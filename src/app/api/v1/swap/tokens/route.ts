import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSupportedTokens } from "@/lib/server/swapRouter";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/swap/tokens
 * 
 * Returns supported tokens across connected blockchains (Base, Solana, Ethereum, Arbitrum, BSC, Tron, Bitcoin).
 * Supports filtering by ?chain=base|sol|eth|btc|tron|arb|bsc.
 * Rate limit: 60 req/min for IP, 300 req/min for authenticated API Key.
 */
export async function GET(req: Request) {
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "tokens", apiKey);
  if (rateLimitResp) return rateLimitResp;

  try {
    const { searchParams } = new URL(req.url);
    const chain = searchParams.get("chain");

    const tokens = await getSupportedTokens(chain);

    return corsJson(
      {
        success: true,
        count: tokens.length,
        tokens,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[SwapTokens] Error:", err);
    return corsJson(
      { success: false, error: err.message || "Failed to fetch supported tokens" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
