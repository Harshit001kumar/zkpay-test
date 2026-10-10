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
} from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const originAssetId = searchParams.get("originAssetId");
    const amount = searchParams.get("amount"); // smallest units (satoshis, wei, etc.)
    const recipientAddress = searchParams.get("recipientAddress");
    const userRefundTo = searchParams.get("refundTo");

    if (!originAssetId || !amount || !recipientAddress) {
      return NextResponse.json({ error: "Missing required fields: originAssetId, amount, recipientAddress" }, { status: 400 });
    }

    const effectiveRefundTo = resolveRefundAddress(originAssetId, userRefundTo, recipientAddress, { isDryRun: true });

    // In 1Click API (NEAR Intents), appFees are carved directly out of the INPUT TOKEN on the ORIGIN CHAIN.
    // Resolving our native treasury address per origin chain ensures dry quotes mirror wet execution accurately.
    const originChain = resolveChainFromAssetId(originAssetId) || "base";
    const feeRecipient = getTreasuryAddressForChain(originChain);

    const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const payload = {
      dry: true,
      swapType: "FLEX_INPUT",
      slippageTolerance: 100, // 1% slippage
      originAsset: originAssetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: DESTINATION_ASSET,
      recipientType: "DESTINATION_CHAIN",
      amount,
      recipient: recipientAddress,
      refundTo: effectiveRefundTo,
      refundType: "ORIGIN_CHAIN",
      deadline,
      appFees: [{ recipient: feeRecipient, fee: DEPOSIT_FEE_BPS }],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // API key is optional — without it 1Click adds 25 bps overhead
    if (process.env.NEAR_INTENTS_API_KEY) {
      headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
    }

    console.log("[NEAR Intents Estimate] Calling dry quote, origin:", originAssetId, "amount:", amount);

    const response = await fetch(`${ONECLICK_API}/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("[NEAR Intents Estimate] Status:", response.status, "Body:", responseText.slice(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: `API returned non-JSON: ${responseText.slice(0, 200)}` }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: data.message || JSON.stringify(data) }, { status: response.status });
    }

    // Extract the quote details from the response
    const quote = data.quote;
    if (!quote) {
      return NextResponse.json({ error: "No quote data in response" }, { status: 502 });
    }

    return NextResponse.json({
      estimatedAmount: quote.amountOutFormatted,
      amountOut: quote.amountOut,
      minAmountOut: quote.minAmountOut,
      timeEstimate: quote.timeEstimate,
    });
  } catch (error: any) {
    console.error("[NEAR Intents Estimate] Exception:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
