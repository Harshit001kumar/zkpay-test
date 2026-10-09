import { NextResponse } from "next/server";
import { getUserRewardsSummary, getCurrentCycle } from "@/lib/server/rewardsStore";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { isAddress } from "viem";

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

    if (!isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Require valid authentication session to protect financial privacy
    const userAuth = await verifyUserRequest(req);
    if (!userAuth.authorized || !userAuth.userId) {
      return NextResponse.json(
        { error: userAuth.error || "Unauthorized — session token required" },
        { status: userAuth.status || 401 }
      );
    }

    const normalizedAddress = address.toLowerCase();
    const authorizedWallets = new Set([
      ...(userAuth.walletAddresses || []).map((a) => a.toLowerCase()),
      ...(userAuth.walletAddress ? [userAuth.walletAddress.toLowerCase()] : []),
    ]);

    if (authorizedWallets.size > 0 && !authorizedWallets.has(normalizedAddress)) {
      return NextResponse.json(
        { error: "Forbidden — cannot view another user's rewards" },
        { status: 403 }
      );
    }

    const summary = await getUserRewardsSummary(address, cycle);

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
