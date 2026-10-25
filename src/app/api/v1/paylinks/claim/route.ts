import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  getPayLink,
  updatePayLink,
  verifyPayLinkPin,
  acquirePayLinkClaimLock,
  releasePayLinkClaimLock,
  sanitizePayLink,
} from "@/lib/server/payStore";
import { executeClaimDisbursement } from "@/lib/server/p2pServerEngine";
import { dispatchWebhook } from "@/lib/server/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/paylinks/claim
 *
 * Receiver claims an escrow disbursement link by providing:
 * - linkId
 * - 4-digit PIN (verified with constant-time salted comparison)
 * - recipientUpi (where INR fiat will be deposited)
 */
export async function POST(req: Request) {
  let linkId = "";
  try {
    const body = await req.json();
    linkId = String(body.linkId || "").trim();
    const pin = String(body.pin || "").trim();
    const recipientUpi = String(body.recipientUpi || body.upi || "").trim();

    if (!linkId) {
      return corsJson({ error: "Missing linkId parameter." }, { status: 400 });
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      return corsJson({ error: "Invalid PIN. Must be a 4-digit number." }, { status: 400 });
    }

    if (!recipientUpi || !recipientUpi.includes("@")) {
      return corsJson(
        { error: "Valid recipient UPI ID is required (e.g. name@okaxis)." },
        { status: 400 }
      );
    }

    const link = getPayLink(linkId);
    if (!link) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    if (link.mode !== "disburse") {
      return corsJson(
        { error: "This pay link is an invoice request link, not a claimable disbursement link." },
        { status: 400 }
      );
    }

    // Mutex Lock to prevent race condition / double-claiming
    const lockAcquired = acquirePayLinkClaimLock(linkId);
    if (!lockAcquired) {
      return corsJson(
        { error: "A claim is currently being processed for this link. Please wait a moment." },
        { status: 409 }
      );
    }

    try {
      if (link.status === "PIN_LOCKED" || (link.failedAttempts || 0) >= 5) {
        return corsJson(
          {
            error:
              "This pay link has been locked due to exceeding 5 incorrect PIN attempts. Please contact the sender.",
            status: "PIN_LOCKED",
          },
          { status: 423 }
        );
      }

      if (link.status === "PAID") {
        return corsJson({ error: "This payment has already been claimed." }, { status: 409 });
      }

      if (link.status === "REFUNDED" || link.status === "CANCELLED") {
        return corsJson({ error: "This pay link was cancelled/refunded by the sender." }, { status: 410 });
      }

      if (link.status === "EXPIRED") {
        return corsJson({ error: "This pay link has expired." }, { status: 410 });
      }

      // Timing-safe constant-time PIN verification
      const isPinValid = verifyPayLinkPin(link, pin);
      if (!isPinValid) {
        const newFailed = (link.failedAttempts || 0) + 1;
        const remaining = Math.max(0, 5 - newFailed);
        const isNowLocked = newFailed >= 5;

        updatePayLink(linkId, {
          failedAttempts: newFailed,
          status: isNowLocked ? "PIN_LOCKED" : link.status,
        });

        // Progressive throttling delay if failed >= 3
        if (newFailed >= 3) {
          await new Promise((r) => setTimeout(r, 2000));
        }

        return corsJson(
          {
            error: isNowLocked
              ? "Exceeded 5 incorrect attempts. This pay link is now locked."
              : `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
            failedAttemptsRemaining: remaining,
            status: isNowLocked ? "PIN_LOCKED" : link.status,
          },
          { status: 401 }
        );
      }

      // PIN is verified! Reset failed attempts and transition to CLAIMING
      updatePayLink(linkId, {
        failedAttempts: 0,
        status: "CLAIMING",
      });

      // Execute on-chain sweep and Diamond offramp to recipient UPI
      const result = await executeClaimDisbursement({
        link,
        recipientUpi,
      });

      if (!result.success) {
        // Rollback status to ACTIVE if execution failed
        updatePayLink(linkId, { status: "ACTIVE" });
        return corsJson({ error: result.error || "Failed to process disbursement claim." }, { status: 500 });
      }

      const updated = getPayLink(linkId)!;

      // Dispatch webhook if creator configured one
      if (updated.webhookUrl) {
        dispatchWebhook(updated.webhookUrl, {
          event: "paylink.paid",
          linkId: updated.id,
          fiatAmount: updated.amountINR,
          currency: "INR",
          amountUsdc: updated.estimatedUsdc,
          recipientUpi,
          txHash: result.txHash,
          p2pOrderId: result.p2pOrderId,
          timestamp: Date.now(),
        }).catch(() => {});
      }

      return corsJson({
        success: true,
        message: `Successfully claimed ₹${updated.amountINR}! Payout has been initiated to ${recipientUpi}.`,
        txHash: result.txHash,
        p2pOrderId: result.p2pOrderId,
        link: sanitizePayLink(updated),
      });
    } finally {
      releasePayLinkClaimLock(linkId);
    }
  } catch (err: any) {
    if (linkId) releasePayLinkClaimLock(linkId);
    console.error("[PayLinks Claim] Error:", err);
    return corsJson({ error: err?.message || "Failed to process claim." }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
