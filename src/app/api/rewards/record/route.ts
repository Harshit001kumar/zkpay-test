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

function hasUsdcTransferToTreasury(receipt: any, treasuryAddress: string): boolean {
  if (!receipt || !Array.isArray(receipt.logs)) return false;
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const normalizedTreasury = treasuryAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");

  return receipt.logs.some((log: any) => {
    const isUsdc = log.address?.toLowerCase() === CONTRACTS.USDC.toLowerCase();
    const isTransfer = log.topics?.[0]?.toLowerCase() === transferTopic;
    const recipient = log.topics?.[2]?.toLowerCase().replace(/^0x/, "");
    return isUsdc && isTransfer && recipient === normalizedTreasury;
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { txHash, feeTxHash, orderId, principalUsdc, feeUsdc, userAddress } = body;

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

    // On-chain receipt verification (confirm tx succeeded on Base AND fee was paid to Treasury)
    const publicClient = getServerPublicClient();
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      if (!receipt || receipt.status !== "success") {
        return NextResponse.json(
          { error: "Transaction verification failed: Transaction not successful on Base" },
          { status: 400 }
        );
      }

      // Check if fee was transferred to ZkPay Treasury in either txHash (batched Smart Wallet) or feeTxHash (EOA)
      let feePaid = hasUsdcTransferToTreasury(receipt, CONTRACTS.TREASURY);
      if (!feePaid && feeTxHash && /^0x[a-fA-F0-9]{64}$/.test(feeTxHash)) {
        try {
          const feeReceipt = await publicClient.getTransactionReceipt({
            hash: feeTxHash as `0x${string}`,
          });
          if (feeReceipt && feeReceipt.status === "success") {
            feePaid = hasUsdcTransferToTreasury(feeReceipt, CONTRACTS.TREASURY);
          }
        } catch {}
      }

      if (!feePaid) {
        return NextResponse.json(
          { error: "Transaction rejected: No 1% platform fee transfer to ZkPay Treasury detected. Rewards are only issued for orders placed through ZkPay." },
          { status: 400 }
        );
      }
    } catch (verifyErr: any) {
      console.warn("[RewardsRecord] Warning: Verification failed:", verifyErr?.message);
      return NextResponse.json({ error: "Transaction verification failed on Base" }, { status: 400 });
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
