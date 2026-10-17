import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSwapQuote, SwapQuoteParams } from "@/lib/server/swapRouter";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";

export const dynamic = "force-dynamic";

/**
 * Parses parameters from either query string or JSON body.
 */
async function extractQuoteParams(req: Request): Promise<SwapQuoteParams> {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const resolvedOriginChain = body.originChain || body.fromChain || body.chain || body.origin_chain || body.srcChain || undefined;
    const resolvedDestChain = body.destinationChain || body.toChain || body.destChain || body.targetChain || body.destination_chain || body.to_chain || body.dstChain || undefined;

    return {
      fromAsset: body.fromAsset || body.originAsset,
      toAsset: body.toAsset || body.destinationAsset,
      chain: resolvedOriginChain,
      originChain: resolvedOriginChain,
      destinationChain: resolvedDestChain,
      amount: String(body.amount || ""),
      feeRecipient: body.feeRecipient || body.partnerAddress || body.partnerFeeRecipient,
      totalFeeBps: typeof body.totalFeeBps === "number" ? body.totalFeeBps : (body.feeBps ? Number(body.feeBps) : undefined),
      slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : undefined,
      recipientAddress: body.recipient || body.recipientAddress,
      refundTo: body.refundTo,
    };
  }

  const { searchParams } = new URL(req.url);
  const resolvedOriginChain =
    searchParams.get("originChain") ||
    searchParams.get("fromChain") ||
    searchParams.get("chain") ||
    searchParams.get("origin_chain") ||
    searchParams.get("srcChain") ||
    undefined;

  const resolvedDestChain =
    searchParams.get("destinationChain") ||
    searchParams.get("toChain") ||
    searchParams.get("destChain") ||
    searchParams.get("targetChain") ||
    searchParams.get("destination_chain") ||
    searchParams.get("to_chain") ||
    searchParams.get("dstChain") ||
    undefined;

  return {
    fromAsset: searchParams.get("fromAsset") || searchParams.get("originAsset") || "",
    toAsset: searchParams.get("toAsset") || searchParams.get("destinationAsset") || undefined,
    chain: resolvedOriginChain,
    originChain: resolvedOriginChain,
    destinationChain: resolvedDestChain,
    amount: searchParams.get("amount") || "",
    feeRecipient: searchParams.get("feeRecipient") || searchParams.get("partnerAddress") || searchParams.get("partnerFeeRecipient") || undefined,
    totalFeeBps: searchParams.get("totalFeeBps") ? Number(searchParams.get("totalFeeBps")) : (searchParams.get("feeBps") ? Number(searchParams.get("feeBps")) : undefined),
    slippageBps: searchParams.get("slippageBps") ? Number(searchParams.get("slippageBps")) : undefined,
    recipientAddress: searchParams.get("recipient") || searchParams.get("recipientAddress") || undefined,
    refundTo: searchParams.get("refundTo") || undefined,
  };
}

async function handleQuote(req: Request) {
  const auth = await resolvePublicApiAuth(req);
  const validatedKeyId = auth.ok
    ? (auth.apiKeyRecord?.id || (auth.isEnvKey ? "admin_env" : auth.userId || "auth_user"))
    : undefined;

  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "quote", validatedKeyId);
  if (rateLimitResp) return rateLimitResp;

  try {
    const params = await extractQuoteParams(req);

    if (!params.fromAsset || !params.amount || params.amount === "0") {
      return corsJson(
        {
          success: false,
          error: "MISSING_REQUIRED_FIELDS",
          message: "Missing required fields: 'fromAsset' and 'amount' (in atomic units).",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const quote = await getSwapQuote(params);

    return corsJson(
      {
        success: true,
        quote,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[SwapQuote] Error:", err.message || err);
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
      message: err.message || "Failed to generate swap quote",
    };
    if (err.minAmountRequired) {
      body.minAmountRequired = err.minAmountRequired;
    }
    return corsJson(body, { status: statusCode, headers: rateLimit.headers });
  }
}

export async function GET(req: Request) {
  return handleQuote(req);
}

export async function POST(req: Request) {
  return handleQuote(req);
}

export async function OPTIONS() {
  return corsOptions();
}
