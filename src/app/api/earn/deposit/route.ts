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

    // ── 5. Call Privy Earn deposit API with Authorization Context ──
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const authKey = getPrivyAuthPrivateKey();

    // Attempt SDK call with authorization_context first
    const privy = getPrivyClient() as any;
    if (typeof privy?.wallets === "function" && typeof privy.wallets()?.earn === "function") {
      try {
        const sdkContext: Record<string, any> = { user_jwts: [accessToken] };
        if (authKey) sdkContext.authorization_private_keys = [authKey];

        const sdkResult = await privy.wallets().earn().ethereum().deposit(targetWalletId, {
          vault_id: VAULT_ID,
          amount: String(parsedAmount),
          authorization_context: sdkContext,
        });

        return NextResponse.json({
          success: true,
          actionId: sdkResult?.id,
          status: sdkResult?.status || "pending",
        });
      } catch (sdkErr: any) {
        console.warn("[Earn Deposit SDK call failed, falling back to REST]:", sdkErr?.message);
      }
    }

    // Fallback: REST API with computed privy-authorization-signature
    const endpointUrl = `https://api.privy.io/api/v1/wallets/${targetWalletId}/earn/ethereum/deposit`;
    const requestBody = {
      vault_id: VAULT_ID,
      amount: String(parsedAmount),
    };

    const headers: Record<string, string> = {
      "privy-app-id": appId,
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    };

    if (authKey) {
      const { createPrivyAuthorizationSignature } = await import("@/lib/server/privyEarn");
      const signature = createPrivyAuthorizationSignature({
        method: "POST",
        url: endpointUrl,
        body: requestBody,
        appId,
        privateKeyRaw: authKey,
      });
      if (signature) {
        headers["privy-authorization-signature"] = signature;
      }
    }

    const restResponse = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const earnData = await restResponse.json();

    if (!restResponse.ok) {
      console.error("[Earn Deposit REST Error]:", earnData);
      const errMsg = earnData.error || earnData.message || earnData.details || "Deposit failed";
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
    console.error("[Earn Deposit Error]:", error?.message || error);
    const detailedMessage = parsePrivyEarnError(error);
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
