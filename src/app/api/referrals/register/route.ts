import { NextResponse } from "next/server";
import { bindReferral } from "@/lib/server/rewardsStore";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { isAddress } from "viem";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userAuth = await verifyUserRequest(req);
    if (!userAuth.authorized || !userAuth.userId) {
      return NextResponse.json(
        { error: userAuth.error || "Unauthorized — valid session required to register referral" },
        { status: userAuth.status || 401 }
      );
    }

    const body = await req.json();
    const { userAddress: rawUserAddress, referrerCodeOrAddress } = body;

    if (!rawUserAddress || !referrerCodeOrAddress) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress and referrerCodeOrAddress" },
        { status: 400 }
      );
    }

    if (!isAddress(rawUserAddress)) {
      return NextResponse.json({ error: "Invalid userAddress format" }, { status: 400 });
    }

    const userAddress = rawUserAddress.toLowerCase();

    // Verify caller owns the userAddress
    const authorizedWallets = new Set([
      ...(userAuth.walletAddresses || []).map((a) => a.toLowerCase()),
      ...(userAuth.walletAddress ? [userAuth.walletAddress.toLowerCase()] : []),
    ]);

    if (authorizedWallets.size > 0 && !authorizedWallets.has(userAddress)) {
      return NextResponse.json(
        { error: "Forbidden — userAddress does not belong to the authenticated user" },
        { status: 403 }
      );
    }

    const res = await bindReferral(userAddress, referrerCodeOrAddress);

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      referrer: res.referrer,
      alreadyBound: res.alreadyBound || false,
      message: res.alreadyBound
        ? "Referral already registered"
        : "Referral binding registered successfully",
    });
  } catch (err: any) {
    console.error("[ReferralRegister] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to register referral" },
      { status: 500 }
    );
  }
}
