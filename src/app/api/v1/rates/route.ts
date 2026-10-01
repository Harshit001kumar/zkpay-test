import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

import { getPricesClient } from "@/lib/server/p2pRates";

const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP"];

/**
 * GET /api/v1/rates
 * 
 * Returns live exchange rates for supported fiat currencies directly from
 * the P2P Diamond contract on Base Mainnet.
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

    const pricesClient = getPricesClient();
    const rates: Record<string, any> = {};

    for (const currency of currencies) {
      const result = await pricesClient.getPriceConfig({ currency });

      if (result.isOk() && result.value?.sellPrice) {
        const sellPrice = Number(result.value.sellPrice) / 1e6;
        const buyPrice = result.value.buyPrice ? Number(result.value.buyPrice) / 1e6 : sellPrice;
        const spread = result.value.spread ? Number(result.value.spread) / 1e6 : 0;
        const lastUpdated = result.value.lastUpdated ? Number(result.value.lastUpdated) : Date.now();

        rates[`USDC_${currency}`] = {
          sell: sellPrice,
          buy: buyPrice,
          spread,
          lastUpdated,
          source: "onchain_diamond",
        };
      } else if (requestedCurrency) {
        return corsJson(
          { error: `Currency "${currency}" price is not currently available on the P2P contract.` },
          { status: 404 }
        );
      }
    }

    if (Object.keys(rates).length === 0) {
      return corsJson(
        { error: "No on-chain exchange rates could be retrieved from the P2P Diamond contract." },
        { status: 503 }
      );
    }

    return corsJson({
      success: true,
      rates,
      network: "Base Mainnet",
      chainId: 8453,
      contractAddress: DIAMOND_ADDRESS,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error("[Rates] Error:", err);
    return corsJson(
      { error: err.message || "Failed to fetch on-chain exchange rates" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
