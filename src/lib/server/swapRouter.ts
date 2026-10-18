/**
 * ZkPay Public Swap Router & 50/50 Fee Settlement Engine
 * 
 * Routes multi-chain swaps through NEAR Intents 1Click protocol with:
 * - 50/50 custom fee split between ZkPay Treasury and Partner Recipient
 * - Destination-chain-aware treasury addresses (fees paid in destination asset)
 * - Curated token allowlist (only ZkPay-approved tokens exposed)
 * - Fixed NEAR Intents protocol fee accounting (25 bps overhead without key)
 * - Safe clamping to guarantee compliance with NEAR Intents 500 bps appFees limit
 * - Atomic units validation & pre-flight sanity checks
 * - Sanitized upstream solver error handling (no HTML/Cloudflare leaks)
 * - Multi-chain token collision resolution via chain parameter
 * - In-memory caching for token metadata
 */

import {
  SWAP_ALLOWED_TOKENS,
  SWAP_ALLOWED_CHAINS,
  TARGET_ASSET,
  CONTRACTS,
  DESTINATION_FALLBACK_ADDRESSES,
  ZERO_FEE_CHAINS,
  isZeroFeeChain,
  resolveChainFromAssetId,
  getFeeRecipientAddress,
  getTreasuryAddressForChain,
  getFallbackDestinationAddress,
  normalizeChain,
} from "@/lib/constants";
import { resolveRefundAddress } from "@/lib/refundAddress";
import { generateProxyDepositWallet, isProxySupportedChain } from "./proxyWallets";
import {
  saveProxySwapOrder,
  getProxyOrderByAddress,
  ProxySwapOrder,
} from "./proxySwapStore";
import { checkAndForwardProxyDeposit } from "./proxyForwarder";

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Protocol constants
export const NEAR_INTENTS_PROTOCOL_FEE_BPS = 25; // 0.25% fixed protocol overhead
export const DEFAULT_CUSTOM_FEE_BPS = 100;        // 1.00% default
export const MIN_CUSTOM_FEE_BPS = 20;             // 0.20% minimum custom fee
export const MAX_CUSTOM_FEE_BPS = 450;            // 4.50% max custom fee (leaves headroom for 25 bps overhead < 500 bps cap)

// Default EVM treasury address (used when origin chain isn't specified or is EVM)
export const ZKPAY_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT ||
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  CONTRACTS.TREASURY ||
  "0xb856b24fb054135deba5e0309edd31ed6a8afbe2";

/**
 * Validates that a fee recipient address matches the expected format for the chain.
 */
export function isValidFeeRecipient(address?: string | null, chain?: string | null): boolean {
  if (!address || typeof address !== "string") return false;
  const clean = address.trim();
  const c = normalizeChain(chain);
  // EVM address
  if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return true;
  // Solana address (base58, 32-44 characters)
  if ((!c || c === "sol") && /^[1-9A-HJ-NP-za-km-z]{32,44}$/.test(clean)) return true;
  // Tron address (starts with T, base58 34 characters)
  if ((!c || c === "tron") && /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(clean)) return true;
  // Litecoin address (starts with L, M, or ltc1)
  if ((!c || c === "ltc") && /^(L|M|ltc1)[a-km-zA-HJ-NP-Z1-9]{25,43}$/.test(clean)) return true;
  // Bitcoin address
  if ((!c || c === "btc") && /^(1|3|bc1)[a-km-zA-HJ-NP-Z1-9]{25,62}$/.test(clean)) return true;
  // Named NEAR account or implicit
  if (/^[a-z0-9_.-]+\.(near|tg)$/i.test(clean)) return true;
  if (/^[a-fA-F0-9]{64}$/.test(clean)) return true;
  return false;
}

// Re-export chain & treasury resolution helpers
export {
  resolveChainFromAssetId,
  getFeeRecipientAddress,
  getTreasuryAddressForChain,
  getFallbackDestinationAddress,
  normalizeChain,
  isZeroFeeChain,
};

export interface ExecutionTransfer {
  purpose: "PLATFORM_FEE" | "SWAP_DEPOSIT";
  recipient: string;
  amount: string;
}

export interface ExecutionPlan {
  isDirectRoute: boolean;
  type: "DIRECT_DEPOSIT" | "UPFRONT_FEE_SPLIT";
  totalAmountIn: string;
  netSwapAmount: string;
  feeAmount: string;
  feeAsset: string;
  treasuryAddress: string | null;
  partnerFeeRecipient: string | null;
  depositAddress: string;
  transfers: ExecutionTransfer[];
}

export interface FeeSplitResult {
  totalCustomFeeBps: number;
  zkpayFeeBps: number;
  partnerFeeBps: number;
  partnerFeeRecipient: string | null;
  networkProtocolFeeBps: number;
  nearIntentsProtocolFeeBps?: number;
  totalDeductionsBps: number;
  appFees: { recipient: string; fee: number }[];
  treasuryAddress: string;
  isDirectRoute: boolean;
  feeSettlementNote: string;
}

/**
 * Computes upfront fee split between ZkPay Treasury and Partner.
 * 
 * Rules:
 * 1. Ethereum L1 and Bitcoin -> Direct route with 0% platform fee to protect users from high gas.
 * 2. L2s (Base, Arbitrum, Polygon, BSC) and low-fee L1s (Solana, Litecoin, Tron) -> Upfront fee collection in source asset.
 * 3. appFees sent to NEAR Intents is ALWAYS [] to bypass NEAR's $1,000 threshold and ensure instant payout.
 */
export function calculateFeeSplit(
  requestedFeeBps?: number | null,
  partnerFeeRecipient?: string | null,
  originChain?: string | null,
  fromAsset?: string | null
): FeeSplitResult {
  const normChain = normalizeChain(originChain);

  // RULE 1: Direct Route, 0% Platform Fee
  // Applied to:
  // - Zero-fee chains (Ethereum L1, Bitcoin) to protect users from high gas.
  // - Any chain or asset that does NOT use Single-Transfer Proxy (Litecoin, Tron, Solana SPL tokens, etc.)
  //   so 100% of user deposit routes directly to Near Intents solvers with 0 amount mismatch and 0 risk of stuck funds!
  if (isZeroFeeChain(normChain) || !isProxySupportedChain(normChain, fromAsset)) {
    return {
      totalCustomFeeBps: 0,
      zkpayFeeBps: 0,
      partnerFeeBps: 0,
      partnerFeeRecipient: null,
      networkProtocolFeeBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
      nearIntentsProtocolFeeBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
      totalDeductionsBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
      appFees: [],
      treasuryAddress: "",
      isDirectRoute: true,
      feeSettlementNote: `Direct route enabled (0% platform fee) on ${normChain || "origin chain"} to eliminate extra hops and ensure 100% direct solver routing.`,
    };
  }

  // RULE 2 & 3: Low-fee L2s (Base, Arbitrum, Polygon, BSC) and low-fee L1s (Solana, Litecoin, Tron)
  let totalCustom = typeof requestedFeeBps === "number" && !isNaN(requestedFeeBps)
    ? Math.round(requestedFeeBps)
    : DEFAULT_CUSTOM_FEE_BPS;

  totalCustom = Math.max(MIN_CUSTOM_FEE_BPS, Math.min(MAX_CUSTOM_FEE_BPS, totalCustom));

  const cleanPartnerRecipient = partnerFeeRecipient?.trim() || null;
  const treasuryAddress = getTreasuryAddressForChain(normChain);

  let zkpayFeeBps: number;
  let partnerFeeBps: number;

  if (cleanPartnerRecipient) {
    zkpayFeeBps = Math.floor(totalCustom / 2);
    partnerFeeBps = totalCustom - zkpayFeeBps;
  } else {
    zkpayFeeBps = totalCustom;
    partnerFeeBps = 0;
  }

  // Upfront fee settlement: appFees sent to NEAR Intents is ALWAYS []
  // This bypasses NEAR's $1,000 threshold and ensures instant on-chain settlement directly to treasury.
  return {
    totalCustomFeeBps: totalCustom,
    zkpayFeeBps,
    partnerFeeBps,
    partnerFeeRecipient: cleanPartnerRecipient,
    networkProtocolFeeBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
    nearIntentsProtocolFeeBps: NEAR_INTENTS_PROTOCOL_FEE_BPS,
    totalDeductionsBps: NEAR_INTENTS_PROTOCOL_FEE_BPS + totalCustom,
    appFees: [],
    treasuryAddress,
    isDirectRoute: false,
    feeSettlementNote: `Upfront fee settlement on origin chain (${normChain || "L2"}). Fee is transferred directly to treasury/partner address before or atomically with the swap. $0 minimum payout threshold.`,
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


// Build the allowlist assetId set for fast lookups
const ALLOWED_ASSET_IDS = new Set(SWAP_ALLOWED_TOKENS.map((t) => t.assetId));

/**
 * Fetches supported tokens from NEAR Intents, then filters against ZkPay's curated allowlist.
 * Only tokens in SWAP_ALLOWED_TOKENS (constants.ts) are returned.
 */
export async function getSupportedTokens(chain?: string | null): Promise<SwapToken[]> {
  const now = Date.now();
  const normalizedTargetChain = normalizeChain(chain);

  if (tokenCache && now - tokenCache.timestamp < TOKEN_CACHE_TTL_MS) {
    return filterTokensByChain(tokenCache.tokens, normalizedTargetChain);
  }

  // Start with our curated allowlist as the base
  const allowlistTokens: SwapToken[] = SWAP_ALLOWED_TOKENS.map((d) => ({
    assetId: d.assetId,
    symbol: d.symbol,
    name: d.name,
    blockchain: d.blockchain,
    decimals: d.decimals,
    iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${d.blockchain}/info/logo.png`,
  }));

  try {
    // Fetch remote tokens to enrich with live data (icons, prices, contract addresses)
    const res = await fetch(`${ONECLICK_API}/tokens`, {
      method: "GET",
      headers: buildSolverHeaders(),
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const text = await res.text();
      if (!text.trim().startsWith("<") && !text.includes("<!DOCTYPE")) {
        const data = JSON.parse(text);
        const rawList: any[] = Array.isArray(data) ? data : data?.tokens || [];

        // Build a map of remote token data keyed by assetId
        const remoteMap = new Map<string, any>();
        for (const t of rawList) {
          if (t.assetId) remoteMap.set(t.assetId, t);
        }

        // Enrich our allowlist tokens with remote data (icons, prices, contract addresses)
        const enrichedTokens: SwapToken[] = allowlistTokens.map((local) => {
          const remote = remoteMap.get(local.assetId);
          if (!remote) return local;
          return {
            ...local,
            contractAddress: remote.contractAddress || undefined,
            priceUsd: typeof remote.price === "number" ? remote.price : undefined,
            iconUrl: remote.iconUrl || local.iconUrl,
          };
        });

        tokenCache = { tokens: enrichedTokens, timestamp: now };
        return filterTokensByChain(enrichedTokens, normalizedTargetChain);
      }
    }
  } catch (err) {
    console.warn("[SwapRouter] Remote tokens query skipped, using allowlist defaults:", err);
  }

  tokenCache = { tokens: allowlistTokens, timestamp: now };
  return filterTokensByChain(allowlistTokens, normalizedTargetChain);
}

function filterTokensByChain(tokens: SwapToken[], chain?: string | null): SwapToken[] {
  if (!chain || chain.trim() === "" || chain === "all") return tokens;
  const targetChain = normalizeChain(chain) || chain.trim().toLowerCase();
  return tokens.filter((t) => normalizeChain(t.blockchain) === targetChain);
}


/**
 * Resolves symbol or partial asset identifier to full NEAR Intents assetId.
 * Supports chainHint to resolve multi-chain token collisions (e.g. USDC on Solana vs Arbitrum).
 */
export async function resolveAssetId(symbolOrAssetId: string, chainHint?: string | null): Promise<string> {
  const query = symbolOrAssetId.trim();
  if (query.startsWith("nep141:") || query.startsWith("nep245:") || query.startsWith("1cs_v1:")) {
    return query;
  }

  const allTokens = await getSupportedTokens();
  const upper = query.toUpperCase();
  const normalizedChain = normalizeChain(chainHint);

  // 1. Check for composite symbol_chain formats: e.g. "USDT_POLYGON", "USDC_BASE", "USDT-TRON", "USDC/SOL"
  const separatorMatch = query.match(/^([a-zA-Z0-9$]+)[_\-\.\/]([a-zA-Z0-9]+)$/);
  if (separatorMatch) {
    const parsedSym = separatorMatch[1].toUpperCase();
    const parsedChain = normalizeChain(separatorMatch[2]);
    if (parsedChain) {
      const match = allTokens.find(
        (t) => t.symbol === parsedSym && normalizeChain(t.blockchain) === parsedChain
      );
      if (match) return match.assetId;
    }
  }

  // 2. Try matching symbol AND normalized chain hint if provided
  if (normalizedChain) {
    const matchWithChain = allTokens.find(
      (t) => t.symbol === upper && normalizeChain(t.blockchain) === normalizedChain
    );
    if (matchWithChain) return matchWithChain.assetId;
  }

  // 3. Multi-chain stablecoin defaults
  if (upper === "USDC") {
    if (normalizedChain === "sol") {
      const solUsdc = allTokens.find((t) => t.symbol === "USDC" && normalizeChain(t.blockchain) === "sol");
      if (solUsdc) return solUsdc.assetId;
    }
    if (normalizedChain === "arb") {
      const arbUsdc = allTokens.find((t) => t.symbol === "USDC" && normalizeChain(t.blockchain) === "arb");
      if (arbUsdc) return arbUsdc.assetId;
    }
    if (normalizedChain === "polygon") {
      const polyUsdc = allTokens.find((t) => t.symbol === "USDC" && normalizeChain(t.blockchain) === "polygon");
      if (polyUsdc) return polyUsdc.assetId;
    }
    if (normalizedChain === "eth") {
      const ethUsdc = allTokens.find((t) => t.symbol === "USDC" && normalizeChain(t.blockchain) === "eth");
      if (ethUsdc) return ethUsdc.assetId;
    }
    return TARGET_ASSET.assetId; // Base USDC default
  }

  if (upper === "USDT") {
    if (normalizedChain) {
      const matchUsdt = allTokens.find((t) => t.symbol === "USDT" && normalizeChain(t.blockchain) === normalizedChain);
      if (matchUsdt) return matchUsdt.assetId;
    }
    // Preferred default for USDT if chain is omitted: Tron TRC20 USDT
    const tronUsdt = allTokens.find((t) => t.symbol === "USDT" && normalizeChain(t.blockchain) === "tron");
    if (tronUsdt) return tronUsdt.assetId;
  }

  // Composite multi-chain USDT aliases (e.g. USDT_POLYGON, USDT-POL)
  if (
    upper === "USDT_POLYGON" ||
    upper === "USDT-POLYGON" ||
    upper === "USDT_POL" ||
    upper === "USDT-POL" ||
    upper === "USDTPOLYGON" ||
    upper === "USDTPOL" ||
    upper === "USDT_MATIC" ||
    upper === "USDT-MATIC" ||
    upper === "USDTMATIC"
  ) {
    const polygonUsdt = allTokens.find((t) => t.symbol === "USDT" && normalizeChain(t.blockchain) === "polygon");
    if (polygonUsdt) return polygonUsdt.assetId;
  }

  if (
    upper === "USDC_POLYGON" ||
    upper === "USDC-POLYGON" ||
    upper === "USDC_POL" ||
    upper === "USDC-POL" ||
    upper === "USDCPOLYGON" ||
    upper === "USDCPOL" ||
    upper === "USDC_MATIC" ||
    upper === "USDC-MATIC" ||
    upper === "USDCMATIC"
  ) {
    const polygonUsdc = allTokens.find((t) => t.symbol === "USDC" && normalizeChain(t.blockchain) === "polygon");
    if (polygonUsdc) return polygonUsdc.assetId;
  }

  // 4. Fallback defaults for common coins
  if (upper === "BTC") return "nep141:btc.omft.near";
  if (upper === "ETH") {
    if (normalizedChain === "base") {
      const baseEth = allTokens.find((t) => t.symbol === "ETH" && normalizeChain(t.blockchain) === "base");
      if (baseEth) return baseEth.assetId;
    }
    return "nep141:eth.omft.near";
  }
  if (upper === "SOL") return "nep141:sol.omft.near";

  // 5. Exact symbol match from supported tokens list
  const match = allTokens.find((t) => t.symbol === upper);
  if (match) return match.assetId;

  throw new Error(
    `Asset '${symbolOrAssetId}' not found. Use GET /api/v1/swap/tokens to inspect supported assetIds, or pass 'chain' parameter (e.g. ?fromAsset=${symbolOrAssetId}&chain=polygon).`
  );
}

/**
 * Validates that the amount is provided in valid atomic units (positive integer string)
 * and meets the minimum solver volume threshold (~$0.05 USD).
 */
export function validateSwapAmount(amountStr: string, originAssetId: string): void {
  const clean = (amountStr || "").trim();

  // Guard against human decimal floats (e.g. "1.5" or "0.5")
  if (clean.includes(".")) {
    const err: any = new Error(
      "Amount is below minimum trade threshold (~$0.05 USD) or provided in human units instead of atomic units (e.g. lamports/wei). Expected atomic units as an integer string (e.g. '1000000000' for 1 SOL, '50000' for 0.05 USDC)."
    );
    err.code = "AMOUNT_BELOW_MINIMUM";
    err.statusCode = 400;
    throw err;
  }

  if (!clean || !/^\d+$/.test(clean) || clean === "0") {
    const err: any = new Error("Amount must be a positive non-zero integer string in atomic units.");
    err.code = "INVALID_AMOUNT";
    err.statusCode = 400;
    throw err;
  }

  // Pre-flight check against tiny human-unit inputs (e.g. "1" or "10" passed instead of lamports/wei)
  const val = BigInt(clean);
  const assetLower = originAssetId.toLowerCase();

  // SOL (9 decimals): 1 SOL = 1e9 (~$150). $0.05 USD is ~250,000 lamports
  if (assetLower.includes("sol") && val < 200_000n) {
    const err: any = new Error(
      "Amount is below minimum trade threshold (~$0.05 USD) or provided in human units instead of atomic units (e.g. lamports/wei). Expected atomic units as an integer string (e.g. '1000000000' for 1 SOL, '250000' for ~0.00025 SOL)."
    );
    err.code = "AMOUNT_BELOW_MINIMUM";
    err.statusCode = 400;
    throw err;
  }

  // ETH (18 decimals): 1 ETH = 1e18 (~$2,500). $0.05 USD is ~2e13 wei
  if (assetLower.includes("eth") && !assetLower.includes("usdc") && !assetLower.includes("usdt") && val < 10_000_000_000_000n) {
    const err: any = new Error(
      "Amount is below minimum trade threshold (~$0.05 USD) or provided in human units instead of atomic units (e.g. wei). Expected atomic units as an integer string (e.g. '10000000000000000' for 0.01 ETH, '20000000000000' for ~0.00002 ETH)."
    );
    err.code = "AMOUNT_BELOW_MINIMUM";
    err.statusCode = 400;
    throw err;
  }

  // BTC (8 decimals): 1 BTC = 1e8 (~$65,000). $0.05 USD is ~50-80 satoshis
  if (assetLower.includes("btc") && val < 50n) {
    const err: any = new Error(
      "Amount is below minimum trade threshold (~$0.05 USD) or provided in human units instead of atomic units (e.g. satoshis). Expected atomic units as an integer string (e.g. '100000' for 0.001 BTC, '50' for ~0.0000005 BTC)."
    );
    err.code = "AMOUNT_BELOW_MINIMUM";
    err.statusCode = 400;
    throw err;
  }

  // USDC / USDT (6 decimals): 1 USDC/USDT = 1e6 ($1.00). $0.05 USD is 50,000 atomic units
  const isUsdStable =
    assetLower.includes("usdc") ||
    assetLower.includes("usdt") ||
    assetLower.includes("137_3hpyoaltt8mp1z2gh1u473dmrkgr") ||
    assetLower.includes("137_qistmoqjdqptebapjgx5vbxzv6l") ||
    SWAP_ALLOWED_TOKENS.some(
      (t) => t.assetId.toLowerCase() === assetLower && (t.symbol === "USDC" || t.symbol === "USDT")
    );

  if (isUsdStable && val < 50_000n) {
    const err: any = new Error(
      "Amount is below minimum trade threshold ($0.05 USD) or provided in human units instead of atomic units (6 decimals). Expected atomic units as an integer string (e.g. '50000' for 0.05 USDC/USDT)."
    );
    err.code = "AMOUNT_BELOW_MINIMUM";
    err.statusCode = 400;
    throw err;
  }
}

function buildSolverHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 ZkPay/1.0",
  };
  if (process.env.NEAR_INTENTS_API_KEY) {
    headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
    headers["Authorization"] = `Bearer ${process.env.NEAR_INTENTS_API_KEY}`;
  }
  return headers;
}

/**
 * Robust fetch wrapper that guarantees no HTML or Cloudflare errors leak to the client.
 */
async function fetchSolverApi(endpoint: string, options: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(endpoint, options);
  } catch (networkErr: any) {
    const err: any = new Error("The decentralized solver network is currently unreachable. Please retry shortly.");
    err.code = "SOLVER_NETWORK_BUSY";
    err.statusCode = 503;
    throw err;
  }

  const responseText = await response.text();
  const trimmed = responseText.trim();

  // Catch upstream HTML / Cloudflare error pages (521 Origin Down, 502/503/504, bot challenges)
  if (
    response.status === 521 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504 ||
    trimmed.startsWith("<") ||
    trimmed.includes("<!DOCTYPE") ||
    trimmed.includes("<html")
  ) {
    const err: any = new Error("The decentralized solver network is temporarily unavailable. Please retry in a moment.");
    err.code = "SOLVER_NETWORK_BUSY";
    err.statusCode = 503;
    throw err;
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    const err: any = new Error("The decentralized solver network returned an unexpected response format. Please retry in a moment.");
    err.code = "SOLVER_NETWORK_BUSY";
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    const rawMsg = data.message || (typeof data.error === "string" ? data.error : "Failed to execute request on solver network.");
    const err: any = new Error(rawMsg);
    err.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    err.rawMessage = rawMsg;

    // Granular solver error classification
    const lowerMsg = rawMsg.toLowerCase();
    const minMatch = rawMsg.match(/try at least\s+(\d+)/i) || rawMsg.match(/minimum\s+.*?(\d+)/i);
    if (minMatch) {
      err.code = "AMOUNT_BELOW_MINIMUM";
      err.minAmountRequired = minMatch[1];
      err.message = `Amount is below solver bridge threshold. Minimum required is ${minMatch[1]} atomic units.`;
    } else if (lowerMsg.includes("amount is too low") || lowerMsg.includes("amount below")) {
      err.code = "AMOUNT_BELOW_MINIMUM";
    } else if (lowerMsg.includes("recipient is not valid") || lowerMsg.includes("invalid recipient")) {
      err.code = "INVALID_RECIPIENT";
      err.message = "Destination recipient address is invalid for the target blockchain.";
    } else if (lowerMsg.includes("refundto") || lowerMsg.includes("refund address")) {
      err.code = "INVALID_REFUND_ADDRESS";
      err.message = "Origin refund address is invalid for the source blockchain.";
    } else if (lowerMsg.includes("appfee") || lowerMsg.includes("fee recipient")) {
      err.code = "INVALID_FEE_RECIPIENT";
      err.message = "Fee recipient address is invalid for the origin blockchain (where fees are carved from input tokens).";
    } else if (lowerMsg.includes("no route") || lowerMsg.includes("liquidity") || lowerMsg.includes("cannot find quote") || lowerMsg.includes("no quote")) {
      err.code = "NO_SOLVER_LIQUIDITY";
      err.message = "Temporary lack of solver liquidity for this token pair or amount. Please adjust trade amount or retry shortly.";
    } else if (lowerMsg.includes("not available") || lowerMsg.includes("quoting for this pair") || lowerMsg.includes("offline")) {
      err.code = "PAIR_UNAVAILABLE";
      err.message = "Quoting for this token pair or destination network is currently unavailable on the solver network (the network may be temporarily offline for maintenance or lacking active solver market makers). Please try another supported chain or stablecoin (e.g. USDC on Base/Solana/Arbitrum or USDT on Tron/Solana).";
    } else {
      err.code = data.code || (response.status === 400 ? "SOLVER_REJECTED" : "SOLVER_ERROR");
    }

    throw err;
  }

  return data;
}

export interface SwapQuoteParams {
  fromAsset: string;
  toAsset?: string;
  chain?: string | null;
  originChain?: string | null;
  destinationChain?: string | null;
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
  const chainHint = params.chain || params.originChain;

  const originAssetId = await resolveAssetId(fromAsset, chainHint);
  const destinationAssetId = params.toAsset
    ? await resolveAssetId(params.toAsset, params.destinationChain)
    : TARGET_ASSET.assetId;

  // Resolve chains for both origin (fee routing) and destination (settlement)
  const resolvedOriginChain = params.originChain || params.chain || resolveChainFromAssetId(originAssetId) || "base";
  const resolvedDestChain = params.destinationChain || resolveChainFromAssetId(destinationAssetId) || "base";

  // Validate atomic units and minimum volume threshold
  validateSwapAmount(amount, originAssetId);

  // Fee split is resolved per ORIGIN chain because 1Click appFees carve out input tokens
  const feeSplit = calculateFeeSplit(totalFeeBps, feeRecipient, resolvedOriginChain, fromAsset);

  // Validate partner fee recipient format if provided
  if (
    feeSplit.partnerFeeRecipient &&
    !isValidFeeRecipient(feeSplit.partnerFeeRecipient, resolvedOriginChain)
  ) {
    const err: any = new Error(
      `Partner fee recipient address '${feeSplit.partnerFeeRecipient}' is invalid for origin chain '${resolvedOriginChain}'.`
    );
    err.code = "INVALID_FEE_RECIPIENT";
    err.statusCode = 400;
    throw err;
  }

  // Compute upfront fee deduction
  let netSwapAmount = amount.trim();
  let feeAmount = "0";

  if (!feeSplit.isDirectRoute && feeSplit.totalCustomFeeBps > 0) {
    const totalAtomic = BigInt(amount.trim());
    const feeAtomic = (totalAtomic * BigInt(feeSplit.totalCustomFeeBps)) / 10000n;
    const netAtomic = totalAtomic - feeAtomic;
    netSwapAmount = netAtomic > 0n ? netAtomic.toString() : amount.trim();
    feeAmount = feeAtomic.toString();
  }

  // Ensure effectiveRecipient is ALWAYS valid for the destination chain
  const effectiveRecipient =
    params.recipientAddress?.trim() ||
    getFallbackDestinationAddress(resolvedDestChain);
  const effectiveRefundTo = resolveRefundAddress(originAssetId, params.refundTo, effectiveRecipient, { isDryRun: true });

  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = {
    dry: true,
    swapType: "FLEX_INPUT",
    slippageTolerance: Math.max(10, Math.min(500, slippageBps || 100)),
    originAsset: originAssetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destinationAssetId,
    recipientType: "DESTINATION_CHAIN",
    amount: netSwapAmount, // Pass net swap amount to solver
    recipient: effectiveRecipient,
    refundTo: effectiveRefundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
    appFees: [], // ZERO appFees to NEAR Intents!
  };

  const data = await fetchSolverApi(`${ONECLICK_API}/quote`, {
    method: "POST",
    headers: buildSolverHeaders(),
    body: JSON.stringify(payload),
  });

  if (!data.quote) {
    const err: any = new Error("Solver network did not return a valid quote.");
    err.code = "NO_QUOTE_RETURNED";
    err.statusCode = 502;
    throw err;
  }

  const quote = data.quote;

  const executionPlan: ExecutionPlan = {
    isDirectRoute: feeSplit.isDirectRoute,
    type: feeSplit.isDirectRoute ? "DIRECT_DEPOSIT" : "UPFRONT_FEE_SPLIT",
    totalAmountIn: amount.trim(),
    netSwapAmount,
    feeAmount,
    feeAsset: originAssetId,
    treasuryAddress: feeSplit.treasuryAddress || null,
    partnerFeeRecipient: feeSplit.partnerFeeRecipient || null,
    depositAddress: quote.depositAddress,
    transfers: feeSplit.isDirectRoute
      ? [
          {
            purpose: "SWAP_DEPOSIT",
            recipient: quote.depositAddress,
            amount: amount.trim(),
          },
        ]
      : [
          {
            purpose: "PLATFORM_FEE",
            recipient: feeSplit.treasuryAddress,
            amount: feeAmount,
          },
          {
            purpose: "SWAP_DEPOSIT",
            recipient: quote.depositAddress,
            amount: netSwapAmount,
          },
        ],
  };

  return {
    quoteId: data.correlationId || `q_${Date.now()}`,
    originAsset: originAssetId,
    destinationAsset: destinationAssetId,
    totalAmountIn: amount.trim(),
    netSwapAmount,
    feeAmount,
    amountIn: quote.amountIn || netSwapAmount,
    amountInFormatted: quote.amountInFormatted,
    amountOut: quote.amountOut,
    amountOutFormatted: quote.amountOutFormatted,
    minAmountOut: quote.minAmountOut,
    minAmountOutFormatted: quote.minAmountOutFormatted,
    executionPlan,
    feeBreakdown: {
      isDirectRoute: feeSplit.isDirectRoute,
      networkProtocolFeeBps: feeSplit.networkProtocolFeeBps,
      totalCustomFeeBps: feeSplit.totalCustomFeeBps,
      feeAmount,
      split: {
        zkpayFeeBps: feeSplit.zkpayFeeBps,
        partnerFeeBps: feeSplit.partnerFeeBps,
        partnerFeeRecipient: feeSplit.partnerFeeRecipient,
        treasuryAddress: feeSplit.treasuryAddress,
      },
      totalDeductionsBps: feeSplit.totalDeductionsBps,
      feeSettlementNote: feeSplit.feeSettlementNote,
    },
    slippageBps: payload.slippageTolerance,
    timeEstimateSeconds: quote.timeEstimate || 45,
    expiresAt: quote.deadline || deadline,
  };
}

export interface CreateSwapParams {
  fromAsset: string;
  toAsset?: string;
  chain?: string | null;
  originChain?: string | null;
  destinationChain?: string | null;
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
    const err: any = new Error("Missing required 'recipient' address for destination chain.");
    err.code = "INVALID_RECIPIENT";
    err.statusCode = 400;
    throw err;
  }

  const chainHint = params.chain || params.originChain;
  const originAssetId = await resolveAssetId(fromAsset, chainHint);
  const destinationAssetId = params.toAsset
    ? await resolveAssetId(params.toAsset, params.destinationChain)
    : TARGET_ASSET.assetId;

  // Resolve chains for origin (fee routing) and destination (settlement)
  const resolvedOriginChain = params.originChain || params.chain || resolveChainFromAssetId(originAssetId) || "base";
  const resolvedDestChain = params.destinationChain || resolveChainFromAssetId(destinationAssetId) || "base";

  // Validate atomic units and minimum volume threshold
  validateSwapAmount(amount, originAssetId);

  // Fee split is resolved per ORIGIN chain
  const feeSplit = calculateFeeSplit(totalFeeBps, feeRecipient, resolvedOriginChain, fromAsset);

  // Validate partner fee recipient format if provided
  if (
    feeSplit.partnerFeeRecipient &&
    !isValidFeeRecipient(feeSplit.partnerFeeRecipient, resolvedOriginChain)
  ) {
    const err: any = new Error(
      `Partner fee recipient address '${feeSplit.partnerFeeRecipient}' is invalid for origin chain '${resolvedOriginChain}'.`
    );
    err.code = "INVALID_FEE_RECIPIENT";
    err.statusCode = 400;
    throw err;
  }

  // Compute upfront fee deduction
  let netSwapAmount = amount.trim();
  let feeAmount = "0";

  if (!feeSplit.isDirectRoute && feeSplit.totalCustomFeeBps > 0) {
    const totalAtomic = BigInt(amount.trim());
    const feeAtomic = (totalAtomic * BigInt(feeSplit.totalCustomFeeBps)) / 10000n;
    const netAtomic = totalAtomic - feeAtomic;
    netSwapAmount = netAtomic > 0n ? netAtomic.toString() : amount.trim();
    feeAmount = feeAtomic.toString();
  }

  const effectiveRefundTo = resolveRefundAddress(originAssetId, params.refundTo, recipient, { isDryRun: false });
  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = {
    dry: false, // Wet run: returns deposit address
    swapType: "FLEX_INPUT",
    slippageTolerance: Math.max(10, Math.min(500, slippageBps || 100)),
    originAsset: originAssetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: destinationAssetId,
    recipientType: "DESTINATION_CHAIN",
    amount: netSwapAmount, // Pass net swap amount to solver
    recipient: recipient.trim(),
    refundTo: effectiveRefundTo,
    refundType: "ORIGIN_CHAIN",
    deadline,
    appFees: [], // ZERO appFees to NEAR Intents!
  };

  const data = await fetchSolverApi(`${ONECLICK_API}/quote`, {
    method: "POST",
    headers: buildSolverHeaders(),
    body: JSON.stringify(payload),
  });

  if (!data.quote || !data.quote.depositAddress) {
    const err: any = new Error(data.message || "Failed to create swap order or generate deposit address.");
    err.code = "DEPOSIT_ADDRESS_FAILED";
    err.statusCode = 502;
    throw err;
  }

  const quote = data.quote;

  // Single-transfer Proxy System:
  // For Tier 2 (L2s: Base, Arbitrum, Polygon, BSC) and Tier 3 (Solana):
  // Generate an ephemeral single-use proxy deposit address so the user sends 100% in a single transaction.
  let finalDepositAddress = quote.depositAddress;
  let finalDepositAmount = quote.amountInFormatted || netSwapAmount;

  if (!feeSplit.isDirectRoute && isProxySupportedChain(resolvedOriginChain, fromAsset)) {
    try {
      const proxyWallet = generateProxyDepositWallet(resolvedOriginChain);
      finalDepositAddress = proxyWallet.depositAddress;
      finalDepositAmount = formatHumanAmount(amount.trim(), originAssetId);

      const proxyOrder: ProxySwapOrder = {
        swapId: data.correlationId || `swp_${Date.now()}`,
        proxyDepositAddress: proxyWallet.depositAddress,
        encryptedPrivateKey: proxyWallet.encryptedPrivateKey,
        chain: resolvedOriginChain,
        originAssetId,
        fromAsset,
        toAsset: params.toAsset || "USDC",
        destinationChain: resolvedDestChain,
        recipient: recipient.trim(),
        refundTo: effectiveRefundTo,
        totalAmountIn: amount.trim(),
        totalAmountFormatted: finalDepositAmount,
        netSwapAmount,
        feeAmount,
        gasBufferAmount: "10000",
        solverDepositAddress: quote.depositAddress,
        treasuryAddress: feeSplit.treasuryAddress,
        partnerFeeRecipient: feeSplit.partnerFeeRecipient,
        status: "PENDING_DEPOSIT",
        createdAt: Date.now(),
        expiresAt: new Date(quote.deadline || deadline).getTime(),
      };

      await saveProxySwapOrder(proxyOrder);
      console.log(`[SwapRouter] Proxy single-transfer order initialized: ${proxyOrder.swapId} -> ${proxyOrder.proxyDepositAddress}`);
    } catch (proxyErr) {
      console.warn("[SwapRouter] Proxy wallet generation warning, fallback to direct solver:", proxyErr);
      finalDepositAddress = quote.depositAddress;
    }
  }

  const executionPlan: ExecutionPlan = {
    isDirectRoute: feeSplit.isDirectRoute,
    type: feeSplit.isDirectRoute ? "DIRECT_DEPOSIT" : "UPFRONT_FEE_SPLIT",
    totalAmountIn: amount.trim(),
    netSwapAmount,
    feeAmount,
    feeAsset: originAssetId,
    treasuryAddress: feeSplit.treasuryAddress || null,
    partnerFeeRecipient: feeSplit.partnerFeeRecipient || null,
    depositAddress: finalDepositAddress,
    transfers: feeSplit.isDirectRoute
      ? [
          {
            purpose: "SWAP_DEPOSIT",
            recipient: quote.depositAddress,
            amount: amount.trim(),
          },
        ]
      : [
          {
            purpose: "PLATFORM_FEE",
            recipient: feeSplit.treasuryAddress,
            amount: feeAmount,
          },
          {
            purpose: "SWAP_DEPOSIT",
            recipient: quote.depositAddress,
            amount: netSwapAmount,
          },
        ],
  };

  return {
    swapId: data.correlationId || `swp_${Date.now()}`,
    status: "PENDING_DEPOSIT",
    deposit: {
      address: finalDepositAddress,
      memo: quote.depositMemo || null,
      amount: finalDepositAmount,
      deadline: quote.deadline || deadline,
    },
    settlement: {
      recipient: recipient.trim(),
      destinationAsset: destinationAssetId,
      estimatedAmountOut: quote.amountOutFormatted || quote.amountOut,
      minAmountOut: quote.minAmountOutFormatted || quote.minAmountOut,
      timeEstimateSeconds: quote.timeEstimate || 60,
    },
    executionPlan,
    feeSplit: {
      isDirectRoute: feeSplit.isDirectRoute,
      totalCustomFeeBps: feeSplit.totalCustomFeeBps,
      feeAmount,
      zkpayFeeBps: feeSplit.zkpayFeeBps,
      partnerFeeBps: feeSplit.partnerFeeBps,
      partnerFeeRecipient: feeSplit.partnerFeeRecipient,
      networkProtocolFeeBps: feeSplit.networkProtocolFeeBps,
      totalDeductionsBps: feeSplit.totalDeductionsBps,
      treasuryAddress: feeSplit.treasuryAddress,
      feeSettlementNote: feeSplit.feeSettlementNote,
    },
  };
}

function formatHumanAmount(atomicStr: string, assetId: string): string {
  const token = SWAP_ALLOWED_TOKENS.find((t) => t.assetId === assetId);
  const decimals = token?.decimals ?? 18;
  const rawNum = Number(BigInt(atomicStr)) / Math.pow(10, decimals);
  return rawNum.toFixed(Math.min(6, decimals)).replace(/\.?0+$/, "");
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
 * Automatically checks proxy deposit balance, triggers auto-forwarding,
 * and tracks upstream solver settlement.
 */
export async function getSwapStatus(depositAddress: string) {
  const cleanAddr = depositAddress.trim();

  // 1. Check if this is an ephemeral single-use proxy deposit address
  const proxyOrder = await getProxyOrderByAddress(cleanAddr);

  if (proxyOrder) {
    let currentOrder = proxyOrder;

    // If pending, trigger active balance check & auto-forward
    if (proxyOrder.status === "PENDING_DEPOSIT") {
      try {
        currentOrder = await checkAndForwardProxyDeposit(proxyOrder);
      } catch (err) {
        console.warn("[SwapRouter] Auto-forward check warning:", err);
      }
    }

    // If forwarded to solver, query Near Intents with solverDepositAddress
    if (currentOrder.status === "FORWARDED" || currentOrder.status === "SETTLED") {
      try {
        const solverStatus = await fetchNearIntentsStatus(currentOrder.solverDepositAddress);
        return {
          ...solverStatus,
          depositAddress: currentOrder.proxyDepositAddress,
          proxyDepositAddress: currentOrder.proxyDepositAddress,
          solverDepositAddress: currentOrder.solverDepositAddress,
          splitFeeTxHash: currentOrder.feeTxHash || null,
          forwardTxHash: currentOrder.forwardTxHash || null,
          status: solverStatus.status === "pending" ? "processing" : solverStatus.status,
        };
      } catch (solverErr) {
        console.warn("[SwapRouter] Solver status query warning:", solverErr);
      }
    }

    return {
      status: currentOrder.status === "PENDING_DEPOSIT" ? "pending" : "processing",
      rawStatus: currentOrder.status,
      depositAddress: currentOrder.proxyDepositAddress,
      solverDepositAddress: currentOrder.solverDepositAddress,
      depositedAmount: currentOrder.totalAmountFormatted,
      settledAmount: null,
      destinationTxHash: null,
      destinationExplorerUrl: null,
      originTxHash: currentOrder.depositTxHash || null,
      splitFeeTxHash: currentOrder.feeTxHash || null,
      forwardTxHash: currentOrder.forwardTxHash || null,
      updatedAt: new Date().toISOString(),
    };
  }

  // 2. Direct route query (Tier 1 ETH/BTC or legacy)
  return fetchNearIntentsStatus(cleanAddr);
}

async function fetchNearIntentsStatus(depositAddress: string) {
  const url = new URL(`${ONECLICK_API}/status`);
  url.searchParams.set("depositAddress", depositAddress.trim());

  const data = await fetchSolverApi(url.toString(), {
    method: "GET",
    headers: buildSolverHeaders(),
  });

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
