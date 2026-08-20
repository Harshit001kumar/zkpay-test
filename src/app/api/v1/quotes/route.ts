import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100; // 1%

// ABI fragment for getPriceConfig
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

/**
 * POST /api/v1/quotes
 * 
 * Computes exact payout breakdown: USDC principal, 1% ZkPay fee, total USDC needed,
 * fiat payout amount, and rate used.
 *
 * Body:
 *   { "amount": 1000, "currency": "INR" }
 *   - amount: The fiat amount the user wants the recipient to receive.
 *   - currency: Supported fiat currency code (default: "INR").
 *
 * Response:
 *   {
 *     "fiatAmount": "₹ 1,000.00",
 *     "usdcPrincipal": "11.43",
 *     "feeUsdc": "0.11",
 *     "totalUsdc": "11.54",
 *     "rate": "87.50",
 *     "feeBps": 100,
 *     "currency": "INR",
 *     "expiresAt": 1755500000
 *   }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const currency = (body.currency || "INR").toUpperCase();

    if (!amount || amount <= 0) {
      return corsJson(
        { error: "Invalid amount. Must be a positive number." },
        { status: 400 }
      );
    }

    if (amount > 10000) {
      return corsJson(
        { error: "Amount exceeds maximum single transaction limit of 10,000 fiat units." },
        { status: 400 }
      );
    }

    // Fetch live rate from on-chain
    const client = getPublicClient();
    let priceConfig: any;
    try {
      priceConfig = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: PRICE_CONFIG_ABI,
        functionName: "getPriceConfig",
        args: [currency],
      });
    } catch (err: any) {
      return corsJson(
        { error: `Currency "${currency}" is not available on the P2P network.` },
        { status: 404 }
      );
    }

    const sellPrice = Number(priceConfig.sellPrice) / 1e6; // e.g. 87.50

    if (sellPrice <= 0) {
      return corsJson(
        { error: `No active sell price available for ${currency}.` },
        { status: 503 }
      );
    }

    // Calculate USDC amounts
    const usdcPrincipal = amount / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const totalUsdc = usdcPrincipal + feeUsdc;

    // Check against no-KYC limit (100 USDC for INR, 200 for others)
    const noKycLimit = currency === "INR" ? 100 : 200;
    const withinLimit = usdcPrincipal <= noKycLimit;

    // Currency symbol map
    const symbolMap: Record<string, string> = {
      INR: "₹",
      USD: "$",
      EUR: "€",
      GBP: "£",
    };
    const sym = symbolMap[currency] || "";

    // Quote valid for 5 minutes
    const expiresAt = Date.now() + 5 * 60 * 1000;

    return corsJson({
      success: true,
      fiatAmount: `${sym} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      fiatAmountRaw: amount,
      usdcPrincipal: usdcPrincipal.toFixed(2),
      feeUsdc: feeUsdc.toFixed(2),
      totalUsdc: totalUsdc.toFixed(2),
      rate: sellPrice.toFixed(2),
      feeBps: PLATFORM_FEE_BPS,
      currency,
      withinNoKycLimit: withinLimit,
      noKycLimitUsdc: noKycLimit,
      expiresAt,
    });
  } catch (err: any) {
    console.error("[Quotes] Error:", err);
    return corsJson(
      { error: err.message || "Failed to generate quote" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
