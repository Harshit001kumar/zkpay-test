import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { CONTRACTS, CHAIN } from "@/lib/constants";
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

let _pricesClient: any = null;
function getPricesClient() {
  if (!_pricesClient) {
    _pricesClient = createPrices({
      publicClient: getServerPublicClient(),
      diamondAddress: CONTRACTS.DIAMOND as `0x${string}`,
    });
  }
  return _pricesClient;
}

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
      const pricesClient = getPricesClient();
      const priceResult = await pricesClient.getPriceConfig({ currency: "INR" });
      if (priceResult.isOk() && priceResult.value?.sellPrice) {
        inrSellPrice = (Number(priceResult.value.sellPrice) / 1_000_000).toFixed(2);
      }
    } catch (err) {
      console.warn("[Admin Stats] Failed to read P2P INR price feed:", err);
    }

    // 4. Fetch Gas Relayer telemetry
    let relayerStats = {
      address: "Not Configured",
      balanceEth: "0.00",
      healthy: false,
      error: undefined as string | undefined,
    };
    try {
      const relAddress = getRelayerAddress();
      const relBal = await getRelayerBalance();
      relayerStats = {
        address: relAddress,
        balanceEth: formatEther(relBal),
        healthy: relBal > 0n,
        error: relBal === 0n ? "Gas Tank is empty (0 ETH). Please send ETH to relayer address." : undefined,
      };
    } catch (relErr: any) {
      relayerStats = {
        address: "Not Configured",
        balanceEth: "0.00",
        healthy: false,
        error: relErr?.message || "Missing RELAYER_PRIVATE_KEY",
      };
    }

    // 5. Fetch PayLinks and Sessions summary
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
      },
      relayer: relayerStats,
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
