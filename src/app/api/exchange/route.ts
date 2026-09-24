import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Base USDC destination asset (NEAR Intents assetId)
const DESTINATION_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";

import { resolveRefundAddress } from "./estimate/route";

// ZkPay fee: 175 bps (1.75%)
const APP_FEE_BPS = 175;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { originAssetId, amount, settleAddress, refundTo: userRefundTo } = body;

    if (!originAssetId || !amount || !settleAddress) {
      return NextResponse.json({ error: "Missing required fields: originAssetId, amount, settleAddress" }, { status: 400 });
    }

    const effectiveRefundTo = resolveRefundAddress(originAssetId, userRefundTo, settleAddress);

    // Fee recipient — treasury or env override
    const feeRecipient = process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT ||
                         process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
                         "0xb856b24fb054135deba5e0309edd31ed6a8afbe2";

    const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const payload = {
      dry: false, // wet run — generates deposit address
      swapType: "FLEX_INPUT",
      slippageTolerance: 100, // 1% slippage
      originAsset: originAssetId,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: DESTINATION_ASSET,
      recipientType: "DESTINATION_CHAIN",
      amount,
      recipient: settleAddress,
      refundTo: effectiveRefundTo,
      refundType: "ORIGIN_CHAIN",
      deadline,
      appFees: [{ recipient: feeRecipient, fee: APP_FEE_BPS }],
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

    // Map to frontend expectations (same shape as old SideShift response)
    return NextResponse.json({
      id: data.correlationId,
      payinAddress: quote.depositAddress,
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
