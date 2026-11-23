import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { createSwapOrder } from "@/lib/server/swapRouter";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/v1/swap/create
 * 
 * Commits a swap order and generates a single-use deposit address.
 * Applies a 50/50 custom fee split between ZkPay Treasury and Partner feeRecipient.
 * 
 * Rate limits: 10 req/min for unauthenticated callers, 60 req/min with API Key.
 */
export async function POST(req: Request) {
  const auth = await resolvePublicApiAuth(req);
  const validatedKeyId = auth.ok
    ? (auth.apiKeyRecord?.id || (auth.isEnvKey ? "admin_env" : auth.userId || "auth_user"))
    : undefined;

  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create", validatedKeyId);
  if (rateLimitResp) return rateLimitResp;

  try {
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return corsJson(
        { success: false, error: "INVALID_BODY", message: "Request body must be a JSON object." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const {
      fromAsset,
      originAsset,
      toAsset,
      destinationAsset,
      chain,
      originChain,
      fromChain,
      srcChain,
      destinationChain,
      toChain,
      destChain,
      targetChain,
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

    const sourceAsset = (originAsset && typeof originAsset === "string" && originAsset.startsWith("nep"))
      ? originAsset
      : (fromAsset || originAsset);
    const targetAsset = (destinationAsset && typeof destinationAsset === "string" && destinationAsset.startsWith("nep"))
      ? destinationAsset
      : (toAsset || destinationAsset);
    const resolvedChain = originChain || fromChain || chain || srcChain || body.origin_chain || undefined;
    const resolvedDestinationChain = destinationChain || toChain || destChain || targetChain || body.destination_chain || body.to_chain || body.dstChain || undefined;
    const resolvedFeeRecipient = rawFeeRecipient || partnerAddress || partnerFeeRecipient;
    const resolvedFeeBps = typeof totalFeeBps === "number" ? totalFeeBps : (feeBps ? Number(feeBps) : undefined);

    if (
      typeof sourceAsset !== "string" ||
      typeof recipient !== "string" ||
      (targetAsset !== undefined && targetAsset !== null && typeof targetAsset !== "string") ||
      (refundTo !== undefined && refundTo !== null && typeof refundTo !== "string") ||
      (resolvedChain !== undefined && typeof resolvedChain !== "string") ||
      (resolvedDestinationChain !== undefined && typeof resolvedDestinationChain !== "string") ||
      (resolvedFeeRecipient !== undefined && resolvedFeeRecipient !== null && typeof resolvedFeeRecipient !== "string") ||
      (typeof amount !== "string" && typeof amount !== "number")
    ) {
      return corsJson(
        {
          success: false,
          error: "INVALID_INPUT_TYPE",
          message: "All asset, chain, and address parameters must be strings.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (!sourceAsset.trim() || !String(amount).trim() || !recipient.trim()) {
      return corsJson(
        {
          success: false,
          error: "MISSING_REQUIRED_FIELDS",
          message: "Missing required fields: 'fromAsset', 'amount', and destination 'recipient'.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    // Only verified Partner API keys receive partner attribution or custom fee overrides.
    const isPartnerApi = Boolean(auth.apiKeyRecord);
    const apiKeyId = auth.apiKeyRecord?.id || undefined;
    const partnerUserId = auth.apiKeyRecord?.userId || undefined;
    const source: "api" | "app" = isPartnerApi ? "api" : "app";
    const effectiveFeeRecipient = isPartnerApi
      ? (resolvedFeeRecipient || auth.apiKeyRecord?.walletAddress || undefined)
      : undefined;
    const effectiveFeeBps = isPartnerApi || auth.isEnvKey ? resolvedFeeBps : undefined;
    const callerId = validatedKeyId || getClientIp(req);

    const order = await createSwapOrder({
      fromAsset: sourceAsset,
      toAsset: targetAsset,
      chain: resolvedChain,
      originChain: resolvedChain,
      destinationChain: resolvedDestinationChain,
      amount: String(amount),
      recipient,
      refundTo,
      feeRecipient: effectiveFeeRecipient,
      totalFeeBps: effectiveFeeBps,
      slippageBps: typeof slippageBps === "number" ? slippageBps : undefined,
      apiKeyId,
      partnerUserId,
      source,
      callerId,
      swapType: "FLEX_INPUT",
    });

    return corsJson(
      {
        success: true,
        order,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[SwapCreate] Error:", err.message || err);
    const isClientError =
      err.code === "AMOUNT_BELOW_MINIMUM" ||
      err.code === "INVALID_AMOUNT" ||
      err.code === "INVALID_RECIPIENT" ||
      err.code === "INVALID_REFUND_ADDRESS" ||
      err.code === "INVALID_FEE_RECIPIENT" ||
      err.code === "NO_SOLVER_LIQUIDITY" ||
      err.code === "PAIR_UNAVAILABLE" ||
      err.code === "SOLVER_REJECTED";
    const statusCode = err.statusCode || (isClientError ? 400 : 503);
    const body: Record<string, any> = {
      success: false,
      error: err.code || "SOLVER_NETWORK_BUSY",
      message: err.message || "Failed to create swap order",
    };
    if (err.minAmountRequired) {
      body.minAmountRequired = err.minAmountRequired;
    }
    return corsJson(body, { status: statusCode, headers: rateLimit.headers });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
