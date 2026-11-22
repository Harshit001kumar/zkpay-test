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
} from "@/lib/server/paylinkStore";
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

    if (paylink.singleUse && paylink.status === "ACTIVE") {
      const statsMap = await getPaylinkPaymentsByIds([paylink.id]);
      const stats = statsMap[paylink.id];
      const settled = stats?.payments.find((p) => p.status.toUpperCase() === "SETTLED");
      if (settled) {
        await markPaylinkPaidIfSingleUse(paylink.id, settled.swapId);
        paylink = (await getPaylinkBySlug(params.slug)) || { ...paylink, status: "PAID", paidSwapId: settled.swapId };
      }
    }

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
