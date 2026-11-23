import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { getPartnerBalance } from "@/lib/server/partnerBalanceStore";
import { enforceRateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { response: rlResp } = enforceRateLimit(req, "partner_read", undefined, { cors: false });
  if (rlResp) return rlResp;

  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const balance = await getPartnerBalance(auth.userId);
    return NextResponse.json({
      success: true,
      balance,
    });
  } catch (err: any) {
    console.error("[PartnerBalance] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load partner balance" },
      { status: 500 }
    );
  }
}
