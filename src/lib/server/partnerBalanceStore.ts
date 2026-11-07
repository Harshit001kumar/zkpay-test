import { getMongoDb } from "./mongodb";
import { ProxySwapOrder, updateProxySwapOrder } from "./proxySwapStore";
import { calculateTokenUsdValue } from "./priceService";
import { getApiKeyById, listApiKeysForUser, findUserIdByWalletAddress } from "./apiKeysStore";
import { SWAP_ALLOWED_TOKENS } from "@/lib/constants";

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

function resolveOrderAssetMeta(order: { fromAsset?: string; originAssetId?: string }): { symbol: string; decimals: number } {
  const match = SWAP_ALLOWED_TOKENS.find(
    (t) => t.assetId.toLowerCase() === (order.originAssetId || "").toLowerCase()
  );
  if (match) {
    return { symbol: match.symbol.toUpperCase(), decimals: match.decimals };
  }
  let sym = (order.fromAsset || "").toUpperCase();
  if (sym === "BASE" || sym === "ARB") sym = "ETH";
  else if (sym === "BSC") sym = "BNB";
  else if (sym === "POLYGON") sym = "POL";
  else if (sym === "V2_1") {
    sym = order.originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") ? "USDT" : "USDC";
  }
  return { symbol: sym || "USDC", decimals: getDecimalsForAsset(sym) };
}

function getDecimalsForAsset(symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT") || sym === "V2_1") return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("BTC") || sym.includes("WBTC") || sym.includes("LTC")) return 8;
  return 18;
}

// In-memory fallback if MongoDB is briefly offline
const memoryBalances = new Map<string, PartnerBalanceRecord>();
const memoryCredits = new Map<string, PartnerFeeCreditRecord>();
const memoryPayouts = new Map<string, PartnerPayoutRequest>();

/**
 * Scans all proxy swap orders belonging to `userId` (or any of `userId`'s API keys)
 * that have not yet been credited:
 * - If status === "SETTLED", immediately credits the partner's 50% USD fee share.
 * - If status === "FORWARDED", checks upstream NEAR Intents status and, if settled,
 *   marks the order "SETTLED" and credits the partner immediately.
 */
export async function reconcilePartnerSwaps(userId: string): Promise<void> {
  try {
    const db = await getMongoDb();
    if (!db) return;

    const userKeys = await listApiKeysForUser(userId);
    const keyIds = userKeys.map((k) => k.id);
    const walletAddrs = Array.from(
      new Set(
        userKeys
          .map((k) => k.walletAddress?.toLowerCase())
          .filter(Boolean) as string[]
      )
    );

    const orConditions: any[] = [{ partnerUserId: userId }];
    if (keyIds.length > 0) {
      orConditions.push({ apiKeyId: { $in: keyIds } });
    }
    if (walletAddrs.length > 0) {
      for (const w of walletAddrs) {
        orConditions.push({ partnerFeeRecipient: new RegExp(`^${w}$`, "i") });
      }
    }

    const uncreditedOrders = (await db
      .collection<ProxySwapOrder>("proxy_swap_orders")
      .find({
        feeCredited: { $ne: true },
        status: { $in: ["SETTLED", "FORWARDED"] },
        $or: orConditions,
      } as any)
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray()) as ProxySwapOrder[];

    for (const ord of uncreditedOrders) {
      if (!ord.partnerUserId) {
        ord.partnerUserId = userId;
      }
      if (ord.status === "SETTLED") {
        await creditPartnerFeeOnSettlement(ord);
      } else if (ord.status === "FORWARDED" && ord.solverDepositAddress) {
        try {
          const solverUrl = `https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(ord.solverDepositAddress.trim())}`;
          const headers: Record<string, string> = { Accept: "application/json" };
          if (process.env.NEAR_INTENTS_API_KEY) {
            headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
          }
          const res = await fetch(solverUrl, { headers, signal: AbortSignal.timeout(3500) }).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.status === "SUCCESS") {
              const rawOriginHash = data?.swapDetails?.originChainTxHashes?.[0]?.hash;
              const updatedOrder =
                (await updateProxySwapOrder(ord.swapId, {
                  status: "SETTLED",
                  partnerUserId: userId,
                  ...(rawOriginHash && !ord.forwardTxHash ? { forwardTxHash: rawOriginHash } : {}),
                })) || { ...ord, status: "SETTLED" as const, partnerUserId: userId };
              await creditPartnerFeeOnSettlement(updatedOrder);
            }
          }
        } catch {
          // non-fatal
        }
      }
    }

    // Also repair any existing credits that were saved with hardcoded fallback rates (e.g. 150 for SOL)
    const fallbackCredits = (await db
      .collection<PartnerFeeCreditRecord>("partner_fee_credits")
      .find({
        partnerUserId: userId,
        usdRate: { $in: [150, 2500, 70, 600, 0.089] },
      } as any)
      .limit(20)
      .toArray()) as PartnerFeeCreditRecord[];

    for (const cred of fallbackCredits) {
      try {
        const decimals = getDecimalsForAsset(cred.fromAsset);
        const { pricePerToken, usdValue } = await calculateTokenUsdValue(
          cred.tokenAmount,
          cred.fromAsset,
          decimals
        );
        if (pricePerToken > 0 && Math.abs(pricePerToken - cred.usdRate) > 0.01) {
          const deltaUsd = Math.round((usdValue - cred.feeUsd) * 10000) / 10000;
          await db.collection("partner_fee_credits").updateOne(
            { id: cred.id } as any,
            { $set: { usdRate: pricePerToken, feeUsd: usdValue } }
          );
          await updateProxySwapOrder(cred.swapId, { partnerFeeUsd: usdValue });
          if (deltaUsd !== 0) {
            await db.collection("partner_balances").updateOne(
              { userId } as any,
              {
                $inc: {
                  availableBalanceUsd: deltaUsd,
                  totalEarnedUsd: deltaUsd,
                },
                $set: { updatedAt: Date.now() },
              }
            );
          }
        }
      } catch {
        // non-fatal
      }
    }
  } catch (err) {
    console.warn("[PartnerBalanceStore] reconcilePartnerSwaps warning:", err);
  }
}

/**
 * Returns the current partner balance (after reconciling any newly settled swaps).
 */
export async function getPartnerBalance(userId: string): Promise<PartnerBalanceRecord> {
  await reconcilePartnerSwaps(userId);

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
      const record = await db.collection<PartnerBalanceRecord>("partner_balances").findOne({ userId } as any);
      if (record) {
        return {
          userId: record.userId,
          availableBalanceUsd: Math.max(0, Math.round((record.availableBalanceUsd || 0) * 10000) / 10000),
          pendingPayoutUsd: Math.max(0, Math.round((record.pendingPayoutUsd || 0) * 10000) / 10000),
          totalEarnedUsd: Math.max(0, Math.round((record.totalEarnedUsd || 0) * 10000) / 10000),
          totalWithdrawnUsd: Math.max(0, Math.round((record.totalWithdrawnUsd || 0) * 10000) / 10000),
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

  // Guard against any order that was refunded instead of settled
  if (order.error && order.error.toLowerCase().includes("refund")) {
    await updateProxySwapOrder(order.swapId, {
      status: "EXPIRED",
      feeCredited: true,
      feeAmount: "0",
      partnerFeeAmount: "0",
      zkpayFeeAmount: "0",
    }).catch(() => {});
    return false;
  }

  // 1. Identify partner user ID (via partnerUserId, apiKeyId, or partnerFeeRecipient wallet)
  let targetUserId = order.partnerUserId || null;
  if (!targetUserId && order.apiKeyId) {
    const keyRec = await getApiKeyById(order.apiKeyId);
    if (keyRec?.userId) {
      targetUserId = keyRec.userId;
    }
  }
  if (!targetUserId && order.partnerFeeRecipient) {
    targetUserId = await findUserIdByWalletAddress(order.partnerFeeRecipient);
  }

  if (!targetUserId) {
    // Mark feeCredited so unlinked non-partner orders don't block the 12s sweeper queue
    await updateProxySwapOrder(order.swapId, { feeCredited: true }).catch(() => {});
    return false;
  }

  // 2. Resolve partner fee atomic amount (with automatic 50/50 percentage fee recovery if order was created without feeRecipient)
  let effectivePartnerFeeAtomic = order.partnerFeeAmount || "0";
  try {
    if (!effectivePartnerFeeAtomic || BigInt(effectivePartnerFeeAtomic) <= 0n) {
      const totalFee = BigInt(order.feeAmount || "0");
      const fixedFee = BigInt(order.fixedFeeAmount || "0");
      if (totalFee > fixedFee) {
        const percentageFee = totalFee - fixedFee;
        const partnerHalf = percentageFee - percentageFee / 2n;
        if (partnerHalf > 0n) {
          effectivePartnerFeeAtomic = partnerHalf.toString();
        }
      }
    }
  } catch {
    effectivePartnerFeeAtomic = "0";
  }

  if (!effectivePartnerFeeAtomic || effectivePartnerFeeAtomic === "0") {
    // Legitimate 0-fee settled swap (e.g. fee was below Solana rent-exempt minimum or LTC dust):
    // mark feeCredited = true so the 12s daemon does not re-scan this order forever.
    await updateProxySwapOrder(order.swapId, {
      feeCredited: true,
      partnerUserId: targetUserId,
      partnerFeeUsd: 0,
    }).catch(() => {});
    return false;
  }

  // Compute live USD fee amount BEFORE locking feeCredited so we never lock in a $0 / fake price
  const { symbol: canonicalSymbol, decimals } = resolveOrderAssetMeta(order);
  const { humanAmount, pricePerToken, usdValue } = await calculateTokenUsdValue(
    effectivePartnerFeeAtomic,
    canonicalSymbol,
    decimals
  );

  if (pricePerToken <= 0) {
    console.warn(
      `[PartnerBalanceStore] Live USD price unavailable for ${canonicalSymbol} on swap ${order.swapId}; will retry on next sweep.`
    );
    return false;
  }

  const db = await getMongoDb();

  // MongoDB atomic lock: lock feeCredited = true so concurrent queries don't double-credit
  if (db) {
    const lockRes = await db.collection("proxy_swap_orders").updateOne(
      { swapId: order.swapId, feeCredited: { $ne: true } },
      {
        $set: {
          fromAsset: canonicalSymbol,
          feeCredited: true,
          feeCreditedAt: Date.now(),
          partnerUserId: targetUserId,
          partnerFeeAmount: effectivePartnerFeeAtomic,
          partnerFeeUsd: usdValue,
        },
      }
    );
    if (lockRes.matchedCount === 0) {
      return false; // Another concurrent call already claimed credit
    }
  }

  console.log(
    `[PartnerBalanceStore] Crediting settled fee for swap ${order.swapId} to partner ${targetUserId}: ${humanAmount} ${canonicalSymbol} @ $${pricePerToken} = $${usdValue} USD`
  );

  const creditId = `cred_${order.swapId}`;
  const creditRecord: PartnerFeeCreditRecord = {
    id: creditId,
    partnerUserId: targetUserId,
    apiKeyId: order.apiKeyId || null,
    swapId: order.swapId,
    chain: order.chain,
    fromAsset: canonicalSymbol,
    tokenAmount: effectivePartnerFeeAtomic,
    humanTokenAmount: humanAmount,
    usdRate: pricePerToken,
    feeUsd: usdValue,
    settledAt: Date.now(),
  };

  // Update order record with exact USD credited
  await updateProxySwapOrder(order.swapId, {
    fromAsset: canonicalSymbol,
    feeCredited: true,
    feeCreditedAt: Date.now(),
    partnerUserId: targetUserId,
    partnerFeeAmount: effectivePartnerFeeAtomic,
    partnerFeeUsd: usdValue,
  }).catch(() => {});

  if (db) {
    try {
      await db.collection<PartnerFeeCreditRecord>("partner_fee_credits").updateOne(
        { id: creditId } as any,
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
  const roundedAmount = Math.round(amountUsd * 10000) / 10000;

  if (db) {
    // Atomic deduction guard (with 0.0001 epsilon for IEEE-754 float precision)
    const updateRes = await db.collection("partner_balances").updateOne(
      { userId, availableBalanceUsd: { $gte: roundedAmount - 0.0001 } },
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

    // Clamp tiny negative float residue to 0
    await db.collection("partner_balances").updateOne(
      { userId, availableBalanceUsd: { $lt: 0 } },
      { $set: { availableBalanceUsd: 0 } }
    ).catch(() => {});
  } else {
    const memBal = memoryBalances.get(userId);
    if (!memBal || memBal.availableBalanceUsd + 0.0001 < roundedAmount) {
      throw new Error("Insufficient available balance.");
    }
    memBal.availableBalanceUsd = Math.max(0, memBal.availableBalanceUsd - roundedAmount);
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
    const upd = await db.collection("partner_payout_requests").updateOne(
      { id: payoutId, status: { $in: ["PENDING", "PROCESSING"] } },
      { $set: { status: "COMPLETED", txHash: cleanTx, processedAt: now, processedBy: adminIdentifier } }
    );
    if (upd.matchedCount === 0) {
      throw new Error("Payout was already processed by another request.");
    }

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
    const upd = await db.collection("partner_payout_requests").updateOne(
      { id: payoutId, status: { $in: ["PENDING", "PROCESSING"] } },
      { $set: { status: "REJECTED", adminNote: cleanReason, processedAt: now, processedBy: adminIdentifier } }
    );
    if (upd.matchedCount === 0) {
      throw new Error("Payout was already processed by another request.");
    }

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
