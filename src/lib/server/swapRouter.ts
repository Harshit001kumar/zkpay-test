/**
 * ZkPay Public Swap Router & 50/50 Fee Settlement Engine
 * 
 * Routes multi-chain swaps through NEAR Intents 1Click protocol with:
 * - 50/50 custom fee split between ZkPay Treasury and Partner Recipient
 * - Fixed NEAR Intents protocol fee accounting (25 bps overhead without key)
 * - Safe clamping to guarantee compliance with NEAR Intents 500 bps appFees limit
 * - In-memory caching for token metadata
 */

import { DEPOSIT_ASSETS, TARGET_ASSET, CONTRACTS } from "@/lib/constants";
import { resolveRefundAddress } from "@/lib/refundAddress";

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Protocol constants
export const NEAR_INTENTS_PROTOCOL_FEE_BPS = 25; // 0.25% fixed protocol overhead
export const DEFAULT_CUSTOM_FEE_BPS = 100;        // 1.00% default
export const MIN_CUSTOM_FEE_BPS = 20;             // 0.20% minimum custom fee
export const MAX_CUSTOM_FEE_BPS = 450;            // 4.50% max custom fee (leaves headroom for 25 bps overhead < 500 bps cap)

export const ZKPAY_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT ||
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  CONTRACTS.TREASURY ||
  "0xb856b24fb054135deba5e0309edd31ed6a8afbe2";

export interface FeeSplitResult {
  totalCustomFeeBps: number;
  zkpayFeeBps: number;
  partnerFeeBps: number;
  partnerFeeRecipient: string | null;
  nearIntentsProtocolFeeBps: number;
  totalDeductionsBps: number;
  appFees: { recipient: string; fee: number }[];
}

/**
 * Computes 50/50 fee split between ZkPay Treasury and Partner:
 * - If partner recipient is provided, custom fee is split 50/50.
 * - If no partner recipient is provided, 100% of custom fee goes to ZkPay Treasury.
 */
export function calculateFeeSplit(
  requestedFeeBps?: number | null,
  partnerFeeRecipient?: string | null
): FeeSplitResult {
  // Clamp requested custom fee within [MIN_CUSTOM_FEE_BPS, MAX_CUSTOM_FEE_BPS]
  let totalCustom = typeof requestedFeeBps === "number" && !isNaN(requestedFeeBps)
    ? Math.round(requestedFeeBps)
    : DEFAULT_CUSTOM_FEE_BPS;

  totalCustom = Math.max(MIN_CUSTOM_FEE_BPS, Math.min(MAX_CUSTOM_FEE_BPS, totalCustom));

  const cleanPartnerRecipient = partnerFeeRecipient?.trim() || null;

  let zkpayFeeBps: number;
  let partnerFeeBps: number;

  if (cleanPartnerRecipient) {
    // 50/50 Split
    zkpayFeeBps = Math.floor(totalCustom / 2);
    partnerFeeBps = totalCustom - zkpayFeeBps;
  } else {
    // 100% to ZkPay
    zkpayFeeBps = totalCustom;
    partnerFeeBps = 0;
  }

  const appFees: { recipient: string; fee: number }[] = [
    { recipient: ZKPAY_TREASURY_ADDRESS, fee: zkpayFeeBps },
  ];

  if (cleanPartnerRecipient && partnerFeeBps > 0) {
    appFees.push({ recipient: cleanPartnerRecipient, fee: partnerFeeBps });
  }

  return {
    totalCustomFeeBps: totalCustom,
    zkpayFeeBps,
    partnerFeeBps,
    partnerFeeRecipient: cleanPartnerRecipient,
    nearIntentsProtocolFeeBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
    totalDeductionsBps: NEAR_INTENTS_PROTOCOL_FEE_BPS + totalCustom,
    appFees,
  };
}

export interface SwapToken {
  assetId: string;
  symbol: string;
  name: string;
  blockchain: string;
  decimals: number;
  contractAddress?: string;
  priceUsd?: number;
  iconUrl?: string;
}

let tokenCache: { tokens: SwapToken[]; timestamp: number } | null = null;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches supported tokens from NEAR Intents and augments with local icons and metadata.
 */
export async function getSupportedTokens(chain?: string | null): Promise<SwapToken[]> {
  const now = Date.now();
  if (tokenCache && now - tokenCache.timestamp < TOKEN_CACHE_TTL_MS) {
    return filterTokensByChain(tokenCache.tokens, chain);
  }

  const localDefaults: SwapToken[] = DEPOSIT_ASSETS.map((d) => ({
    assetId: d.assetId,
    symbol: d.symbol,
    name: d.name,
    blockchain: d.blockchain,
    decimals: d.decimals,
    iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${d.blockchain}/info/logo.png`,
  }));

  // Add Base USDC destination token
  localDefaults.push({
    assetId: TARGET_ASSET.assetId,
    symbol: "USDC",
    name: "USD Coin (Base)",
    blockchain: "base",
    decimals: TARGET_ASSET.decimals,
    contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    iconUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png",
  });

  try {
    const res = await fetch(`${ONECLICK_API}/tokens`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data = await res.json();
      const rawList: any[] = Array.isArray(data) ? data : data?.tokens || [];
      const remoteTokens: SwapToken[] = rawList.map((t: any) => ({
        assetId: t.assetId,
        symbol: t.symbol?.toUpperCase() || "UNKNOWN",
        name: t.name || t.symbol || "Token",
        blockchain: t.blockchain?.toLowerCase() || "unknown",
        decimals: Number(t.decimals) || 18,
        contractAddress: t.contractAddress,
        priceUsd: typeof t.price === "number" ? t.price : undefined,
        iconUrl: t.iconUrl || `https://assets.zkpay.top/tokens/${(t.symbol || "").toLowerCase()}.svg`,
      }));

      // Merge: remote tokens + local defaults without duplicate assetIds
      const mergedMap = new Map<string, SwapToken>();
      for (const t of [...localDefaults, ...remoteTokens]) {
        if (t.assetId && !mergedMap.has(t.assetId)) {
          mergedMap.set(t.assetId, t);
        }
      }

      const allTokens = Array.from(mergedMap.values());
      tokenCache = { tokens: allTokens, timestamp: now };
      return filterTokensByChain(allTokens, chain);
    }
  } catch (err) {
    console.warn("[SwapRouter] Failed to fetch remote tokens, using fallback:", err);
  }

  tokenCache = { tokens: localDefaults, timestamp: now };
  return filterTokensByChain(localDefaults, chain);
}

function filterTokensByChain(tokens: SwapToken[], chain?: string | null): SwapToken[] {
  if (!chain || chain.trim() === "" || chain === "all") return tokens;
  const targetChain = chain.trim().toLowerCase();
  return tokens.filter((t) => t.blockchain.toLowerCase() === targetChain);
}

/**
 * Resolves symbol or partial asset identifier to full NEAR Intents assetId.
 */
export async function resolveAssetId(symbolOrAssetId: string, chainHint?: string): Promise<string> {
  const query = symbolOrAssetId.trim();
  if (query.startsWith("nep141:") || query.startsWith("nep245:")) {
    return query;
  }

  const allTokens = await getSupportedTokens();
  const upper = query.toUpperCase();

  // Try matching symbol and chain hint if given
  if (chainHint) {
    const matchWithChain = allTokens.find(
      (t) => t.symbol === upper && t.blockchain.toLowerCase() === chainHint.toLowerCase()
    );
    if (matchWithChain) return matchWithChain.assetId;
  }

  // Exact symbol match
  const match = allTokens.find((t) => t.symbol === upper);
  if (match) return match.assetId;

  // Fallback defaults for common coins
  if (upper === "BTC") return "nep141:btc.omft.near";
  if (upper === "ETH") return "nep141:eth.omft.near";
  if (upper === "SOL") return "nep141:sol.omft.near";
  if (upper === "USDC") return TARGET_ASSET.assetId;

  throw new Error(`Asset '${symbolOrAssetId}' not found. Use GET /api/v1/swap/tokens to inspect supported assetIds.`);
}

export interface SwapQuoteParams {
  fromAsset: string;
  toAsset?: string;
  amount: string;
  feeRecipient?: string | null;
  totalFeeBps?: number | null;
  slippageBps?: number | null;
  recipientAddress?: string | null;
  refundTo?: string | null;
}

/**
 * Creates dry quote for previewing rates and fees.
 */
export async function getSwapQuote(params: SwapQuoteParams) {
  const { fromAsset, amount, feeRecipient, totalFeeBps, slippageBps } = params;
  const originAssetId = await resolveAssetId(fromAsset);
  const destinationAssetId = params.toAsset
    ? await resolveAssetId(params.toAsset)
    : TARGET_ASSET.assetId;

  const feeSplit = calculateFeeSplit(totalFeeBps, feeRecipient);
  const effectiveRecipient = params.recipientAddress || ZKPAY_TREASURY_ADDRESS;
  const effectiveRefundTo = resolveRefundAddress(originAssetId, params.refundTo, effectiveRecipient);

  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = {
    dry: true,
    swapType: "FLEX_INPUT",
    slippageTolerance: Math.max(10, Math.min(500, slippageBps || 100)),
    originAsset: originAssetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destinationAssetId,
    recipientType: "DESTINATION_CHAIN",
    amount,
    recipient: effectiveRecipient,
    refundTo: effectiveRefundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
    appFees: feeSplit.appFees,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NEAR_INTENTS_API_KEY) {
    headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
  }

  const response = await fetch(`${ONECLICK_API}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`NEAR Intents API returned invalid response: ${responseText.slice(0, 150)}`);
  }

  if (!response.ok || !data.quote) {
    throw new Error(data.message || `Failed to fetch quote from solver: ${JSON.stringify(data)}`);
  }

  const quote = data.quote;

  return {
    quoteId: data.correlationId || `q_${Date.now()}`,
    originAsset: originAssetId,
    destinationAsset: destinationAssetId,
    amountIn: quote.amountIn || amount,
    amountInFormatted: quote.amountInFormatted,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut: quote.minAmountOut,
    minAmountOutFormatted: quote.minAmountOutFormatted,
    feeBreakdown: {
      nearIntentsProtocolFeeBps: feeSplit.nearIntentsProtocolFeeBps,
      totalCustomFeeBps: feeSplit.totalCustomFeeBps,
      split: {
        zkpayFeeBps: feeSplit.zkpayFeeBps,
        partnerFeeBps: feeSplit.partnerFeeBps,
        partnerFeeRecipient: feeSplit.partnerFeeRecipient,
      },
      totalDeductionsBps: feeSplit.totalDeductionsBps,
    },
    slippageBps: payload.slippageTolerance,
    timeEstimateSeconds: quote.timeEstimate || 45,
    expiresAt: quote.deadline || deadline,
  };
}

export interface CreateSwapParams {
  fromAsset: string;
  toAsset?: string;
  amount: string;
  recipient: string;
  refundTo?: string | null;
  feeRecipient?: string | null;
  totalFeeBps?: number | null;
  slippageBps?: number | null;
}

/**
 * Creates live wet swap order with single-use deposit address.
 */
export async function createSwapOrder(params: CreateSwapParams) {
  const { fromAsset, amount, recipient, feeRecipient, totalFeeBps, slippageBps } = params;
  if (!recipient || recipient.trim() === "") {
    throw new Error("Missing required 'recipient' address for destination chain.");
  }

  const originAssetId = await resolveAssetId(fromAsset);
  const destinationAssetId = params.toAsset
    ? await resolveAssetId(params.toAsset)
    : TARGET_ASSET.assetId;

  const feeSplit = calculateFeeSplit(totalFeeBps, feeRecipient);
  const effectiveRefundTo = resolveRefundAddress(originAssetId, params.refundTo, recipient);
  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = {
    dry: false, // Wet run: returns deposit address
    swapType: "FLEX_INPUT",
    slippageTolerance: Math.max(10, Math.min(500, slippageBps || 100)),
    originAsset: originAssetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destinationAssetId,
    recipientType: "DESTINATION_CHAIN",
    amount,
    recipient: recipient.trim(),
    refundTo: effectiveRefundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
    appFees: feeSplit.appFees,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NEAR_INTENTS_API_KEY) {
    headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
  }

  const response = await fetch(`${ONECLICK_API}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`API returned invalid JSON: ${responseText.slice(0, 150)}`);
  }

  if (!response.ok || !data.quote || !data.quote.depositAddress) {
    throw new Error(data.message || "Failed to create swap order or generate deposit address.");
  }

  const quote = data.quote;

  return {
    swapId: data.correlationId || `swp_${Date.now()}`,
    status: "PENDING_DEPOSIT",
    deposit: {
      address: quote.depositAddress,
      memo: quote.depositMemo || null,
      amount: quote.amountInFormatted || amount,
      deadline: quote.deadline || deadline,
    },
    settlement: {
      recipient: recipient.trim(),
      destinationAsset: destinationAssetId,
      estimatedAmountOut: quote.amountOutFormatted || quote.amountOut,
      minAmountOut: quote.minAmountOutFormatted || quote.minAmountOut,
      timeEstimateSeconds: quote.timeEstimate || 60,
    },
    feeSplit: {
      totalCustomFeeBps: feeSplit.totalCustomFeeBps,
      zkpayFeeBps: feeSplit.zkpayFeeBps,
      partnerFeeBps: feeSplit.partnerFeeBps,
      partnerFeeRecipient: feeSplit.partnerFeeRecipient,
      nearIntentsProtocolFeeBps: feeSplit.nearIntentsProtocolFeeBps,
      totalDeductionsBps: feeSplit.totalDeductionsBps,
    },
  };
}

export function mapSolverStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "PENDING_DEPOSIT":
    case "KNOWN_DEPOSIT_TX":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "SUCCESS":
      return "settled";
    case "FAILED":
      return "failed";
    case "REFUNDED":
      return "refunded";
    case "INCOMPLETE_DEPOSIT":
      return "expired";
    default:
      return rawStatus?.toLowerCase() || "unknown";
  }
}

/**
 * Polls real-time swap status by deposit address.
 */
export async function getSwapStatus(depositAddress: string) {
  const url = new URL(`${ONECLICK_API}/status`);
  url.searchParams.set("depositAddress", depositAddress.trim());

  const headers: Record<string, string> = {};
  if (process.env.NEAR_INTENTS_API_KEY) {
    headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
  });

  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Status API returned non-JSON: ${responseText.slice(0, 150)}`);
  }

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch swap status");
  }

  const swapDetails = data.swapDetails || {};

  return {
    status: mapSolverStatus(data.status),
    rawStatus: data.status,
    depositedAmount: swapDetails.depositedAmountFormatted || null,
    settledAmount: swapDetails.amountOutFormatted || null,
    destinationTxHash: swapDetails.destinationChainTxHashes?.[0]?.hash || null,
    destinationExplorerUrl: swapDetails.destinationChainTxHashes?.[0]?.explorerUrl || null,
    originTxHash: swapDetails.originChainTxHashes?.[0]?.hash || null,
    updatedAt: new Date().toISOString(),
  };
}
