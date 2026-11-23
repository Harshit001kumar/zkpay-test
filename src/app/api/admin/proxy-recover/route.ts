import { NextResponse } from "next/server";
import { verifyAdminRequest, recordAdminAudit } from "@/lib/server/adminAuth";
import { enforceRateLimit, getClientIp } from "@/lib/server/rateLimit";
import {
  inspectProxyDepositBalances,
  recoverProxyDeposit,
  sweepAllProxyDustToRelayer,
} from "@/lib/server/proxyForwarder";
import { getRecentProxyOrders, sanitizeProxyOrder } from "@/lib/server/proxySwapStore";
import {
  getInfuraApiKey,
  getNowNodesApiKey,
  getAlchemyApiKey,
  getHeliusApiKey,
} from "@/lib/server/rpcConfig";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const providers = {
    infura: Boolean(getInfuraApiKey()),
    nowNodes: Boolean(getNowNodesApiKey()),
    alchemy: Boolean(getAlchemyApiKey()),
    helius: Boolean(getHeliusApiKey()),
    customSolana: Boolean(process.env.SOLANA_RPC_URL || process.env.SOL_RPC_URL),
  };

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || searchParams.get("depositAddress") || searchParams.get("swapId");
    const customToken = searchParams.get("customToken") || undefined;

    if (query) {
      const inspectRes = await inspectProxyDepositBalances(query.trim(), customToken);
      if (!inspectRes.success) {
        return NextResponse.json({ error: inspectRes.message, providers }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        report: inspectRes.report,
        providers,
      });
    }

    // Return recent proxy orders for table / quick selector
    const orders = await getRecentProxyOrders(50);
    return NextResponse.json({
      success: true,
      providers,
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
 * 1. Batch dust recycling: sweeps unspent native gas dust from past proxy wallets back to relayer
 * 2. Transfers native gas or any ERC-20 / SPL token from a proxy deposit wallet
 *    to ANY specified address (e.g. manual user refund or custom rescue address).
 */
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  const { response: rateLimitResp } = enforceRateLimit(req, "admin_write", auth.userId, { cors: false });
  if (rateLimitResp) return rateLimitResp;

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const action = body.action || "custom"; // "refund" | "forward" | "custom" | "recycle-dust"
    if (!["refund", "forward", "custom", "recycle-dust", "sweep-dust"].includes(action)) {
      return NextResponse.json({ error: "Invalid recovery action." }, { status: 400 });
    }

    // ── Batch Dust Recycling to Relayer Gas Tank ──
    if (action === "recycle-dust" || action === "sweep-dust") {
      const chain = body.chain || "polygon";
      const limit = typeof body.limit === "number" ? Math.min(100, Math.max(1, body.limit)) : 50;
      console.log(
        `[AdminProxyRecover] Admin (${auth.userId || auth.walletAddress}) executing batch proxy dust recycling on ${chain} (limit ${limit})`
      );
      const recycleResult = await sweepAllProxyDustToRelayer(chain, limit);
      await recordAdminAudit({
        adminUserId: auth.userId,
        adminWallet: auth.walletAddress,
        clientIp,
        action: "DUST_RECYCLE",
        target: chain,
        amount: recycleResult.totalSweptFormatted,
        status: "SUCCESS",
      });
      return NextResponse.json({
        ...recycleResult,
        message: `Successfully recycled ${recycleResult.totalSweptFormatted} dust back to the relayer across ${recycleResult.sweptCount} proxy wallets (${recycleResult.skippedCount} skipped/empty).`,
      });
    }

    const depositAddress = body.depositAddress || body.address || body.swapId;
    const customRecipient = body.customRecipient?.trim() || body.destination?.trim();
    const tokenAddress = body.tokenAddress?.trim();
    const tokenType = body.tokenType;
    const amount = body.amount?.trim();

    if (!depositAddress || typeof depositAddress !== "string") {
      return NextResponse.json(
        { error: "Missing required 'depositAddress' (or 'swapId')." },
        { status: 400 }
      );
    }
    if (amount && (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)) {
      return NextResponse.json({ error: "Invalid recovery amount." }, { status: 400 });
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
      adminOverride: true,
    });

    await recordAdminAudit({
      adminUserId: auth.userId,
      adminWallet: auth.walletAddress,
      clientIp,
      action: `PROXY_RECOVER_${String(action).toUpperCase()}`,
      target: depositAddress.trim(),
      amount: result.recoveredAmount || amount,
      destination: result.destination || customRecipient,
      txHash: result.txHash,
      status: result.success ? "SUCCESS" : "ERROR",
      error: result.success ? undefined : result.message,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          order: sanitizeProxyOrder(result.order),
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
      order: sanitizeProxyOrder(result.order),
    });
  } catch (err: any) {
    console.error("[AdminProxyRecover] POST execution error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute proxy recovery." },
      { status: 500 }
    );
  }
}
