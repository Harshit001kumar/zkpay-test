import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

export async function POST() {
  return corsJson(
    {
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message: "Fiat payment links have been retired. Use /api/v1/swap/recover for swap refunds.",
    },
    { status: 410 }
  );
}

export async function OPTIONS() {
  return corsOptions();
}
