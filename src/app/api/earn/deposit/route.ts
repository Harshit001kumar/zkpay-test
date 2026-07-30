import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

// ──────────────────────────────────────────────
// Server-side Privy client (Node SDK)
// ──────────────────────────────────────────────
const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

const VAULT_ID = process.env.PRIVY_EARN_VAULT_ID;

// ──────────────────────────────────────────────
// POST /api/earn/deposit
// Deposits USDC from the authenticated user's
// embedded wallet into the configured Privy Earn vault.
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Verify the caller is authenticated ──
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized — no access token provided" },
        { status: 401 }
      );
    }

    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    // ── 2. Validate environment is configured ──
    if (!VAULT_ID) {
      console.error("PRIVY_EARN_VAULT_ID is not set");
      return NextResponse.json(
        { error: "Earn feature is not configured" },
        { status: 503 }
      );
    }

    // ── 3. Parse and validate input ──
    const body = await request.json();
    const { amount, walletId } = body;

    if (!walletId || typeof walletId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid walletId" },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (
      !amount ||
      isNaN(parsedAmount) ||
      !isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 1_000_000 // Safety cap
    ) {
      return NextResponse.json(
        { error: "Invalid amount. Must be a positive number up to 1,000,000." },
        { status: 400 }
      );
    }

    // Validate USDC decimal precision (max 6 decimals)
    const decimalParts = String(amount).split(".");
    if (decimalParts[1] && decimalParts[1].length > 6) {
      return NextResponse.json(
        { error: "USDC supports a maximum of 6 decimal places." },
        { status: 400 }
      );
    }

    // ── 4. Call Privy Earn deposit API ──
    // The SDK handles ERC-20 approval + deposit in a single call.
    // The deposit is asynchronous — it returns a "pending" wallet action.
    const depositParams: Record<string, unknown> = {
      vault_id: VAULT_ID,
      amount: String(parsedAmount),
    };

    // Only include authorization_context if an auth private key is configured
    const authPrivateKey = process.env.PRIVY_AUTH_PRIVATE_KEY;
    if (authPrivateKey) {
      depositParams.authorization_context = {
        authorization_private_keys: [authPrivateKey],
      };
    }

    const earnResponse = await privy
      .wallets()
      .earn()
      .ethereum()
      .deposit(walletId, depositParams as any);

    return NextResponse.json(
      {
        success: true,
        actionId: earnResponse.id,
        status: earnResponse.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Privy Earn Deposit Error:", error?.message || error);
    return NextResponse.json(
      { error: "Deposit failed. Please try again." },
      { status: 500 }
    );
  }
}
