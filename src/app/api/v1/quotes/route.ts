import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

export async function POST() {
  return corsJson(
    {
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message: "Fiat quotes have been retired. Use GET or POST /api/v1/swap/quote for cross-chain crypto swap quotes.",
      swapApi: "https://zkpay.top/api/v1/swap/quote",
    },
    { status: 410 }
  );
}

export async function GET() {
  return POST();
}

export async function OPTIONS() {
  return corsOptions();
}
