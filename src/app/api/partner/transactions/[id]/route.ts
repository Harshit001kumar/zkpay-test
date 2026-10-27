import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { getPartnerTransactionDetail } from "@/lib/server/partnerLedger";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  const txId = params?.id;

  if (!txId) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });
  }

  try {
    const tx = await getPartnerTransactionDetail(auth.userId, txId);
    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Transaction not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      transaction: tx,
    });
  } catch (err: any) {
    console.error("[PartnerTxDetail] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load transaction details" },
      { status: 500 }
    );
  }
}
