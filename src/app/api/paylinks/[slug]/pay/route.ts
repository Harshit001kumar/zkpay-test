import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import {
  getPaylinkBySlug,
  resolveAllowedToken,
  computePaylinkQuote,
  resolveOpenPaylinkInputAtomic,
} from "@/lib/server/paylinkStore";
import { createSwapOrder } from "@/lib/server/swapRouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create");
  if (rateLimitResp) return rateLimitResp;

  try {
    const paylink = await getPaylinkBySlug(params.slug);
    if (!paylink) {
      return NextResponse.json(
        { success: false, error: "NOT_FOUND", message: "Paylink not found." },
        { status: 404, headers: rateLimit.headers }
      );
    }

    if (paylink.status === "PAUSED") {
      return NextResponse.json(
        { success: false, error: "PAYLINK_PAUSED", message: "This Paylink is temporarily paused by its creator." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (paylink.status === "PAID") {
      return NextResponse.json(
        { success: false, error: "PAYLINK_ALREADY_PAID", message: "This single-use Paylink has already been paid." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    // Tamper protection: ONLY read origin asset/amount/refund from client.
    // Never accept recipientAddress, toAsset, or destinationChain from the client body.
    const body = await req.json().catch(() => ({}));
    const rawFromAsset = String(body?.fromAsset || body?.originAsset || "");
    const rawOriginChain =
      typeof body?.originChain === "string"
        ? body.originChain
        : typeof body?.chain === "string"
        ? body.chain
        : undefined;
    const rawRefundTo = typeof body?.refundTo === "string" ? body.refundTo.trim() : undefined;
    const rawSlippageBps = typeof body?.slippageBps === "number" ? body.slippageBps : 100;

    if (!rawFromAsset) {
      return NextResponse.json(
        { success: false, error: "MISSING_REQUIRED_FIELDS", message: "Please select a payment currency." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const originToken = resolveAllowedToken(rawFromAsset, rawOriginChain);
    if (!originToken) {
      return NextResponse.json(
        { success: false, error: "UNSUPPORTED_ASSET", message: "Selected pay currency is not supported." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    // Same-asset transfers do not need a cross-chain swap
    if (originToken.assetId.toLowerCase() === paylink.receiveAssetId.toLowerCase()) {
      return NextResponse.json(
        {
          success: true,
          mode: "DIRECT_SAME_ASSET",
          depositAddress: paylink.recipientAddress,
          message: "Same currency selected — send directly to the recipient address with 0% swap fee.",
        },
        { headers: rateLimit.headers }
      );
    }

    let inputAtomic = "";
    if (paylink.amountMode === "FIXED") {
      const serverQuote = await computePaylinkQuote({
        paylink,
        fromAsset: originToken.assetId,
        originChain: originToken.blockchain,
        slippageBps: rawSlippageBps,
        refundTo: rawRefundTo || undefined,
      });
      if (serverQuote.mode !== "SWAP") {
        return NextResponse.json(
          { success: true, mode: "DIRECT_SAME_ASSET", depositAddress: paylink.recipientAddress },
          { headers: rateLimit.headers }
        );
      }
      const serverBi = BigInt(serverQuote.inputAmountAtomic);
      inputAtomic = serverQuote.inputAmountAtomic;

      // Accept recent quotedInputAtomic only within safe [98%, 110%] bounds to block underpayment tampering
      if (typeof body?.quotedInputAtomic === "string" && /^\d+$/.test(body.quotedInputAtomic.trim())) {
        const clientBi = BigInt(body.quotedInputAtomic.trim());
        if (clientBi >= (serverBi * 98n) / 100n && clientBi <= (serverBi * 110n) / 100n) {
          inputAtomic = clientBi.toString();
        }
      }
    } else {
      const openResolved = await resolveOpenPaylinkInputAtomic({
        originToken,
        amountHuman:
          typeof body?.amountHuman === "string"
            ? body.amountHuman
            : typeof body?.amount === "string" || typeof body?.amount === "number"
            ? String(body.amount)
            : undefined,
        amountAtomic: typeof body?.amountAtomic === "string" ? body.amountAtomic : undefined,
        amountUsd: typeof body?.amountUsd === "number" ? body.amountUsd : undefined,
      });
      inputAtomic = openResolved.atomic;
    }

    // Create the live payment order with creator's stored destination & recipient strictly enforced
    const order = await createSwapOrder({
      fromAsset: originToken.assetId,
      toAsset: paylink.receiveAssetId,
      chain: originToken.blockchain,
      originChain: originToken.blockchain,
      destinationChain: paylink.receiveChain,
      amount: inputAtomic,
      recipient: paylink.recipientAddress,
      refundTo: rawRefundTo || undefined,
      slippageBps: Math.max(10, Math.min(500, rawSlippageBps)),
      source: "app",
      swapType: "FLEX_INPUT",
      paylinkId: paylink.id,
      paylinkSlug: paylink.slug,
    });

    return NextResponse.json(
      {
        success: true,
        mode: "SWAP",
        paylinkSlug: paylink.slug,
        order,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    const status = err?.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    return NextResponse.json(
      {
        success: false,
        error: err?.code || "PAYLINK_ORDER_FAILED",
        message: err?.message || "Failed to initiate Paylink payment",
      },
      { status, headers: rateLimit.headers }
    );
  }
}
