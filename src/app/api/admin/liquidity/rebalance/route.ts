import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { enforceRateLimit, getClientIp } from "@/lib/server/rateLimit";
import {
  getRebalanceQuote,
  executeLiquidityRebalance,
  reconcileRebalanceById,
  reconcileActiveRebalances,
  getRecentRebalances,
} from "@/lib/server/liquidityRebalance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  const { response: rateLimitResp } = enforceRateLimit(
    req,
    "status",
    auth.userId,
    { cors: false }
  );
  if (rateLimitResp) return rateLimitResp;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();
    if (id) {
      const rebalance = await reconcileRebalanceById(id);
      if (!rebalance) {
        return NextResponse.json({ error: "Rebalance record not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, rebalance });
    }

    await reconcileActiveRebalances();
    const rebalances = await getRecentRebalances(25);
    return NextResponse.json({ success: true, rebalances });
  } catch (err: any) {
    console.error("[AdminLiquidityRebalance] GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed loading rebalance status" },
      { status: 500 }
    );
  }
}

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
    const action = body?.action === "execute" ? "execute" : "quote";

    const { response: rateLimitResp } = enforceRateLimit(
      req,
      action === "execute" ? "admin_write" : "quote",
      auth.userId,
      { cors: false }
    );
    if (rateLimitResp) return rateLimitResp;

    const fromAssetKey = String(body?.fromAssetKey || "").trim();
    const toAssetKey = String(body?.toAssetKey || "").trim();
    const amountHuman = String(body?.amount || "").trim();
    const slippageBps =
      typeof body?.slippageBps === "number" ? body.slippageBps : undefined;

    if (action === "quote") {
      const quote = await getRebalanceQuote({
        fromAssetKey,
        toAssetKey,
        amountHuman,
        slippageBps,
      });
      return NextResponse.json({ success: true, quote });
    }

    const res = await executeLiquidityRebalance({
      fromAssetKey,
      toAssetKey,
      amountHuman,
      slippageBps,
      previewAmountOutAtomic:
        typeof body?.previewAmountOutAtomic === "string"
          ? body.previewAmountOutAtomic
          : undefined,
      adminUserId: auth.userId,
      adminWallet: auth.walletAddress,
      clientIp: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      rebalance: res.rebalance,
      pendingConfirmation: res.pendingConfirmation,
    });
  } catch (err: any) {
    console.error("[AdminLiquidityRebalance] POST error:", err);
    const status =
      typeof err?.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    return NextResponse.json(
      { error: err?.message || "Failed processing liquidity rebalance" },
      { status }
    );
  }
}
