import { getMongoDb } from "./mongodb";
import { ProxySwapOrder } from "./proxySwapStore";
import { DirectSwapOrder } from "./directSwapStore";
import { listAllApiKeys } from "./apiKeysStore";

export type AdminTxChannel = "app" | "api" | "checkout";
export type AdminTxCategory = "swap" | "payment";
export type AdminTxStatus = "COMPLETED" | "PENDING" | "FAILED" | "REFUNDED" | "EXPIRED";

export interface AdminSystemTransaction {
  id: string;
  category: AdminTxCategory;
  channel: AdminTxChannel;
  title: string;
  status: AdminTxStatus;
  rawStatus: string;
  chain: string;
  destinationChain: string;
  fromAsset: string;
  toAsset: string;
  amountHuman: string;
  amountUsdEstimate: number;
  zkpayFeeUsdEstimate: number;
  partnerFeeUsdEstimate?: number;
  fiatAmount?: number;
  recipient: string;
  depositAddress?: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  apiKeyId?: string | null;
  apiKeyLabel?: string | null;
  createdAt: number;
}

export interface AdminSystemMetrics {
  totalVolumeUsd: number;
  totalTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  refundedTransactions: number;
  successRate: number;
  totalFeesUsd: number;
  volumeByCategory: {
    paymentsUsd: number;
    swapsUsd: number;
  };
  countsByChannel: {
    appCount: number;
    apiCount: number;
  };
  chainBreakdown: Record<string, number>;
}

export interface GetAdminTransactionsOptions {
  page?: number;
  limit?: number;
  channel?: "all" | AdminTxChannel;
  category?: "all" | AdminTxCategory;
  status?: "all" | AdminTxStatus;
  chain?: string;
  timeRange?: "all" | "24h" | "7d" | "30d";
  search?: string;
}

export type AdminLedgerEntry = AdminSystemTransaction;

function normalizeStatus(raw: string): AdminTxStatus {
  const s = (raw || "").toUpperCase();
  if (["SETTLED", "SUCCESS", "COMPLETED", "FORWARDED_TO_SOLVER"].includes(s)) return "COMPLETED";
  if (["REFUNDED"].includes(s)) return "REFUNDED";
  if (["EXPIRED"].includes(s)) return "EXPIRED";
  if (["FAILED", "SWEEP_FAILED"].includes(s)) return "FAILED";
  return "PENDING";
}

function getExplorerUrl(chain: string, txHash?: string | null): string | null {
  if (!txHash) return null;
  const c = (chain || "").toLowerCase();
  if (c === "sol") return `https://solscan.io/tx/${txHash}`;
  if (c === "ltc") return `https://litecoinspace.org/tx/${txHash}`;
  if (c === "polygon") return `https://polygonscan.com/tx/${txHash}`;
  if (c === "arb") return `https://arbiscan.io/tx/${txHash}`;
  if (c === "bsc") return `https://bscscan.com/tx/${txHash}`;
  if (c === "eth") return `https://etherscan.io/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

export async function getAdminSystemTransactions(
  options: GetAdminTransactionsOptions = {}
): Promise<{
  transactions: AdminSystemTransaction[];
  metrics: AdminSystemMetrics;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const {
    page = 1,
    limit = 50,
    channel = "all",
    category = "all",
    status = "all",
    chain = "all",
    timeRange = "all",
    search = "",
  } = options;

  const db = await getMongoDb();
  let entries: AdminSystemTransaction[] = [];

  if (db) {
    const allKeys = await listAllApiKeys();
    const keyMap = new Map(allKeys.map((k) => [k.id, k.label || `${k.keyPrefix}...${k.keyLast4}`]));

    let sinceMs = 0;
    const now = Date.now();
    if (timeRange === "24h") sinceMs = now - 24 * 3600 * 1000;
    else if (timeRange === "7d") sinceMs = now - 7 * 24 * 3600 * 1000;
    else if (timeRange === "30d") sinceMs = now - 30 * 24 * 3600 * 1000;

    const filter: any = sinceMs > 0 ? { createdAt: { $gte: sinceMs } } : {};

    const [proxySwaps, directSwaps] = await Promise.all([
      db.collection<ProxySwapOrder>("proxy_swap_orders").find(filter).sort({ createdAt: -1 }).limit(500).toArray(),
      db.collection<DirectSwapOrder>("direct_swap_orders").find(filter).sort({ createdAt: -1 }).limit(500).toArray(),
    ]);

    for (const o of proxySwaps) {
      const txHash = o.forwardTxHash || o.depositTxHash || o.feeTxHash || null;
      const usdEst = parseFloat(o.totalAmountFormatted) || 0;
      const totalBps = (o.zkpayFeeBps || 50) + (o.partnerFeeBps || 50);
      const feeUsdEst = (usdEst * totalBps) / 10000;
      const txChannel: AdminTxChannel = o.apiKeyId || o.source === "api" ? "api" : "app";

      entries.push({
        id: o.swapId,
        category: "swap",
        channel: txChannel,
        title: `${o.fromAsset} → ${o.toAsset} Swap`,
        status: normalizeStatus(o.status),
        rawStatus: o.status,
        chain: o.chain,
        destinationChain: o.destinationChain,
        fromAsset: o.fromAsset,
        toAsset: o.toAsset,
        amountHuman: `${o.totalAmountFormatted} ${o.fromAsset}`,
        amountUsdEstimate: usdEst,
        zkpayFeeUsdEstimate: feeUsdEst / 2,
        partnerFeeUsdEstimate: feeUsdEst / 2,
        recipient: o.recipient,
        depositAddress: o.proxyDepositAddress,
        txHash,
        explorerUrl: getExplorerUrl(o.chain, txHash),
        apiKeyId: o.apiKeyId || null,
        apiKeyLabel: o.apiKeyId ? keyMap.get(o.apiKeyId) || null : null,
        createdAt: o.createdAt,
      });
    }

    for (const o of directSwaps) {
      const usdEst = parseFloat(o.totalAmountFormatted) || 0;
      const txChannel: AdminTxChannel = o.apiKeyId || o.source === "api" ? "api" : "app";

      entries.push({
        id: o.swapId,
        category: "swap",
        channel: txChannel,
        title: `${o.fromAsset} → ${o.toAsset} Direct Swap`,
        status: normalizeStatus(o.lastKnownStatus || "PENDING"),
        rawStatus: o.lastKnownStatus || "PENDING_DEPOSIT",
        chain: o.originChain,
        destinationChain: o.destinationChain,
        fromAsset: o.fromAsset,
        toAsset: o.toAsset,
        amountHuman: `${o.totalAmountFormatted} ${o.fromAsset}`,
        amountUsdEstimate: usdEst,
        zkpayFeeUsdEstimate: 0,
        partnerFeeUsdEstimate: 0,
        recipient: o.recipient,
        depositAddress: o.depositAddress,
        txHash: null,
        explorerUrl: null,
        apiKeyId: o.apiKeyId || null,
        apiKeyLabel: o.apiKeyId ? keyMap.get(o.apiKeyId) || null : null,
        createdAt: o.createdAt,
      });
    }
  }

  // Compute aggregate metrics before pagination
  let totalVolumeUsd = 0;
  let completedTransactions = 0;
  let pendingTransactions = 0;
  let failedTransactions = 0;
  let refundedTransactions = 0;
  let totalFeesUsd = 0;
  let appCount = 0;
  let apiCount = 0;
  const chainBreakdown: Record<string, number> = {};

  for (const tx of entries) {
    totalVolumeUsd += tx.amountUsdEstimate;
    totalFeesUsd += tx.zkpayFeeUsdEstimate;
    if (tx.status === "COMPLETED") completedTransactions++;
    else if (tx.status === "PENDING") pendingTransactions++;
    else if (tx.status === "REFUNDED") refundedTransactions++;
    else failedTransactions++;

    if (tx.channel === "api") apiCount++;
    else appCount++;

    chainBreakdown[tx.chain] = (chainBreakdown[tx.chain] || 0) + 1;
  }

  const totalTransactions = entries.length;
  const successRate =
    totalTransactions > 0 ? Math.round((completedTransactions / totalTransactions) * 100) : 100;

  const metrics: AdminSystemMetrics = {
    totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
    totalTransactions,
    completedTransactions,
    pendingTransactions,
    failedTransactions,
    refundedTransactions,
    successRate,
    totalFeesUsd: Math.round(totalFeesUsd * 100) / 100,
    volumeByCategory: {
      paymentsUsd: 0,
      swapsUsd: Math.round(totalVolumeUsd * 100) / 100,
    },
    countsByChannel: {
      appCount,
      apiCount,
    },
    chainBreakdown,
  };

  // Apply filters
  let filtered = entries;
  if (channel !== "all") filtered = filtered.filter((e) => e.channel === channel);
  if (category !== "all") filtered = filtered.filter((e) => e.category === category);
  if (status !== "all") filtered = filtered.filter((e) => e.status === status);
  if (chain !== "all") filtered = filtered.filter((e) => e.chain.toLowerCase() === chain.toLowerCase());
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.recipient.toLowerCase().includes(q) ||
        (e.depositAddress && e.depositAddress.toLowerCase().includes(q)) ||
        (e.txHash && e.txHash.toLowerCase().includes(q)) ||
        (e.apiKeyLabel && e.apiKeyLabel.toLowerCase().includes(q))
    );
  }

  filtered.sort((a, b) => b.createdAt - a.createdAt);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (Math.max(1, page) - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    transactions: paginated,
    metrics,
    pagination: {
      page: Math.max(1, page),
      limit,
      total,
      totalPages,
    },
  };
}

export async function exportAdminTransactionsCsv(
  options: GetAdminTransactionsOptions = {}
): Promise<string> {
  const { transactions } = await getAdminSystemTransactions({ ...options, page: 1, limit: 1000 });
  const headers = [
    "ID",
    "Status",
    "Channel",
    "Title",
    "OriginChain",
    "DestinationChain",
    "Amount",
    "UsdEstimate",
    "Recipient",
    "DepositAddress",
    "TxHash",
    "CreatedAt",
  ];
  const rows = transactions.map((tx) =>
    [
      tx.id,
      tx.status,
      tx.channel,
      `"${tx.title.replace(/"/g, '""')}"`,
      tx.chain,
      tx.destinationChain,
      `"${tx.amountHuman}"`,
      tx.amountUsdEstimate.toFixed(2),
      tx.recipient,
      tx.depositAddress || "",
      tx.txHash || "",
      new Date(tx.createdAt).toISOString(),
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export const getAdminLedger = getAdminSystemTransactions;
