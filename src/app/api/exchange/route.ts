import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Retired legacy endpoint — kept as explicit 410 Gone so stale clients receive a clean migration error
// instead of bypassing /api/v1/swap/create security & validation checks.
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "ENDPOINT_RETIRED",
      message: "This legacy endpoint has been retired. Use /api/v1/swap/create instead.",
    },
    { status: 410 }
  );
}
