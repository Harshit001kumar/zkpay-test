import { corsJson, corsOptions } from "@/lib/server/cors";
import { createPayLink, findPayLinkByTxHash, getPayLink, updatePayLink } from "@/lib/server/payStore";
import { dispatchWebhook, isSafeWebhookUrl } from "@/lib/server/webhooks";
import { requirePublicApiKey } from "@/lib/server/publicApiAuth";
import { createPrices } from "@p2pdotme/sdk/prices";
import { createPublicClient, decodeEventLog, http, isHex, parseAbiItem, parseUnits } from "viem";
import { base } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";

export const dynamic = "force-dynamic";

const DIAMOND_ADDRESS = (process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x4cad6eC90e65baBec9335cAd728DDC610c316368") as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org";
const PLATFORM_FEE_BPS = 100;
const PUBLIC_APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://zkpay.top";
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

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

function getPublicBaseUrl(): string {
  try {
    const url = new URL(PUBLIC_APP_BASE_URL);
    if (url.protocol !== "https:" && !url.hostname.includes("localhost")) {
      throw new Error("APP_BASE_URL must use https in production.");
    }
    return url.origin;
  } catch {
    return "https://zkpay.top";
  }
}

function isSafeRedirectUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:" && host === "localhost") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/paylinks
 *
 * Creates a shareable payment link.
 */
export async function POST(req: Request) {
  try {
    const auth = await requirePublicApiKey(req);
    if (!auth.ok) {
      return corsJson({ error: auth.error }, { status: auth.status || 401 });
    }

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

    if (redirectUrl && !isSafeRedirectUrl(redirectUrl)) {
      return corsJson(
        { error: "redirectUrl must be https (or http://localhost in development)." },
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
      creatorUserId: auth.apiKeyRecord?.userId,
      creatorWalletAddress: auth.apiKeyRecord?.walletAddress,
      apiKeyId: auth.apiKeyRecord?.id,
    });

    const payUrl = `${getPublicBaseUrl()}/pay/${link.id}`;
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

    const payUrl = `${getPublicBaseUrl()}/pay/${link.id}`;
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
    const auth = await requirePublicApiKey(req);
    const body = await req.json();
    const { id, status, txHash, p2pOrderId } = body;

    // Must have a valid API key OR provide an on-chain txHash for verified payment confirmation
    if (!auth.ok && !txHash) {
      return corsJson(
        { error: "Authentication required or provide a valid on-chain txHash for payment confirmation." },
        { status: 401 }
      );
    }

    if (!id) {
      return corsJson({ error: "Missing 'id' parameter in request body." }, { status: 400 });
    }

    const existing = getPayLink(id);
    if (!existing) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    if (status && status !== "PAID") {
      return corsJson({ error: "Only PAID status transition is allowed on this endpoint." }, { status: 400 });
    }

    if (existing.status === "PAID") {
      if (!txHash || existing.txHash?.toLowerCase() === String(txHash).toLowerCase()) {
        return corsJson({ success: true, link: existing });
      }
      return corsJson({ error: "Pay link is already marked PAID with a different transaction." }, { status: 409 });
    }

    if (!txHash) {
      return corsJson({ error: "txHash is required for PAID confirmation." }, { status: 400 });
    }

    if (!isHex(txHash) || txHash.length !== 66) {
      return corsJson({ error: "Invalid transaction hash format." }, { status: 400 });
    }

    const reused = findPayLinkByTxHash(txHash);
    if (reused && reused.id !== id) {
      return corsJson({ error: "This transaction hash has already been used for another pay link." }, { status: 409 });
    }

    let receipt: any;
    try {
      const client = getPublicClient();
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    } catch (verifyErr: any) {
      console.warn(`[PayLinks] On-chain receipt check failed for ${txHash}:`, verifyErr?.message);
      return corsJson({ error: "Could not verify transaction on-chain. Please retry shortly." }, { status: 503 });
    }

    if (!receipt || receipt.status !== "success") {
      return corsJson(
        { error: "Transaction receipt verification failed or transaction reverted on Base." },
        { status: 400 }
      );
    }

    const totalUsdc = Number(String(existing.estimatedUsdc || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(totalUsdc) || totalUsdc <= 0) {
      return corsJson({ error: "Pay link has invalid expected amount metadata." }, { status: 400 });
    }

    const expectedFeeUnits = parseUnits(totalUsdc.toFixed(6), 6) / 100n;
    const treasuryLower = CONTRACTS.TREASURY.toLowerCase();
    const usdcLower = CONTRACTS.USDC.toLowerCase();

    const hasExpectedFeeTransfer = receipt.logs.some((log: any) => {
      if (!log?.address || String(log.address).toLowerCase() !== usdcLower) {
        return false;
      }
      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "Transfer") return false;
        const to = String((decoded.args as any).to || "").toLowerCase();
        const value = (decoded.args as any).value as bigint;
        return to === treasuryLower && value === expectedFeeUnits;
      } catch {
        return false;
      }
    });

    if (!hasExpectedFeeTransfer) {
      return corsJson(
        { error: "Transaction does not include the expected USDC fee transfer for this pay link." },
        { status: 400 }
      );
    }

    const updates: any = {
      txHash,
      paidAt: Date.now(),
      status: "PAID",
    };

    if (p2pOrderId) {
      updates.p2pOrderId = String(p2pOrderId);
    }

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
