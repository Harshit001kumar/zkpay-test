import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

// ──────────────────────────────────────────────
// Lazy-init Privy client to avoid crashes if env vars are missing at build time
// ──────────────────────────────────────────────
let _privy: InstanceType<typeof PrivyClient> | null = null;
function getPrivy() {
  if (!_privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Privy credentials not configured");
    _privy = new PrivyClient(appId, appSecret);
  }
  return _privy;
}

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
      verifiedClaims = await getPrivy().utils().auth().verifyAccessToken(accessToken);
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
    // Privy Earn API requires the Privy Wallet ID (e.g. clx...), NOT the 0x EVM address.
    let targetWalletId = rawWalletId;

    if (!targetWalletId || targetWalletId.startsWith("0x")) {
      try {
        const privyUser = await getPrivy().getUser(userId);
        const embeddedWallet = privyUser.linkedAccounts?.find(
          (acc: any) =>
            acc.type === "wallet" &&
            (acc.walletClientType === "privy" || acc.connectorType === "embedded")
        ) as any;

        if (embeddedWallet?.id) {
          targetWalletId = embeddedWallet.id;
        }
      } catch (userErr: any) {
        console.error("[Earn Deposit] Failed to fetch user for wallet lookup:", userErr?.message);
      }
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
    // The SDK handles ERC-20 approval + deposit in a single call.
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

    const earnResponse = await getPrivy()
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
    const detailedMessage =
      error?.response?.data?.message ||
      error?.message ||
      "Deposit transaction failed. Please ensure your wallet has sufficient USDC on Base.";
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
