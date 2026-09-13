import { NextResponse } from "next/server";
import { recordScanAndPayReward } from "@/lib/server/rewardsStore";
import { CHAIN, CONTRACTS } from "@/lib/constants";
import { createPublicClient, http } from "viem";
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { txHash, orderId, principalUsdc, feeUsdc, userAddress } = body;

    if (!txHash || !userAddress || principalUsdc === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: txHash, userAddress, principalUsdc" },
        { status: 400 }
      );
    }

    const principal = Number(principalUsdc);
    const fee = Number(feeUsdc || (principal * 0.01).toFixed(4));

    if (isNaN(principal) || principal <= 0) {
      return NextResponse.json({ error: "Invalid principal USDC amount" }, { status: 400 });
    }

    // On-chain receipt verification (confirm tx succeeded on Base)
    try {
      const publicClient = getServerPublicClient();
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (!receipt || receipt.status !== "success") {
        return NextResponse.json(
          { error: "Transaction verification failed: Transaction not successful on Base" },
          { status: 400 }
        );
      }
    } catch (verifyErr: any) {
      console.warn("[RewardsRecord] Warning: Could not verify receipt via RPC immediately:", verifyErr?.message);
      // If RPC is temporarily rate limited or indexing delay, allow graceful recording if hash format matches
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
      }
    }

    // Record the verified Scan & Pay transaction
    const res = recordScanAndPayReward({
      txHash,
      orderId: String(orderId || ""),
      userAddress,
      principalUsdc: principal,
      feeUsdc: fee,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      entry: res.entry,
      message: "Monthly reward recorded successfully",
    });
  } catch (err: any) {
    console.error("[RewardsRecord] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to record reward" },
      { status: 500 }
    );
  }
}
