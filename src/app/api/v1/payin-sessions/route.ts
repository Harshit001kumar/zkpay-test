import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

function deprecatedResponse() {
  return corsJson(
    {
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message: "Fiat pay-in sessions have been retired. Use POST /api/v1/swap/create for instant cross-chain swap deposit addresses.",
      swapApi: "https://zkpay.top/api/v1/swap/create",
    },
    { status: 410 }
  );
}

export async function GET() {
  return deprecatedResponse();
}

export async function POST() {
  return deprecatedResponse();
}

export async function OPTIONS() {
  return corsOptions();
}
