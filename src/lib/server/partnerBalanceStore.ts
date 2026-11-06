import { getMongoDb } from "./mongodb";
import { ProxySwapOrder, updateProxySwapOrder } from "./proxySwapStore";
import { calculateTokenUsdValue } from "./priceService";
import { getApiKeyById } from "./apiKeysStore";

export const MIN_PAYOUT_AMOUNT_USD = 1.0;

export interface SupportedPayoutOption {
  id: "ltc" | "sol" | "usdt-polygon" | "usdc-base";
  asset: string;
  chain: string;
  label: string;
}

export const SUPPORTED_PAYOUT_OPTIONS: SupportedPayoutOption[] = [
  { id: "usdc-base", asset: "USDC", chain: "Base", label: "USDC (Base)" },
  { id: "usdt-polygon", asset: "USDT", chain: "Polygon", label: "USDT (Polygon)" },
  { id: "sol", asset: "SOL", chain: "Solana", label: "SOL (Solana)" },
  { id: "ltc", asset: "LTC", chain: "Litecoin", label: "LTC (Litecoin)" },
];

export interface PartnerBalanceRecord {
  userId: string;
  availableBalanceUsd: number;
  pendingPayoutUsd: number;
  totalEarnedUsd: number;
  totalWithdrawnUsd: number;
  settledSwapsCount: number;
  updatedAt: number;
}

export interface PartnerFeeCreditRecord {
  id: string;
  partnerUserId: string;
  apiKeyId: string | null;
  swapId: string;
  chain: string;
  fromAsset: string;
  tokenAmount: string;
  humanTokenAmount: string;
  usdRate: number;
  feeUsd: number;
  settledAt: number;
}

export interface PartnerPayoutRequest {
  id: string;
  partnerUserId: string;
  partnerWalletAddress?: string;
  amountUsd: number;
  payoutOption: "ltc" | "sol" | "usdt-polygon" | "usdc-base";
  targetAsset: string;
  targetChain: string;
  destinationAddress: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "REJECTED";
  txHash?: string;
  adminNote?: string;
  createdAt: number;
  processedAt?: number;
  processedBy?: string;
}

function validateAddressForOption(
  option: "ltc" | "sol" | "usdt-polygon" | "usdc-base",
  address: string
): { valid: boolean; error?: string } {
  const clean = (address || "").trim();
  if (!clean) return { valid: false, error: "Destination address cannot be empty." };

  if (option === "usdc-base" || option === "usdt-polygon") {
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(clean);
    if (!isEvm) return { valid: false, error: "Must be a valid 42-character EVM address (0x...)." };
    return { valid: true };
  }

  if (option === "sol") {
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean);
    if (!isSol) return { valid: false, error: "Must be a valid Solana Base58 address (32-44 characters)." };
    return { valid: true };
  }

  if (option === "ltc") {
    const isLtc = /^(L|M|ltc1)[a-km-zA-HJ-NP-Z1-9]{26,45}$/.test(clean);
    if (!isLtc) return { valid: false, error: "Must be a valid Litecoin address (starts with L, M, or ltc1)." };
    return { valid: true };
  }

  return { valid: false, error: "Unsupported payout option." };
}

function getDecimalsForAsset(symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT")) return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("BTC") || sym.includes("WBTC") || sym.includes("LTC")) return 8;
  return 18;
}

// In-memory fallback if MongoDB is briefly offline
const memoryBalances = new Map<string, PartnerBalanceRecord>();
const memoryCredits = new Map<string, PartnerFeeCreditRecord>();
const memoryPayouts = new Map<string, PartnerPayoutRequest>();

/**
 * Returns the current partner balance.
 */
export async function getPartnerBalance(userId: string): Promise<PartnerBalanceRecord> {
  const defaultRecord: PartnerBalanceRecord = {
    userId,
    availableBalanceUsd: 0,
    pendingPayoutUsd: 0,
    totalEarnedUsd: 0,
    totalWithdrawnUsd: 0,
    settledSwapsCount: 0,
    updatedAt: Date.now(),
  };

  try {
    const db = await getMongoDb();
    if (db) {
      const record = await db.collection<PartnerBalanceRecord>("partner_balances").findOne({ userId });
      if (record) {
        return {
          userId: record.userId,
          availableBalanceUsd: Math.round((record.availableBalanceUsd || 0) * 10000) / 10000,
          pendingPayoutUsd: Math.round((record.pendingPayoutUsd || 0) * 10000) / 10000,
          totalEarnedUsd: Math.round((record.totalEarnedUsd || 0) * 10000) / 10000,
          totalWithdrawnUsd: Math.round((record.totalWithdrawnUsd || 0) * 10000) / 10000,
          settledSwapsCount: record.settledSwapsCount || 0,
          updatedAt: record.updatedAt || Date.now(),
        };
      }
    }
  } catch (err) {
    console.warn("[PartnerBalanceStore] MongoDB getPartnerBalance warning:", err);
  }

  return memoryBalances.get(userId) || defaultRecord;
}

/**
 * Hook invoked strictly upon swap order settlement to credit the partner's USD balance.
 * Idempotent: guaranteed never to credit the same swap twice.
 */
export async function creditPartnerFeeOnSettlement(order: ProxySwapOrder): Promise<boolean> {
  if (order.feeCredited) {
    return false; // Already credited
  }

  // Must have a partner fee amount > 0
  if (!order.partnerFeeAmount || order.partnerFeeAmount === "0") {
    return false;
  }

  // Identify partner user ID
  let targetUserId = order.partnerUserId;
  if (!targetUserId && order.apiKeyId) {
    const keyRec = await getApiKeyById(order.apiKeyId);
    if (keyRec?.userId) {
      targetUserId = keyRec.userId;
    }
  }

  if (!targetUserId) {
    console.log(`[PartnerBalanceStore] Order ${order.swapId} has partner fee but no associated partner userId.`);
    return false;
  }

  const db = await getMongoDb();

  // MongoDB atomic lock: lock feeCredited = true so concurrent queries don't double-credit
  if (db) {
    const lockRes = await db.collection("proxy_swap_orders").updateOne(
      { swapId: order.swapId, feeCredited: { $ne: true } },
      { $set: { feeCredited: true, feeCreditedAt: Date.now() } }
    );
    if (lockRes.matchedCount === 0) {
      return false; // Another concurrent call already claimed credit
    }
  }

  // Compute live USD fee amount
  const decimals = getDecimalsForAsset(order.fromAsset);
  const { humanAmount, pricePerToken, usdValue } = await calculateTokenUsdValue(
    order.partnerFeeAmount,
    order.fromAsset,
    decimals
  );

  console.log(
    `[PartnerBalanceStore] Crediting settled fee for swap ${order.swapId} to partner ${targetUserId}: ${humanAmount} ${order.fromAsset} @ $${pricePerToken} = $${usdValue} USD`
  );

  const creditId = `cred_${order.swapId}`;
  const creditRecord: PartnerFeeCreditRecord = {
    id: creditId,
    partnerUserId: targetUserId,
    apiKeyId: order.apiKeyId || null,
    swapId: order.swapId,
    chain: order.chain,
    fromAsset: order.fromAsset,
    tokenAmount: order.partnerFeeAmount,
    humanTokenAmount: humanAmount,
    usdRate: pricePerToken,
    feeUsd: usdValue,
    settledAt: Date.now(),
  };

  // Update order record with exact USD credited
  await updateProxySwapOrder(order.swapId, {
    feeCredited: true,
    feeCreditedAt: Date.now(),
    partnerFeeUsd: usdValue,
  }).catch(() => {});

  if (db) {
    try {
      await db.collection<PartnerFeeCreditRecord>("partner_fee_credits").updateOne(
        { id: creditId },
        { $set: creditRecord },
        { upsert: true }
      );

      await db.collection("partner_balances").updateOne(
        { userId: targetUserId },
        {
          $inc: {
            availableBalanceUsd: usdValue,
            totalEarnedUsd: usdValue,
            settledSwapsCount: 1,
          },
          $set: { updatedAt: Date.now() },
        },
        { upsert: true }
      );
      return true;
    } catch (dbErr) {
      console.error("[PartnerBalanceStore] DB credit update error:", dbErr);
    }
  }

  // Memory fallback
  memoryCredits.set(creditId, creditRecord);
  const existing = memoryBalances.get(targetUserId) || {
    userId: targetUserId,
    availableBalanceUsd: 0,
    pendingPayoutUsd: 0,
    totalEarnedUsd: 0,
    totalWithdrawnUsd: 0,
    settledSwapsCount: 0,
    updatedAt: Date.now(),
  };
  existing.availableBalanceUsd += usdValue;
  existing.totalEarnedUsd += usdValue;
  existing.settledSwapsCount += 1;
  existing.updatedAt = Date.now();
  memoryBalances.set(targetUserId, existing);

  return true;
}

/**
 * Partner submits a payout request.
 * Atomically deducts from availableBalanceUsd and adds to pendingPayoutUsd.
 */
export async function requestPartnerPayout(params: {
  userId: string;
  partnerWalletAddress?: string;
  amountUsd: number;
  payoutOption: "ltc" | "sol" | "usdt-polygon" | "usdc-base";
  destinationAddress: string;
}): Promise<PartnerPayoutRequest> {
  const { userId, partnerWalletAddress, amountUsd, payoutOption, destinationAddress } = params;

  if (typeof amountUsd !== "number" || isNaN(amountUsd) || amountUsd < MIN_PAYOUT_AMOUNT_USD) {
    throw new Error(`Minimum payout request is $${MIN_PAYOUT_AMOUNT_USD.toFixed(2)} USD.`);
  }

  const opt = SUPPORTED_PAYOUT_OPTIONS.find((o) => o.id === payoutOption);
  if (!opt) {
    throw new Error("Invalid payout option selected. Choose LTC, SOL, USDT (Polygon), or USDC (Base).");
  }

  const cleanDest = destinationAddress.trim();
  const validation = validateAddressForOption(payoutOption, cleanDest);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid destination address.");
  }

  const db = await getMongoDb();
  const roundedAmount = Math.round(amountUsd * 100) / 100;

  if (db) {
    // Atomic deduction guard: only decrement if availableBalanceUsd >= roundedAmount
    const updateRes = await db.collection("partner_balances").updateOne(
      { userId, availableBalanceUsd: { $gte: roundedAmount } },
      {
        $inc: {
          availableBalanceUsd: -roundedAmount,
          pendingPayoutUsd: roundedAmount,
        },
        $set: { updatedAt: Date.now() },
      }
    );

    if (updateRes.matchedCount === 0) {
      throw new Error("Insufficient available balance for this payout request.");
    }
  } else {
    const memBal = memoryBalances.get(userId);
    if (!memBal || memBal.availableBalanceUsd < roundedAmount) {
      throw new Error("Insufficient available balance.");
    }
    memBal.availableBalanceUsd -= roundedAmount;
    memBal.pendingPayoutUsd += roundedAmount;
    memBal.updatedAt = Date.now();
  }

  const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const ticket: PartnerPayoutRequest = {
    id: payoutId,
    partnerUserId: userId,
    partnerWalletAddress,
    amountUsd: roundedAmount,
    payoutOption,
    targetAsset: opt.asset,
    targetChain: opt.chain,
    destinationAddress: cleanDest,
    status: "PENDING",
    createdAt: Date.now(),
  };

  if (db) {
    await db.collection<PartnerPayoutRequest>("partner_payout_requests").insertOne(ticket as any);
  }
  memoryPayouts.set(payoutId, ticket);

  return ticket;
}

/**
 * Returns all payout requests submitted by a partner.
 */
export async function listPartnerPayoutRequests(userId: string): Promise<PartnerPayoutRequest[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      return (await db
        .collection<PartnerPayoutRequest>("partner_payout_requests")
        .find({ partnerUserId: userId } as any)
        .sort({ createdAt: -1 })
        .toArray()) as PartnerPayoutRequest[];
    }
  } catch (err) {
    console.warn("[PartnerBalanceStore] listPartnerPayoutRequests warning:", err);
  }

  return Array.from(memoryPayouts.values())
    .filter((p) => p.partnerUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Returns fee credits for a partner.
 */
export async function listPartnerFeeCredits(userId: string, limit = 50): Promise<PartnerFeeCreditRecord[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      return (await db
        .collection<PartnerFeeCreditRecord>("partner_fee_credits")
        .find({ partnerUserId: userId } as any)
        .sort({ settledAt: -1 })
        .limit(limit)
        .toArray()) as PartnerFeeCreditRecord[];
    }
  } catch (err) {
    console.warn("[PartnerBalanceStore] listPartnerFeeCredits warning:", err);
  }

  return Array.from(memoryCredits.values())
    .filter((c) => c.partnerUserId === userId)
    .sort((a, b) => b.settledAt - a.settledAt)
    .slice(0, limit);
}

// ── Admin Payout Operations ──

export async function listAdminPayoutRequests(status?: string): Promise<PartnerPayoutRequest[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const query: any = {};
      if (status && status !== "ALL") {
        query.status = status;
      }
      return (await db
        .collection<PartnerPayoutRequest>("partner_payout_requests")
        .find(query as any)
        .sort({ createdAt: -1 })
        .toArray()) as PartnerPayoutRequest[];
    }
  } catch (err) {
    console.warn("[PartnerBalanceStore] listAdminPayoutRequests warning:", err);
  }

  const all = Array.from(memoryPayouts.values());
  if (status && status !== "ALL") {
    return all.filter((p) => p.status === status).sort((a, b) => b.createdAt - a.createdAt);
  }
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function completeAdminPayout(
  payoutId: string,
  txHash: string,
  adminIdentifier: string
): Promise<PartnerPayoutRequest> {
  const cleanTx = (txHash || "").trim();
  if (!cleanTx) {
    throw new Error("Transaction hash is required to complete payout.");
  }

  const db = await getMongoDb();
  let ticket: PartnerPayoutRequest | null = null;

  if (db) {
    ticket = (await db.collection<PartnerPayoutRequest>("partner_payout_requests").findOne({ id: payoutId } as any)) as PartnerPayoutRequest | null;
  } else {
    ticket = memoryPayouts.get(payoutId) || null;
  }

  if (!ticket) throw new Error(`Payout request '${payoutId}' not found.`);
  if (ticket.status === "COMPLETED") throw new Error("Payout is already marked completed.");
  if (ticket.status === "REJECTED") throw new Error("Cannot complete a rejected payout.");

  const now = Date.now();
  ticket.status = "COMPLETED";
  ticket.txHash = cleanTx;
  ticket.processedAt = now;
  ticket.processedBy = adminIdentifier;

  if (db) {
    await db.collection("partner_payout_requests").updateOne(
      { id: payoutId },
      { $set: { status: "COMPLETED", txHash: cleanTx, processedAt: now, processedBy: adminIdentifier } }
    );

    // Deduct pending and increment totalWithdrawn
    await db.collection("partner_balances").updateOne(
      { userId: ticket.partnerUserId },
      {
        $inc: {
          pendingPayoutUsd: -ticket.amountUsd,
          totalWithdrawnUsd: ticket.amountUsd,
        },
        $set: { updatedAt: now },
      }
    );
  } else {
    memoryPayouts.set(payoutId, ticket);
    const bal = memoryBalances.get(ticket.partnerUserId);
    if (bal) {
      bal.pendingPayoutUsd -= ticket.amountUsd;
      bal.totalWithdrawnUsd += ticket.amountUsd;
      bal.updatedAt = now;
    }
  }

  return ticket;
}

export async function rejectAdminPayout(
  payoutId: string,
  reason: string,
  adminIdentifier: string
): Promise<PartnerPayoutRequest> {
  const cleanReason = (reason || "").trim() || "Rejected by administrator";

  const db = await getMongoDb();
  let ticket: PartnerPayoutRequest | null = null;

  if (db) {
    ticket = (await db.collection<PartnerPayoutRequest>("partner_payout_requests").findOne({ id: payoutId } as any)) as PartnerPayoutRequest | null;
  } else {
    ticket = memoryPayouts.get(payoutId) || null;
  }

  if (!ticket) throw new Error(`Payout request '${payoutId}' not found.`);
  if (ticket.status === "COMPLETED") throw new Error("Cannot reject an already completed payout.");
  if (ticket.status === "REJECTED") throw new Error("Payout is already rejected.");

  const now = Date.now();
  ticket.status = "REJECTED";
  ticket.adminNote = cleanReason;
  ticket.processedAt = now;
  ticket.processedBy = adminIdentifier;

  if (db) {
    await db.collection("partner_payout_requests").updateOne(
      { id: payoutId },
      { $set: { status: "REJECTED", adminNote: cleanReason, processedAt: now, processedBy: adminIdentifier } }
    );

    // Refund pending amount back to available balance!
    await db.collection("partner_balances").updateOne(
      { userId: ticket.partnerUserId },
      {
        $inc: {
          pendingPayoutUsd: -ticket.amountUsd,
          availableBalanceUsd: ticket.amountUsd,
        },
        $set: { updatedAt: now },
      }
    );
  } else {
    memoryPayouts.set(payoutId, ticket);
    const bal = memoryBalances.get(ticket.partnerUserId);
    if (bal) {
      bal.pendingPayoutUsd -= ticket.amountUsd;
      bal.availableBalanceUsd += ticket.amountUsd;
      bal.updatedAt = now;
    }
  }

  return ticket;
}
