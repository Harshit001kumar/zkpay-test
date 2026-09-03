import { NextResponse } from "next/server";
import {
  getPrivyClient,
  getPrivyAuthPrivateKey,
  resolveEmbeddedWalletId,
  parsePrivyEarnError,
} from "@/lib/server/privyEarn";

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
      verifiedClaims = await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
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

    // ── 4. Call Privy Earn withdraw REST API via Basic Auth ──
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");

    const restResponse = await fetch(
      `https://api.privy.io/api/v1/wallets/${targetWalletId}/earn/ethereum/withdraw`,
      {
        method: "POST",
        headers: {
          "privy-app-id": appId,
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vault_id: VAULT_ID,
          amount: String(parsedAmount),
        }),
      }
    );

    const earnData = await restResponse.json();

    if (!restResponse.ok) {
      console.error("[Earn Withdraw REST Error]:", earnData);
      const errMsg = earnData.error || earnData.message || earnData.details || "Withdrawal failed";
      return NextResponse.json(
        { error: errMsg },
        { status: restResponse.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        actionId: earnData.id,
        status: earnData.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Earn Withdraw Error]:", error?.message || error);
    const detailedMessage = parsePrivyEarnError(error);
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
