// P2PKit contract addresses — Base Sepolia (testnet)
// Switch to mainnet addresses (chainId 8453) when going live.
import { getAddress } from "viem";

export const CONTRACTS = {
  // The P2P Diamond — the core protocol contract
  DIAMOND: getAddress(process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0xd8d6acdbc5dbafa073827f3335dbb06df31580f6"),

  // ZkPay custom integrator on Base Sepolia
  INTEGRATOR: getAddress(process.env.NEXT_PUBLIC_INTEGRATOR_ADDRESS || "0x5610D5f587F9cEEBb11C2920D15aC54175b40b2f"),

  // Native USDC on Base Sepolia (matches Circle Faucet)
  USDC: getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  
  // ZkPay Treasury (receives 1% platform fee)
  TREASURY: getAddress(process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0x0242898972A3DCA88082Ccc366B27cBf950E25b8"),
} as const;

export const CHAIN = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532, // Base Sepolia
  name: "Base Sepolia",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://base-sepolia-rpc.publicnode.com",
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

// ChangeNOW supported deposit assets
export const DEPOSIT_ASSETS = [
  { symbol: "BTC", name: "Bitcoin", network: "btc", ticker: "btc" },
  { symbol: "ETH", name: "Ethereum", network: "eth", ticker: "eth" },
  { symbol: "SOL", name: "Solana", network: "sol", ticker: "sol" },
  { symbol: "USDT", name: "Tether (TRC20)", network: "trx", ticker: "usdttrx" },
  { symbol: "USDC", name: "USDC (ERC20)", network: "eth", ticker: "usdc" },
  { symbol: "MATIC", name: "Polygon", network: "matic", ticker: "matic" },
  { symbol: "BNB", name: "BNB (BSC)", network: "bsc", ticker: "bnbbsc" }
] as const;

// The target asset on the Base network for our embedded wallet
export const TARGET_ASSET = {
  ticker: "usdc",
  network: "base",
};
