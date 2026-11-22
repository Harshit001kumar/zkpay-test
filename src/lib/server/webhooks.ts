import crypto from "crypto";
import dns from "dns/promises";

export interface WebhookPayload {
  event:
    | "swap.deposit_detected"
    | "swap.settled"
    | "swap.failed"
    | "swap.refunded"
    | (string & {});
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
  [key: string]: any;
}

/**
 * Checks if an IP string is within a private, loopback, link-local, CGNAT, ULA, or reserved range.
 */
function isPrivateIp(rawIp: string): boolean {
  let ip = (rawIp || "").trim().toLowerCase();
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }
  if (!ip || ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }
  // IPv6 link-local fe80::/10 (fe80..febf)
  if (/^fe[89ab][0-9a-f]:/.test(ip)) {
    return true;
  }

  // Handle dotted-quad IPv4
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  // Reject hex/octal/integer IPv4 obfuscations or compressed loopback like 0:0:0:0:0:0:0:1
  if (ip.includes(":")) {
    return ip.replace(/0+/g, "") === "::1" || ip.startsWith("::");
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

    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block bracketed IPv6 literals or integer/hex single-label hosts
    if (hostname.startsWith("[") || /^\d+$/.test(hostname) || /^0x[0-9a-f]+$/.test(hostname)) {
      return false;
    }

    // Block localhost, loopback, and internal hostnames
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      isPrivateIp(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously validates URL with DNS lookup to prevent SSRF to internal networks.
 * shortcut: validates DNS pre-flight without pinning resolved IP on fetch; add custom undici dispatcher before wiring user-supplied webhooks.
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
      redirect: "error",
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
