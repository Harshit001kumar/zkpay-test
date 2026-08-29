import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

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
        { error: "Unauthorized — no access token provided" },
        { status: 401 }
      );
    }

    let verifiedClaims;
    try {
      verifiedClaims = await getPrivy().utils().auth().verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    if (!VAULT_ID) {
      return NextResponse.json(
        { error: "Privy Earn Vault ID is not configured on the server (missing PRIVY_EARN_VAULT_ID)." },
        { status: 400 }
      );
    }

    // ── 2. Validate input ──
    const body = await request.json();
    const { amount, walletId: rawWalletId } = body;

    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount." },
        { status: 400 }
      );
    }

    // ── 3. Resolve Target Privy Embedded Wallet ID ──
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
        console.error("[Earn Withdraw] Failed to fetch user for wallet lookup:", userErr?.message);
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

    // ── 4. Call Privy Earn withdraw API ──
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

    const response = await getPrivy()
      .wallets()
      .earn()
      .ethereum()
      .withdraw(targetWalletId, withdrawParams as any);

    return NextResponse.json(
      {
        success: true,
        actionId: response.id,
        status: response.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Earn Withdraw Error]:", error?.message || error);
    const detailedMessage =
      error?.response?.data?.message ||
      error?.message ||
      "Withdrawal request failed. Please try again.";
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
