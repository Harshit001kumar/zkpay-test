import { NextResponse } from "next/server";
import { getPrivyClient, resolveEmbeddedWalletId } from "@/lib/server/privyEarn";
import { CONTRACTS, EARN_CONFIG } from "@/lib/constants";

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

    // ── 2. Get walletId from query params or resolve from user ──
    const { searchParams } = new URL(request.url);
    let targetWalletId = searchParams.get("walletId");

    if (!targetWalletId || targetWalletId.startsWith("0x")) {
      targetWalletId = await resolveEmbeddedWalletId(userId);
    }

    if (!VAULT_ID) {
      // Calculate net APY after ZkPay 10% performance fee (8.40% gross -> 7.56% net)
      const grossApy = parseFloat(EARN_CONFIG.BENCHMARK_APY);
      const netApy = (grossApy * (1 - EARN_CONFIG.PERFORMANCE_FEE_BPS / 10000)).toFixed(2);

      return NextResponse.json({
        vault: {
          address: CONTRACTS.EARN_VAULT,
          name: EARN_CONFIG.VAULT_NAME,
          provider: EARN_CONFIG.VAULT_PROVIDER,
          apy: netApy,
          grossApy: EARN_CONFIG.BENCHMARK_APY,
          performanceFeePercent: "10%",
          tvlUsd: 12500000,
          availableLiquidityUsd: 5000000,
          asset: "USDC",
        },
        position: {
          totalDeposited: 0,
          totalWithdrawn: 0,
          assetsInVault: 0,
          earnedYield: 0,
        },
      });
    }

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");

    const vaultPromise = fetch(
      `https://api.privy.io/api/v1/earn/ethereum/vaults/${VAULT_ID}`,
      {
        headers: {
          "privy-app-id": appId,
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    const positionPromise = targetWalletId && !targetWalletId.startsWith("0x")
      ? fetch(
          `https://api.privy.io/api/v1/wallets/${targetWalletId}/earn/ethereum/vaults?vault_id=${VAULT_ID}`,
          {
            headers: {
              "privy-app-id": appId,
              Authorization: `Basic ${basicAuth}`,
            },
          }
        )
      : Promise.resolve(null);

    const [vaultRes, positionRes] = await Promise.all([vaultPromise, positionPromise]);

    const vaultData = vaultRes.ok ? await vaultRes.json() : null;
    const positionData = positionRes && positionRes.ok ? await positionRes.json() : null;

    if (!vaultRes.ok) {
      console.warn(`[Earn Position] Privy vault query returned ${vaultRes.status}`);
    } else {
      console.log(`[Earn Position] Privy vault data:`, vaultData);
    }

    // Resolve on-chain vault address
    const resolvedVaultAddress =
      (VAULT_ID.startsWith("0x") ? VAULT_ID : null) ||
      vaultData?.vault_address ||
      vaultData?.address ||
      vaultData?.contract_address ||
      vaultData?.vaultAddress ||
      CONTRACTS.EARN_VAULT;

    // Parse APY from basis points to percentage (fallback to benchmark net APY)
    const userApyBps = vaultData?.user_apy;
    const grossApy = userApyBps && userApyBps > 0 ? userApyBps / 100 : parseFloat(EARN_CONFIG.BENCHMARK_APY);
    const netApyPercent = (grossApy * (1 - EARN_CONFIG.PERFORMANCE_FEE_BPS / 10000)).toFixed(2);

    // Parse position amounts (handle array or object response)
    const decimals = vaultData?.asset?.decimals ?? 6;
    const divisor = Math.pow(10, decimals);

    let pos = positionData;
    if (Array.isArray(pos)) {
      pos = pos.find((p: any) => p.vault_id === VAULT_ID) || pos[0];
    } else if (Array.isArray(pos?.data)) {
      pos = pos.data.find((p: any) => p.vault_id === VAULT_ID) || pos.data[0];
    }

    const totalDeposited = pos?.total_deposited
      ? Number(pos.total_deposited) / divisor
      : 0;
    const totalWithdrawn = pos?.total_withdrawn
      ? Number(pos.total_withdrawn) / divisor
      : 0;
    const assetsInVault = pos?.assets_in_vault
      ? Number(pos.assets_in_vault) / divisor
      : 0;
    const earnedYield = assetsInVault - (totalDeposited - totalWithdrawn);

    return NextResponse.json({
      vault: {
        address: resolvedVaultAddress,
        name: vaultData?.name || EARN_CONFIG.VAULT_NAME,
        provider: vaultData?.provider || EARN_CONFIG.VAULT_PROVIDER,
        apy: netApyPercent,
        grossApy: grossApy.toFixed(2),
        performanceFeePercent: "10%",
        tvlUsd: vaultData?.tvl_usd ?? 12500000,
        availableLiquidityUsd: vaultData?.available_liquidity_usd ?? 5000000,
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
    console.error("[Earn Position Error]:", error?.message || error);
    return NextResponse.json(
      {
        vault: {
          address: CONTRACTS.EARN_VAULT,
          name: EARN_CONFIG.VAULT_NAME,
          provider: EARN_CONFIG.VAULT_PROVIDER,
          apy: "7.56",
          grossApy: EARN_CONFIG.BENCHMARK_APY,
          performanceFeePercent: "10%",
          tvlUsd: 12500000,
          availableLiquidityUsd: 5000000,
          asset: "USDC",
        },
        position: {
          totalDeposited: 0,
          totalWithdrawn: 0,
          assetsInVault: 0,
          earnedYield: 0,
        },
      },
      { status: 200 }
    );
  }
}
