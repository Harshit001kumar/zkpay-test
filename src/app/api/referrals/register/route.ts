import { NextResponse } from "next/server";
import { bindReferral } from "@/lib/server/rewardsStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userAddress, referrerCodeOrAddress } = body;

    if (!userAddress || !referrerCodeOrAddress) {
      return NextResponse.json(
        { error: "Missing required fields: userAddress and referrerCodeOrAddress" },
        { status: 400 }
      );
    }

    const res = bindReferral(userAddress, referrerCodeOrAddress);

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      referrer: res.referrer,
      message: "Referral binding registered successfully",
    });
  } catch (err: any) {
    console.error("[ReferralRegister] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to register referral" },
      { status: 500 }
    );
  }
}
