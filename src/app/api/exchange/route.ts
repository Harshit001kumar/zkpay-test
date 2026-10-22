import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Base USDC destination asset (NEAR Intents assetId)
const DESTINATION_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";

import { resolveRefundAddress } from "@/lib/refundAddress";
import {
  DEPOSIT_FEE_BPS,
  resolveChainFromAssetId,
  getTreasuryAddressForChain,
  isZeroFeeChain,
} from "@/lib/constants";
import { isProxySupportedChain } from "@/lib/server/proxyWallets";
import { saveProxySwapOrder } from "@/lib/server/proxySwapStore";
import { getQuoteDeadline } from "@/lib/server/swapRouter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { originAssetId, amount, settleAddress, refundTo: userRefundTo } = body;

    if (!originAssetId || !amount || !settleAddress) {
      return NextResponse.json({ error: "Missing required fields: originAssetId, amount, settleAddress" }, { status: 400 });
    }

    const effectiveRefundTo = resolveRefundAddress(originAssetId, userRefundTo, settleAddress, { isDryRun: false });

    // In 1Click API (NEAR Intents), appFees settle on the intents.near contract.
    // The recipient MUST be an EVM address (0x...) or a NEAR account (*.near).
    const originChain = resolveChainFromAssetId(originAssetId) || "base";
    const isDirect = isZeroFeeChain(originChain) || !isProxySupportedChain(originChain, originAssetId);
    const feeRecipient = getTreasuryAddressForChain(originChain);

    let netSwapAmount = String(amount).trim();
    let feeAmount = "0";

    if (!isDirect) {
      const totalAtomic = BigInt(String(amount).trim());
      const feeAtomic = (totalAtomic * BigInt(DEPOSIT_FEE_BPS)) / 10000n;
      netSwapAmount = (totalAtomic - feeAtomic).toString();
      feeAmount = feeAtomic.toString();
    }

    const deadline = getQuoteDeadline(originChain);

    const payload = {
      dry: false, // wet run — generates deposit address
      swapType: "FLEX_INPUT",
      slippageTolerance: 100, // 1% slippage
      originAsset: originAssetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: DESTINATION_ASSET,
      recipientType: "DESTINATION_CHAIN",
      amount: netSwapAmount,
      recipient: settleAddress,
      refundTo: effectiveRefundTo,
      refundType: "ORIGIN_CHAIN",
      deadline,
      appFees: [], // ZERO appFees to NEAR Intents! Avoids $1,000 threshold.
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // API key is optional — without it 1Click adds 25 bps overhead
    if (process.env.NEAR_INTENTS_API_KEY) {
      headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
    }

    console.log("[NEAR Intents Exchange] Creating wet quote, origin:", originAssetId, "recipient:", settleAddress);

    const response = await fetch(`${ONECLICK_API}/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("[NEAR Intents Exchange] Status:", response.status, "Body:", responseText.slice(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: `API returned non-JSON: ${responseText.slice(0, 200)}` }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    const quote = data.quote;
    if (!quote || !quote.depositAddress) {
      return NextResponse.json({ error: "No deposit address in response" }, { status: 502 });
    }

    let finalPayinAddress = quote.depositAddress;

    if (!isDirect) {
      try {
        const { generateProxyDepositWallet, isProxySupportedChain } = await import("@/lib/server/proxyWallets");
        if (isProxySupportedChain(originChain, originAssetId)) {
          const proxyWallet = generateProxyDepositWallet(originChain);
          finalPayinAddress = proxyWallet.depositAddress;

          await saveProxySwapOrder({
            swapId: data.correlationId || `exch_${Date.now()}`,
            proxyDepositAddress: proxyWallet.depositAddress,
            encryptedPrivateKey: proxyWallet.encryptedPrivateKey,
            chain: originChain,
            originAssetId,
            fromAsset: originAssetId.split(":")[1]?.split(".")[0]?.toUpperCase() || "CRYPTO",
            toAsset: "USDC",
            destinationChain: "base",
            recipient: settleAddress,
            refundTo: effectiveRefundTo,
            totalAmountIn: String(amount).trim(),
            totalAmountFormatted: String(amount),
            netSwapAmount,
            feeAmount,
            gasBufferAmount: "10000",
            solverDepositAddress: quote.depositAddress,
            treasuryAddress: feeRecipient,
            status: "PENDING_DEPOSIT",
            createdAt: Date.now(),
            expiresAt: new Date(quote.deadline || deadline).getTime(),
          });

          console.log(`[Exchange] Single-transfer proxy deposit created: ${finalPayinAddress}`);
        }
      } catch (proxyErr) {
        console.warn("[Exchange] Proxy wallet fallback to direct solver:", proxyErr);
        finalPayinAddress = quote.depositAddress;
      }
    }

    // Map to frontend expectations
    return NextResponse.json({
      id: data.correlationId,
      payinAddress: finalPayinAddress,
      depositMemo: quote.depositMemo || null,
      deadline: quote.deadline,
      amountOut: quote.amountOutFormatted,
      minAmountOut: quote.minAmountOut,
      timeEstimate: quote.timeEstimate,
    });
  } catch (error: any) {
    console.error("[NEAR Intents Exchange] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
