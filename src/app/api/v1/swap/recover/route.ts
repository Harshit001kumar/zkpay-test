import { NextResponse } from "next/server";
import { verifyAdminRequest, recordAdminAudit } from "@/lib/server/adminAuth";
import { enforceRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { sanitizeProxyOrder } from "@/lib/server/proxySwapStore";
import {
  recoverProxyDeposit,
  inspectProxyDepositBalances,
} from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: auth.error || "Unauthorized",
      },
      { status: auth.status }
    );
  }

  const { response: rateLimitResp } = enforceRateLimit(req, "admin_write", auth.userId, { cors: false });
  if (rateLimitResp) return rateLimitResp;

  try {
    const body = await req.json();
    const depositAddress = body.depositAddress || body.address || body.swapId;
    const action = body.action || "forward";
    const customRecipient = body.customRecipient?.trim() || undefined;
    const tokenAddress = body.tokenAddress?.trim() || undefined;
    const tokenType = body.tokenType;
    const amount = body.amount?.trim() || undefined;

    if (!["forward", "refund", "custom"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid recovery action." }, { status: 400 });
    }
    if (amount && (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0)) {
      return NextResponse.json({ success: false, error: "Invalid recovery amount." }, { status: 400 });
    }

    if (!depositAddress || typeof depositAddress !== "string") {
      return NextResponse.json(
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
      adminOverride: true,
    });

    await recordAdminAudit({
      adminUserId: auth.userId,
      adminWallet: auth.walletAddress,
      clientIp: getClientIp(req),
      action: `V1_RECOVER_${String(action).toUpperCase()}`,
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
    console.error("[SwapRecover] Recovery execution error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to recover deposit.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
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
    const customToken = searchParams.get("customToken") || undefined;

    if (!depositAddress) {
      return NextResponse.json(
        { success: false, error: "Missing query parameter 'depositAddress'." },
        { status: 400 }
      );
    }

    if (searchParams.get("trigger") === "true" || searchParams.get("action") === "forward") {
      return NextResponse.json(
        { success: false, error: "State-mutating recovery execution requires a POST request." },
        { status: 405 }
      );
    }

    // Default inspection behavior
    const inspectRes = await inspectProxyDepositBalances(depositAddress.trim(), customToken);
    if (!inspectRes.success) {
      return NextResponse.json({ success: false, error: inspectRes.message }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      report: inspectRes.report,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
