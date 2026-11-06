import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { completeAdminPayout } from "@/lib/server/partnerBalanceStore";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { txHash } = body;

    if (!txHash || typeof txHash !== "string" || txHash.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Transaction hash (txHash) is required to complete payout." },
        { status: 400 }
      );
    }

    const adminIdentifier = auth.walletAddress || auth.userId || "admin";
    const ticket = await completeAdminPayout(id, txHash.trim(), adminIdentifier);

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (err: any) {
    console.error("[AdminPayoutComplete] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to complete payout" },
      { status: 400 }
    );
  }
}
