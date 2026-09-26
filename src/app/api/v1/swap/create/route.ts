import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { createSwapOrder } from "@/lib/server/swapRouter";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/swap/create
 * 
 * Commits a swap order and generates a single-use deposit address.
 * Applies a 50/50 custom fee split between ZkPay Treasury and Partner feeRecipient.
 * 
 * Rate limits: 10 req/min for unauthenticated callers, 60 req/min with API Key.
 */
export async function POST(req: Request) {
  const directKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const auth = await resolvePublicApiAuth(req);
  const effectiveApiKey = auth.ok && auth.apiKeyRecord ? auth.apiKeyRecord.id : directKey;

  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create", effectiveApiKey);
  if (rateLimitResp) return rateLimitResp;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      fromAsset,
      originAsset,
      toAsset,
      destinationAsset,
      amount,
      recipient,
      refundTo,
      feeRecipient: rawFeeRecipient,
      partnerAddress,
      partnerFeeRecipient,
      totalFeeBps,
      feeBps,
      slippageBps,
    } = body;

    const sourceAsset = fromAsset || originAsset;
    const targetAsset = toAsset || destinationAsset;
    const resolvedFeeRecipient = rawFeeRecipient || partnerAddress || partnerFeeRecipient;
    const resolvedFeeBps = typeof totalFeeBps === "number" ? totalFeeBps : (feeBps ? Number(feeBps) : undefined);

    if (!sourceAsset || !amount || !recipient) {
      return corsJson(
        {
          success: false,
          error: "Missing required fields: 'fromAsset', 'amount', and destination 'recipient'.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const order = await createSwapOrder({
      fromAsset: sourceAsset,
      toAsset: targetAsset,
      amount: String(amount),
      recipient,
      refundTo,
      feeRecipient: resolvedFeeRecipient,
      totalFeeBps: resolvedFeeBps,
      slippageBps: typeof slippageBps === "number" ? slippageBps : undefined,
    });

    return corsJson(
      {
        success: true,
        order,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[SwapCreate] Error:", err);
    return corsJson(
      { success: false, error: err.message || "Failed to create swap order" },
      { status: 400, headers: rateLimit.headers }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
