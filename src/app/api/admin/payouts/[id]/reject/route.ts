import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { rejectAdminPayout } from "@/lib/server/partnerBalanceStore";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing payout ID" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    const adminIdentifier = auth.walletAddress || auth.userId || "admin";
    const ticket = await rejectAdminPayout(id, reason || "Rejected by admin", adminIdentifier);

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (err: any) {
    console.error("[AdminPayoutReject] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to reject payout" },
      { status: 400 }
    );
  }
}
