import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import {
  getPaylinkBySlug,
  sanitizePublicPaylink,
  updatePaylinkForUser,
  deletePaylinkForUser,
  getPaylinkPaymentsByIds,
  markPaylinkPaidIfSingleUse,
  markPaylinkProcessing,
  resolveEffectivePaylinkStatus,
} from "@/lib/server/paylinkStore";
import { pollDirectWatchesForPaylink } from "@/lib/server/paylinkDirectWatcher";
import { getLiveTokenPriceUsd } from "@/lib/server/priceService";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "default");
  if (rateLimitResp) return rateLimitResp;

  try {
    let paylink = await getPaylinkBySlug(params.slug);
    if (!paylink) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Paylink not found." },
        { status: 404, headers: rateLimit.headers }
      );
    }

    if (paylink.singleUse && (paylink.status === "ACTIVE" || paylink.status === "PROCESSING")) {
      await pollDirectWatchesForPaylink(paylink.id).catch(() => {});
      const statsMap = await getPaylinkPaymentsByIds([paylink.id]);
      const stats = statsMap[paylink.id];
      const settled = stats?.payments.find(
        (p) => p.status.toUpperCase() === "SETTLED" || p.status.toUpperCase() === "SUCCESS"
      );
      if (settled) {
        await markPaylinkPaidIfSingleUse(paylink.id, {
          swapId: settled.swapId,
          txHash: settled.destinationTxHash || undefined,
          explorerUrl: settled.destinationExplorerUrl || undefined,
          fromAsset: settled.fromAsset,
          fromChain: settled.originChain,
          amountIn: settled.amountInFormatted,
          amountOut: settled.amountOutFormatted,
          mode: settled.fromAsset === paylink.receiveSymbol && settled.originChain === paylink.receiveChain ? "DIRECT_SAME_ASSET" : "SWAP",
        });
        paylink = (await getPaylinkBySlug(params.slug)) || {
          ...paylink,
          status: "PAID",
          paidSwapId: settled.swapId,
          paidFromAsset: settled.fromAsset,
          paidFromChain: settled.originChain,
          paidAmountIn: settled.amountInFormatted,
          paidAmountOut: settled.amountOutFormatted,
          paidTxHash: settled.destinationTxHash || undefined,
          paidExplorerUrl: settled.destinationExplorerUrl || undefined,
        };
      } else if (paylink.status === "ACTIVE") {
        const detected = stats?.payments.find((p) => {
          const s = p.status.toUpperCase();
          return s === "DETECTED" || s === "PAYING_OUT" || s === "FORWARDING" || s === "FORWARDED";
        });
        if (detected) {
          await markPaylinkProcessing(paylink.id, detected.swapId);
          paylink = (await getPaylinkBySlug(params.slug)) || {
            ...paylink,
            status: "PROCESSING",
            activePaymentId: detected.swapId,
          };
        }
      }
    }

    paylink = resolveEffectivePaylinkStatus(paylink);

    const receivePriceUsd = await getLiveTokenPriceUsd(paylink.receiveSymbol).catch(() => 0);

    return NextResponse.json(
      {
        success: true,
        paylink: sanitizePublicPaylink(paylink),
        receivePriceUsd: receivePriceUsd > 0 ? receivePriceUsd : null,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[PaylinkSlug] GET error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load Paylink" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updated = await updatePaylinkForUser(auth.userId, params.slug, {
      status: body.status === "ACTIVE" || body.status === "PAUSED" ? body.status : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Paylink not found or not owned by you." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, paylink: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update Paylink" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const deleted = await deletePaylinkForUser(auth.userId, params.slug);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Paylink not found or not owned by you." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete Paylink" },
      { status: 500 }
    );
  }
}
