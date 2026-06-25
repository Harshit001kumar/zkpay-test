// P2PKit contract addresses — Base Sepolia (testnet)
// Switch to mainnet addresses (chainId 8453) when going live.

export const CONTRACTS = {
  // The P2P Diamond — the core protocol contract
  DIAMOND: process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0xeb0BB8E3c014D915D9B2df03aBB130a1Fb44beb9",

  // Demo MarketplaceCheckoutIntegrator on Sepolia — use this until our own is whitelisted
  INTEGRATOR: process.env.NEXT_PUBLIC_INTEGRATOR_ADDRESS || "0x6daE4C184a32782A72bd99875379fc1E7383213B",

  // Native USDC on Base Sepolia (matches Circle Faucet)
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532, // Base Sepolia
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
} as const;

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/p2p/base-sepolia/version/latest";

// Demo products available on the Sepolia integrator
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
