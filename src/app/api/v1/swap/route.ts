import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/swap
 * 
 * Discovery endpoint for ZkPay Cross-Chain Swap API.
 */
export async function GET() {
  return corsJson({
    success: true,
    name: "ZkPay Cross-Chain Swap API",
    version: "v1",
    engine: "ZkPay Solver Network",
    endpoints: {
      tokens: {
        method: "GET",
        path: "/api/v1/swap/tokens",
        description: "List supported cross-chain tokens across 8 blockchains. Supports ?chain=base|sol|eth|btc|tron|arb|bsc.",
      },
      quote: {
        method: "GET | POST",
        path: "/api/v1/swap/quote",
        description: "Generate a dry-run swap quote with transparent partner fee breakdown. Supports crypto-to-crypto across any supported pair. Pass amount in atomic units.",
      },
      create: {
        method: "POST",
        path: "/api/v1/swap/create",
        description: "Commit a swap order and obtain a single-use cross-chain deposit address. Supports crypto-to-crypto, partner revenue share, and origin-chain refund protection.",
      },
      status: {
        method: "GET",
        path: "/api/v1/swap/status?depositAddress=...",
        description: "Poll real-time swap execution and settlement status by deposit address.",
      },
    },
    documentation: "https://zkpay.top/docs",
    unitsNotice: "All 'amount' parameters must be provided in atomic integer units (e.g. 1000000000 for 1 SOL, 1000000 for 1 USDC).",
  });
}

export async function OPTIONS() {
  return corsOptions();
}
