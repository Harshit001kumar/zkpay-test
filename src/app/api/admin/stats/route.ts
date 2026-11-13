import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";
import { getResilientPublicClientForChain } from "@/lib/server/rpcConfig";

export const dynamic = "force-dynamic";

function getServerPublicClient() {
  return getResilientPublicClientForChain("base");
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

    // 1. Fetch Treasury USDC Balance (collected swap fees)
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

    // 2. Backend Relayer / Proxy Forwarder Wallet Telemetry
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
        healthy: sweeperBal > 500000000000000n,
        error: undefined,
      };
    } catch (err: any) {
      sweeperStats = {
        configured: false,
        address: null,
        balanceEth: "0.0000",
        healthy: false,
        error: err.message || "Relayer private key not set",
      };
    }

    const relayerStats = {
      address: sweeperStats.address || null,
      balanceEth: sweeperStats.configured ? `${sweeperStats.balanceEth} ETH` : "Unconfigured",
      healthy: sweeperStats.healthy,
      error: sweeperStats.error,
    };

    const treasuryUsdc = (Number(treasuryUsdcRaw) / 1_000_000).toFixed(2);

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      network: {
        chainId: CHAIN.id,
        name: CHAIN.name,
        explorer: CHAIN.blockExplorer,
      },
      contracts: {
        usdc: CONTRACTS.USDC,
        treasury: CONTRACTS.TREASURY,
      },
      relayer: relayerStats,
      sweeper: sweeperStats,
      telemetry: {
        treasuryUsdcBalance: treasuryUsdc,
        platformFeeBps: 200,
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
