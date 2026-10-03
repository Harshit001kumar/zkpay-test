import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  createPayInSession,
  getPayInSession,
  updatePayInSession,
} from "@/lib/server/payStore";
import { dispatchWebhook, isSafeWebhookUrlAsync } from "@/lib/server/webhooks";
import { requirePublicApiKey, resolvePublicApiAuth } from "@/lib/server/publicApiAuth";
import { parseAbi, parseUnits, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sweepPayInSession } from "@/lib/server/sweeper";
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
    const auth = await requirePublicApiKey(req);
    if (!auth.ok) {
      return corsJson({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json();
    const recipientUpi = (body.recipientUpi || body.upi || "").trim();
    const amountINR = Number(body.amountINR || body.amount);
    const webhookUrl = body.webhookUrl ? String(body.webhookUrl).trim() : undefined;

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

    // 2. Calculate USDC required (principal + 1% fee + protocol small order fee if <= 10 USDC)
    const usdcPrincipal = amountINR / sellPrice;
    const feeUsdc = usdcPrincipal * (PLATFORM_FEE_BPS / 10000);
    const isSmallOrder = usdcPrincipal > 0 && usdcPrincipal <= 10;
    const protocolFeeUsdc = isSmallOrder ? 0.10 : 0;
    const totalUsdc = usdcPrincipal + feeUsdc + protocolFeeUsdc;

    // 3. Generate a dedicated ephemeral deposit keypair on Base
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const payinAddress = account.address;

    // 4. Set 30-minute validity window
    const now = Date.now();
    const validityMs = 30 * 60 * 1000; // 30 minutes
    const expiresAt = now + validityMs;

    // 5. Store session with encrypted private key and ephemeral clientSecret token
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
      creatorUserId: auth.apiKeyRecord?.userId,
      creatorWalletAddress: auth.apiKeyRecord?.walletAddress,
      apiKeyId: auth.apiKeyRecord?.id,
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
      isSmallOrder,
      gasSponsorship: "Sponsored by ZkPay (Pimlico Paymaster)",
      fiatAmount: `₹ ${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      fiatAmountRaw: amountINR,
      recipientUpi,
      rate: sellPrice.toFixed(2),
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
 * GET /api/v1/payin-sessions?id=ses_abc123&token=...
 *
 * Checks live status of a deposit session.
 * Actively checks the on-chain USDC balance of the deposit address.
 */
export async function GET(req: Request) {
  try {
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
    if (session.status === "AWAITING_PAYMENT" || session.status === "PROCESSING") {
      const client = getPublicClient();
      try {
        const balanceWei = (await client.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [session.payinAddress as `0x${string}`],
        })) as bigint;

        const expectedUsdcWei = parseUnits(session.expectedUsdc, 6);
        // Require at least 99.5% of expected amount (50 bps max slippage tolerance)
        const minRequiredWei = (expectedUsdcWei * 995n) / 1000n;

        if (balanceWei >= minRequiredWei) {
          const balanceUsdcStr = formatUnits(balanceWei, 6);

          // Mark as PROCESSING while sweep executes
          updatePayInSession(session.id, {
            status: "PROCESSING",
            receivedUsdc: balanceUsdcStr,
          });

          // Await on-chain EIP-3009 gasless sweep to Treasury
          const sweep = await sweepPayInSession(session);
          if (sweep.success) {
            updatePayInSession(session.id, {
              status: "SETTLED",
              receivedUsdc: balanceUsdcStr,
              txHash: sweep.txHash,
            });

            // Dispatch Webhook if registered
            if (session.webhookUrl) {
              dispatchWebhook(session.webhookUrl, {
                event: "payin.settled",
                sessionId: session.id,
                recipientUpi: session.recipientUpi,
                fiatAmount: session.amountINR,
                currency: "INR",
                amountUsdc: balanceUsdcStr,
                txHash: sweep.txHash,
                timestamp: Date.now(),
              }).catch((err) => console.warn("[Webhook] Auto dispatch err:", err));
            }

            return corsJson({
              success: true,
              sessionId: session.id,
              status: "SETTLED",
              recipientUpi: displayUpi,
              fiatAmount: `₹ ${session.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
              receivedUsdc: `${balanceUsdcStr} USDC`,
              payinAddress: session.payinAddress,
              network: "Base Mainnet",
              txHash: sweep.txHash,
              createdAt: session.createdAt,
              message: `Payment of ${balanceUsdcStr} USDC confirmed and swept to treasury.`,
            });
          } else {
            console.warn(`[PayInSession] Sweep in-flight or delayed for ${session.id}: ${sweep.error}`);
            return corsJson({
              success: true,
              sessionId: session.id,
              status: "PROCESSING",
              recipientUpi: displayUpi,
              fiatAmount: `₹ ${session.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
              receivedUsdc: `${balanceUsdcStr} USDC`,
              payinAddress: session.payinAddress,
              network: "Base Mainnet",
              createdAt: session.createdAt,
              message: "Payment detected on Base. Sweeper is relaying settlement...",
            });
          }
        }
      } catch (err: any) {
        console.warn(`[PayInSession] Balance check failed for ${session.payinAddress}:`, err.message);
      }
    }

    return corsJson({
      success: true,
      sessionId: session.id,
      status: session.status,
      recipientUpi: displayUpi,
      fiatAmount: `₹ ${session.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      expectedAmountUsdc: `${session.expectedUsdc} USDC`,
      receivedUsdc: session.receivedUsdc,
      payinAddress: session.payinAddress,
      network: "Base Mainnet",
      rate: session.rate,
      txHash: session.txHash,
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
