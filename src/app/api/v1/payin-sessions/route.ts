import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  createPayInSession,
  getPayInSession,
  updatePayInSession,
} from "@/lib/server/payStore";
import { dispatchWebhook } from "@/lib/server/webhooks";
import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, http, parseAbi } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS ||
  "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;
const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  "0x4747883abdf84ad96565415514de298e3a3fd3e1") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100; // 1%

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

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
 * POST /api/v1/payin-sessions
 *
 * Creates a 30-minute dynamic deposit session on Base Mainnet.
 * Designed specifically for Telegram bots, Discord bots, and automated backends.
 *
 * Body:
 *   {
 *     "recipientUpi": "merchant@okaxis",
 *     "amountINR": 500,
 *     "webhookUrl": "https://my-bot.com/webhook" // optional
 *   }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const recipientUpi = (body.recipientUpi || body.upi || "").trim();
    const amountINR = Number(body.amountINR || body.amount);
    const webhookUrl = body.webhookUrl;

    if (!recipientUpi || !recipientUpi.includes("@")) {
      return corsJson(
        { error: "recipientUpi is required and must be a valid UPI ID (e.g. name@okaxis)." },
        { status: 400 }
      );
    }

    if (!amountINR || amountINR <= 0) {
      return corsJson(
        { error: "amountINR is required and must be a positive number." },
        { status: 400 }
      );
    }

    if (amountINR > 8500) {
      return corsJson(
        { error: "amountINR exceeds maximum single transaction limit of ₹8,500 (100 USDC no-KYC tier)." },
        { status: 400 }
      );
    }

    // 1. Fetch live rate directly from P2P contract
    const pricesClient = getPricesClient();
    const priceResult = await pricesClient.getPriceConfig({ currency: "INR" });
    if (priceResult.isErr() || !priceResult.value?.sellPrice) {
      return corsJson(
        { error: "Could not fetch live INR exchange rate from P2P Diamond contract." },
        { status: 503 }
      );
    }
    const sellPrice = Number(priceResult.value.sellPrice) / 1e6;

    // 2. Calculate USDC required (principal + 1% fee)
    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const totalUsdc = usdcPrincipal + feeUsdc;

    // 3. Generate a dedicated ephemeral deposit keypair on Base
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const payinAddress = account.address;

    // 4. Set 30-minute validity window
    const now = Date.now();
    const validityMs = 30 * 60 * 1000; // 30 minutes
    const expiresAt = now + validityMs;

    // 5. Store session
    const session = createPayInSession({
      recipientUpi,
      amountINR,
      expectedUsdc: totalUsdc.toFixed(2),
      feeUsdc: feeUsdc.toFixed(2),
      rate: sellPrice,
      payinAddress,
      payinPrivateKey: privateKey,
      webhookUrl,
      expiresAt,
    });

    // 6. Build Direct USDC Transfer QR code on Base (EIP-681)
    // 6 decimals: e.g. 5.76 USDC = 5760000 units
    const usdcUnits = Math.round(totalUsdc * 1_000_000);
    const eip681Uri = `ethereum:${USDC_ADDRESS}@8453/transfer?address=${payinAddress}&uint256=${usdcUnits}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      eip681Uri
    )}`;

    return corsJson({
      success: true,
      sessionId: session.id,
      status: session.status,
      network: "Base Mainnet (Chain ID: 8453)",
      asset: "USDC",
      contractAddress: USDC_ADDRESS,
      payinAddress,
      expectedAmountUsdc: totalUsdc.toFixed(2),
      fiatAmount: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      fiatAmountRaw: amountINR,
      recipientUpi,
      rate: sellPrice.toFixed(2),
      feeUsdc: feeUsdc.toFixed(2),
      expiresAt,
      expiresInSeconds: 1800,
      qrCodeUrl,
      instructions: `Send exactly ${totalUsdc.toFixed(2)} USDC on Base Mainnet to ${payinAddress} within 30 minutes. Once sent, ₹${amountINR} will be automatically delivered to ${recipientUpi}.`,
      createdAt: session.createdAt,
    });
  } catch (err: any) {
    console.error("[PayInSession] Create Error:", err);
    return corsJson({ error: err.message || "Failed to create deposit session" }, { status: 500 });
  }
}

/**
 * GET /api/v1/payin-sessions?id=ses_abc123
 *
 * Checks live status of a deposit session.
 * Actively checks the on-chain USDC balance of the deposit address.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return corsJson({ error: "Missing ?id= query parameter." }, { status: 400 });
    }

    const session = getPayInSession(id);
    if (!session) {
      return corsJson({ error: "Pay-in session not found." }, { status: 404 });
    }

    const now = Date.now();

    // Check expiration
    if (session.status === "AWAITING_PAYMENT" && session.expiresAt <= now) {
      updatePayInSession(session.id, { status: "EXPIRED" });
      return corsJson({
        success: true,
        sessionId: session.id,
        status: "EXPIRED",
        error: "Session expired after 30 minutes. Please create a new session.",
      });
    }

    // If still awaiting, actively poll on-chain balance on Base
    if (session.status === "AWAITING_PAYMENT") {
      const client = getPublicClient();
      try {
        const balanceWei = await client.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [session.payinAddress as `0x${string}`],
        });

        const balanceUsdc = Number(balanceWei) / 1e6;
        const expectedUsdc = parseFloat(session.expectedUsdc);

        // If funds have arrived (at least 98% of expected amount to tolerate tiny rounding)
        if (balanceUsdc >= expectedUsdc * 0.98) {
          // Update status to DETECTED / SETTLING
          const updated = updatePayInSession(session.id, {
            status: "SETTLED",
            receivedUsdc: balanceUsdc.toFixed(2),
          });

          // Dispatch Webhook if registered
          if (session.webhookUrl) {
            dispatchWebhook(session.webhookUrl, {
              event: "payin.settled",
              sessionId: session.id,
              recipientUpi: session.recipientUpi,
              fiatAmount: session.amountINR,
              currency: "INR",
              amountUsdc: balanceUsdc.toFixed(2),
              timestamp: Date.now(),
            }).catch((err) => console.warn("[Webhook] Auto dispatch err:", err));
          }

          return corsJson({
            success: true,
            sessionId: session.id,
            status: "SETTLED",
            recipientUpi: session.recipientUpi,
            fiatAmount: `₹ ${session.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            receivedUsdc: `${balanceUsdc.toFixed(2)} USDC`,
            payinAddress: session.payinAddress,
            network: "Base Mainnet",
            createdAt: session.createdAt,
            message: `Payment of ${balanceUsdc.toFixed(2)} USDC received! Order completed for ${session.recipientUpi}.`,
          });
        }
      } catch (err: any) {
        console.warn(`[PayInSession] Balance check failed for ${session.payinAddress}:`, err.message);
      }
    }

    return corsJson({
      success: true,
      sessionId: session.id,
      status: session.status,
      recipientUpi: session.recipientUpi,
      fiatAmount: `₹ ${session.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      expectedAmountUsdc: `${session.expectedUsdc} USDC`,
      receivedUsdc: session.receivedUsdc,
      payinAddress: session.payinAddress,
      network: "Base Mainnet",
      rate: session.rate,
      expiresAt: session.expiresAt,
      expiresInSeconds: Math.max(0, Math.floor((session.expiresAt - now) / 1000)),
      createdAt: session.createdAt,
    });
  } catch (err: any) {
    console.error("[PayInSession] Status Error:", err);
    return corsJson({ error: err.message || "Failed to check session status" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
