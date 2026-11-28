import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import {
  getPaylinkBySlug,
  resolveEffectivePaylinkStatus,
} from "@/lib/server/paylinkStore";
import {
  checkDirectPaylinkWatch,
  verifyDirectPaylinkTxHash,
} from "@/lib/server/paylinkDirectWatcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "status");
  if (rateLimitResp) return rateLimitResp;

  try {
    const { searchParams } = new URL(req.url);
    const watchId = searchParams.get("watchId")?.trim();
    if (!watchId) {
      return NextResponse.json(
        { success: false, error: "MISSING_WATCH_ID", message: "Missing watchId parameter." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const rawPaylink = await getPaylinkBySlug(params.slug);
    if (!rawPaylink) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Invoice not found." },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const watch = await checkDirectPaylinkWatch(watchId);
    if (!watch || watch.paylinkId !== rawPaylink.id) {
      return NextResponse.json(
        { success: false, error: "WATCH_NOT_FOUND", message: "Direct payment watch not found for this invoice." },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const latestPaylink = resolveEffectivePaylinkStatus(
      (await getPaylinkBySlug(params.slug)) || rawPaylink
    );

    return NextResponse.json(
      {
        success: true,
        watch,
        paylinkStatus: latestPaylink.status,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[DirectStatus] GET error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed checking direct payment status." },
      { status: 500, headers: rateLimit.headers }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create");
  if (rateLimitResp) return rateLimitResp;

  try {
    const body = await req.json().catch(() => ({}));
    const watchId = typeof body?.watchId === "string" ? body.watchId.trim() : "";
    const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";

    if (!watchId || !txHash) {
      return NextResponse.json(
        {
          success: false,
          error: "MISSING_REQUIRED_FIELDS",
          message: "Both watchId and txHash are required.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const rawPaylink = await getPaylinkBySlug(params.slug);
    if (!rawPaylink) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Invoice not found." },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const res = await verifyDirectPaylinkTxHash(watchId, txHash);
    if (!res.verified || !res.watch) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: "TX_VERIFICATION_FAILED",
          message: res.error || "Unable to verify transaction on-chain yet.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (res.watch.paylinkId !== rawPaylink.id) {
      return NextResponse.json(
        { success: false, error: "WATCH_MISMATCH", message: "Watch does not belong to this invoice." },
        { status: 403, headers: rateLimit.headers }
      );
    }

    const latestPaylink = resolveEffectivePaylinkStatus(
      (await getPaylinkBySlug(params.slug)) || rawPaylink
    );

    return NextResponse.json(
      {
        success: true,
        verified: true,
        watch: res.watch,
        paylinkStatus: latestPaylink.status,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[DirectStatus] POST error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed verifying transaction hash." },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
