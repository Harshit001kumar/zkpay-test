import { NextResponse } from "next/server";
import { getUserRewardsSummary, getCurrentCycle } from "@/lib/server/rewardsStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    const cycle = searchParams.get("cycle") || getCurrentCycle();

    if (!address) {
      return NextResponse.json(
        { error: "Address query parameter is required" },
        { status: 400 }
      );
    }

    const summary = getUserRewardsSummary(address, cycle);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    console.error("[UserRewards] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch user rewards summary" },
      { status: 500 }
    );
  }
}
