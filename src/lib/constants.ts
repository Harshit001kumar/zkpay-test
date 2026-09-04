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

  // Default Base Mainnet ERC-4626 Vault (Moonwell Flagship USDC)
  EARN_VAULT: (process.env.NEXT_PUBLIC_EARN_VAULT_ADDRESS || "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca") as `0x${string}`,
} as const;

export const EARN_CONFIG = {
  VAULT_ADDRESS: CONTRACTS.EARN_VAULT,
  VAULT_NAME: "Moonwell Flagship USDC",
  VAULT_PROVIDER: "Moonwell / MetaMorpho",
  BENCHMARK_APY: "8.40",
  // 10% platform performance fee on harvested yield (1000 bps)
  PERFORMANCE_FEE_BPS: 1000,
} as const;

export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 8453, // Base Mainnet
  name: "Base",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org",
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

// SideShift supported deposit assets
export const DEPOSIT_ASSETS = [
  { symbol: "BTC", name: "Bitcoin", coin: "BTC", network: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", coin: "ETH", network: "ethereum" },
  { symbol: "LTC", name: "Litecoin", coin: "LTC", network: "litecoin" },
  { symbol: "SOL", name: "Solana", coin: "SOL", network: "solana" },
  { symbol: "USDT", name: "Tether (TRC20)", coin: "USDT", network: "tron" },
  { symbol: "USDC", name: "USDC (ERC20)", coin: "USDC", network: "ethereum" },
  { symbol: "USDC", name: "USDC (Polygon)", coin: "USDC", network: "polygon" },
  { symbol: "BNB", name: "BNB (BSC)", coin: "BNB", network: "bsc" }
] as const;

// The target asset on the Base network for our embedded wallet
export const TARGET_ASSET = {
  coin: "USDC",
  network: "base",
};
