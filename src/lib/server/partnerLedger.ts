import { getMongoDb } from "./mongodb";
import { listApiKeysForUser, ApiKeyRecord } from "./apiKeysStore";
import { PayInSession, PayLink, listPayLinks, listAllPayInSessions } from "./payStore";
import { ProxySwapOrder, getProxyOrderBySwapId, sanitizeProxyOrder } from "./proxySwapStore";
import { DirectSwapOrder, getDirectSwapBySwapId } from "./directSwapStore";
import { getSwapStatus } from "./swapRouter";

export {
  type PartnerTxType,
  type PartnerTxStatus,
  type PartnerTransaction,
  type PartnerMetrics,
  getExplorerTxUrl,
} from "../partnerTypes";
import {
  PartnerTxType,
  PartnerTxStatus,
  PartnerTransaction,
  PartnerMetrics,
  getExplorerTxUrl,
} from "../partnerTypes";

function getDecimalsForAsset(assetId?: string, symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT")) return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("BTC") || sym.includes("WBTC")) return 8;
  return 18;
}

function formatAtomicToHuman(atomic: string | undefined, decimals: number): string {
  if (!atomic || atomic === "0") return "0";
  try {
    const raw = Number(BigInt(atomic)) / Math.pow(10, decimals);
    return raw.toFixed(Math.min(6, decimals)).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

function normalizePayInStatus(raw: string): PartnerTxStatus {
  switch (raw) {
    case "PAID":
    case "COMPLETED":
    case "STORED_IN_REFUND_WALLET":
      return "COMPLETED";
    case "AWAITING_PAYMENT":
    case "DETECTED":
    case "CONVERTING":
    case "PAYING":
    case "SWEEPING":
      return "PENDING";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "FAILED";
  }
}

function normalizePayLinkStatus(raw: string): PartnerTxStatus {
  switch (raw) {
    case "PAID":
      return "COMPLETED";
    case "ACTIVE":
    case "AWAITING_FUNDING":
    case "CLAIMING":
      return "PENDING";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "FAILED";
  }
}

function normalizeProxySwapStatus(raw: string): PartnerTxStatus {
  switch (raw) {
    case "SETTLED":
    case "FORWARDED":
      return "COMPLETED";
    case "PENDING_DEPOSIT":
    case "DETECTED":
    case "FORWARDING":
      return "PENDING";
    case "EXPIRED":
      return "EXPIRED";
    default:
      return "FAILED";
  }
}

function normalizeDirectSwapStatus(raw?: string): PartnerTxStatus {
  const s = (raw || "").toUpperCase();
  if (s === "COMPLETED" || s === "SETTLED" || s === "SUCCESS") return "COMPLETED";
  if (s === "PENDING_DEPOSIT" || s === "PENDING" || s === "KNOWN_DEPOSIT_TX" || s === "PROCESSING") return "PENDING";
  if (s === "EXPIRED" || s === "INCOMPLETE_DEPOSIT") return "EXPIRED";
  return "FAILED";
}

/**
 * Builds user API key lookup structures.
 */
export async function getPartnerKeysContext(userId: string) {
  const userKeys = await listApiKeysForUser(userId);
  const keyIds = userKeys.map((k) => k.id);
  const keyMap = new Map<string, ApiKeyRecord>();
  for (const k of userKeys) {
    keyMap.set(k.id, k);
  }
  return { userKeys, keyIds, keyMap };
}

/**
 * Maps a PayInSession into a unified PartnerTransaction.
 */
function mapPayInSessionToTx(
  s: PayInSession,
  keyMap: Map<string, ApiKeyRecord>
): PartnerTransaction {
  const normStatus = normalizePayInStatus(s.status);
  const keyRec = s.apiKeyId ? keyMap.get(s.apiKeyId) : undefined;
  const keyLabel = keyRec ? (keyRec.label || `${keyRec.keyPrefix}...${keyRec.keyLast4}`) : "Checkout Link";
  const amountUsd = parseFloat(s.expectedUsdc) || ((s.amountINR || 0) / 90);

  return {
    id: s.id,
    type: "payin_session",
    productLabel: "Pay-In Checkout",
    apiKeyId: s.apiKeyId || null,
    apiKeyLabel: keyLabel,
    status: normStatus,
    rawStatus: s.status,
    amount: s.expectedUsdc ? `${s.expectedUsdc} USDC` : `${s.amountINR} INR`,
    currency: "USDC",
    amountUsdEstimate: amountUsd,
    fiatAmount: s.amountINR,
    fiatCurrency: "INR",
    partnerFeeAmount: null,
    partnerFeeCurrency: null,
    partnerFeeUsdEstimate: 0,
    chain: "base",
    destinationChain: "base",
    fromAsset: "USDC",
    toAsset: "INR",
    recipient: s.recipientUpi,
    customerIdentifier: s.recipientUpi,
    txHash: s.completedTxHash || s.txHash || null,
    depositAddress: s.payinAddress,
    explorerUrl: getExplorerTxUrl("base", s.completedTxHash || s.txHash),
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    settledAt: s.settledAt,
    source: s.source || (s.apiKeyId ? "api" : s.parentLinkId ? "checkout" : "app"),
    details: {
      rate: s.rate,
      recipientUpi: s.recipientUpi,
      parentLinkId: s.parentLinkId,
      discrepancyType: s.discrepancyType,
      refundStatus: s.refundStatus,
    },
  };
}

/**
 * Maps a PayLink into a unified PartnerTransaction.
 */
function mapPayLinkToTx(
  l: PayLink,
  keyMap: Map<string, ApiKeyRecord>
): PartnerTransaction {
  const normStatus = normalizePayLinkStatus(l.status);
  const keyRec = l.apiKeyId ? keyMap.get(l.apiKeyId) : undefined;
  const keyLabel = keyRec ? (keyRec.label || `${keyRec.keyPrefix}...${keyRec.keyLast4}`) : "Dashboard";
  const amountUsd = parseFloat(l.estimatedUsdc) || ((l.amountINR || 0) / 90);

  return {
    id: l.id,
    type: "pay_link",
    productLabel: l.mode === "disburse" ? "Claim Escrow" : "Pay Link",
    apiKeyId: l.apiKeyId || null,
    apiKeyLabel: keyLabel,
    status: normStatus,
    rawStatus: l.status,
    amount: l.estimatedUsdc ? `${l.estimatedUsdc} USDC` : `${l.amountINR} INR`,
    currency: "USDC",
    amountUsdEstimate: amountUsd,
    fiatAmount: l.amountINR,
    fiatCurrency: "INR",
    partnerFeeAmount: null,
    partnerFeeCurrency: null,
    partnerFeeUsdEstimate: 0,
    chain: "base",
    destinationChain: "base",
    fromAsset: "USDC",
    toAsset: "INR",
    recipient: l.recipientUpi,
    customerIdentifier: l.title || l.recipientUpi,
    txHash: l.txHash || null,
    depositAddress: l.escrowAddress || null,
    explorerUrl: getExplorerTxUrl("base", l.txHash),
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    settledAt: l.paidAt || l.claimedAt,
    source: l.apiKeyId ? "api" : "app",
    details: {
      mode: l.mode,
      title: l.title,
      rate: l.rate,
      totalPaidCount: l.totalPaidCount,
      totalVolumeINR: l.totalVolumeINR,
    },
  };
}

/**
 * Maps a ProxySwapOrder into a unified PartnerTransaction.
 */
function mapProxySwapToTx(
  o: ProxySwapOrder,
  keyMap: Map<string, ApiKeyRecord>
): PartnerTransaction {
  const normStatus = normalizeProxySwapStatus(o.status);
  const keyRec = o.apiKeyId ? keyMap.get(o.apiKeyId) : undefined;
  const keyLabel = keyRec ? (keyRec.label || `${keyRec.keyPrefix}...${keyRec.keyLast4}`) : "Partner API";

  const decimals = getDecimalsForAsset(o.originAssetId, o.fromAsset);
  const partnerFeeFormatted = formatAtomicToHuman(o.partnerFeeAmount, decimals);
  const isUsdPegged = (o.fromAsset || "").toUpperCase().includes("USD");

  const amountNumber = parseFloat(o.totalAmountFormatted) || (Number(o.totalAmountIn) / Math.pow(10, decimals));
  const amountUsdEstimate = isUsdPegged ? amountNumber : amountNumber;
  const partnerFeeNumber = parseFloat(partnerFeeFormatted);
  const partnerFeeUsdEstimate = isUsdPegged ? partnerFeeNumber : partnerFeeNumber;

  const primaryTxHash = o.forwardTxHash || o.depositTxHash || o.feeTxHash || null;

  return {
    id: o.swapId,
    type: "swap",
    productLabel: "Cross-Chain Swap",
    apiKeyId: o.apiKeyId || null,
    apiKeyLabel: keyLabel,
    status: normStatus,
    rawStatus: o.status,
    amount: `${o.totalAmountFormatted} ${o.fromAsset}`,
    currency: o.fromAsset,
    amountUsdEstimate,
    partnerFeeAmount: partnerFeeNumber > 0 ? `${partnerFeeFormatted} ${o.fromAsset}` : "0",
    partnerFeeCurrency: o.fromAsset,
    partnerFeeUsdEstimate,
    chain: o.chain,
    destinationChain: o.destinationChain,
    fromAsset: o.fromAsset,
    toAsset: o.toAsset,
    recipient: o.recipient,
    customerIdentifier: o.recipient,
    txHash: primaryTxHash,
    depositAddress: o.proxyDepositAddress,
    explorerUrl: getExplorerTxUrl(o.chain, primaryTxHash),
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    settledAt: o.status === "SETTLED" ? o.createdAt : undefined,
    source: o.source || (o.apiKeyId ? "api" : "app"),
    details: {
      netSwapAmount: o.netSwapAmount,
      feeAmount: o.feeAmount,
      partnerFeeBps: o.partnerFeeBps,
      partnerFeeRecipient: o.partnerFeeRecipient,
      zkpayFeeAmount: o.zkpayFeeAmount,
      solverDepositAddress: o.solverDepositAddress,
      depositTxHash: o.depositTxHash,
      forwardTxHash: o.forwardTxHash,
      feeTxHash: o.feeTxHash,
    },
  };
}

/**
 * Maps a DirectSwapOrder into a unified PartnerTransaction.
 */
function mapDirectSwapToTx(
  o: DirectSwapOrder,
  keyMap: Map<string, ApiKeyRecord>
): PartnerTransaction {
  const normStatus = normalizeDirectSwapStatus(o.lastKnownStatus);
  const keyRec = o.apiKeyId ? keyMap.get(o.apiKeyId) : undefined;
  const keyLabel = keyRec ? (keyRec.label || `${keyRec.keyPrefix}...${keyRec.keyLast4}`) : "Partner API";

  const decimals = getDecimalsForAsset(o.originAssetId, o.fromAsset);
  const amountNumber = parseFloat(o.totalAmountFormatted) || (Number(o.totalAmountIn) / Math.pow(10, decimals));

  return {
    id: o.swapId,
    type: "swap",
    productLabel: "Cross-Chain Swap",
    apiKeyId: o.apiKeyId || null,
    apiKeyLabel: keyLabel,
    status: normStatus,
    rawStatus: o.lastKnownStatus || "PENDING_DEPOSIT",
    amount: `${o.totalAmountFormatted} ${o.fromAsset}`,
    currency: o.fromAsset,
    amountUsdEstimate: amountNumber,
    partnerFeeAmount: null,
    partnerFeeCurrency: null,
    partnerFeeUsdEstimate: 0,
    chain: o.originChain,
    destinationChain: o.destinationChain,
    fromAsset: o.fromAsset,
    toAsset: o.toAsset,
    recipient: o.recipient,
    customerIdentifier: o.recipient,
    txHash: null,
    depositAddress: o.depositAddress,
    explorerUrl: null,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    source: o.source || (o.apiKeyId ? "api" : "app"),
    details: {
      estimatedAmountOut: o.estimatedAmountOut,
      solverDepositAddress: o.depositAddress,
    },
  };
}

/**
 * Calculates aggregate partner metrics (volume, counts, success rate, earnings).
 */
export async function getPartnerMetrics(
  userId: string,
  filterKeyId?: string,
  timeRange: "24h" | "7d" | "30d" | "all" = "all"
): Promise<PartnerMetrics> {
  const { userKeys, keyIds, keyMap } = await getPartnerKeysContext(userId);

  let sinceMs = 0;
  const now = Date.now();
  if (timeRange === "24h") sinceMs = now - 24 * 3600 * 1000;
  else if (timeRange === "7d") sinceMs = now - 7 * 24 * 3600 * 1000;
  else if (timeRange === "30d") sinceMs = now - 30 * 24 * 3600 * 1000;

  const validKeyIds = filterKeyId ? [filterKeyId] : keyIds;

  let allTx: PartnerTransaction[] = [];

  const db = await getMongoDb();
  if (db) {
    const swapFilter: any = { createdAt: { $gte: sinceMs } };
    const payFilter: any = { createdAt: { $gte: sinceMs } };

    if (filterKeyId) {
      swapFilter.apiKeyId = filterKeyId;
      payFilter.apiKeyId = filterKeyId;
    } else {
      const swapOr: any[] = [{ partnerUserId: userId }];
      const payOr: any[] = [{ creatorUserId: userId }];
      if (validKeyIds.length > 0) {
        swapOr.push({ apiKeyId: { $in: validKeyIds } });
        payOr.push({ apiKeyId: { $in: validKeyIds } });
      }
      swapFilter.$or = swapOr;
      payFilter.$or = payOr;
    }

    const [proxySwaps, directSwaps, payins, paylinks] = await Promise.all([
      db.collection<ProxySwapOrder>("proxy_swap_orders").find(swapFilter).toArray(),
      db.collection<DirectSwapOrder>("direct_swap_orders").find(swapFilter).toArray(),
      db.collection<PayInSession>("payin_sessions").find(payFilter).toArray(),
      db.collection<PayLink>("pay_links").find(payFilter).toArray(),
    ]);

    allTx = [
      ...proxySwaps.map((o) => mapProxySwapToTx(o, keyMap)),
      ...directSwaps.map((o) => mapDirectSwapToTx(o, keyMap)),
      ...payins.map((s) => mapPayInSessionToTx(s, keyMap)),
      ...paylinks.map((l) => mapPayLinkToTx(l, keyMap)),
    ];
  } else {
    // In-memory fallback
    const payins = listAllPayInSessions().filter((s) => {
      if (s.createdAt < sinceMs) return false;
      if (filterKeyId) return s.apiKeyId === filterKeyId;
      return s.creatorUserId === userId || (s.apiKeyId && validKeyIds.includes(s.apiKeyId));
    });

    const paylinks = listPayLinks().filter((l) => {
      if (l.createdAt < sinceMs) return false;
      if (filterKeyId) return l.apiKeyId === filterKeyId;
      return l.creatorUserId === userId || (l.apiKeyId && validKeyIds.includes(l.apiKeyId));
    });

    allTx = [
      ...payins.map((s) => mapPayInSessionToTx(s, keyMap)),
      ...paylinks.map((l) => mapPayLinkToTx(l, keyMap)),
    ];
  }

  let totalVolumeUsd = 0;
  let totalTransactions = allTx.length;
  let successfulTransactions = 0;
  let pendingTransactions = 0;
  let failedTransactions = 0;
  let estimatedPartnerEarningsUsd = 0;

  let swapsCount = 0;
  let payinsCount = 0;
  let paylinksCount = 0;

  let swapsUsd = 0;
  let payinsUsd = 0;
  let paylinksUsd = 0;

  for (const tx of allTx) {
    if (tx.status === "COMPLETED") successfulTransactions++;
    else if (tx.status === "PENDING") pendingTransactions++;
    else failedTransactions++;

    totalVolumeUsd += tx.amountUsdEstimate;
    estimatedPartnerEarningsUsd += tx.partnerFeeUsdEstimate;

    if (tx.type === "swap") {
      swapsCount++;
      swapsUsd += tx.amountUsdEstimate;
    } else if (tx.type === "payin_session") {
      payinsCount++;
      payinsUsd += tx.amountUsdEstimate;
    } else if (tx.type === "pay_link") {
      paylinksCount++;
      paylinksUsd += tx.amountUsdEstimate;
    }
  }

  const successRate =
    totalTransactions > 0
      ? Math.round((successfulTransactions / totalTransactions) * 100)
      : 100;

  const activeKeysCount = userKeys.filter((k) => k.status === "ACTIVE").length;

  return {
    totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
    totalTransactions,
    successfulTransactions,
    pendingTransactions,
    failedTransactions,
    successRate,
    estimatedPartnerEarningsUsd: Math.round(estimatedPartnerEarningsUsd * 1000) / 1000,
    breakdownByType: {
      swaps: swapsCount,
      payins: payinsCount,
      paylinks: paylinksCount,
    },
    volumeByType: {
      swapsUsd: Math.round(swapsUsd * 100) / 100,
      payinsUsd: Math.round(payinsUsd * 100) / 100,
      paylinksUsd: Math.round(paylinksUsd * 100) / 100,
    },
    activeKeysCount,
  };
}

/**
 * Retrieves a filtered, paginated transaction list for the partner.
 */
export async function getPartnerTransactions(params: {
  userId: string;
  apiKeyId?: string;
  type?: string; // "all" | "swaps" | "payins" | "paylinks"
  status?: string; // "all" | "COMPLETED" | "PENDING" | "FAILED"
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ transactions: PartnerTransaction[]; totalCount: number }> {
  const { userId, apiKeyId, type = "all", status = "all", search = "", limit = 20, offset = 0 } = params;
  const { userKeys, keyIds, keyMap } = await getPartnerKeysContext(userId);
  const validKeyIds = apiKeyId ? [apiKeyId] : keyIds;

  let allTx: PartnerTransaction[] = [];
  const db = await getMongoDb();

  const includeSwaps = type === "all" || type === "swaps" || type === "swap";
  const includePayins = type === "all" || type === "payins" || type === "payin_session";
  const includePaylinks = type === "all" || type === "paylinks" || type === "pay_link";

  if (db) {
    const swapFilter: any = {};
    const payFilter: any = {};

    if (apiKeyId) {
      swapFilter.apiKeyId = apiKeyId;
      payFilter.apiKeyId = apiKeyId;
    } else {
      const swapOr: any[] = [{ partnerUserId: userId }];
      const payOr: any[] = [{ creatorUserId: userId }];
      if (validKeyIds.length > 0) {
        swapOr.push({ apiKeyId: { $in: validKeyIds } });
        payOr.push({ apiKeyId: { $in: validKeyIds } });
      }
      swapFilter.$or = swapOr;
      payFilter.$or = payOr;
    }

    const queries: Promise<any>[] = [];
    if (includeSwaps) {
      queries.push(
        db.collection<ProxySwapOrder>("proxy_swap_orders").find(swapFilter).sort({ createdAt: -1 }).limit(500).toArray()
      );
      queries.push(
        db.collection<DirectSwapOrder>("direct_swap_orders").find(swapFilter).sort({ createdAt: -1 }).limit(500).toArray()
      );
    } else {
      queries.push(Promise.resolve([]));
      queries.push(Promise.resolve([]));
    }

    if (includePayins) {
      queries.push(
        db.collection<PayInSession>("payin_sessions").find(payFilter).sort({ createdAt: -1 }).limit(500).toArray()
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    if (includePaylinks) {
      queries.push(
        db.collection<PayLink>("pay_links").find(payFilter).sort({ createdAt: -1 }).limit(500).toArray()
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const [proxySwaps, directSwaps, payins, paylinks] = await Promise.all(queries);

    allTx = [
      ...proxySwaps.map((o: ProxySwapOrder) => mapProxySwapToTx(o, keyMap)),
      ...directSwaps.map((o: DirectSwapOrder) => mapDirectSwapToTx(o, keyMap)),
      ...payins.map((s: PayInSession) => mapPayInSessionToTx(s, keyMap)),
      ...paylinks.map((l: PayLink) => mapPayLinkToTx(l, keyMap)),
    ];
  } else {
    // In-memory fallback
    const payins = includePayins
      ? listAllPayInSessions().filter((s) => {
          if (apiKeyId) return s.apiKeyId === apiKeyId;
          return s.creatorUserId === userId || (s.apiKeyId && validKeyIds.includes(s.apiKeyId));
        })
      : [];

    const paylinks = includePaylinks
      ? listPayLinks().filter((l) => {
          if (apiKeyId) return l.apiKeyId === apiKeyId;
          return l.creatorUserId === userId || (l.apiKeyId && validKeyIds.includes(l.apiKeyId));
        })
      : [];

    allTx = [
      ...payins.map((s) => mapPayInSessionToTx(s, keyMap)),
      ...paylinks.map((l) => mapPayLinkToTx(l, keyMap)),
    ];
  }

  // Filter by status if specified
  if (status !== "all") {
    allTx = allTx.filter((tx) => tx.status === status);
  }

  // Filter by search string if specified
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    allTx = allTx.filter(
      (tx) =>
        tx.id.toLowerCase().includes(q) ||
        tx.amount.toLowerCase().includes(q) ||
        (tx.customerIdentifier && tx.customerIdentifier.toLowerCase().includes(q)) ||
        (tx.txHash && tx.txHash.toLowerCase().includes(q)) ||
        (tx.depositAddress && tx.depositAddress.toLowerCase().includes(q)) ||
        (tx.apiKeyLabel && tx.apiKeyLabel.toLowerCase().includes(q))
    );
  }

  // Sort descending by createdAt
  allTx.sort((a, b) => b.createdAt - a.createdAt);

  const totalCount = allTx.length;
  const paginated = allTx.slice(offset, offset + limit);

  return { transactions: paginated, totalCount };
}

/**
 * Fetches single transaction details for partner view, verifying user ownership.
 * Also runs live upstream status query for pending swaps.
 */
export async function getPartnerTransactionDetail(
  userId: string,
  txId: string
): Promise<PartnerTransaction | null> {
  const { userKeys, keyIds, keyMap } = await getPartnerKeysContext(userId);

  // 1. Check Proxy Swap
  const proxy = await getProxyOrderBySwapId(txId);
  if (proxy) {
    const isOwner =
      proxy.partnerUserId === userId ||
      (proxy.apiKeyId && keyIds.includes(proxy.apiKeyId));
    if (!isOwner) return null;

    // Trigger status check if pending
    if (proxy.status === "PENDING_DEPOSIT" && proxy.proxyDepositAddress) {
      try {
        await getSwapStatus(proxy.proxyDepositAddress);
      } catch {}
    }

    return mapProxySwapToTx(proxy, keyMap);
  }

  // 2. Check Direct Swap
  const direct = await getDirectSwapBySwapId(txId);
  if (direct) {
    const isOwner =
      direct.partnerUserId === userId ||
      (direct.apiKeyId && keyIds.includes(direct.apiKeyId));
    if (!isOwner) return null;

    if (direct.depositAddress) {
      try {
        await getSwapStatus(direct.depositAddress);
      } catch {}
    }

    return mapDirectSwapToTx(direct, keyMap);
  }

  // 3. Check Pay-In Session
  const db = await getMongoDb();
  let session: PayInSession | null = null;
  if (db) {
    session = await db.collection<PayInSession>("payin_sessions").findOne({ id: txId });
  }
  if (!session) {
    const all = listAllPayInSessions();
    session = all.find((s) => s.id === txId) || null;
  }

  if (session) {
    const isOwner =
      session.creatorUserId === userId ||
      (session.apiKeyId && keyIds.includes(session.apiKeyId));
    if (!isOwner) return null;
    return mapPayInSessionToTx(session, keyMap);
  }

  // 4. Check Pay Link
  let link: PayLink | null = null;
  if (db) {
    link = await db.collection<PayLink>("pay_links").findOne({ id: txId });
  }
  if (!link) {
    const allLinks = listPayLinks();
    link = allLinks.find((l) => l.id === txId) || null;
  }

  if (link) {
    const isOwner =
      link.creatorUserId === userId ||
      (link.apiKeyId && keyIds.includes(link.apiKeyId));
    if (!isOwner) return null;
    return mapPayLinkToTx(link, keyMap);
  }

  return null;
}
