import { NextResponse } from "next/server";
import { corsJson, corsOptions } from "@/lib/server/cors";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { sanitizeProxyOrder } from "@/lib/server/proxySwapStore";
import {
  recoverProxyDeposit,
  inspectProxyDepositBalances,
} from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsOptions();
}

/**
 * POST /api/v1/swap/recover
 * 
 * Permanent emergency recovery for any stuck cross-chain proxy deposit.
 * Sweeps stuck funds directly to Near Intents solver address or refunds 100% to user.
 * Protected by administrator authentication.
 * 
 * Body:
 * - depositAddress (required): The proxy deposit address or swap ID
 * - action (optional): "forward" (sweeps to solver) | "refund" (refunds to user) | "custom"
 * - customRecipient (optional): Custom destination address override
 * - tokenAddress (optional): Specific ERC-20 contract address to sweep
 * - tokenType (optional): "native" | "token" | "auto"
 * - amount (optional): Specific amount to sweep
 */
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return corsJson(
      {
        success: false,
        error: auth.error || "Unauthorized",
      },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json();
    const depositAddress = body.depositAddress || body.address || body.swapId;
    const action = body.action || "forward";
    const customRecipient = body.customRecipient?.trim() || undefined;
    const tokenAddress = body.tokenAddress?.trim() || undefined;
    const tokenType = body.tokenType;
    const amount = body.amount?.trim() || undefined;

    if (!depositAddress || typeof depositAddress !== "string") {
      return corsJson(
        {
          success: false,
          error: "Missing required 'depositAddress' (or 'swapId') in request body.",
        },
        { status: 400 }
      );
    }

    console.log(`[SwapRecover] Recovery requested for ${depositAddress}, action: ${action}`);

    const result = await recoverProxyDeposit(depositAddress.trim(), {
      action,
      customRecipient,
      tokenAddress,
      tokenType,
      amount,
    });

    if (!result.success) {
      return corsJson(
        {
          success: false,
          error: result.message,
          order: sanitizeProxyOrder(result.order),
        },
        { status: 400 }
      );
    }

    return corsJson({
      success: true,
      message: result.message,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      recoveredAmount: result.recoveredAmount,
      destination: result.destination,
      order: sanitizeProxyOrder(result.order),
    });
  } catch (err: any) {
    console.error("[SwapRecover] Recovery execution error:", err);
    return corsJson(
      {
        success: false,
        error: err.message || "Failed to recover deposit.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/swap/recover?depositAddress=...
 * 
 * Inspect on-chain balances across native gas and ERC-20 tokens,
 * or trigger an automatic forward if ?trigger=true.
 * Protected by administrator authentication.
 */
export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return corsJson(
      {
        success: false,
        error: auth.error || "Unauthorized",
      },
      { status: auth.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const depositAddress = searchParams.get("depositAddress") || searchParams.get("address") || searchParams.get("swapId");
    const shouldTrigger = searchParams.get("trigger") === "true" || searchParams.get("action") === "forward";
    const customToken = searchParams.get("customToken") || undefined;

    if (!depositAddress) {
      return corsJson(
        { success: false, error: "Missing query parameter 'depositAddress'." },
        { status: 400 }
      );
    }

    if (shouldTrigger) {
      const result = await recoverProxyDeposit(depositAddress.trim(), { action: "forward" });
      return corsJson({
        success: result.success,
        message: result.message,
        txHash: result.txHash || null,
        explorerUrl: result.explorerUrl || null,
        recoveredAmount: result.recoveredAmount || null,
        destination: result.destination || null,
        order: sanitizeProxyOrder(result.order),
      });
    }

    // Default inspection behavior
    const inspectRes = await inspectProxyDepositBalances(depositAddress.trim(), customToken);
    if (!inspectRes.success) {
      return corsJson({ success: false, error: inspectRes.message }, { status: 404 });
    }

    return corsJson({
      success: true,
      report: inspectRes.report,
    });
  } catch (err: any) {
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}
