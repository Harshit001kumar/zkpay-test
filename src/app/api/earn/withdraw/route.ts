import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

const VAULT_ID = process.env.PRIVY_EARN_VAULT_ID;

// ──────────────────────────────────────────────
// POST /api/earn/withdraw
// Withdraws USDC + accrued yield from the vault.
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Verify auth ──
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    try {
      await privy.utils().auth().verifyAccessToken({
        access_token: accessToken,
      });
    } catch {
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    if (!VAULT_ID) {
      return NextResponse.json(
        { error: "Earn feature is not configured" },
        { status: 503 }
      );
    }

    // ── 2. Validate input ──
    const body = await request.json();
    const { amount, walletId } = body;

    if (!walletId || typeof walletId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid walletId" },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount." },
        { status: 400 }
      );
    }

    // ── 3. Call Privy Earn withdraw API ──
    const withdrawParams: Record<string, unknown> = {
      vault_id: VAULT_ID,
      amount: String(parsedAmount),
    };

    const authPrivateKey = process.env.PRIVY_AUTH_PRIVATE_KEY;
    if (authPrivateKey) {
      withdrawParams.authorization_context = {
        authorization_private_keys: [authPrivateKey],
      };
    }

    const response = await privy
      .wallets()
      .earn()
      .ethereum()
      .withdraw(walletId, withdrawParams as any);

    return NextResponse.json(
      {
        success: true,
        actionId: response.id,
        status: response.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Privy Earn Withdraw Error:", error?.message || error);
    return NextResponse.json(
      { error: "Withdrawal failed. Please try again." },
      { status: 500 }
    );
  }
}
