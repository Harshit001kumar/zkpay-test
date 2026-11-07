import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

export async function GET() {
  return corsJson(
    {
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message: "Fiat exchange rates have been retired. Use GET /api/v1/swap/quote for live cross-chain crypto swap rates.",
      swapApi: "https://zkpay.top/api/v1/swap",
    },
    { status: 410 }
  );
}

export async function OPTIONS() {
  return corsOptions();
}
