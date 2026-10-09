import { NextResponse } from "next/server";
import { recordScanAndPayReward } from "@/lib/server/rewardsStore";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { CHAIN, CONTRACTS } from "@/lib/constants";
import { createPublicClient, http, parseUnits, isAddress } from "viem";
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

function findFeeTransferToTreasury(
  receipt: any,
  treasuryAddress: string
): { found: boolean; from?: string; valueWei: bigint } {
  if (!receipt || !Array.isArray(receipt.logs)) return { found: false, valueWei: 0n };
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const normalizedTreasury = treasuryAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const usdcLower = CONTRACTS.USDC.toLowerCase();

  for (const log of receipt.logs) {
    const isUsdc = log.address?.toLowerCase() === usdcLower;
    const isTransfer = log.topics?.[0]?.toLowerCase() === transferTopic;
    const recipient = log.topics?.[2]?.toLowerCase().replace(/^0x/, "");
    if (isUsdc && isTransfer && recipient === normalizedTreasury) {
      const from = "0x" + log.topics?.[1]?.slice(26)?.toLowerCase();
      const valueWei = log.data && log.data !== "0x" ? BigInt(log.data) : 0n;
      return { found: true, from, valueWei };
    }
  }
  return { found: false, valueWei: 0n };
}

export async function POST(req: Request) {
  try {
    // 1. Authenticate caller via Privy session token
    const userAuth = await verifyUserRequest(req);
    if (!userAuth.authorized || !userAuth.userId) {
      return NextResponse.json(
        { error: userAuth.error || "Unauthorized — valid session required to record rewards" },
        { status: userAuth.status || 401 }
      );
    }

    const body = await req.json();
    const { txHash, feeTxHash, orderId, principalUsdc, feeUsdc, userAddress: rawUserAddress } = body;

    if (!txHash || !rawUserAddress || principalUsdc === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: txHash, userAddress, principalUsdc" },
        { status: 400 }
      );
    }

    if (!isAddress(rawUserAddress)) {
      return NextResponse.json({ error: "Invalid userAddress format" }, { status: 400 });
    }

    const userAddress = rawUserAddress.toLowerCase();

    // Verify authenticated user's wallet matches requested userAddress if known
    if (userAuth.walletAddress && userAuth.walletAddress.toLowerCase() !== userAddress) {
      return NextResponse.json(
        { error: "Forbidden — userAddress does not match authenticated user's wallet" },
        { status: 403 }
      );
    }

    const principal = Number(principalUsdc);
    const fee = Number(feeUsdc || (principal * 0.01).toFixed(4));

    if (isNaN(principal) || principal <= 0 || principal > 100_000) {
      return NextResponse.json({ error: "Invalid principal USDC amount" }, { status: 400 });
    }

    // 2. On-chain receipt verification
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

      // Check if fee was transferred to ZkPay Treasury in either txHash (Smart Wallet) or feeTxHash (EOA)
      let feeInfo = findFeeTransferToTreasury(receipt, CONTRACTS.TREASURY);
      let receiptSender = receipt.from?.toLowerCase();

      if (!feeInfo.found && feeTxHash && /^0x[a-fA-F0-9]{64}$/.test(feeTxHash)) {
        try {
          const feeReceipt = await publicClient.getTransactionReceipt({
            hash: feeTxHash as `0x${string}`,
          });
          if (feeReceipt && feeReceipt.status === "success") {
            feeInfo = findFeeTransferToTreasury(feeReceipt, CONTRACTS.TREASURY);
            receiptSender = feeReceipt.from?.toLowerCase();
          }
        } catch {}
      }

      if (!feeInfo.found) {
        return NextResponse.json(
          { error: "Transaction rejected: No 1% platform fee transfer to ZkPay Treasury detected." },
          { status: 400 }
        );
      }

      // 3. Verify sender ownership
      if (receiptSender !== userAddress && feeInfo.from !== userAddress) {
        return NextResponse.json(
          { error: "Transaction sender does not match userAddress." },
          { status: 403 }
        );
      }

      // 4. Verify transferred fee amount matches principal (allow 2% slippage tolerance for tiny rounding)
      const expectedFeeWei = parseUnits((principal * 0.01).toFixed(6), 6);
      const minAcceptableFeeWei = (expectedFeeWei * 98n) / 100n;
      if (feeInfo.valueWei < minAcceptableFeeWei) {
        return NextResponse.json(
          { error: "Fee amount verification failed: On-chain transfer to Treasury is less than required 1% fee." },
          { status: 400 }
        );
      }
    } catch (verifyErr: any) {
      console.warn("[RewardsRecord] Warning: Verification failed:", verifyErr?.message);
      return NextResponse.json({ error: "Transaction verification failed on Base" }, { status: 400 });
    }

    // 5. Record verified Scan & Pay reward with feeTxHash deduplication
    const res = recordScanAndPayReward({
      txHash,
      feeTxHash: feeTxHash || undefined,
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
