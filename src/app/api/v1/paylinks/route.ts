import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  createPayLink,
  findPayLinkByTxHash,
  getPayLink,
  updatePayLink,
  listPayLinks,
  sanitizePayLink,
  encryptKey,
  PayLinkMode,
} from "@/lib/server/payStore";
import { dispatchWebhook, isSafeWebhookUrlAsync } from "@/lib/server/webhooks";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import {
  decodeEventLog,
  isHex,
  parseAbi,
  parseAbiItem,
  parseUnits,
  formatUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CONTRACTS } from "@/lib/constants";
import { getResilientPublicClientForChain } from "@/lib/server/rpcConfig";
import { getLiveFiatRate } from "@/lib/server/p2pRates";

export const dynamic = "force-dynamic";

const PLATFORM_FEE_BPS = 100;
const PUBLIC_APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://zkpay.top";
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ERC20_BAL_ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

function getPublicClient() {
  return getResilientPublicClientForChain("base");
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
 * Creates a payment link:
 * - mode: "request" (Default): Creator requests payment to their own UPI.
 * - mode: "disburse": Creator pre-funds escrow with USDC and protects with 4-digit PIN.
 */
export async function POST(req: Request) {
  try {
    const auth = await resolvePublicApiAuth(req);
    if (!auth.ok) {
      return corsJson(
        { error: auth.error || "Authentication required (API key or Privy session token) to create pay links." },
        { status: auth.status || 401 }
      );
    }

    const validatedKeyId = auth.ok
      ? (auth.apiKeyRecord?.id || (auth.isEnvKey ? "admin_env" : auth.userId || "auth_user"))
      : undefined;

    const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create", validatedKeyId);
    if (rateLimitResp) return rateLimitResp;

    const body = await req.json();
    const mode: PayLinkMode = body.mode === "disburse" ? "disburse" : "request";
    const title = (body.title || (mode === "disburse" ? "ZkPay Payout" : "ZkPay Payment")).trim().slice(0, 100);
    const amountINR = Number(body.amountINR || body.amount);
    const recipientUpi = (body.recipientUpi || body.upi || "").trim();
    const type = body.type === "reusable" ? "reusable" : "one_time";
    const webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim() : undefined;
    const redirectUrl = body.redirectUrl ? String(body.redirectUrl).trim() : undefined;
    const pin = body.pin ? String(body.pin).trim() : undefined;
    const creatorRefundAddress = (body.creatorRefundAddress || auth.walletAddress || "").trim();

    if (!amountINR || amountINR <= 0) {
      return corsJson(
        { error: "amountINR is required and must be a positive number." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (amountINR > 8500) {
      return corsJson(
        { error: "amountINR exceeds maximum single transaction limit of ₹8,500 (100 USDC no-KYC tier)." },
        { status: 400, headers: rateLimit.headers }
      );
    }

    if (mode === "request") {
      if (!recipientUpi || !recipientUpi.includes("@")) {
        return corsJson(
          { error: "recipientUpi is required for request mode and must be a valid UPI ID (e.g. name@okaxis)." },
          { status: 400, headers: rateLimit.headers }
        );
      }
    } else {
      // Disburse mode validation
      if (!pin || !/^\d{4}$/.test(pin)) {
        return corsJson(
          { error: "PIN is required for claimable disbursement links and must be exactly 4 digits (e.g. 1234)." },
          { status: 400, headers: rateLimit.headers }
        );
      }
    }

    // SSRF validation on webhook URL with DNS rebinding protection
    if (webhookUrl) {
      const safe = await isSafeWebhookUrlAsync(webhookUrl);
      if (!safe) {
        return corsJson(
          { error: "webhookUrl must be a valid, publicly resolvable HTTPS URL (SSRF protected)." },
          { status: 400, headers: rateLimit.headers }
        );
      }
    }

    if (redirectUrl && !isSafeRedirectUrl(redirectUrl)) {
      return corsJson(
        { error: "redirectUrl must be https (or http://localhost in development)." },
        { status: 400 }
      );
    }

    // Fetch live rate directly with multi-RPC failover and TTL caching
    const sellPrice = await getLiveFiatRate("INR");
    if (!sellPrice || sellPrice <= 0) {
      return corsJson(
        { error: "Could not fetch live INR exchange rate from P2P Diamond contract." },
        { status: 503 }
      );
    }

    // Calculate USDC required (principal + 1% fee + protocol small order fee if <= 10 USDC)
    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const isSmallOrder = usdcPrincipal > 0 && usdcPrincipal <= 10;
    const protocolFeeUsdc = isSmallOrder ? 0.10 : 0;
    const totalUsdc = usdcPrincipal + feeUsdc + protocolFeeUsdc;

    const creatorUserId = auth.userId || auth.apiKeyRecord?.userId;
    const creatorWalletAddress = auth.walletAddress || auth.apiKeyRecord?.walletAddress;
    const apiKeyId = auth.apiKeyRecord?.id;

    // In disburse mode: generate dedicated escrow address & encrypted key
    let escrowAddress: string | undefined;
    let encryptedEscrowKey: string | undefined;

    if (mode === "disburse") {
      const privKey = generatePrivateKey();
      const account = privateKeyToAccount(privKey);
      escrowAddress = account.address;
      encryptedEscrowKey = encryptKey(privKey);
    }

    const link = createPayLink({
      mode,
      title,
      amountINR,
      recipientUpi: mode === "request" ? recipientUpi : undefined,
      type: mode === "disburse" ? "one_time" : type, // Disburse links are single-claim
      webhookUrl,
      redirectUrl,
      estimatedUsdc: `${totalUsdc.toFixed(2)} USDC`,
      rate: sellPrice,
      creatorUserId,
      creatorWalletAddress,
      apiKeyId,
      pin,
      escrowAddress,
      encryptedEscrowKey,
      creatorRefundAddress: creatorRefundAddress || undefined,
    });

    const payUrl = `${getPublicBaseUrl()}/pay/${link.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;

    return corsJson(
      {
        success: true,
        linkId: link.id,
        mode: link.mode,
        title: link.title,
        payUrl,
        qrCodeUrl,
        amountINR: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        amountINRRaw: amountINR,
        estimatedUsdc: `${totalUsdc.toFixed(2)} USDC`,
        usdcPrincipal: usdcPrincipal.toFixed(2),
        feeUsdc: `${feeUsdc.toFixed(2)} USDC`,
        protocolFeeUsdc: `${protocolFeeUsdc.toFixed(2)} USDC`,
        isSmallOrder,
        gasSponsorship: "Sponsored by ZkPay (Pimlico Paymaster)",
        rate: sellPrice.toFixed(2),
        recipientUpi: link.recipientUpi,
        type: link.type,
        status: link.status,
        createdAt: link.createdAt,
        escrowAddress: link.escrowAddress,
        creatorSecret: link.creatorSecret, // Keep safe for refunds/unlocks
      },
      { headers: rateLimit.headers }
    );
  } catch (err: any) {
    console.error("[PayLinks] Create Error:", err);
    return corsJson({ error: err.message || "Failed to create pay link" }, { status: 500 });
  }
}

/**
 * GET /api/v1/paylinks
 * - If ?id=pl_xxx: Fetches a single link with public sanitized metadata
 * - If no ?id: Authenticated list of creator's links
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    // Case 1: Fetch single paylink by ID
    if (id) {
      const link = getPayLink(id);
      if (!link) {
        return corsJson({ error: "Pay link not found." }, { status: 404 });
      }

      // If disburse mode in AWAITING_FUNDING status, check on-chain if funds arrived
      if (link.mode === "disburse" && link.status === "AWAITING_FUNDING" && link.escrowAddress) {
        try {
          const client = getPublicClient();
          const targetUnits = parseUnits(Number(link.estimatedUsdc.replace(/[^0-9.]/g, "")).toFixed(6), 6);
          const bal = (await client.readContract({
            address: CONTRACTS.USDC as `0x${string}`,
            abi: ERC20_BAL_ABI,
            functionName: "balanceOf",
            args: [link.escrowAddress as `0x${string}`],
          })) as bigint;

          if (bal >= (targetUnits * 98n) / 100n) {
            updatePayLink(link.id, { status: "ACTIVE" });
            link.status = "ACTIVE";
          }
        } catch (balErr) {
          console.warn("[PayLinks] Escrow balance check warning:", balErr);
        }
      }

      const payUrl = `${getPublicBaseUrl()}/pay/${link.id}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;
      const sanitized = sanitizePayLink(link);

      return corsJson({
        success: true,
        ...sanitized,
        payUrl,
        qrCodeUrl,
        amountINR: `₹ ${link.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        amountINRRaw: link.amountINR,
      });
    }

    // Case 2: List merchant links (authenticated)
    const auth = await resolvePublicApiAuth(req);
    if (!auth.ok) {
      return corsJson({ error: "Authentication required to list pay links." }, { status: 401 });
    }

    const links = listPayLinks({
      creatorUserId: auth.userId,
      creatorWalletAddress: auth.walletAddress,
      apiKeyId: auth.apiKeyRecord?.id,
    });

    const sanitizedList = links.map((l) => {
      const payUrl = `${getPublicBaseUrl()}/pay/${l.id}`;
      return {
        ...sanitizePayLink(l),
        payUrl,
      };
    });

    return corsJson({
      success: true,
      links: sanitizedList,
      total: sanitizedList.length,
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
    const auth = await resolvePublicApiAuth(req);
    const body = await req.json();
    const { id, status, txHash, p2pOrderId } = body;

    // Must have a valid API key/session OR provide an on-chain txHash for verified payment confirmation
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

    // If one-time link is already PAID with same tx, return success
    if (existing.type === "one_time" && existing.status === "PAID") {
      if (!txHash || existing.txHash?.toLowerCase() === String(txHash).toLowerCase()) {
        return corsJson({ success: true, link: sanitizePayLink(existing) });
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
    if (reused && (reused.id !== id || existing.type === "reusable")) {
      return corsJson({ error: "This transaction hash has already been used for a pay link." }, { status: 409 });
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

    const expectedTotalUnits = parseUnits(totalUsdc.toFixed(6), 6);
    const expectedFeeUnits = expectedTotalUnits / 100n;
    const expectedPrincipalUnits = expectedTotalUnits - expectedFeeUnits;
    const treasuryLower = CONTRACTS.TREASURY.toLowerCase();
    const diamondLower = CONTRACTS.DIAMOND.toLowerCase();
    const escrowLower = existing.escrowAddress?.toLowerCase();
    const usdcLower = CONTRACTS.USDC.toLowerCase();

    let hasExpectedFeeTransfer = false;
    let hasExpectedPrincipalTransfer = false;

    for (const log of receipt.logs) {
      if (!log?.address || String(log.address).toLowerCase() !== usdcLower) {
        continue;
      }
      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "Transfer") continue;
        const to = String((decoded.args as any).to || "").toLowerCase();
        const value = (decoded.args as any).value as bigint;
        if (to === treasuryLower && value >= (expectedFeeUnits * 95n) / 100n) {
          hasExpectedFeeTransfer = true;
        }
        if (
          (to === diamondLower || (escrowLower && to === escrowLower)) &&
          value >= (expectedPrincipalUnits * 95n) / 100n
        ) {
          hasExpectedPrincipalTransfer = true;
        }
      } catch {
        continue;
      }
    }

    if (!hasExpectedFeeTransfer || !hasExpectedPrincipalTransfer) {
      return corsJson(
        {
          error:
            "Transaction does not include both the expected USDC principal escrow and fee transfer for this pay link.",
        },
        { status: 400 }
      );
    }

    // Reusable vs One-Time Updates
    const isReusable = existing.type === "reusable";
    const normalizedTxHash = String(txHash).toLowerCase().trim();
    const existingPaidHashes = Array.isArray(existing.paidTxHashes) ? existing.paidTxHashes : [];
    const updates: Partial<typeof existing> = {
      paidAt: Date.now(),
      txHash,
      paidTxHashes: existingPaidHashes.includes(normalizedTxHash)
        ? existingPaidHashes
        : [...existingPaidHashes, normalizedTxHash],
      status: isReusable ? "ACTIVE" : "PAID",
      totalPaidCount: (existing.totalPaidCount || 0) + 1,
      totalVolumeINR: (existing.totalVolumeINR || 0) + existing.amountINR,
    };

    if (p2pOrderId) {
      updates.p2pOrderId = String(p2pOrderId);
    }

    const updated = updatePayLink(id, updates);

    // Dispatch webhook if configured
    if (existing.webhookUrl) {
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
      link: updated ? sanitizePayLink(updated) : null,
    });
  } catch (err: any) {
    console.error("[PayLinks] PATCH Error:", err);
    return corsJson({ error: err.message || "Failed to update pay link" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/paylinks?id=pl_xxx
 *
 * Deactivates or cancels a pay link.
 */
export async function DELETE(req: Request) {
  try {
    const auth = await resolvePublicApiAuth(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return corsJson({ error: "Missing 'id' parameter." }, { status: 400 });
    }

    const existing = getPayLink(id);
    if (!existing) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    // Check creator ownership
    const isCreator =
      auth.ok &&
      ((existing.creatorUserId && existing.creatorUserId === auth.userId) ||
        (existing.creatorWalletAddress && existing.creatorWalletAddress.toLowerCase() === auth.walletAddress?.toLowerCase()) ||
        auth.isEnvKey);

    if (!isCreator) {
      return corsJson({ error: "Unauthorized to deactivate this pay link." }, { status: 403 });
    }

    const updated = updatePayLink(id, { status: "CANCELLED" });
    return corsJson({
      success: true,
      message: "Pay link cancelled.",
      link: updated ? sanitizePayLink(updated) : null,
    });
  } catch (err: any) {
    console.error("[PayLinks] DELETE Error:", err);
    return corsJson({ error: err.message || "Failed to delete pay link" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
