import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

const VAULT_ID = process.env.PRIVY_EARN_VAULT_ID;

// ──────────────────────────────────────────────
// GET /api/earn/position?walletId=...
// Returns vault details (APY, TVL) and the
// user's position (assets_in_vault, yield earned).
// ──────────────────────────────────────────────
export async function GET(request: Request) {
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
      await privy.utils().auth().verifyAccessToken(accessToken);
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

    // ── 2. Get walletId from query params ──
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get("walletId");

    if (!walletId) {
      return NextResponse.json(
        { error: "walletId query parameter is required" },
        { status: 400 }
      );
    }

    // ── 3. Fetch vault details (APY, TVL, liquidity) ──
    // Use the REST API directly since the SDK method chain may vary
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");

    const [vaultRes, positionRes] = await Promise.all([
      fetch(
        `https://api.privy.io/api/v1/earn/ethereum/vaults/${VAULT_ID}`,
        {
          headers: {
            "privy-app-id": appId,
            Authorization: `Basic ${basicAuth}`,
          },
        }
      ),
      fetch(
        `https://api.privy.io/api/v1/wallets/${walletId}/earn/ethereum/vaults?vault_id=${VAULT_ID}`,
        {
          headers: {
            "privy-app-id": appId,
            Authorization: `Basic ${basicAuth}`,
          },
        }
      ),
    ]);

    const vaultData = vaultRes.ok ? await vaultRes.json() : null;
    const positionData = positionRes.ok ? await positionRes.json() : null;

    // Parse APY from basis points to percentage
    const userApyBps = vaultData?.user_apy ?? 0;
    const userApyPercent = (userApyBps / 100).toFixed(2);

    // Parse position amounts (smallest unit → human-readable)
    const decimals = vaultData?.asset?.decimals ?? 6;
    const divisor = Math.pow(10, decimals);

    const totalDeposited = positionData?.total_deposited
      ? Number(positionData.total_deposited) / divisor
      : 0;
    const totalWithdrawn = positionData?.total_withdrawn
      ? Number(positionData.total_withdrawn) / divisor
      : 0;
    const assetsInVault = positionData?.assets_in_vault
      ? Number(positionData.assets_in_vault) / divisor
      : 0;
    const earnedYield = assetsInVault - (totalDeposited - totalWithdrawn);

    return NextResponse.json({
      vault: {
        name: vaultData?.name || "Yield Vault",
        provider: vaultData?.provider || "unknown",
        apy: userApyPercent,
        tvlUsd: vaultData?.tvl_usd ?? null,
        availableLiquidityUsd: vaultData?.available_liquidity_usd ?? null,
        asset: vaultData?.asset?.symbol ?? "USDC",
      },
      position: {
        totalDeposited,
        totalWithdrawn,
        assetsInVault,
        earnedYield: Math.max(0, earnedYield),
      },
    });
  } catch (error: any) {
    console.error("Privy Earn Position Error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch position data." },
      { status: 500 }
    );
  }
}
