import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100; // 1%

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

let _pricesClient: any = null;
function getPricesClient() {
  if (!_pricesClient) {
    _pricesClient = createPrices({
      publicClient: getPublicClient(),
      diamondAddress: DIAMOND_ADDRESS,
    });
  }
  return _pricesClient;
}

/**
 * POST /api/v1/quotes
 * 
 * Computes exact payout breakdown: USDC principal, 1% ZkPay fee, total USDC needed,
 * fiat payout amount, and on-chain rate directly from the P2P Diamond contract.
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

    // Fetch live rate directly from P2P contract
    const pricesClient = getPricesClient();
    const priceResult = await pricesClient.getPriceConfig({ currency });

    if (priceResult.isErr() || !priceResult.value?.sellPrice) {
      return corsJson(
        { error: `Currency "${currency}" is not available on the P2P Diamond contract.` },
        { status: 404 }
      );
    }

    const sellPrice = Number(priceResult.value.sellPrice) / 1e6;

    if (sellPrice <= 0) {
      return corsJson(
        { error: `Invalid price configuration on-chain for ${currency}.` },
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
      { error: err.message || "Failed to generate on-chain quote" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return corsOptions();
}
