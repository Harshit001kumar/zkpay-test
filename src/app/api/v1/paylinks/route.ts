import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

function deprecatedResponse() {
  return corsJson(
    {
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message: "Fiat payment links have been retired. ZkPay is now exclusively a Cross-Chain Swap Provider (/api/v1/swap).",
      swapApi: "https://zkpay.top/api/v1/swap",
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

export async function PATCH() {
  return deprecatedResponse();
}

export async function OPTIONS() {
  return corsOptions();
}
