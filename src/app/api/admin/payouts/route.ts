import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { listAdminPayoutRequests } from "@/lib/server/partnerBalanceStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const payouts = await listAdminPayoutRequests(status);

    return NextResponse.json({
      success: true,
      payouts,
    });
  } catch (err: any) {
    console.error("[AdminPayouts] GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load admin payouts" },
      { status: 500 }
    );
  }
}
