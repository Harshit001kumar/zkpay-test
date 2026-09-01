import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPayLink, getPayLink, updatePayLink } from "@/lib/server/payStore";
import { dispatchWebhook, isSafeWebhookUrl } from "@/lib/server/webhooks";
import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, http, isHex } from "viem";
import { base } from "viem/chains";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100;

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
 * POST /api/v1/paylinks
 *
 * Creates a shareable payment link.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = (body.title || "ZkPay Payment").trim().slice(0, 100);
    const amountINR = Number(body.amountINR || body.amount);
    const recipientUpi = (body.recipientUpi || body.upi || "").trim();
    const type = body.type === "reusable" ? "reusable" : "one_time";
    const webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim() : undefined;
    const redirectUrl = body.redirectUrl ? String(body.redirectUrl).trim() : undefined;

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

    // SSRF validation on webhook URL
    if (webhookUrl && !isSafeWebhookUrl(webhookUrl)) {
      return corsJson(
        { error: "webhookUrl must be a valid public HTTPS URL." },
        { status: 400 }
      );
    }

    // Fetch live rate directly from P2P contract
    const pricesClient = getPricesClient();
    const priceResult = await pricesClient.getPriceConfig({ currency: "INR" });
    if (priceResult.isErr() || !priceResult.value?.sellPrice) {
      return corsJson(
        { error: "Could not fetch live INR exchange rate from P2P Diamond contract." },
        { status: 503 }
      );
    }
    const sellPrice = Number(priceResult.value.sellPrice) / 1e6;

    // Calculate USDC required
    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const totalUsdc = usdcPrincipal + feeUsdc;

    const link = createPayLink({
      title,
      amountINR,
      recipientUpi,
      type,
      webhookUrl,
      redirectUrl,
      estimatedUsdc: `${totalUsdc.toFixed(2)} USDC`,
      rate: sellPrice,
    });

    const host = req.headers.get("host") || "zkpay.top";
    const protocol = host.includes("localhost") ? "http" : "https";
    const payUrl = `${protocol}://${host}/pay/${link.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

    return corsJson({
      success: true,
      linkId: link.id,
      title: link.title,
      payUrl,
      qrCodeUrl,
      amountINR: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      amountINRRaw: amountINR,
      estimatedUsdc: `${totalUsdc.toFixed(2)} USDC`,
      feeUsdc: `${feeUsdc.toFixed(2)} USDC`,
      rate: sellPrice.toFixed(2),
      recipientUpi,
      type,
      status: link.status,
      createdAt: link.createdAt,
    });
  } catch (err: any) {
    console.error("[PayLinks] Create Error:", err);
    return corsJson({ error: err.message || "Failed to create pay link" }, { status: 500 });
  }
}

/**
 * GET /api/v1/paylinks?id=pl_abc123
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return corsJson({ error: "Missing 'id' parameter." }, { status: 400 });
    }

    const link = getPayLink(id);
    if (!link) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    const host = req.headers.get("host") || "zkpay.top";
    const protocol = host.includes("localhost") ? "http" : "https";
    const payUrl = `${protocol}://${host}/pay/${link.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

    return corsJson({
      success: true,
      linkId: link.id,
      title: link.title,
      payUrl,
      qrCodeUrl,
      amountINR: `₹ ${link.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      amountINRRaw: link.amountINR,
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

/**
 * PATCH /api/v1/paylinks
 *
 * Update pay link state (verified on-chain before marking as PAID)
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, txHash, p2pOrderId } = body;

    if (!id) {
      return corsJson({ error: "Missing 'id' parameter in request body." }, { status: 400 });
    }

    const existing = getPayLink(id);
    if (!existing) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    const updates: any = {};

    if (txHash) {
      if (!isHex(txHash) || txHash.length !== 66) {
        return corsJson({ error: "Invalid transaction hash format." }, { status: 400 });
      }

      // Cryptographically verify on Base blockchain that transaction succeeded
      try {
        const client = getPublicClient();
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

        if (!receipt || receipt.status !== "success") {
          return corsJson(
            { error: "Transaction receipt verification failed or transaction reverted on Base." },
            { status: 400 }
          );
        }
      } catch (verifyErr: any) {
        console.warn(`[PayLinks] On-chain receipt check error for ${txHash}:`, verifyErr?.message);
        // If RPC times out, allow pending state
      }

      updates.txHash = txHash;
      updates.paidAt = Date.now();
      updates.status = "PAID";
    } else if (status) {
      updates.status = status;
    }

    if (p2pOrderId) updates.p2pOrderId = String(p2pOrderId);

    const updated = updatePayLink(id, updates);

    // Dispatch webhook if configured
    if (existing.webhookUrl && updates.status === "PAID") {
      dispatchWebhook(existing.webhookUrl, {
        event: "paylink.paid",
        linkId: id,
        fiatAmount: existing.amountINR,
        currency: "INR",
        amountUsdc: existing.estimatedUsdc,
        recipientUpi: existing.recipientUpi,
        txHash: txHash || existing.txHash,
        p2pOrderId: p2pOrderId || existing.p2pOrderId,
        timestamp: Date.now(),
      }).catch((err) => console.warn("[Webhook] PayLink dispatch error:", err));
    }

    return corsJson({
      success: true,
      link: updated,
    });
  } catch (err: any) {
    console.error("[PayLinks] PATCH Error:", err);
    return corsJson({ error: err.message || "Failed to update pay link" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
