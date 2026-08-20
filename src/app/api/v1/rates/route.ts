import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || "https://api.goldsky.com/api/public/project_cmq7kbyqt81p501xi7h0wdeuh/subgraphs/p2pme-subgraph/prod/gn";

// ABI fragment for getPriceConfig on the Diamond contract
const PRICE_CONFIG_ABI = [
  {
    name: "getPriceConfig",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "currency", type: "string" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "buyPrice", type: "uint256" },
          { name: "sellPrice", type: "uint256" },
          { name: "spread", type: "uint256" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
  },
] as const;

let _publicClient: any = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });
  }
  return _publicClient;
}

// Supported currency list
const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

/**
 * GET /api/v1/rates
 * 
 * Returns live exchange rates for all supported fiat currencies.
 * Rates are queried from the P2P Diamond contract on Base Mainnet.
 *
 * Query params:
 *   ?currency=INR  (optional, returns only that currency)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedCurrency = searchParams.get("currency")?.toUpperCase();

    const currencies = requestedCurrency
      ? [requestedCurrency]
      : SUPPORTED_CURRENCIES;

    const client = getPublicClient();
    const rates: Record<string, any> = {};

    // Query price configs from the P2P Diamond contract
    for (const currency of currencies) {
      try {
        const priceConfig = await client.readContract({
          address: DIAMOND_ADDRESS,
          abi: PRICE_CONFIG_ABI,
          functionName: "getPriceConfig",
          args: [currency],
        });

        const sellPrice = Number(priceConfig.sellPrice) / 1e6;
        const buyPrice = Number(priceConfig.buyPrice) / 1e6;

        rates[`USDC_${currency}`] = {
          sell: sellPrice,     // What 1 USDC sells for in fiat
          buy: buyPrice,       // What 1 USDC costs in fiat to buy
          spread: Number(priceConfig.spread) / 1e6,
          lastUpdated: Number(priceConfig.lastUpdated),
        };
      } catch (err: any) {
        console.warn(`[Rates] Could not fetch price for ${currency}:`, err.message);
        // If single currency was requested and failed, return error
        if (requestedCurrency) {
          return corsJson(
            { error: `Currency "${currency}" is not currently available on the P2P network.` },
            { status: 404 }
          );
        }
      }
    }

    return corsJson({
      success: true,
      rates,
      network: "Base Mainnet",
      chainId: 8453,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("[Rates] Error:", err);
    return corsJson(
      { error: err.message || "Failed to fetch exchange rates" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
