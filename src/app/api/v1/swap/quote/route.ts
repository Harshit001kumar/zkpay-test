import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSwapQuote, SwapQuoteParams } from "@/lib/server/swapRouter";

export const dynamic = "force-dynamic";

/**
 * Parses parameters from either query string or JSON body.
 */
async function extractQuoteParams(req: Request): Promise<SwapQuoteParams> {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    return {
      fromAsset: body.fromAsset || body.originAsset,
      toAsset: body.toAsset || body.destinationAsset,
      amount: String(body.amount || ""),
      feeRecipient: body.feeRecipient || body.partnerAddress || body.partnerFeeRecipient,
      totalFeeBps: typeof body.totalFeeBps === "number" ? body.totalFeeBps : (body.feeBps ? Number(body.feeBps) : undefined),
      slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : undefined,
      recipientAddress: body.recipient || body.recipientAddress,
      refundTo: body.refundTo,
    };
  }

  const { searchParams } = new URL(req.url);
  return {
    fromAsset: searchParams.get("fromAsset") || searchParams.get("originAsset") || "",
    toAsset: searchParams.get("toAsset") || searchParams.get("destinationAsset") || undefined,
    amount: searchParams.get("amount") || "",
    feeRecipient: searchParams.get("feeRecipient") || searchParams.get("partnerAddress") || searchParams.get("partnerFeeRecipient") || undefined,
    totalFeeBps: searchParams.get("totalFeeBps") ? Number(searchParams.get("totalFeeBps")) : (searchParams.get("feeBps") ? Number(searchParams.get("feeBps")) : undefined),
    slippageBps: searchParams.get("slippageBps") ? Number(searchParams.get("slippageBps")) : undefined,
    recipientAddress: searchParams.get("recipient") || searchParams.get("recipientAddress") || undefined,
    refundTo: searchParams.get("refundTo") || undefined,
  };
}

async function handleQuote(req: Request) {
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "quote", apiKey);
  if (rateLimitResp) return rateLimitResp;

  try {
    const params = await extractQuoteParams(req);

    if (!params.fromAsset || !params.amount || params.amount === "0") {
      return corsJson(
        {
          success: false,
          error: "Missing required fields: 'fromAsset' and 'amount' (in smallest units).",
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
    console.error("[SwapQuote] Error:", err);
    return corsJson(
      { success: false, error: err.message || "Failed to generate swap quote" },
      { status: 400, headers: rateLimit.headers }
    );
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
