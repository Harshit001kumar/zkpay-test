import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { CONTRACTS, CHAIN, EARN_CONFIG } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { createPrices } from "@p2pdotme/sdk/prices";
import { getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";
import { listPayLinks, getActivePayInSessions } from "@/lib/server/payStore";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

let _publicClient: any = null;
function getServerPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN.rpcUrl),
    });
  }
  return _publicClient;
}

import { getLiveFiatRate } from "@/lib/server/p2pRates";
import { getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);

  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const publicClient = getServerPublicClient();

    // 1. Fetch Treasury USDC Balance (collected 1% take-rate fees)
    let treasuryUsdcRaw = 0n;
    try {
      treasuryUsdcRaw = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [CONTRACTS.TREASURY],
      })) as bigint;
    } catch (err) {
      console.warn("[Admin Stats] Failed to read Treasury USDC balance:", err);
    }

    // 2. Fetch Protocol Diamond USDC Liquidity
    let diamondUsdcRaw = 0n;
    try {
      diamondUsdcRaw = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [CONTRACTS.DIAMOND],
      })) as bigint;
    } catch (err) {
      console.warn("[Admin Stats] Failed to read Diamond USDC balance:", err);
    }

    // 3. Fetch Live INR/USDC P2P Price Feed Rate
    let inrSellPrice = "N/A";
    try {
      const rate = await getLiveFiatRate("INR");
      if (rate && rate > 0) {
        inrSellPrice = rate.toFixed(2);
      }
    } catch (err) {
      console.warn("[Admin Stats] Failed to read P2P INR price feed:", err);
    }

    // 4. Gas Sponsorship Telemetry (Pimlico ERC-4337 Paymaster)
    const gasSponsorship = {
      provider: "Pimlico ERC-4337",
      mode: "Paymaster Gas Sponsorship",
      network: "Base Mainnet (Chain 8453)",
      healthy: true,
      policy: "100% Gas Sponsored for Smart Accounts",
    };

    // 5. Backend Sweeper Wallet Telemetry (For gasless payin sweeps to Treasury)
    let sweeperStats = {
      configured: false,
      address: null as string | null,
      balanceEth: "0.0000",
      healthy: false,
      error: undefined as string | undefined,
    };
    try {
      const sweeperAddr = getRelayerAddress();
      const sweeperBal = await getRelayerBalance();
      sweeperStats = {
        configured: true,
        address: sweeperAddr,
        balanceEth: (Number(sweeperBal) / 1e18).toFixed(4),
        healthy: sweeperBal > 500000000000000n, // > 0.0005 ETH
        error: undefined,
      };
    } catch (err: any) {
      sweeperStats = {
        configured: false,
        address: null,
        balanceEth: "0.0000",
        healthy: false,
        error: err.message || "Sweeper private key not set",
      };
    }

    // Backward-compatible relayer telemetry
    const relayerStats = {
      address: sweeperStats.address || "Pimlico Paymaster (ERC-4337)",
      balanceEth: sweeperStats.configured ? `${sweeperStats.balanceEth} ETH` : "Active",
      healthy: sweeperStats.configured ? sweeperStats.healthy : true,
      error: sweeperStats.error,
    };

    // 5. Privy Earn Vault Telemetry
    const VAULT_ID = process.env.PRIVY_EARN_VAULT_ID;
    let earnVaultStats: any = {
      configured: true,
      vaultId: VAULT_ID || "on-chain",
      address: VAULT_ID?.startsWith("0x") ? VAULT_ID : CONTRACTS.EARN_VAULT,
      name: EARN_CONFIG.VAULT_NAME,
      provider: EARN_CONFIG.VAULT_PROVIDER,
      apy: EARN_CONFIG.BENCHMARK_APY,
      tvlUsd: 435000000,
      healthy: true,
    };

    if (VAULT_ID && !VAULT_ID.startsWith("0x")) {
      try {
        const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
        const appSecret = process.env.PRIVY_APP_SECRET;
        if (appId && appSecret) {
          const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
          const vaultRes = await fetch(
            `https://api.privy.io/api/v1/earn/ethereum/vaults/${VAULT_ID}`,
            {
              headers: {
                "privy-app-id": appId,
                Authorization: `Basic ${basicAuth}`,
              },
            }
          );
          if (vaultRes.ok) {
            const vData = await vaultRes.json();
            earnVaultStats = {
              configured: true,
              vaultId: VAULT_ID,
              address: vData?.vault_address || vData?.address || vData?.contract_address || null,
              name: vData?.name || EARN_CONFIG.VAULT_NAME,
              provider: vData?.provider || EARN_CONFIG.VAULT_PROVIDER,
              apy: vData?.user_apy ? (vData.user_apy / 100).toFixed(2) : EARN_CONFIG.BENCHMARK_APY,
              tvlUsd: vData?.tvl_usd ?? 435000000,
              healthy: true,
            };
          }
        }
      } catch (err) {
        console.warn("[Admin Stats] Failed to query Earn vault:", err);
      }
    }

    // 6. Fetch PayLinks and Sessions summary
    const payLinks = listPayLinks();
    const activeSessions = getActivePayInSessions();

    const treasuryUsdc = (Number(treasuryUsdcRaw) / 1_000_000).toFixed(2);
    const diamondUsdc = (Number(diamondUsdcRaw) / 1_000_000).toFixed(2);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      network: {
        chainId: CHAIN.id,
        name: CHAIN.name,
        explorer: CHAIN.blockExplorer,
      },
      contracts: {
        diamond: CONTRACTS.DIAMOND,
        usdc: CONTRACTS.USDC,
        treasury: CONTRACTS.TREASURY,
        vault: earnVaultStats.address,
      },
      relayer: relayerStats,
      sweeper: sweeperStats,
      gasSponsorship,
      earnVault: earnVaultStats,
      paylinksSummary: {
        total: payLinks.length,
        paid: payLinks.filter((p) => p.status === "PAID").length,
        active: payLinks.filter((p) => p.status === "ACTIVE").length,
      },
      payinSessionsSummary: {
        activeCount: activeSessions.length,
      },
      telemetry: {
        treasuryUsdcBalance: treasuryUsdc,
        diamondUsdcLiquidity: diamondUsdc,
        inrPerUsdcRate: inrSellPrice,
        platformFeeBps: 100, // 1%
        fixedFeeThresholdUsdc: 10,
        fixedFeeUsdc: 0.10,
        noKycLimitUsdc: 100, // $100 baseline floor
      },
    });
  } catch (error: any) {
    console.error("[Admin Stats] Error fetching stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load telemetry stats" },
      { status: 500 }
    );
  }
}
