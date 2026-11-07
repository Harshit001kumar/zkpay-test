/**
 * Live Token USD Price Service
 *
 * Provides real-time asset prices against USD using CoinGecko Simple Price API,
 * protected by an in-memory TTL cache (60s) to prevent rate limits on Render.
 * Includes fallbacks to 1Click public token endpoints and stablecoin $1.00 pegs.
 */

interface PriceCacheEntry {
  priceUsd: number;
  timestamp: number;
}

const PRICE_CACHE = new Map<string, PriceCacheEntry>();
const IN_FLIGHT_FETCHES = new Map<string, Promise<number>>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes (prevents rate-limiting across concurrent swaps)

// Mapping standard asset symbols to CoinGecko API IDs
const COINGECKO_ID_MAP: Record<string, string> = {
  USDC: "usd-coin",
  "USDC.E": "usd-coin",
  USDT: "tether",
  USDT0: "tether",
  ETH: "ethereum",
  WETH: "ethereum",
  POL: "matic-network",
  MATIC: "matic-network",
  BNB: "binancecoin",
  SOL: "solana",
  WSOL: "solana",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  LTC: "litecoin",
  NEAR: "near",
  AVAX: "avalanche-2",
  TRX: "tron",
  DAI: "dai",
};

// Stablecoins pegged 1:1 to USD
const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "USDT0",
  "USDC.E",
  "DAI",
  "BUSD",
  "FDUSD",
  "PYUSD",
  "USDD",
]);

/**
 * Returns the live USD price of a cryptocurrency asset.
 */
export async function getLiveTokenPriceUsd(symbol: string): Promise<number> {
  const normSym = (symbol || "").trim().toUpperCase();

  // 1. Stablecoin immediate $1.00 return
  if (STABLECOIN_SYMBOLS.has(normSym) || normSym.includes("USD")) {
    return 1.0;
  }

  // 2. Check in-memory cache
  const cached = PRICE_CACHE.get(normSym);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.priceUsd;
  }

  // 3. Deduplicate concurrent in-flight requests for the same symbol
  const existingInFlight = IN_FLIGHT_FETCHES.get(normSym);
  if (existingInFlight) {
    return existingInFlight;
  }

  const fetchPromise = fetchTokenPriceInternal(normSym, cached).finally(() => {
    IN_FLIGHT_FETCHES.delete(normSym);
  });
  IN_FLIGHT_FETCHES.set(normSym, fetchPromise);
  return fetchPromise;
}

async function fetchTokenPriceInternal(
  normSym: string,
  cached?: PriceCacheEntry
): Promise<number> {
  const cgId = COINGECKO_ID_MAP[normSym];

  // 1. Primary Bulk Feed: NEAR Intents 1Click Public Tokens API (populates ALL tokens in 1 single HTTP request!)
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.NEAR_INTENTS_API_KEY) {
      headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
    }
    const oneClickRes = await fetch("https://1click.chaindefuser.com/v0/tokens", {
      headers,
      signal: AbortSignal.timeout(3500),
    });
    if (oneClickRes.ok) {
      const raw = await oneClickRes.json();
      const list: any[] = Array.isArray(raw) ? raw : raw?.tokens || [];
      let matchedPrice = 0;
      const now = Date.now();
      for (const t of list) {
        const sym = (t?.symbol || "").trim().toUpperCase();
        const p = typeof t?.price === "number" ? t.price : parseFloat(t?.price);
        if (sym && !isNaN(p) && p > 0) {
          PRICE_CACHE.set(sym, { priceUsd: p, timestamp: now });
          if (sym === normSym) matchedPrice = p;
        }
      }
      if (matchedPrice > 0) {
        return matchedPrice;
      }
    }
  } catch {
    // Continue to next live provider
  }

  // 2. Secondary Live Feed: Coinbase Public Spot API (Fast, US-hosted CDN, 10,000 req/hr limit)
  try {
    const cbSymbol = normSym === "MATIC" ? "POL" : normSym === "WSOL" ? "SOL" : normSym === "WETH" ? "ETH" : normSym === "WBTC" ? "BTC" : normSym;
    const cbRes = await fetch(`https://api.coinbase.com/v2/prices/${cbSymbol}-USD/spot`, {
      headers: { Accept: "application/json", "User-Agent": "ZkPay/1.0" },
      signal: AbortSignal.timeout(3500),
    });
    if (cbRes.ok) {
      const cbData = await cbRes.json();
      const price = parseFloat(cbData?.data?.amount);
      if (!isNaN(price) && price > 0) {
        PRICE_CACHE.set(normSym, { priceUsd: price, timestamp: Date.now() });
        return price;
      }
    }
  } catch {
    // Continue to next live provider
  }

  // 3. Tertiary Bulk Feed: CoinGecko Batched Simple Price API (fetches all major tokens in 1 call)
  if (cgId) {
    try {
      const allIds = Array.from(new Set(Object.values(COINGECKO_ID_MAP))).join(",");
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${allIds}&vs_currencies=usd`;
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "ZkPay-Partner-Engine/1.0",
      };
      if (process.env.COINGECKO_API_KEY) {
        headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
      }
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const data = await res.json();
        const now = Date.now();
        for (const [symKey, idVal] of Object.entries(COINGECKO_ID_MAP)) {
          const p = data?.[idVal]?.usd;
          if (typeof p === "number" && p > 0) {
            PRICE_CACHE.set(symKey, { priceUsd: p, timestamp: now });
          }
        }
        const price = data?.[cgId]?.usd;
        if (typeof price === "number" && price > 0) {
          return price;
        }
      }
    } catch {
      // Continue to next live provider
    }
  }

  // 4. Fallback Live Feed: Binance US Public Ticker
  try {
    const binanceSymbol = `${normSym}USDT`;
    const res = await fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${binanceSymbol}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.price);
      if (!isNaN(price) && price > 0) {
        PRICE_CACHE.set(normSym, { priceUsd: price, timestamp: Date.now() });
        return price;
      }
    }
  } catch {
    // Ignore and fallback
  }

  // 5. Fallback: Existing expired cache if available (still a real historical market price)
  if (cached && cached.priceUsd > 0) {
    return cached.priceUsd;
  }

  return 0;
}

/**
 * Calculates human token amount and converted USD value from atomic token units.
 */
export async function calculateTokenUsdValue(
  atomicUnits: string | bigint,
  symbol: string,
  decimals: number
): Promise<{ humanAmount: string; pricePerToken: number; usdValue: number }> {
  try {
    const atomic = BigInt(atomicUnits.toString());
    const rawTokens = Number(atomic) / Math.pow(10, decimals);
    const humanAmount = rawTokens.toFixed(Math.min(6, decimals)).replace(/\.?0+$/, "");
    const pricePerToken = await getLiveTokenPriceUsd(symbol);
    if (pricePerToken <= 0) {
      return { humanAmount, pricePerToken: 0, usdValue: 0 };
    }
    const usdValue = Math.round(rawTokens * pricePerToken * 10000) / 10000;

    return { humanAmount, pricePerToken, usdValue };
  } catch {
    return { humanAmount: "0", pricePerToken: 0, usdValue: 0 };
  }
}
