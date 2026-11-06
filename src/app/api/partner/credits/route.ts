import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { listPartnerFeeCredits } from "@/lib/server/partnerBalanceStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const credits = await listPartnerFeeCredits(auth.userId, limit);

    return NextResponse.json({
      success: true,
      credits,
    });
  } catch (err: any) {
    console.error("[PartnerCredits] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load fee credits" },
      { status: 500 }
    );
  }
}
