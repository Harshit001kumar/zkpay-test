import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Base USDC destination asset (NEAR Intents assetId)
const DESTINATION_ASSET = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";

// ZkPay fee: 175 bps (1.75%)
const APP_FEE_BPS = 175;

// Helper to resolve a valid refund address for the origin blockchain
export function resolveRefundAddress(
  originAssetId: string,
  userRefundTo?: string | null,
  fallbackEvmAddress?: string | null
): string {
  if (userRefundTo && userRefundTo.trim().length > 0) {
    const trimmed = userRefundTo.trim();
    if (originAssetId.includes(":sol")) {
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":tron")) {
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":btc")) {
      if (/^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":ltc")) {
      if (/^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59})$/i.test(trimmed)) return trimmed;
    } else {
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed;
    }
  }

  // Network-specific fallbacks for non-EVM chains (configured project addresses)
  if (originAssetId.includes(":sol")) {
    return process.env.SOLANA_REFUND_ADDRESS || "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf";
  }
  if (originAssetId.includes(":btc")) {
    return process.env.BTC_REFUND_ADDRESS || "bc1qg52t5l20hfhmk7nkwe62s4xt3qr2fedwqmu6up";
  }
  if (originAssetId.includes(":tron")) {
    return process.env.TRON_REFUND_ADDRESS || "TSsMeYZRBVp2oSocHbbZJJPSWLFKaAy28j";
  }
  if (originAssetId.includes(":ltc")) {
    return process.env.LTC_REFUND_ADDRESS || "LdmUa92dDxtp84nwJQgdjmayJqE1ESKza4";
  }

  return fallbackEvmAddress && /^0x[a-fA-F0-9]{40}$/.test(fallbackEvmAddress)
    ? fallbackEvmAddress
    : (process.env.EVM_REFUND_ADDRESS || "0xb856b24fb054135deba5e0309edd31ed6a8afbe2");
}

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

    const effectiveRefundTo = resolveRefundAddress(originAssetId, userRefundTo, recipientAddress);

    // Fee recipient — treasury or env override
    const feeRecipient = process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT ||
                         process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
                         "0xb856b24fb054135deba5e0309edd31ed6a8afbe2";

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
      appFees: [{ recipient: feeRecipient, fee: APP_FEE_BPS }],
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
