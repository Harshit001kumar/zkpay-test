import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  createPayInSession,
  getPayInSession,
  updatePayInSession,
  getPayLink,
} from "@/lib/server/payStore";
import { isSafeWebhookUrlAsync } from "@/lib/server/webhooks";
import { requirePublicApiKey, resolvePublicApiAuth } from "@/lib/server/publicApiAuth";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { parseAbi, parseUnits, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  evaluateAndProcessDeposit,
  checkAndDeliverHandshake,
  checkOrderSettlement,
  handleOrderTimeoutOrCancel,
} from "@/lib/server/p2pServerEngine";
import { getLiveFiatRate, getResilientPublicClient } from "@/lib/server/p2pRates";

export const dynamic = "force-dynamic";

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`;
const PLATFORM_FEE_BPS = 100; // 1%

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

function getPublicClient() {
  return getResilientPublicClient();
}

function maskUpi(upi: string): string {
  const [user, handle] = upi.split("@");
  if (!handle) return "***";
  const visible = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  return `${visible}***@${handle}`;
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
    const linkId = body.linkId ? String(body.linkId).trim() : undefined;
    const linkedPayLink = linkId ? getPayLink(linkId) : undefined;
    const isValidCheckoutLink = Boolean(
      linkedPayLink && linkedPayLink.status === "ACTIVE" && linkedPayLink.mode === "request"
    );

    const auth = await resolvePublicApiAuth(req);
    if (!auth.ok && !isValidCheckoutLink) {
      return corsJson(
        { error: auth.error || "Missing or invalid API key / authorization token." },
        { status: auth.status || 401 }
      );
    }

    const validatedKeyId = auth.ok
      ? (auth.apiKeyRecord?.id || (auth.isEnvKey ? "admin_env" : auth.userId || "auth_user"))
      : undefined;

    const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "create", validatedKeyId);
    if (rateLimitResp) return rateLimitResp;

    const recipientUpi = (
      !auth.ok && linkedPayLink
        ? linkedPayLink.recipientUpi || ""
        : body.recipientUpi || body.upi || linkedPayLink?.recipientUpi || ""
    ).trim();
    const amountINR =
      !auth.ok && linkedPayLink
        ? Number(linkedPayLink.amountINR)
        : Number(body.amountINR || body.amount || linkedPayLink?.amountINR);
    const webhookUrl =
      !auth.ok && linkedPayLink
        ? linkedPayLink.webhookUrl
        : body.webhookUrl
          ? String(body.webhookUrl).trim()
          : linkedPayLink?.webhookUrl;
    const refundAddress = body.refundAddress ? String(body.refundAddress).trim() : undefined;
    const tipUsdcNum = body.tipUsdc ? Math.max(0, Number(body.tipUsdc)) : (body.tip ? Math.max(0, Number(body.tip)) : 0);

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

    if (refundAddress && !/^0x[a-fA-F0-9]{40}$/.test(refundAddress)) {
      return corsJson(
        { error: "refundAddress must be a valid 0x EVM address on Base." },
        { status: 400 }
      );
    }

    if (webhookUrl) {
      const safe = await isSafeWebhookUrlAsync(webhookUrl);
      if (!safe) {
        return corsJson(
          { error: "webhookUrl must be a valid, publicly resolvable HTTPS URL (SSRF protected)." },
          { status: 400 }
        );
      }
    }

    // 1. Fetch live rate directly with multi-RPC failover and TTL caching
    const sellPrice = await getLiveFiatRate("INR");
    if (!sellPrice || sellPrice <= 0) {
      return corsJson(
        { error: "Could not fetch live INR exchange rate from P2P Diamond contract." },
        { status: 503 }
      );
    }

    // 2. Calculate USDC required (principal + 1% fee + protocol small order fee if <= 10 USDC + optional provider tip)
    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const isSmallOrder = usdcPrincipal > 0 && usdcPrincipal <= 10;
    const protocolFeeUsdc = isSmallOrder ? 0.10 : 0;
    const totalUsdc = usdcPrincipal + feeUsdc + protocolFeeUsdc + tipUsdcNum;

    // 3. Generate a dedicated ephemeral deposit keypair on Base
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const payinAddress = account.address;

    // 4. Set 30-minute validity window
    const now = Date.now();
    const validityMs = 30 * 60 * 1000; // 30 minutes
    const expiresAt = now + validityMs;

    // 5. Store session with encrypted private key, refundAddress, tipUsdc and ephemeral clientSecret token
    const session = createPayInSession({
      recipientUpi,
      amountINR,
      expectedUsdc: totalUsdc.toFixed(2),
      feeUsdc: feeUsdc.toFixed(2),
      rate: sellPrice,
      payinAddress,
      payinPrivateKey: privateKey,
      refundAddress,
      tipUsdc: tipUsdcNum > 0 ? tipUsdcNum.toFixed(2) : undefined,
      webhookUrl,
      expiresAt,
      // Partner attribution: API-key callers own the session directly; public checkout sessions
      // opened from a pay link inherit the link creator's API key so they appear in /partner.
      creatorUserId: auth.apiKeyRecord?.userId || (isValidCheckoutLink ? linkedPayLink?.creatorUserId : undefined),
      creatorWalletAddress:
        auth.apiKeyRecord?.walletAddress || (isValidCheckoutLink ? linkedPayLink?.creatorWalletAddress : undefined),
      apiKeyId: auth.apiKeyRecord?.id || (isValidCheckoutLink ? linkedPayLink?.apiKeyId : undefined),
      source: auth.apiKeyRecord ? "api" : isValidCheckoutLink ? "checkout" : "app",
      parentLinkId: isValidCheckoutLink ? linkedPayLink?.id : undefined,
    });

    // 6. Build Direct USDC Transfer QR code on Base (EIP-681)
    const usdcUnits = Math.round(totalUsdc * 1_000_000);
    const eip681Uri = `ethereum:${USDC_ADDRESS}@8453/transfer?address=${payinAddress}&uint256=${usdcUnits}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
      eip681Uri
    )}`;

    return corsJson({
      success: true,
      sessionId: session.id,
      clientSecret: session.clientSecret,
      statusUrl: `/api/v1/payin-sessions?id=${session.id}&token=${session.clientSecret}`,
      status: session.status,
      network: "Base Mainnet (Chain ID: 8453)",
      asset: "USDC",
      contractAddress: USDC_ADDRESS,
      payinAddress,
      expectedAmountUsdc: totalUsdc.toFixed(2),
      usdcPrincipal: usdcPrincipal.toFixed(2),
      feeUsdc: feeUsdc.toFixed(2),
      protocolFeeUsdc: protocolFeeUsdc.toFixed(2),
      tipUsdc: tipUsdcNum > 0 ? tipUsdcNum.toFixed(2) : undefined,
      refundAddress: session.refundAddress,
      isSmallOrder,
      gasSponsorship: "Sponsored by ZkPay Relayer (Executed directly from Relayer wallet; if failed, gas fee is paid in USDC from deposit)",
      fiatAmount: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      fiatAmountRaw: amountINR,
      recipientUpi,
      rate: sellPrice.toFixed(2),
      expiresAt,
      expiresInSeconds: 1800,
      qrCodeUrl,
      instructions: `Send ${totalUsdc.toFixed(2)} USDC on Base Mainnet to ${payinAddress} within 30 minutes. Once received, funds will be automatically exchanged via P2P escrow and delivered to ${recipientUpi}.`,
      createdAt: session.createdAt,
    });
  } catch (err: any) {
    console.error("[PayInSession] Create Error:", err);
    return corsJson({ error: err.message || "Failed to create deposit session" }, { status: 500 });
  }
}

/**
 * GET /api/v1/payin-sessions?id=ses_abc123&token=...
 *
 * Checks live status of a deposit session.
 * Actively checks the on-chain USDC balance of the deposit address.
 */
export async function GET(req: Request) {
  try {
    const { response: rateLimitResp } = enforceRateLimit(req, "status");
    if (rateLimitResp) return rateLimitResp;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const token = searchParams.get("token");

    if (!id) {
      return corsJson({ error: "Missing ?id= query parameter." }, { status: 400 });
    }

    const session = getPayInSession(id);
    if (!session) {
      return corsJson({ error: "Pay-in session not found." }, { status: 404 });
    }

    // Scoped access control: determine if caller has full merchant/creator access
    const auth = await resolvePublicApiAuth(req);
    const isAuthorizedMerchant = auth.ok && (
      auth.isEnvKey ||
      (session.apiKeyId && auth.apiKeyRecord?.id === session.apiKeyId) ||
      (session.creatorUserId && auth.userId === session.creatorUserId) ||
      (session.creatorWalletAddress && auth.walletAddress?.toLowerCase() === session.creatorWalletAddress.toLowerCase())
    );
    const hasValidClientToken = Boolean(token && session.clientSecret && token === session.clientSecret);
    const isFullAccess = isAuthorizedMerchant || hasValidClientToken;
    const displayUpi = isFullAccess ? session.recipientUpi : maskUpi(session.recipientUpi);

    const now = Date.now();

    // Check expiration if still awaiting payment
    if (session.status === "AWAITING_PAYMENT" && session.expiresAt <= now) {
      updatePayInSession(session.id, { status: "EXPIRED" });
      return corsJson({
        success: true,
        sessionId: session.id,
        status: "EXPIRED",
        error: "Session expired after 30 minutes. Please create a new session.",
      });
    }

    let currentSession = session;

    // 1. If AWAITING_PAYMENT, actively poll on-chain balance on Base
    if (currentSession.status === "AWAITING_PAYMENT") {
      const client = getPublicClient();
      try {
        const balanceWei = (await client.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [currentSession.payinAddress as `0x${string}`],
        })) as bigint;

        if (balanceWei > 0n) {
          currentSession = await evaluateAndProcessDeposit(currentSession);
        }
      } catch (err: any) {
        console.warn(`[PayInSession] Balance check failed for ${currentSession.payinAddress}:`, err.message);
      }
    }

    // 2. If ORDER_PLACED, check if peer matched and deliver encrypted UPI handshake
    if (currentSession.status === "ORDER_PLACED") {
      try {
        currentSession = await checkAndDeliverHandshake(currentSession);
      } catch (err: any) {
        console.warn(`[PayInSession] Handshake check warning for ${currentSession.id}:`, err.message);
      }
    }

    // 3. If AWAITING_FIAT_PAYMENT, check if merchant completed fiat payment
    if (currentSession.status === "AWAITING_FIAT_PAYMENT") {
      try {
        currentSession = await checkOrderSettlement(currentSession);
      } catch (err: any) {
        console.warn(`[PayInSession] Settlement check warning for ${currentSession.id}:`, err.message);
      }
    }

    // Build verified payment proof object if settled
    const proof = currentSession.status === "SETTLED" ? {
      verification: "P2P.me Protocol Escrow Verified",
      p2pOrderId: currentSession.p2pOrderId || null,
      actualFiatAmount: `₹ ${currentSession.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      actualUsdcAmount: currentSession.actualUsdcAmount || currentSession.receivedUsdc,
      recipientUpi: displayUpi,
      txHash: currentSession.txHash || null,
      basescanUrl: currentSession.txHash ? `https://basescan.org/tx/${currentSession.txHash}` : null,
      settledAt: currentSession.settledAt || Date.now(),
    } : undefined;

    return corsJson({
      success: true,
      sessionId: currentSession.id,
      status: currentSession.status,
      discrepancyType: currentSession.discrepancyType || "EXACT",
      toleranceAppliedUsdc: currentSession.toleranceAppliedUsdc,
      detectedSenderAddress: currentSession.detectedSenderAddress,
      recipientUpi: displayUpi,
      fiatAmount: `₹ ${currentSession.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      expectedAmountUsdc: `${currentSession.expectedUsdc} USDC`,
      receivedUsdc: currentSession.receivedUsdc,
      feeUsdc: currentSession.feeUsdc,
      gasFeeUsdc: currentSession.gasFeeUsdc,
      tipUsdc: currentSession.tipUsdc,
      refundAddress: currentSession.refundAddress || currentSession.detectedSenderAddress,
      refundStatus: currentSession.refundStatus,
      refundTxHash: currentSession.refundTxHash,
      underpaidPenaltyUsdc: currentSession.underpaidPenaltyUsdc,
      payinAddress: currentSession.payinAddress,
      p2pOrderId: currentSession.p2pOrderId,
      network: "Base Mainnet",
      rate: currentSession.rate,
      txHash: currentSession.txHash,
      proof,
      expiresAt: currentSession.expiresAt,
      expiresInSeconds: Math.max(0, Math.floor((currentSession.expiresAt - now) / 1000)),
      createdAt: currentSession.createdAt,
    });
  } catch (err: any) {
    console.error("[PayInSession] Status Error:", err);
    return corsJson({ error: err.message || "Failed to check session status" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
