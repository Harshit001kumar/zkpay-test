import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import {
  getAdminMonthlyOverview,
  toggleUserExclusion,
  markCyclePaid,
  getCurrentCycle,
} from "@/lib/server/rewardsStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const cycle = searchParams.get("cycle") || getCurrentCycle();

    const overview = getAdminMonthlyOverview(cycle);

    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    console.error("[AdminRewards GET] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch rewards overview" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { action, cycle = getCurrentCycle() } = body;

    if (action === "toggle-exclusion") {
      const { userAddress, excluded } = body;
      if (!userAddress || typeof excluded !== "boolean") {
        return NextResponse.json({ error: "Missing userAddress or excluded boolean" }, { status: 400 });
      }

      const res = toggleUserExclusion(cycle, userAddress, excluded);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, record: res.record });
    }

    if (action === "mark-paid") {
      const { userAddresses, payoutTxHash } = body;
      if (!Array.isArray(userAddresses) || userAddresses.length === 0 || !payoutTxHash) {
        return NextResponse.json(
          { error: "Missing userAddresses array or payoutTxHash" },
          { status: 400 }
        );
      }

      const res = markCyclePaid(cycle, userAddresses, payoutTxHash);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        updatedCount: res.updatedCount,
        updated: res.updated,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[AdminRewards POST] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to process rewards action" }, { status: 500 });
  }
}
