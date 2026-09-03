import { NextResponse } from "next/server";
import { getPrivyClient, resolveEmbeddedWalletId, parsePrivyEarnError } from "@/lib/server/privyEarn";

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

    // ── 3. Call Privy Earn claim incentive REST API via Basic Auth ──
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");

    const restResponse = await fetch(
      `https://api.privy.io/api/v1/wallets/${targetWalletId}/earn/ethereum/incentive/claim`,
      {
        method: "POST",
        headers: {
          "privy-app-id": appId,
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chain: "base",
        }),
      }
    );

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
