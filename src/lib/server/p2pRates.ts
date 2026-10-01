import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

/**
 * Resilient P2P Rates Client with Multi-RPC Failover and In-Memory TTL Caching.
 * 
 * Prevents transient Base RPC latency or rate-limiting from failing payin session creation.
 */

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const CUSTOM_RPC = process.env.NEXT_PUBLIC_RPC_URL;

// Reliable Base Mainnet RPC endpoints ordered by priority
const BASE_RPC_URLS = [
  ...(CUSTOM_RPC ? [CUSTOM_RPC] : []),
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.gateway.tenderly.co",
];

let _publicClient: any = null;

export function getResilientPublicClient() {
  if (!_publicClient) {
    const transports = BASE_RPC_URLS.map((url) =>
      http(url, {
        timeout: 5000,
        retryCount: 2,
        retryDelay: 300,
      })
    );

    _publicClient = createPublicClient({
      chain: base,
      transport: fallback(transports, { rank: false }),
    });
  }
  return _publicClient;
}

let _pricesClient: any = null;

export function getPricesClient() {
  if (!_pricesClient) {
    _pricesClient = createPrices({
      publicClient: getResilientPublicClient(),
      diamondAddress: DIAMOND_ADDRESS,
    });
  }
  return _pricesClient;
}

// In-Memory Rate Cache (15-second TTL)
interface RateCacheEntry {
  sellPrice: number;
  buyPrice?: number;
  timestamp: number;
}

const rateCache = new Map<string, RateCacheEntry>();
const RATE_CACHE_TTL_MS = 15 * 1000; // 15 seconds

// Baseline safe fallback if contract is temporarily unreachable and no cache exists
const DEFAULT_FALLBACK_RATES: Record<string, number> = {
  INR: 91.50,
  USD: 1.00,
  EUR: 0.92,
  GBP: 0.79,
};

/**
 * Fetches live fiat sell price with in-memory caching and resilient failover.
 * Returns sell price in human currency units (e.g. 91.50 INR per USDC).
 */
export async function getLiveFiatRate(currency: string = "INR"): Promise<number> {
  const curr = currency.toUpperCase().trim();
  const now = Date.now();
  const cached = rateCache.get(curr);

  // Return fresh cached rate if within TTL
  if (cached && now - cached.timestamp < RATE_CACHE_TTL_MS) {
    return cached.sellPrice;
  }

  try {
    const client = getPricesClient();
    const result = await client.getPriceConfig({ currency: curr });

    if (result.isOk() && result.value?.sellPrice) {
      const sellPrice = Number(result.value.sellPrice) / 1e6;
      rateCache.set(curr, {
        sellPrice,
        timestamp: now,
      });
      return sellPrice;
    }
  } catch (err: any) {
    console.warn(`[P2PRates] RPC query failed for ${curr}:`, err.message || err);
  }

  // Fallback 1: Use slightly stale cached rate if available
  if (cached && cached.sellPrice > 0) {
    console.warn(`[P2PRates] Serving stale cached rate for ${curr}: ₹${cached.sellPrice}`);
    return cached.sellPrice;
  }

  // Fallback 2: Conservative floor default so checkout sessions never break
  const baseline = DEFAULT_FALLBACK_RATES[curr] || 90.00;
  console.warn(`[P2PRates] Serving baseline fallback rate for ${curr}: ${baseline}`);
  return baseline;
}
