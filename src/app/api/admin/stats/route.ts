import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { getPublicClient, getOfframpPrice } from "@/lib/p2pkit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);

  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const publicClient = getPublicClient();

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
    let inrSellPrice = "0";
    try {
      const priceCfg = await getOfframpPrice("INR");
      if (priceCfg?.sellPrice) {
        inrSellPrice = (Number(priceCfg.sellPrice) / 1_000_000).toFixed(2);
      }
    } catch (err) {
      console.warn("[Admin Stats] Failed to read P2P INR price feed:", err);
    }

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
