import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import {
  inspectProxyDepositBalances,
  recoverProxyDeposit,
} from "@/lib/server/proxyForwarder";
import { getRecentProxyOrders } from "@/lib/server/proxySwapStore";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/proxy-recover
 * 
 * - Query param `query` (optional): deposit address or swap ID to inspect.
 *   Returns live on-chain balances across native gas + tokens, and detects mismatched tokens.
 * - If no `query`, returns recent proxy orders for quick admin inspection.
 */
export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || searchParams.get("depositAddress") || searchParams.get("swapId");
    const customToken = searchParams.get("customToken") || undefined;

    if (query) {
      const inspectRes = await inspectProxyDepositBalances(query.trim(), customToken);
      if (!inspectRes.success) {
        return NextResponse.json({ error: inspectRes.message }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        report: inspectRes.report,
      });
    }

    // Return recent proxy orders for table / quick selector
    const orders = await getRecentProxyOrders(50);
    return NextResponse.json({
      success: true,
      orders: orders.map((o) => ({
        swapId: o.swapId,
        chain: o.chain,
        proxyDepositAddress: o.proxyDepositAddress,
        fromAsset: o.fromAsset,
        toAsset: o.toAsset,
        totalAmountFormatted: o.totalAmountFormatted,
        status: o.status,
        refundTo: o.refundTo,
        solverDepositAddress: o.solverDepositAddress,
        createdAt: o.createdAt,
        expiresAt: o.expiresAt,
        depositTxHash: o.depositTxHash,
        forwardTxHash: o.forwardTxHash,
      })),
    });
  } catch (err: any) {
    console.error("[AdminProxyRecover] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to inspect proxy deposit" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/proxy-recover
 * 
 * Emergency admin sweep tool:
 * Transfers native gas or any ERC-20 / SPL token from a proxy deposit wallet
 * to ANY specified address (e.g. manual user refund or custom rescue address).
 */
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json();
    const depositAddress = body.depositAddress || body.address || body.swapId;
    const action = body.action || "custom"; // "refund" | "forward" | "custom"
    const customRecipient = body.customRecipient?.trim() || body.destination?.trim();
    const tokenAddress = body.tokenAddress?.trim();
    const tokenType = body.tokenType; // "native" | "token" | "auto"
    const amount = body.amount?.trim();

    if (!depositAddress || typeof depositAddress !== "string") {
      return NextResponse.json(
        { error: "Missing required 'depositAddress' (or 'swapId')." },
        { status: 400 }
      );
    }

    console.log(
      `[AdminProxyRecover] Admin (${auth.userId || auth.walletAddress}) executing sweep for ${depositAddress} -> ${customRecipient || action}`
    );

    const result = await recoverProxyDeposit(depositAddress.trim(), {
      action,
      customRecipient,
      tokenAddress,
      tokenType,
      amount,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          order: result.order || null,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      recoveredAmount: result.recoveredAmount,
      destination: result.destination,
      order: result.order,
    });
  } catch (err: any) {
    console.error("[AdminProxyRecover] POST execution error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute proxy recovery." },
      { status: 500 }
    );
  }
}
