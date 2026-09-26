import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSwapStatus } from "@/lib/server/swapRouter";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/swap/status
 * 
 * Polls real-time swap execution state across chains by deposit address.
 * Query param: ?depositAddress=...
 * 
 * Rate limits: 60 req/min for IP (1 req/sec polling), 240 req/min for API Key.
 */
export async function GET(req: Request) {
  const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization");
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "status", apiKey);
  if (rateLimitResp) return rateLimitResp;

  try {
    const { searchParams } = new URL(req.url);
    const depositAddress = searchParams.get("depositAddress") || searchParams.get("address");

    if (!depositAddress || depositAddress.trim() === "") {
      return corsJson(
        {
          success: false,
          error: "Missing required query parameter: 'depositAddress'.",
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const status = await getSwapStatus(depositAddress.trim());

    return corsJson(
      {
        success: true,
        depositAddress: depositAddress.trim(),
        ...status,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[SwapStatus] Error:", err);
    return corsJson(
      { success: false, error: err.message || "Failed to fetch swap status" },
      { status: 400, headers: rateLimit.headers }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
