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
    const { buildOneClickHeaders } = await import("./rpcConfig");
    const oneClickRes = await fetch("https://1click.chaindefuser.com/v0/tokens", {
      headers: buildOneClickHeaders(),
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

  // 5. Fallback: Existing expired cache if <= 10m old (prevents unbounded stale prices)
  if (cached && cached.priceUsd > 0 && Date.now() - cached.timestamp <= 10 * 60_000) {
    return cached.priceUsd;
  }

  return 0;
}

/**
 * Calculates human token amount and converted USD value from atomic token units.
 * Uses multi-oracle cross-verified pricing so single-feed spikes cannot inflate partner USD credits.
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
    const pricePerToken = await getFreshTokenPriceUsd(symbol, 60_000);
    if (pricePerToken <= 0) {
      return { humanAmount, pricePerToken: 0, usdValue: 0 };
    }
    const usdValue = Math.round(rawTokens * pricePerToken * 10000) / 10000;

    return { humanAmount, pricePerToken, usdValue };
  } catch {
    return { humanAmount: "0", pricePerToken: 0, usdValue: 0 };
  }
}

const VERIFIED_POOL_PRICE_CACHE = new Map<string, { priceUsd: number; timestamp: number }>();

const KRAKEN_PAIR_MAP: Record<string, { pair: string; keyHint: string }> = {
  LTC: { pair: "LTCUSD", keyHint: "LTC" },
  SOL: { pair: "SOLUSD", keyHint: "SOL" },
  BTC: { pair: "XBTUSD", keyHint: "XBT" },
  ETH: { pair: "ETHUSD", keyHint: "ETH" },
  POL: { pair: "POLUSD", keyHint: "POL" },
  MATIC: { pair: "POLUSD", keyHint: "POL" },
  USDT: { pair: "USDTUSD", keyHint: "USDT" },
  USDC: { pair: "USDCUSD", keyHint: "USDC" },
};

/**
 * Fetches independent spot prices from Coinbase, Kraken, CoinGecko, and Binance US in parallel.
 * Each feed is uniquely named so no provider is ever counted twice.
 */
async function fetchIndependentSpotPricesUsd(
  normSym: string
): Promise<Array<{ provider: string; price: number }>> {
  const cbSymbol =
    normSym === "MATIC"
      ? "POL"
      : normSym === "WSOL"
      ? "SOL"
      : normSym === "WETH"
      ? "ETH"
      : normSym === "WBTC"
      ? "BTC"
      : normSym;

  const krakenInfo = KRAKEN_PAIR_MAP[cbSymbol];
  const cgId = COINGECKO_ID_MAP[normSym] || COINGECKO_ID_MAP[cbSymbol];
  const cgHeaders: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "ZkPay/1.0",
  };
  if (process.env.COINGECKO_API_KEY) {
    cgHeaders["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const [cbPrice, krakenPrice, binancePrice, cgPrice] = await Promise.all([
    fetch(`https://api.coinbase.com/v2/prices/${cbSymbol}-USD/spot`, {
      headers: { Accept: "application/json", "User-Agent": "ZkPay/1.0" },
      signal: AbortSignal.timeout(3000),
    })
      .then(async (r) => (r.ok ? parseFloat((await r.json())?.data?.amount) : 0))
      .catch(() => 0),
    krakenInfo
      ? fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenInfo.pair}`, {
          headers: { Accept: "application/json", "User-Agent": "ZkPay/1.0" },
          signal: AbortSignal.timeout(3000),
        })
          .then(async (r) => {
            if (!r.ok) return 0;
            const d = await r.json();
            const resultObj = d?.result || {};
            const firstKey = Object.keys(resultObj)[0];
            const lastTrade = firstKey ? resultObj[firstKey]?.c?.[0] : null;
            return lastTrade ? parseFloat(lastTrade) : 0;
          })
          .catch(() => 0)
      : Promise.resolve(0),
    cbSymbol === "USDT" || cbSymbol === "USDC"
      ? Promise.resolve(0)
      : fetch(`https://api.binance.us/api/v3/ticker/price?symbol=${cbSymbol}USDT`, {
          signal: AbortSignal.timeout(3000),
        })
          .then(async (r) => (r.ok ? parseFloat((await r.json())?.price) : 0))
          .catch(() => 0),
    cgId
      ? fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`, {
          headers: cgHeaders,
          signal: AbortSignal.timeout(3000),
        })
          .then(async (r) => (r.ok ? Number((await r.json())?.[cgId]?.usd || 0) : 0))
          .catch(() => 0)
      : Promise.resolve(0),
  ]);

  const out: Array<{ provider: string; price: number }> = [];
  if (Number.isFinite(cbPrice) && cbPrice > 0) out.push({ provider: "coinbase", price: cbPrice });
  if (Number.isFinite(krakenPrice) && krakenPrice > 0)
    out.push({ provider: "kraken", price: krakenPrice });
  if (Number.isFinite(binancePrice) && binancePrice > 0)
    out.push({ provider: "binance", price: binancePrice });
  if (Number.isFinite(cgPrice) && cgPrice > 0)
    out.push({ provider: "coingecko", price: cgPrice });
  return out;
}

/**
 * Returns a fresh, multi-oracle cross-verified USD price for liquidity pool quoting & payout checks.
 * Requires at least 2 distinct independent price feeds agreeing within 2.5% spread.
 * Stablecoins are verified against live USD markets within [0.985, 1.015] so depegs trigger Solver fallback.
 */
export async function getFreshTokenPriceUsd(symbol: string, maxAgeMs = 60_000): Promise<number> {
  const normSym = (symbol || "").trim().toUpperCase();
  const effectiveTtl = Math.min(maxAgeMs, 30_000);
  const verifiedCached = VERIFIED_POOL_PRICE_CACHE.get(normSym);
  if (verifiedCached && Date.now() - verifiedCached.timestamp <= effectiveTtl) {
    return verifiedCached.priceUsd;
  }

  const independentSpots = await fetchIndependentSpotPricesUsd(normSym);
  const byProvider = new Map<string, number>();
  for (const item of independentSpots) {
    byProvider.set(item.provider, item.price);
  }

  // Fallback distinct source (1Click tokens feed) only if < 2 direct exchange feeds answered
  if (byProvider.size < 2) {
    try {
      const { buildOneClickHeaders } = await import("./rpcConfig");
      const res = await fetch("https://1click.chaindefuser.com/v0/tokens", {
        headers: buildOneClickHeaders(),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const raw = await res.json();
        const list: any[] = Array.isArray(raw) ? raw : raw?.tokens || [];
        for (const t of list) {
          const sym = (t?.symbol || "").trim().toUpperCase();
          const p = typeof t?.price === "number" ? t.price : parseFloat(t?.price);
          if (sym === normSym && Number.isFinite(p) && p > 0) {
            byProvider.set("1click", p);
            break;
          }
        }
      }
    } catch {}
  }

  const allValid = Array.from(byProvider.values());
  if (allValid.length < 2) {
    console.warn(
      `[PriceService] Multi-oracle check requires >=2 distinct feeds for ${normSym} (got ${allValid.length}); falling back.`
    );
    return 0;
  }

  const minP = Math.min(...allValid);
  const maxP = Math.max(...allValid);
  const spread = minP > 0 ? (maxP - minP) / minP : 1;

  if (STABLECOIN_SYMBOLS.has(normSym) || normSym.includes("USD")) {
    if (minP < 0.985 || maxP > 1.015 || spread > 0.025) {
      console.warn(
        `[PriceService] Stablecoin depeg or oracle divergence for ${normSym}: min=$${minP}, max=$${maxP}; falling back.`
      );
      return 0;
    }
  } else if (spread > 0.025) {
    console.warn(
      `[PriceService] Liquidity pool oracle divergence for ${normSym}: min=$${minP}, max=$${maxP} (spread ${(spread * 100).toFixed(2)}% > 2.5%).`
    );
    return 0;
  }

  const verifiedPrice = allValid.reduce((acc, v) => acc + v, 0) / allValid.length;
  VERIFIED_POOL_PRICE_CACHE.set(normSym, { priceUsd: verifiedPrice, timestamp: Date.now() });
  return verifiedPrice;
}

/**
 * Computes ~$0.02 USD worth of any supported token in atomic units (rounded up).
 * Used to enforce the universal $0.02 minimum ZkPay fee floor (identical to Polygon USDT)
 * whenever ZkPay's percentage fee share is < $0.02, and for user-fault ERC-20 refund gas recovery.
 */
export function computeTwoCentsAtomic(
  symbol: string,
  decimals: number,
  priceUsd?: number | null
): bigint {
  if (decimals < 0 || !Number.isInteger(decimals)) return 0n;
  const normSym = (symbol || "").trim().toUpperCase();

  if (STABLECOIN_SYMBOLS.has(normSym) || normSym.includes("USD")) {
    return decimals >= 2 ? 2n * 10n ** BigInt(decimals - 2) : 1n;
  }

  if (typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0) {
    const priceE8 = BigInt(Math.round(priceUsd * 1e8));
    if (priceE8 > 0n) {
      const numerator = 2_000_000n * 10n ** BigInt(decimals);
      return (numerator + priceE8 - 1n) / priceE8;
    }
  }

  // Safe conservative fallbacks (~$0.02) if live oracle price is temporarily unavailable
  if (normSym === "LTC" && decimals === 8) return 25_000n;
  if ((normSym === "SOL" || normSym === "WSOL") && decimals === 9) return 150_000n;
  if (normSym === "BNB" && decimals === 18) return 35_000_000_000_000n;
  if ((normSym === "ETH" || normSym === "WETH") && decimals === 18) return 8_000_000_000_000n;
  if ((normSym === "POL" || normSym === "MATIC") && decimals === 18) return 80_000_000_000_000_000n;

  return 0n;
}
