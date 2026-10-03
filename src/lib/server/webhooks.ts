import crypto from "crypto";
import dns from "dns/promises";

export interface WebhookPayload {
  event:
    | "payin.detected"
    | "payin.settled"
    | "payin.failed"
    | "paylink.paid"
    | "swap.deposit_detected"
    | "swap.settled"
    | "swap.failed"
    | "swap.refunded";
  sessionId?: string;
  linkId?: string;
  recipientUpi?: string;
  fiatAmount?: number;
  currency?: string;
  amountUsdc?: string;
  txHash?: string;
  p2pOrderId?: string;
  // Cross-chain swap event fields
  swapId?: string;
  depositAddress?: string;
  originAsset?: string;
  destinationAsset?: string;
  depositedAmount?: string;
  settledAmount?: string;
  originTxHash?: string;
  destinationTxHash?: string;
  recipient?: string;
  timestamp: number;
}

/**
 * Checks if an IP string is within a private, loopback, link-local, or reserved range.
 */
function isPrivateIp(ip: string): boolean {
  if (
    ip === "127.0.0.1" ||
    ip === "0.0.0.0" ||
    ip === "::1" ||
    ip === "::" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("100.64.") ||
    ip.startsWith("fc00:") ||
    ip.startsWith("fe80:") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  ) {
    return true;
  }
  return false;
}

/**
 * Validates that a webhook URL is a safe, public HTTPS endpoint.
 * Protects against SSRF (Server-Side Request Forgery) attacks.
 */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    // Enforce HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, loopback, and internal hostnames
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return false;
    }

    // Block AWS / GCP / Azure cloud metadata IP
    if (hostname === "169.254.169.254" || hostname.startsWith("169.254.")) {
      return false;
    }

    // Block Private RFC 1918 IP addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    if (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously validates URL with DNS lookup to prevent DNS rebinding SSRF attacks.
 */
export async function isSafeWebhookUrlAsync(rawUrl: string): Promise<boolean> {
  if (!isSafeWebhookUrl(rawUrl)) {
    return false;
  }

  try {
    const parsed = new URL(rawUrl);
    const records = await dns.lookup(parsed.hostname, { all: true });
    if (!records || records.length === 0) {
      return false;
    }

    for (const record of records) {
      if (isPrivateIp(record.address)) {
        console.warn(`[Webhook SSRF] Blocked resolution of ${parsed.hostname} -> private IP ${record.address}`);
        return false;
      }
    }

    return true;
  } catch (err: any) {
    console.warn(`[Webhook SSRF] DNS lookup failed for ${rawUrl}:`, err.message);
    return false;
  }
}

/**
 * Signs and dispatches an HTTP POST webhook to the recipient endpoint.
 * Includes timestamp and HMAC SHA-256 signature in headers for security.
 */
export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string | undefined = process.env.WEBHOOK_SECRET
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    if (!secret) {
      return {
        success: false,
        error: "WEBHOOK_SECRET is not configured on server.",
      };
    }

    const isSafe = await isSafeWebhookUrlAsync(url);
    if (!isSafe) {
      console.warn(`[Webhook Security] Blocked SSRF attempt to unsafe URL: ${url}`);
      return {
        success: false,
        error: "Unsafe webhook URL. Only public HTTPS endpoints are permitted.",
      };
    }

    const timestamp = Date.now();
    const bodyString = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${bodyString}`)
      .digest("hex");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ZkPay-Webhook-Dispatcher/1.0",
        "X-ZkPay-Signature": `t=${timestamp},v1=${signature}`,
      },
      body: bodyString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return {
      success: res.ok,
      status: res.status,
    };
  } catch (err: any) {
    console.error(`[Webhook] Dispatch failed to ${url}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}
