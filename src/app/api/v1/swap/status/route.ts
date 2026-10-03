import { corsJson, corsOptions } from "@/lib/server/cors";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSwapStatus } from "@/lib/server/swapRouter";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";

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
  const auth = await resolvePublicApiAuth(req);
  const validatedKeyId = auth.ok
    ? (auth.apiKeyRecord?.id || (auth.isEnvKey ? "admin_env" : auth.userId || "auth_user"))
    : undefined;

  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "status", validatedKeyId);
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
    console.error("[SwapStatus] Error:", err.message || err);
    const statusCode = err.statusCode || 503;
    return corsJson(
      {
        success: false,
        error: err.code || "SOLVER_NETWORK_BUSY",
        message: err.message || "Failed to fetch swap status",
      },
      { status: statusCode, headers: rateLimit.headers }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
