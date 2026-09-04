import { NextResponse } from "next/server";
import {
  getPrivyClient,
  getPrivyAuthPrivateKey,
  resolveEmbeddedWalletId,
  parsePrivyEarnError,
} from "@/lib/server/privyEarn";

// ──────────────────────────────────────────────
// POST /api/earn/claim
// Claims accrued yield / token incentives for the user's wallet on Base.
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

    // ── 2. Parse body for walletId ──
    const body = await request.json().catch(() => ({}));
    const { walletId: rawWalletId } = body;

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

    // ── 3. Call Privy Earn claim incentive API with Authorization Context ──
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const authKey = getPrivyAuthPrivateKey();

    // Attempt SDK call with authorization_context first
    const privy = getPrivyClient() as any;
    if (
      typeof privy?.wallets === "function" &&
      typeof privy.wallets()?.earn === "function" &&
      typeof privy.wallets()?.earn()?.ethereum === "function" &&
      typeof privy.wallets()?.earn()?.ethereum()?.incentive === "function"
    ) {
      try {
        const sdkContext: Record<string, any> = { user_jwts: [accessToken] };
        if (authKey) sdkContext.authorization_private_keys = [authKey];

        const sdkResult = await privy.wallets().earn().ethereum().incentive().claim(targetWalletId, {
          chain: "base",
          authorization_context: sdkContext,
        });

        return NextResponse.json({
          success: true,
          actionId: sdkResult?.id,
          status: sdkResult?.status || "pending",
        });
      } catch (sdkErr: any) {
        console.warn("[Earn Claim SDK call failed, falling back to REST]:", sdkErr?.message);
      }
    }

    // Fallback: REST API with computed privy-authorization-signature
    const endpointUrl = `https://api.privy.io/api/v1/wallets/${targetWalletId}/earn/ethereum/incentive/claim`;
    const requestBody = { chain: "base" };

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

    const claimData = await restResponse.json();

    if (!restResponse.ok) {
      console.error("[Earn Claim REST Error]:", claimData);
      const errMsg = claimData.error || claimData.message || claimData.details || "Claim reward failed";
      return NextResponse.json(
        { error: errMsg },
        { status: restResponse.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        actionId: claimData.id,
        status: claimData.status,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Earn Claim Error]:", error?.message || error);
    const detailedMessage = parsePrivyEarnError(error);
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
