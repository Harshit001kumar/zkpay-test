import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Retired legacy endpoint — use /api/v1/swap/quote instead.
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "ENDPOINT_RETIRED",
      message: "This legacy endpoint has been retired. Use /api/v1/swap/quote instead.",
    },
    { status: 410 }
  );
}
