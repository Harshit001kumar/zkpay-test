import { getMongoDb } from "./mongodb";
import { listApiKeysForUser, ApiKeyRecord } from "./apiKeysStore";
import { ProxySwapOrder, getProxyOrderBySwapId } from "./proxySwapStore";
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
  PartnerTxStatus,
  PartnerTransaction,
  PartnerMetrics,
  getExplorerTxUrl,
} from "../partnerTypes";

function getDecimalsForAsset(assetId?: string, symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT")) return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("BTC") || sym.includes("WBTC") || sym.includes("LTC")) return 8;
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

  // Resolve partner fee atomic amount (including 50% recovery if created without feeRecipient)
  let rawPartnerFeeAtomic = o.partnerFeeAmount || "0";
  try {
    if (!rawPartnerFeeAtomic || BigInt(rawPartnerFeeAtomic) <= 0n) {
      const totalFee = BigInt(o.feeAmount || "0");
      const fixedFee = BigInt(o.fixedFeeAmount || "0");
      if (totalFee > fixedFee) {
        const pctFee = totalFee - fixedFee;
        rawPartnerFeeAtomic = (pctFee - pctFee / 2n).toString();
      }
    }
  } catch {
    rawPartnerFeeAtomic = "0";
  }

  const partnerFeeFormatted = formatAtomicToHuman(rawPartnerFeeAtomic, decimals);
  const isUsdPegged = (o.fromAsset || "").toUpperCase().includes("USD");

  const amountNumber = parseFloat(o.totalAmountFormatted) || (Number(o.totalAmountIn) / Math.pow(10, decimals));
  const amountUsdEstimate = isUsdPegged ? amountNumber : amountNumber;
  const partnerFeeNumber = parseFloat(partnerFeeFormatted);
  const partnerFeeUsdEstimate =
    typeof o.partnerFeeUsd === "number" && o.partnerFeeUsd > 0
      ? o.partnerFeeUsd
      : isUsdPegged
      ? partnerFeeNumber
      : partnerFeeNumber;

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
    settledAt: o.status === "SETTLED" ? (o.feeCreditedAt || o.createdAt) : undefined,
    source: o.source || (o.apiKeyId ? "api" : "app"),
    details: {
      netSwapAmount: o.netSwapAmount,
      feeAmount: o.feeAmount,
      partnerFeeBps: o.partnerFeeBps,
      partnerFeeRecipient: o.partnerFeeRecipient,
      partnerFeeUsd: o.partnerFeeUsd,
      feeCredited: o.feeCredited,
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

  if (filterKeyId && !keyIds.includes(filterKeyId)) {
    throw new Error("Forbidden: API key does not belong to partner");
  }

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

    if (filterKeyId) {
      swapFilter.apiKeyId = filterKeyId;
    } else {
      const swapOr: any[] = [{ partnerUserId: userId }];
      if (validKeyIds.length > 0) {
        swapOr.push({ apiKeyId: { $in: validKeyIds } });
      }
      const walletAddrs = Array.from(
        new Set(userKeys.map((k) => k.walletAddress?.toLowerCase()).filter(Boolean) as string[])
      );
      for (const w of walletAddrs) {
        swapOr.push({ partnerFeeRecipient: new RegExp(`^${w}$`, "i") });
      }
      swapFilter.$or = swapOr;
    }

    const [proxySwaps, directSwaps] = await Promise.all([
      db.collection<ProxySwapOrder>("proxy_swap_orders").find(swapFilter).toArray(),
      db.collection<DirectSwapOrder>("direct_swap_orders").find(swapFilter).toArray(),
    ]);

    allTx = [
      ...proxySwaps.map((o) => mapProxySwapToTx(o, keyMap)),
      ...directSwaps.map((o) => mapDirectSwapToTx(o, keyMap)),
    ];
  }

  let totalVolumeUsd = 0;
  const totalTransactions = allTx.length;
  let successfulTransactions = 0;
  let pendingTransactions = 0;
  let failedTransactions = 0;
  let estimatedPartnerEarningsUsd = 0;
  let swapsCount = 0;
  let swapsUsd = 0;

  for (const tx of allTx) {
    if (tx.status === "COMPLETED") successfulTransactions++;
    else if (tx.status === "PENDING") pendingTransactions++;
    else failedTransactions++;

    totalVolumeUsd += tx.amountUsdEstimate;
    estimatedPartnerEarningsUsd += tx.partnerFeeUsdEstimate;
    swapsCount++;
    swapsUsd += tx.amountUsdEstimate;
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
      payins: 0,
      paylinks: 0,
    },
    volumeByType: {
      swapsUsd: Math.round(swapsUsd * 100) / 100,
      payinsUsd: 0,
      paylinksUsd: 0,
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
  type?: string; // "all" | "swaps"
  status?: string; // "all" | "COMPLETED" | "PENDING" | "FAILED"
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ transactions: PartnerTransaction[]; totalCount: number }> {
  const { userId, apiKeyId, status = "all", search = "", limit = 20, offset = 0 } = params;
  const { userKeys, keyIds, keyMap } = await getPartnerKeysContext(userId);

  if (apiKeyId && !keyIds.includes(apiKeyId)) {
    throw new Error("Forbidden: API key does not belong to partner");
  }

  const validKeyIds = apiKeyId ? [apiKeyId] : keyIds;

  let allTx: PartnerTransaction[] = [];
  const db = await getMongoDb();

  if (db) {
    const swapFilter: any = {};

    if (apiKeyId) {
      swapFilter.apiKeyId = apiKeyId;
    } else {
      const swapOr: any[] = [{ partnerUserId: userId }];
      if (validKeyIds.length > 0) {
        swapOr.push({ apiKeyId: { $in: validKeyIds } });
      }
      const walletAddrs = Array.from(
        new Set(userKeys.map((k) => k.walletAddress?.toLowerCase()).filter(Boolean) as string[])
      );
      for (const w of walletAddrs) {
        swapOr.push({ partnerFeeRecipient: new RegExp(`^${w}$`, "i") });
      }
      swapFilter.$or = swapOr;
    }

    const [proxySwaps, directSwaps] = await Promise.all([
      db.collection<ProxySwapOrder>("proxy_swap_orders").find(swapFilter).sort({ createdAt: -1 }).limit(500).toArray(),
      db.collection<DirectSwapOrder>("direct_swap_orders").find(swapFilter).sort({ createdAt: -1 }).limit(500).toArray(),
    ]);

    allTx = [
      ...proxySwaps.map((o: ProxySwapOrder) => mapProxySwapToTx(o, keyMap)),
      ...directSwaps.map((o: DirectSwapOrder) => mapDirectSwapToTx(o, keyMap)),
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
  const { keyIds, keyMap } = await getPartnerKeysContext(userId);

  // 1. Check Proxy Swap
  const proxy = await getProxyOrderBySwapId(txId);
  if (proxy) {
    const isOwner =
      proxy.partnerUserId === userId ||
      (proxy.apiKeyId && keyIds.includes(proxy.apiKeyId));
    if (!isOwner) return null;

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

  return null;
}
