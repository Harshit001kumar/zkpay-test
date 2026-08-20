import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPayLink, getPayLink } from "@/lib/server/payStore";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100;

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
 * POST /api/v1/paylinks
 *
 * Creates a shareable payment link.
 *
 * Body:
 *   {
 *     "title": "Freelance Work - Invoice #42",
 *     "amountINR": 2500,
 *     "recipientUpi": "harshit@okaxis",
 *     "type": "one_time",         // "one_time" | "reusable" (default: "one_time")
 *     "webhookUrl": "https://...", // optional
 *     "redirectUrl": "https://..." // optional
 *   }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = body.title || "ZkPay Payment";
    const amountINR = Number(body.amountINR || body.amount);
    const recipientUpi = body.recipientUpi || body.upi;
    const type = body.type === "reusable" ? "reusable" : "one_time";
    const webhookUrl = body.webhookUrl;
    const redirectUrl = body.redirectUrl;

    // Validate inputs
    if (!amountINR || amountINR <= 0) {
      return corsJson({ error: "amountINR is required and must be positive." }, { status: 400 });
    }
    if (!recipientUpi || !recipientUpi.includes("@")) {
      return corsJson({ error: "recipientUpi is required and must be a valid UPI ID (e.g. name@okaxis)." }, { status: 400 });
    }

    // Fetch live rate to compute estimated USDC
    const client = getPublicClient();
    let sellPrice = 0;
    try {
      const priceConfig = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: PRICE_CONFIG_ABI,
        functionName: "getPriceConfig",
        args: ["INR"],
      });
      sellPrice = Number(priceConfig.sellPrice) / 1e6;
    } catch {
      sellPrice = 87.5; // fallback estimate
    }

    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const totalUsdc = usdcPrincipal + feeUsdc;

    // Create the pay link
    const link = createPayLink({
      title,
      amountINR,
      recipientUpi,
      type,
      webhookUrl,
      redirectUrl,
      estimatedUsdc: totalUsdc.toFixed(2),
      rate: sellPrice,
    });

    // Build the hosted URL
    const host = req.headers.get("host") || "zkpay.top";
    const protocol = host.includes("localhost") ? "http" : "https";
    const payUrl = `${protocol}://${host}/pay/${link.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

    return corsJson({
      success: true,
      linkId: link.id,
      payUrl,
      title: link.title,
      amountINR: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      estimatedUsdc: `${totalUsdc.toFixed(2)} USDC`,
      recipientUpi: link.recipientUpi,
      type: link.type,
      status: link.status,
      rate: sellPrice.toFixed(2),
      qrCodeUrl,
      createdAt: link.createdAt,
    });
  } catch (err: any) {
    console.error("[PayLinks] Error:", err);
    return corsJson({ error: err.message || "Failed to create pay link" }, { status: 500 });
  }
}

/**
 * GET /api/v1/paylinks?id=pl_abc123
 *
 * Retrieve a pay link's current status.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return corsJson({ error: "Missing ?id= query parameter." }, { status: 400 });
    }

    const link = getPayLink(id);
    if (!link) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    const host = req.headers.get("host") || "zkpay.top";
    const protocol = host.includes("localhost") ? "http" : "https";

    return corsJson({
      success: true,
      linkId: link.id,
      payUrl: `${protocol}://${host}/pay/${link.id}`,
      title: link.title,
      amountINR: `₹ ${link.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      estimatedUsdc: link.estimatedUsdc,
      recipientUpi: link.recipientUpi,
      type: link.type,
      status: link.status,
      rate: link.rate,
      createdAt: link.createdAt,
      paidAt: link.paidAt,
      txHash: link.txHash,
      p2pOrderId: link.p2pOrderId,
      redirectUrl: link.redirectUrl,
    });
  } catch (err: any) {
    console.error("[PayLinks] GET Error:", err);
    return corsJson({ error: err.message || "Failed to fetch pay link" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
