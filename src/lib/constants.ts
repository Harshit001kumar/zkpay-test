const DIAMOND = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368";
const USDC = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TREASURY = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0x4747883abdf84ad96565415514de298e3a3fd3e1";

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
export const APP_DESCRIPTION = "Crypto to Fiat — Scan and Pay";

// NEAR Intents 1Click API — supported deposit assets
// assetId values sourced from GET https://1click.chaindefuser.com/v0/tokens
export const DEPOSIT_ASSETS = [
  { symbol: "BTC",  name: "Bitcoin",          assetId: "nep141:btc.omft.near",                                              blockchain: "btc",  decimals: 8 },
  { symbol: "ETH",  name: "Ethereum",         assetId: "nep141:eth.omft.near",                                              blockchain: "eth",  decimals: 18 },
  { symbol: "SOL",  name: "Solana",           assetId: "nep141:sol.omft.near",                                              blockchain: "sol",  decimals: 9 },
  { symbol: "USDT", name: "Tether (TRC20)",   assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",     blockchain: "tron", decimals: 6 },
  { symbol: "USDC", name: "USDC (Ethereum)",  assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",   blockchain: "eth",  decimals: 6 },
  { symbol: "USDC", name: "USDC (Solana)",    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",      blockchain: "sol",  decimals: 6 },
  { symbol: "USDC", name: "USDC (Arbitrum)",  assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",   blockchain: "arb",  decimals: 6 },
  { symbol: "BNB",  name: "BNB (BSC)",        assetId: "nep245:v2_1.omni.hot.tg:56_11111111111111111111",                    blockchain: "bsc",  decimals: 18 },
  { symbol: "LTC",  name: "Litecoin",         assetId: "nep141:ltc.omft.near",                                              blockchain: "ltc",  decimals: 8 },
] as const;

// Base USDC — the destination asset for all cross-chain deposits
export const TARGET_ASSET = {
  coin: "USDC",
  network: "base",
  assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  decimals: 6,
};

// Cross-chain deposit fee (1.75% — charged via NEAR Intents appFees)
// Without an API key, 1Click adds 25 bps on top → ~2.0% total for users
export const DEPOSIT_FEE_BPS = 175;

// Fee recipient for NEAR Intents appFees (defaults to Treasury address)
export const DEPOSIT_FEE_RECIPIENT = process.env.NEXT_PUBLIC_DEPOSIT_FEE_RECIPIENT || TREASURY;

