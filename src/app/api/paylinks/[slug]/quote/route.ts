import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import {
  getPaylinkBySlug,
  computePaylinkQuote,
  resolveEffectivePaylinkStatus,
} from "@/lib/server/paylinkStore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "quote");
  if (rateLimitResp) return rateLimitResp;

  try {
    const rawPaylink = await getPaylinkBySlug(params.slug);
    if (!rawPaylink) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Paylink not found." },
        { status: 404, headers: rateLimit.headers }
      );
    }
    const paylink = resolveEffectivePaylinkStatus(rawPaylink);

    if (paylink.status === "PAUSED") {
      return NextResponse.json(
        { success: false, error: "PAYLINK_PAUSED", message: "This Paylink is temporarily paused by its creator." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (paylink.status === "EXPIRED") {
      return NextResponse.json(
        { success: false, error: "PAYLINK_EXPIRED", message: "This invoice has expired." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (paylink.status === "PAID") {
      return NextResponse.json(
        { success: false, error: "PAYLINK_ALREADY_PAID", message: "This single-use invoice has already been paid." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (paylink.status === "PROCESSING") {
      return NextResponse.json(
        {
          success: false,
          error: "PAYLINK_PAYMENT_IN_PROGRESS",
          message: "A payment for this invoice has already been detected and is confirming.",
        },
        { status: 409, headers: rateLimit.headers }
      );
    }

    const body = await req.json().catch(() => ({}));
    const fromAsset = String(body.fromAsset || body.originAsset || "");
    if (!fromAsset) {
      return NextResponse.json(
        { success: false, error: "MISSING_REQUIRED_FIELDS", message: "Please select a payment currency." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const result = await computePaylinkQuote({
      paylink,
      fromAsset,
      originChain: typeof body.originChain === "string" ? body.originChain : undefined,
      amountHuman:
        typeof body.amountHuman === "string"
          ? body.amountHuman
          : typeof body.amount === "string" || typeof body.amount === "number"
          ? String(body.amount)
          : undefined,
      amountAtomic: typeof body.amountAtomic === "string" ? body.amountAtomic : undefined,
      amountUsd: typeof body.amountUsd === "number" ? body.amountUsd : undefined,
      slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : undefined,
      refundTo: typeof body.refundTo === "string" ? body.refundTo : undefined,
    });

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    const status = err?.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    return NextResponse.json(
      {
        success: false,
        error: err?.code || "QUOTE_FAILED",
        message: err?.message || "Failed to fetch payment quote",
      },
      { status, headers: rateLimit.headers }
    );
  }
}
