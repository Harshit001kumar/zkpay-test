import { getMongoDb } from "./mongodb";
import { ProxySwapOrder } from "./proxySwapStore";
import { DirectSwapOrder } from "./directSwapStore";

export type AdminTxChannel = "app" | "api" | "checkout";
export type AdminTxCategory = "payment" | "swap";
export type AdminTxSubtype = "proxy_swap" | "direct_swap";
export type AdminTxStatus = "COMPLETED" | "PENDING" | "FAILED" | "EXPIRED" | "REFUNDED";

export interface AdminSystemTransaction {
  id: string;
  category: AdminTxCategory;
  subtype: AdminTxSubtype;
  channel: AdminTxChannel;
  title: string;
  status: AdminTxStatus;
  rawStatus: string;

  amountHuman: string;
  amountUsdEstimate: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  fromAsset: string;
  toAsset: string;
  exchangeRate?: number;

  zkpayFeeUsdEstimate: number;
  partnerFeeUsdEstimate: number;
  totalFeeUsdEstimate: number;

  chain: string;
  destinationChain: string;
  depositAddress?: string | null;
  recipient?: string | null;
  senderAddress?: string | null;

  apiKeyId?: string | null;
  apiKeyLabel?: string | null;
  creatorUserId?: string | null;

  txHash?: string | null;
  depositTxHash?: string | null;
  forwardTxHash?: string | null;
  feeTxHash?: string | null;
  explorerUrl?: string | null;

  createdAt: number;
  expiresAt?: number;
  settledAt?: number;

  details?: Record<string, any>;
}

export interface AdminSystemMetrics {
  totalVolumeUsd: number;
  totalTransactions: number;
  successfulTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  refundedTransactions: number;
  successRate: number;
  totalFeesUsd: number;

  volumeByChannel: {
    appUsd: number;
    apiUsd: number;
    checkoutUsd: number;
  };
  volumeByCategory: {
    paymentsUsd: number;
    swapsUsd: number;
  };

  countsByChannel: {
    appCount: number;
    apiCount: number;
    checkoutCount: number;
  };
  countsByCategory: {
    paymentsCount: number;
    swapsCount: number;
  };

  chainBreakdown: Record<string, { count: number; volumeUsd: number }>;
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

export interface AdminTransactionsResult {
  metrics: AdminSystemMetrics;
  transactions: AdminSystemTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getExplorerTxUrl(chain?: string, txHash?: string | null): string | null {
  if (!txHash) return null;
  const c = (chain || "").toLowerCase();
  if (c.includes("poly") || c.includes("matic")) return `https://polygonscan.com/tx/${txHash}`;
  if (c.includes("arb")) return `https://arbiscan.io/tx/${txHash}`;
  if (c.includes("bsc") || c.includes("binance")) return `https://bscscan.com/tx/${txHash}`;
  if (c.includes("sol")) return `https://solscan.io/tx/${txHash}`;
  if (c.includes("ltc") || c.includes("litecoin")) return `https://blockchair.com/litecoin/transaction/${txHash}`;
  if (c.includes("opt")) return `https://optimistic.etherscan.io/tx/${txHash}`;
  if (c.includes("eth") || c.includes("mainnet")) return `https://etherscan.io/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

function getDecimalsForAsset(assetId?: string, symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT")) return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("LTC")) return 8;
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

function normalizeProxySwapStatus(raw: string): AdminTxStatus {
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

function normalizeDirectSwapStatus(raw?: string): AdminTxStatus {
  const s = (raw || "").toUpperCase();
  if (s === "COMPLETED" || s === "SETTLED" || s === "SUCCESS") return "COMPLETED";
  if (s === "PENDING_DEPOSIT" || s === "PENDING" || s === "KNOWN_DEPOSIT_TX" || s === "PROCESSING") return "PENDING";
  if (s === "EXPIRED" || s === "INCOMPLETE_DEPOSIT") return "EXPIRED";
  return "FAILED";
}

async function getApiKeyMap(): Promise<Map<string, { label: string; prefix: string; last4: string }>> {
  const map = new Map<string, { label: string; prefix: string; last4: string }>();
  try {
    const db = await getMongoDb();
    if (db) {
      const keys = await db.collection("api_keys").find({}).toArray();
      for (const k of keys) {
        map.set(String(k._id || k.id), {
          label: k.label || `API Key (${k.keyPrefix || "sk_"}...${k.keyLast4 || ""})`,
          prefix: k.keyPrefix || "sk_",
          last4: k.keyLast4 || "",
        });
      }
    }
  } catch (err) {
    console.warn("[AdminLedger] ApiKeyMap load fallback:", err);
  }
  return map;
}

function mapProxySwapToAdminTx(
  o: ProxySwapOrder,
  keyMap: Map<string, { label: string; prefix: string; last4: string }>
): AdminSystemTransaction {
  const status = normalizeProxySwapStatus(o.status);
  const keyInfo = o.apiKeyId ? keyMap.get(o.apiKeyId) : undefined;
  const channel: AdminTxChannel = o.source === "api" || o.apiKeyId ? "api" : o.source === "checkout" ? "checkout" : "app";

  const decimals = getDecimalsForAsset(o.originAssetId, o.fromAsset);
  const amountNumber = parseFloat(o.totalAmountFormatted) || (Number(o.totalAmountIn) / Math.pow(10, decimals));
  const isUsdPegged = (o.fromAsset || "").toUpperCase().includes("USD");
  const amountUsdEstimate = isUsdPegged ? amountNumber : amountNumber;

  const zkpayFee = o.zkpayFeeAmount ? Number(formatAtomicToHuman(o.zkpayFeeAmount, decimals)) : 0;
  const partnerFee = o.partnerFeeAmount ? Number(formatAtomicToHuman(o.partnerFeeAmount, decimals)) : 0;
  const totalFee = zkpayFee + partnerFee;

  const primaryTxHash = o.forwardTxHash || o.depositTxHash || o.feeTxHash || null;

  return {
    id: o.swapId,
    category: "swap",
    subtype: "proxy_swap",
    channel,
    title: `Bridge & Swap ${o.fromAsset} → ${o.toAsset}`,
    status,
    rawStatus: o.status,
    amountHuman: `${o.totalAmountFormatted || amountNumber.toFixed(4)} ${o.fromAsset}`,
    amountUsdEstimate: Math.round(amountUsdEstimate * 100) / 100,
    fromAsset: o.fromAsset,
    toAsset: o.toAsset,
    zkpayFeeUsdEstimate: Math.round(zkpayFee * 100) / 100,
    partnerFeeUsdEstimate: Math.round(partnerFee * 100) / 100,
    totalFeeUsdEstimate: Math.round(totalFee * 100) / 100,
    chain: o.chain || "base",
    destinationChain: o.destinationChain || "base",
    depositAddress: o.proxyDepositAddress,
    recipient: o.recipient,
    senderAddress: o.refundTo || null,
    apiKeyId: o.apiKeyId || null,
    apiKeyLabel: keyInfo?.label || (o.apiKeyId ? "API Integration" : null),
    creatorUserId: o.partnerUserId || null,
    txHash: primaryTxHash,
    depositTxHash: o.depositTxHash || null,
    forwardTxHash: o.forwardTxHash || null,
    feeTxHash: o.feeTxHash || null,
    explorerUrl: getExplorerTxUrl(o.chain, primaryTxHash),
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    settledAt: o.status === "SETTLED" ? o.createdAt : undefined,
    details: {
      netSwapAmount: o.netSwapAmount,
      solverDepositAddress: o.solverDepositAddress,
      originAssetId: o.originAssetId,
      error: o.error,
    },
  };
}

function mapDirectSwapToAdminTx(
  o: DirectSwapOrder,
  keyMap: Map<string, { label: string; prefix: string; last4: string }>
): AdminSystemTransaction {
  const status = normalizeDirectSwapStatus(o.lastKnownStatus);
  const keyInfo = o.apiKeyId ? keyMap.get(o.apiKeyId) : undefined;
  const channel: AdminTxChannel = o.source === "api" || o.apiKeyId ? "api" : "app";

  const decimals = getDecimalsForAsset(o.originAssetId, o.fromAsset);
  const amountNumber = parseFloat(o.totalAmountFormatted) || (Number(o.totalAmountIn) / Math.pow(10, decimals));

  return {
    id: o.swapId,
    category: "swap",
    subtype: "direct_swap",
    channel,
    title: `Direct 1Click ${o.fromAsset} → ${o.toAsset}`,
    status,
    rawStatus: o.lastKnownStatus || "PENDING_DEPOSIT",
    amountHuman: `${o.totalAmountFormatted || amountNumber.toFixed(4)} ${o.fromAsset}`,
    amountUsdEstimate: Math.round(amountNumber * 100) / 100,
    fromAsset: o.fromAsset,
    toAsset: o.toAsset,
    zkpayFeeUsdEstimate: 0,
    partnerFeeUsdEstimate: 0,
    totalFeeUsdEstimate: 0,
    chain: o.originChain || "base",
    destinationChain: o.destinationChain || "base",
    depositAddress: o.depositAddress,
    recipient: o.recipient,
    senderAddress: o.refundTo || null,
    apiKeyId: o.apiKeyId || null,
    apiKeyLabel: keyInfo?.label || (o.apiKeyId ? "API Integration" : null),
    creatorUserId: o.partnerUserId || null,
    txHash: null,
    explorerUrl: null,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    details: {
      estimatedAmountOut: o.estimatedAmountOut,
      originAssetId: o.originAssetId,
    },
  };
}

export async function getAdminSystemTransactions(
  options: GetAdminTransactionsOptions = {}
): Promise<AdminTransactionsResult> {
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

  let sinceMs = 0;
  const now = Date.now();
  if (timeRange === "24h") sinceMs = now - 24 * 3600 * 1000;
  else if (timeRange === "7d") sinceMs = now - 7 * 24 * 3600 * 1000;
  else if (timeRange === "30d") sinceMs = now - 30 * 24 * 3600 * 1000;

  const keyMap = await getApiKeyMap();
  let rawList: AdminSystemTransaction[] = [];

  const db = await getMongoDb();
  if (db) {
    const timeFilter = sinceMs > 0 ? { createdAt: { $gte: sinceMs } } : {};
    const [proxySwaps, directSwaps] = await Promise.all([
      db.collection<ProxySwapOrder>("proxy_swap_orders").find(timeFilter).sort({ createdAt: -1 }).limit(2000).toArray().catch(() => []),
      db.collection<DirectSwapOrder>("direct_swap_orders").find(timeFilter).sort({ createdAt: -1 }).limit(2000).toArray().catch(() => []),
    ]);

    rawList = [
      ...proxySwaps.map((o) => mapProxySwapToAdminTx(o, keyMap)),
      ...directSwaps.map((o) => mapDirectSwapToAdminTx(o, keyMap)),
    ];
  }

  rawList.sort((a, b) => b.createdAt - a.createdAt);

  let totalVolumeUsd = 0;
  let successfulTransactions = 0;
  let pendingTransactions = 0;
  let failedTransactions = 0;
  let refundedTransactions = 0;
  let totalFeesUsd = 0;

  let appUsd = 0;
  let apiUsd = 0;
  let checkoutUsd = 0;
  let swapsUsd = 0;

  let appCount = 0;
  let apiCount = 0;
  let checkoutCount = 0;
  let swapsCount = 0;

  const chainBreakdown: Record<string, { count: number; volumeUsd: number }> = {};

  for (const tx of rawList) {
    totalVolumeUsd += tx.amountUsdEstimate;
    totalFeesUsd += tx.totalFeeUsdEstimate;

    if (tx.status === "COMPLETED") successfulTransactions++;
    else if (tx.status === "PENDING") pendingTransactions++;
    else if (tx.status === "REFUNDED") refundedTransactions++;
    else failedTransactions++;

    if (tx.channel === "app") {
      appUsd += tx.amountUsdEstimate;
      appCount++;
    } else if (tx.channel === "api") {
      apiUsd += tx.amountUsdEstimate;
      apiCount++;
    } else {
      checkoutUsd += tx.amountUsdEstimate;
      checkoutCount++;
    }

    swapsUsd += tx.amountUsdEstimate;
    swapsCount++;

    const c = (tx.chain || "base").toLowerCase();
    if (!chainBreakdown[c]) chainBreakdown[c] = { count: 0, volumeUsd: 0 };
    chainBreakdown[c].count++;
    chainBreakdown[c].volumeUsd += tx.amountUsdEstimate;
  }

  const successRate = rawList.length > 0 ? Math.round((successfulTransactions / rawList.length) * 100) : 100;

  const metrics: AdminSystemMetrics = {
    totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
    totalTransactions: rawList.length,
    successfulTransactions,
    pendingTransactions,
    failedTransactions,
    refundedTransactions,
    successRate,
    totalFeesUsd: Math.round(totalFeesUsd * 100) / 100,
    volumeByChannel: {
      appUsd: Math.round(appUsd * 100) / 100,
      apiUsd: Math.round(apiUsd * 100) / 100,
      checkoutUsd: Math.round(checkoutUsd * 100) / 100,
    },
    volumeByCategory: {
      paymentsUsd: 0,
      swapsUsd: Math.round(swapsUsd * 100) / 100,
    },
    countsByChannel: { appCount, apiCount, checkoutCount },
    countsByCategory: { paymentsCount: 0, swapsCount },
    chainBreakdown,
  };

  let filtered = rawList;

  if (channel !== "all") {
    filtered = filtered.filter((tx) => tx.channel === channel);
  }

  if (category !== "all") {
    filtered = filtered.filter((tx) => tx.category === category);
  }

  if (status !== "all") {
    filtered = filtered.filter((tx) => tx.status === status);
  }

  if (chain !== "all") {
    const targetChain = chain.toLowerCase();
    filtered = filtered.filter((tx) => (tx.chain || "base").toLowerCase().includes(targetChain));
  }

  if (search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter((tx) =>
      tx.id.toLowerCase().includes(q) ||
      (tx.txHash && tx.txHash.toLowerCase().includes(q)) ||
      (tx.recipient && tx.recipient.toLowerCase().includes(q)) ||
      (tx.depositAddress && tx.depositAddress.toLowerCase().includes(q)) ||
      (tx.senderAddress && tx.senderAddress.toLowerCase().includes(q)) ||
      (tx.apiKeyId && tx.apiKeyId.toLowerCase().includes(q)) ||
      (tx.apiKeyLabel && tx.apiKeyLabel.toLowerCase().includes(q)) ||
      tx.fromAsset.toLowerCase().includes(q) ||
      tx.toAsset.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const totalPages = Math.ceil(total / safeLimit) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * safeLimit;
  const paginated = filtered.slice(startIndex, startIndex + safeLimit);

  return {
    metrics,
    transactions: paginated,
    pagination: {
      page: currentPage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

export async function exportAdminTransactionsCsv(options: GetAdminTransactionsOptions = {}): Promise<string> {
  const result = await getAdminSystemTransactions({ ...options, limit: 10000 });
  const headers = [
    "Transaction ID",
    "Category",
    "Subtype",
    "Channel",
    "Status",
    "Amount",
    "USD Estimate",
    "ZkPay Fee USD",
    "Origin Chain",
    "Destination Chain",
    "Deposit Address",
    "Recipient",
    "Sender",
    "API Key ID",
    "API Key Label",
    "Tx Hash",
    "Created Date (UTC)",
  ];

  const rows = result.transactions.map((t) => [
    t.id,
    t.category,
    t.subtype,
    t.channel,
    t.status,
    `"${t.amountHuman.replace(/"/g, '""')}"`,
    t.amountUsdEstimate,
    t.zkpayFeeUsdEstimate,
    t.chain,
    t.destinationChain,
    t.depositAddress || "",
    `"${(t.recipient || "").replace(/"/g, '""')}"`,
    `"${(t.senderAddress || "").replace(/"/g, '""')}"`,
    t.apiKeyId || "",
    `"${(t.apiKeyLabel || "").replace(/"/g, '""')}"`,
    t.txHash || "",
    new Date(t.createdAt).toISOString(),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
