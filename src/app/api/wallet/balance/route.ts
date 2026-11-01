import { NextResponse } from "next/server";
import { isAddress, parseAbi } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { getResilientPublicClientForChain } from "@/lib/server/rpcConfig";

export const dynamic = "force-dynamic";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address")?.trim();

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { success: false, error: "Valid smart wallet 'address' query param required." },
        { status: 400 }
      );
    }

    const client = getResilientPublicClientForChain("base");
    const usdcAddress = CONTRACTS.USDC as `0x${string}`;

    // Read Smart Wallet USDC balance on Base Mainnet
    const rawBal = (await client.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    })) as bigint;

    const numBal = Number(rawBal) / 1_000_000;

    return NextResponse.json({
      success: true,
      address,
      balanceUsdc: numBal,
      totalAvailableUsdc: numBal,
      formattedUsdc: numBal.toFixed(2),
      rawBalance: rawBal.toString(),
      network: "Base Mainnet",
    });
  } catch (err: any) {
    console.warn("[WalletBalanceAPI] Error fetching Base USDC balance:", err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch on-chain balance" },
      { status: 500 }
    );
  }
}
