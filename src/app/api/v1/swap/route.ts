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
    supportedChains: ["btc", "eth", "base", "sol", "arb", "bsc", "tron", "ltc", "polygon"],
    endpoints: {
      tokens: {
        method: "GET",
        path: "/api/v1/swap/tokens",
        description: "List supported cross-chain tokens. Supports ?chain=base|sol|eth|btc|tron|arb|bsc|ltc|polygon.",
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
    feeSettlement: {
      mechanism: "TREASURY_SWEEP_WITH_USD_PARTNER_CREDIT",
      note: "100% of fees are swept to ZkPay Treasury on-chain. Upon swap settlement, 50% of the fee is converted to USD at the live CoinGecko rate and credited to the Partner Portal balance.",
      partnerGuidance: "Authenticate with your x-api-key header. Settled fees accrue in USD and can be withdrawn ($1.00 minimum) in LTC, SOL, USDT (Polygon), or USDC (Base) from the Partner Portal.",
      defaultFeeBps: 200,
      feeSplitModel: "50/50 between ZkPay Treasury and Partner",
    },
    documentation: "https://zkpay.top/docs",
    unitsNotice: "All 'amount' parameters must be provided in atomic integer units (e.g. 1000000000 for 1 SOL, 1000000 for 1 USDC).",
  });
}

export async function OPTIONS() {
  return corsOptions();
}
