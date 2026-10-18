import { NextResponse } from "next/server";
import { corsJson, corsOptions } from "@/lib/server/cors";
import { recoverProxyDeposit } from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsOptions();
}

/**
 * POST /api/v1/swap/recover
 * 
 * Permanent emergency recovery for any stuck cross-chain proxy deposit.
 * Sweeps stuck funds directly to Near Intents solver address or refunds 100% to user.
 * 
 * Body:
 * - depositAddress (required): The proxy deposit address
 * - action (optional): "forward" (default, sweeps to solver) | "refund" (refunds to user)
 * - customRecipient (optional): Custom destination address override
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const depositAddress = body.depositAddress || body.address || body.swapId;
    const action = body.action === "refund" ? "refund" : "forward";
    const customRecipient = body.customRecipient?.trim() || undefined;

    if (!depositAddress || typeof depositAddress !== "string") {
      return corsJson(
        {
          success: false,
          error: "Missing required 'depositAddress' (or 'swapId') in request body.",
        },
        { status: 400 }
      );
    }

    console.log(`[SwapRecover] Manual recovery requested for ${depositAddress}, action: ${action}`);

    const result = await recoverProxyDeposit(depositAddress.trim(), {
      action,
      customRecipient,
    });

    if (!result.success) {
      return corsJson(
        {
          success: false,
          error: result.message,
          order: result.order || null,
        },
        { status: 400 }
      );
    }

    return corsJson({
      success: true,
      message: result.message,
      txHash: result.txHash,
      recoveredAmount: result.recoveredAmount,
      destination: result.destination,
      order: result.order,
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
 * Inspect recovery status or trigger forward check
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const depositAddress = searchParams.get("depositAddress") || searchParams.get("address") || searchParams.get("swapId");

    if (!depositAddress) {
      return corsJson(
        { success: false, error: "Missing query parameter 'depositAddress'." },
        { status: 400 }
      );
    }

    const result = await recoverProxyDeposit(depositAddress.trim(), { action: "forward" });

    return corsJson({
      success: result.success,
      message: result.message,
      txHash: result.txHash || null,
      recoveredAmount: result.recoveredAmount || null,
      destination: result.destination || null,
      order: result.order || null,
    });
  } catch (err: any) {
    return corsJson({ success: false, error: err.message }, { status: 500 });
  }
}
