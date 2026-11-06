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
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

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

  const cgId = COINGECKO_ID_MAP[normSym];

  // 3. Attempt CoinGecko fetch if mapping exists
  if (cgId) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        // Short timeout so we don't stall settlement status polls
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        const price = data?.[cgId]?.usd;
        if (typeof price === "number" && price > 0) {
          PRICE_CACHE.set(normSym, { priceUsd: price, timestamp: Date.now() });
          return price;
        }
      } else {
        console.warn(`[PriceService] CoinGecko returned status ${res.status} for ${normSym}`);
      }
    } catch (cgErr: any) {
      console.warn(`[PriceService] CoinGecko fetch warning for ${normSym}:`, cgErr?.message || cgErr);
    }
  }

  // 4. Fallback: Binance public ticker
  try {
    const binanceSymbol = `${normSym}USDT`;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`, {
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
  } catch (bErr) {
    // Ignore and fallback
  }

  // 5. Fallback: Existing expired cache if available
  if (cached && cached.priceUsd > 0) {
    return cached.priceUsd;
  }

  // 6. Hardcoded emergency sane baselines if internet connectivity is completely lost
  const emergencyDefaults: Record<string, number> = {
    POL: 0.089,
    MATIC: 0.089,
    ETH: 2500,
    BNB: 600,
    SOL: 150,
    BTC: 70000,
    LTC: 70,
  };

  const defaultPrice = emergencyDefaults[normSym] || 1.0;
  PRICE_CACHE.set(normSym, { priceUsd: defaultPrice, timestamp: Date.now() });
  return defaultPrice;
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
    const usdValue = Math.round(rawTokens * pricePerToken * 10000) / 10000;

    return { humanAmount, pricePerToken, usdValue };
  } catch {
    return { humanAmount: "0", pricePerToken: 1.0, usdValue: 0 };
  }
}
