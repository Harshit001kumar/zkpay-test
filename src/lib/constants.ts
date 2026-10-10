const DIAMOND = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368";
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0xb856b24fb054135deba5e0309edd31ed6a8afbe2";

export const CONTRACTS = {
  // The P2P Diamond — the core protocol contract
  DIAMOND: DIAMOND as `0x${string}`,

  // Native USDC on Base Mainnet
  USDC: USDC as `0x${string}`,

  // ZkPay Treasury (receives 1% platform fee)
  TREASURY: TREASURY as `0x${string}`,

  // Default Base Mainnet ERC-4626 Vault (Steakhouse Prime Instant USDC on Morpho)
  EARN_VAULT: (process.env.NEXT_PUBLIC_EARN_VAULT_ADDRESS || "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9") as `0x${string}`,
} as const;

export const EARN_CONFIG = {
  VAULT_ADDRESS: CONTRACTS.EARN_VAULT,
  VAULT_NAME: "Steakhouse Prime Instant USDC",
  VAULT_PROVIDER: "Steakhouse / Morpho Blue",
  BENCHMARK_APY: "5.51",
  // 10% platform performance fee on harvested yield (1000 bps)
  PERFORMANCE_FEE_BPS: 1000,
} as const;

const INFURA_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY;
const INFURA_RPC = INFURA_KEY ? `https://base-mainnet.infura.io/v3/${INFURA_KEY}` : null;

export const BASE_RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  INFURA_RPC,
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
].filter(Boolean) as string[];

export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 8453, // Base Mainnet
  name: "Base",
  rpcUrl: INFURA_RPC || process.env.NEXT_PUBLIC_RPC_URL || "https://base.llamarpc.com",
  rpcUrls: BASE_RPC_URLS,
  blockExplorer: "https://basescan.org",
} as const;

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.goldsky.com/api/public/project_cmq7kbyqt81p501xi7h0wdeuh/subgraphs/p2pme-subgraph/prod/gn";

// Supported fiat currencies
export const CURRENCIES = [
  { symbol: "INR", flag: "🇮🇳", paymentMethod: "UPI" },
  { symbol: "USD", flag: "🇺🇸", paymentMethod: "Bank Transfer" },
  { symbol: "EUR", flag: "🇪🇺", paymentMethod: "SEPA" },
  { symbol: "GBP", flag: "🇬🇧", paymentMethod: "Faster Payments" },
] as const;

// Platform fee (1% take rate on transactions)
export const PLATFORM_FEE_BPS = 100; // 100 basis points = 1%

export const APP_NAME = "ZkPay";
export const APP_DESCRIPTION = "Crypto to Fiat - Scan and Pay";

// ─── SWAP API: Curated Token Allowlist ───
// assetId values sourced from GET https://1click.chaindefuser.com/v0/tokens
// Only tokens listed here are exposed by ZkPay's /swap/tokens endpoint and accepted by /swap/quote + /swap/create.
export const SWAP_ALLOWED_TOKENS = [
  // ── BTC ──
  { symbol: "BTC", name: "Bitcoin", assetId: "nep141:btc.omft.near", blockchain: "btc", decimals: 8 },
  // ── ETH ──
  { symbol: "ETH", name: "Ethereum", assetId: "nep141:eth.omft.near", blockchain: "eth", decimals: 18 },
  { symbol: "ETH", name: "Ethereum (Base)", assetId: "nep141:base.omft.near", blockchain: "base", decimals: 18 },
  { symbol: "ETH", name: "Ethereum (Arbitrum)", assetId: "nep141:arb.omft.near", blockchain: "arb", decimals: 18 },
  // ── SOL ──
  { symbol: "SOL", name: "Solana", assetId: "nep141:sol.omft.near", blockchain: "sol", decimals: 9 },
  // ── Stablecoins: USDC ──
  { symbol: "USDC", name: "USDC (Base)", assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", blockchain: "base", decimals: 6 },
  { symbol: "USDC", name: "USDC (Ethereum)", assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", blockchain: "eth", decimals: 6 },
  { symbol: "USDC", name: "USDC (Solana)", assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", blockchain: "sol", decimals: 6 },
  { symbol: "USDC", name: "USDC (Arbitrum)", assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", blockchain: "arb", decimals: 6 },
  // ── Stablecoins: USDT ──
  { symbol: "USDT", name: "Tether (Ethereum)", assetId: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near", blockchain: "eth", decimals: 6 },
  { symbol: "USDT", name: "Tether (Solana)", assetId: "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near", blockchain: "sol", decimals: 6 },
  { symbol: "USDT", name: "Tether (TRC20)", assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near", blockchain: "tron", decimals: 6 },
  // ── Other majors ──
  { symbol: "BNB", name: "BNB (BSC)", assetId: "nep245:v2_1.omni.hot.tg:56_11111111111111111111", blockchain: "bsc", decimals: 18 },
  { symbol: "ARB", name: "Arbitrum", assetId: "nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near", blockchain: "arb", decimals: 18 },
  { symbol: "TRX", name: "Tron", assetId: "nep141:tron.omft.near", blockchain: "tron", decimals: 6 },
  { symbol: "LTC", name: "Litecoin", assetId: "nep141:ltc.omft.near", blockchain: "ltc", decimals: 8 },
] as const;

// Legacy alias — some existing code references DEPOSIT_ASSETS
export const DEPOSIT_ASSETS = SWAP_ALLOWED_TOKENS;

// Chains ZkPay officially supports for swaps
export const SWAP_ALLOWED_CHAINS = new Set(["btc", "eth", "base", "sol", "arb", "bsc", "tron", "ltc"]);

// Base USDC — default destination asset when toAsset is omitted
export const TARGET_ASSET = {
  coin: "USDC",
  network: "base",
  assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  decimals: 6,
};

// ─── SWAP FEE TREASURY ADDRESSES ───
// In 1Click API (NEAR Intents), appFees are carved directly out of the INPUT TOKEN on the origin chain
// (e.g. SOL on Solana, BTC on Bitcoin, ETH/USDC on Base).
// ZkPay configures native receiving addresses per origin chain so fees settle directly on-chain ($0 minimum, zero delay).
export const TREASURY_ADDRESSES: Record<string, string> = {
  // EVM chains (all use the same 0x address)
  eth: process.env.TREASURY_ETH || TREASURY,
  base: process.env.TREASURY_BASE || TREASURY,
  arb: process.env.TREASURY_ARB || TREASURY,
  bsc: process.env.TREASURY_BSC || TREASURY,
  polygon: process.env.TREASURY_POLYGON || TREASURY,
  // Non-EVM chains (must be native address per blockchain)
  sol: process.env.TREASURY_SOL || "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
  btc: process.env.TREASURY_BTC || "bc1qg52t5l20hfhmk7nkwe62s4xt3qr2fedwqmu6up",
  tron: process.env.TREASURY_TRON || "TSsMeYZRBVp2oSocHbbZJJPSWLFKaAy28j",
  ltc: process.env.TREASURY_LTC || "LdmUa92dDxtp84nwJQgdjmayJqE1ESKza4",
  near: process.env.TREASURY_NEAR || "",
};

/**
 * Extracts the blockchain identifier from a NEAR Intents assetId.
 * e.g. "nep141:sol.omft.near" -> "sol", "nep141:btc.omft.near" -> "btc"
 */
export function resolveChainFromAssetId(assetId: string): string | null {
  if (!assetId) return null;
  // Check curated allowlist first
  const match = SWAP_ALLOWED_TOKENS.find((t) => t.assetId === assetId);
  if (match) return match.blockchain;

  // Fallback pattern matching on assetId prefixes/tags
  const lower = assetId.toLowerCase();
  if (lower.includes(":base")) return "base";
  if (lower.includes(":eth")) return "eth";
  if (lower.includes(":arb")) return "arb";
  if (lower.includes(":sol")) return "sol";
  if (lower.includes(":btc")) return "btc";
  if (lower.includes(":tron")) return "tron";
  if (lower.includes(":ltc")) return "ltc";
  if (lower.includes(":56_")) return "bsc";
  if (lower.includes(":polygon") || lower.includes(":matic")) return "polygon";
  return null;
}

/**
 * Normalizes user/chain input strings to standard lowercase chain identifiers.
 */
export function normalizeChain(chain?: string | null): string | undefined {
  if (!chain) return undefined;
  const c = chain.trim().toLowerCase();
  if (c === "sol" || c === "solana") return "sol";
  if (c === "eth" || c === "ethereum" || c === "mainnet") return "eth";
  if (c === "base") return "base";
  if (c === "arb" || c === "arbitrum") return "arb";
  if (c === "bsc" || c === "binance" || c === "bnb") return "bsc";
  if (c === "tron" || c === "trx") return "tron";
  if (c === "btc" || c === "bitcoin") return "btc";
  if (c === "polygon" || c === "matic") return "polygon";
  if (c === "ltc" || c === "litecoin") return "ltc";
  if (c === "near") return "near";
  return c;
}

/**
 * Resolves the on-chain treasury recipient address for a given origin chain.
 * In 1Click API (NEAR Intents), appFees are carved out of the INPUT TOKEN on the ORIGIN CHAIN.
 * Providing a chain-native address allows the fee to settle directly and instantly to our wallet on-chain ($0 minimum, 0 delay).
 */
export function getTreasuryAddressForChain(chain?: string | null): string {
  if (!chain) return TREASURY;
  const c = normalizeChain(chain);
  if (!c) return TREASURY;

  if (TREASURY_ADDRESSES[c] && TREASURY_ADDRESSES[c].trim() !== "") {
    return TREASURY_ADDRESSES[c];
  }

  // Fallback to default Base/EVM treasury
  return TREASURY;
}

// Cross-chain deposit fee (1.75% = 175 bps — charged via NEAR Intents appFees)
// Without an API key, 1Click adds 25 bps on top → 2.0% total for users
export const DEPOSIT_FEE_BPS = 175;

// Fee recipient for NEAR Intents appFees (defaults to Treasury address)
export const DEPOSIT_FEE_RECIPIENT = process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT || TREASURY;


