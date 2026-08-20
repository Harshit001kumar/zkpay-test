import crypto from "crypto";

export interface WebhookPayload {
  event: "payin.detected" | "payin.settled" | "payin.failed" | "paylink.paid";
  sessionId?: string;
  linkId?: string;
  recipientUpi: string;
  fiatAmount: number;
  currency: string;
  amountUsdc: string;
  txHash?: string;
  p2pOrderId?: string;
  timestamp: number;
}

/**
 * Signs and dispatches an HTTP POST webhook to the recipient endpoint.
 * Includes timestamp and HMAC SHA-256 signature in headers for security.
 */
export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string = process.env.WEBHOOK_SECRET || "zkpay_webhook_default_sec"
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
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
