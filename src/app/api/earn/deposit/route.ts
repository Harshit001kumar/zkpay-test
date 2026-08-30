import { NextResponse } from "next/server";
import {
  getPrivyClient,
  getPrivyAuthPrivateKey,
  resolveEmbeddedWalletId,
  parsePrivyEarnError,
} from "@/lib/server/privyEarn";

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
      verifiedClaims = await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
    } catch (authErr: any) {
      console.error("[Earn Deposit] Token verification failed:", authErr?.message);
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    // ── 2. Validate environment is configured ──
    if (!VAULT_ID) {
      console.error("[Earn Deposit] PRIVY_EARN_VAULT_ID is not configured");
      return NextResponse.json(
        { error: "Privy Earn Vault ID is not configured on the server (missing PRIVY_EARN_VAULT_ID)." },
        { status: 400 }
      );
    }

    const authPrivateKey = getPrivyAuthPrivateKey();
    if (!authPrivateKey) {
      return NextResponse.json(
        {
          error:
            "Privy Authorization Key is not configured on the server. Please generate an Authorization Key in Privy Dashboard (Settings > Authorization Keys) and add PRIVY_AUTH_PRIVATE_KEY to your Render environment variables.",
        },
        { status: 400 }
      );
    }

    // ── 3. Parse and validate input ──
    const body = await request.json();
    const { amount, walletId: rawWalletId } = body;

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

    // ── 4. Resolve Target Privy Embedded Wallet ID ──
    let targetWalletId = rawWalletId;
    if (!targetWalletId || targetWalletId.startsWith("0x")) {
      targetWalletId = await resolveEmbeddedWalletId(userId);
    }

    if (!targetWalletId || targetWalletId.startsWith("0x")) {
      return NextResponse.json(
        {
          error:
            "No Privy embedded wallet ID found. Privy Earn requires a Privy-managed embedded wallet.",
        },
        { status: 400 }
      );
    }

    // ── 5. Call Privy Earn deposit API ──
    const depositParams: Record<string, unknown> = {
      vault_id: VAULT_ID,
      amount: String(parsedAmount),
      authorization_context: {
        authorization_private_keys: [authPrivateKey],
      },
    };

    const earnResponse = await getPrivyClient()
      .wallets()
      .earn()
      .ethereum()
      .deposit(targetWalletId, depositParams as any);

    return NextResponse.json(
      {
        success: true,
        actionId: earnResponse.id,
        status: earnResponse.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Earn Deposit Error]:", error?.message || error);
    const detailedMessage = parsePrivyEarnError(error);
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
