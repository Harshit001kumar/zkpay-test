import { corsJson, corsOptions } from "@/lib/server/cors";
import {
  getPayLink,
  updatePayLink,
  getDecryptedEscrowKey,
  sanitizePayLink,
} from "@/lib/server/payStore";
import { relayEip3009Transfer } from "@/lib/server/p2pServerEngine";
import { resolvePublicApiAuth } from "@/lib/server/publicApiAuth";
import { getResilientPublicClient } from "@/lib/server/p2pRates";
import { CONTRACTS } from "@/lib/constants";
import { parseAbi, getAddress, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const dynamic = "force-dynamic";

const ERC20_ABI = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

/**
 * POST /api/v1/paylinks/refund
 *
 * Allows the creator of a Claimable PayLink to reclaim escrowed funds
 * if the link was abandoned, locked, or expired.
 */
export async function POST(req: Request) {
  try {
    const auth = await resolvePublicApiAuth(req);
    const body = await req.json();
    const linkId = String(body.linkId || "").trim();
    const creatorSecret = String(body.creatorSecret || "").trim();
    const destinationOverride = String(body.destination || "").trim();

    if (!linkId) {
      return corsJson({ error: "Missing linkId parameter." }, { status: 400 });
    }

    const link = getPayLink(linkId);
    if (!link) {
      return corsJson({ error: "Pay link not found." }, { status: 404 });
    }

    if (link.mode !== "disburse") {
      return corsJson({ error: "Only claimable disbursement links can be refunded." }, { status: 400 });
    }

    // Verify creator authorization via creatorSecret OR session auth
    const isSecretAuthorized = creatorSecret && link.creatorSecret && creatorSecret === link.creatorSecret;
    const isSessionAuthorized =
      auth.ok &&
      ((link.creatorUserId && link.creatorUserId === auth.userId) ||
        (link.creatorWalletAddress &&
          link.creatorWalletAddress.toLowerCase() === auth.walletAddress?.toLowerCase()) ||
        auth.isEnvKey);

    if (!isSecretAuthorized && !isSessionAuthorized) {
      return corsJson(
        { error: "Unauthorized. Valid creatorSecret or creator session is required to reclaim funds." },
        { status: 403 }
      );
    }

    if (link.status === "PAID") {
      return corsJson({ error: "Cannot refund: this pay link has already been claimed and paid out." }, { status: 409 });
    }

    if (link.status === "REFUNDED") {
      return corsJson({ error: "This pay link has already been refunded." }, { status: 410 });
    }

    // Determine refund recipient
    let refundTo = destinationOverride || link.creatorRefundAddress || link.creatorWalletAddress || auth.walletAddress;
    if (!refundTo || !isAddress(refundTo)) {
      return corsJson(
        { error: "No valid 0x destination address specified for the refund. Please provide 'destination'." },
        { status: 400 }
      );
    }
    const cleanRefundTo = getAddress(refundTo);

    if (!link.escrowAddress) {
      return corsJson({ error: "No escrow address associated with this link." }, { status: 400 });
    }

    const publicClient = getResilientPublicClient();
    const bal = (await publicClient.readContract({
      address: CONTRACTS.USDC as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [getAddress(link.escrowAddress as `0x${string}`)],
    })) as bigint;

    let refundTx = "";
    if (bal > 0n) {
      const escrowKey = getDecryptedEscrowKey(link);
      const escrowAccount = privateKeyToAccount(escrowKey);
      refundTx = await relayEip3009Transfer({
        fromAccount: escrowAccount,
        toAddress: cleanRefundTo,
        amountWei: bal,
      });
      console.log(`[PayLinks Refund] Swept ${bal} wei USDC back to creator: ${refundTx}`);
    }

    const updated = updatePayLink(link.id, {
      status: "REFUNDED",
      txHash: refundTx || undefined,
    });

    return corsJson({
      success: true,
      message: `Successfully reclaimed ${bal > 0n ? "and refunded USDC to your wallet" : "unfunded link"}.`,
      refundTxHash: refundTx || undefined,
      link: sanitizePayLink(updated || link),
    });
  } catch (err: any) {
    console.error("[PayLinks Refund] Error:", err);
    return corsJson({ error: err?.message || "Failed to process refund." }, { status: 500 });
  }
}

export async function OPTIONS() {
  return corsOptions();
}
