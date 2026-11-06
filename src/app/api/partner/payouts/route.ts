import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import {
  requestPartnerPayout,
  listPartnerPayoutRequests,
  SUPPORTED_PAYOUT_OPTIONS,
  MIN_PAYOUT_AMOUNT_USD,
} from "@/lib/server/partnerBalanceStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const payouts = await listPartnerPayoutRequests(auth.userId);
    return NextResponse.json({
      success: true,
      payouts,
      supportedOptions: SUPPORTED_PAYOUT_OPTIONS,
      minPayoutUsd: MIN_PAYOUT_AMOUNT_USD,
    });
  } catch (err: any) {
    console.error("[PartnerPayouts] GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load payouts" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { amountUsd, payoutOption, destinationAddress } = body;

    if (!amountUsd || !payoutOption || !destinationAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: amountUsd, payoutOption, destinationAddress" },
        { status: 400 }
      );
    }

    const ticket = await requestPartnerPayout({
      userId: auth.userId,
      partnerWalletAddress: auth.walletAddress,
      amountUsd: Number(amountUsd),
      payoutOption,
      destinationAddress: String(destinationAddress).trim(),
    });

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (err: any) {
    console.error("[PartnerPayouts] POST Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to request payout" },
      { status: 400 }
    );
  }
}
