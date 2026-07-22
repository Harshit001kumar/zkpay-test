export const CONTRACTS = {
  // The P2P Diamond — the core protocol contract
  DIAMOND: (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0xd8d6ACdbc5dbAFa073827F3335dbb06Df31580F6") as `0x${string}`,

  // Native USDC on Base Mainnet
  USDC: (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`,
  
  // ZkPay Treasury (receives 1% platform fee)
  TREASURY: (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0x4747883abdf84ad96565415514de298e3a3fd3e1") as `0x${string}`,
} as const;

export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 8453, // Base Mainnet
  name: "Base",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org",
  blockExplorer: "https://basescan.org",
} as const;

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/p2p/base-mainnet/version/latest";

// Demo products available for testing
export const DEMO_PRODUCTS = [
  { id: 1, name: "Common", price: 5, currency: "USDC" },
  { id: 2, name: "Rare", price: 10, currency: "USDC" },
  { id: 3, name: "Legendary", price: 25, currency: "USDC" },
] as const;

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
  { symbol: "SOL", name: "Solana", coin: "SOL", network: "solana" },
  { symbol: "USDT", name: "Tether (TRC20)", coin: "USDT", network: "tron" },
  { symbol: "USDC", name: "USDC (ERC20)", coin: "USDC", network: "ethereum" },
  { symbol: "MATIC", name: "Polygon", coin: "MATIC", network: "polygon" },
  { symbol: "BNB", name: "BNB (BSC)", coin: "BNB", network: "bsc" }
] as const;

// The target asset on the Base network for our embedded wallet
export const TARGET_ASSET = {
  coin: "USDC",
  network: "base",
};
