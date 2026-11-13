import { SWAP_ALLOWED_TOKENS } from "@/lib/constants";
import { getMongoDb } from "./mongodb";
import type { ProxySwapOrder } from "./proxySwapStore";
import type { DirectSwapOrder } from "./directSwapStore";
import { listAllApiKeys } from "./apiKeysStore";
import { getLiveTokenPriceUsd } from "./priceService";

export type AdminTxChannel = "app" | "api";
export type AdminTxCategory = "swap";
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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function getFallbackDecimalsForSymbol(symbol?: string): number {
  const sym = (symbol || "").toUpperCase();
  if (sym.includes("USDC") || sym.includes("USDT") || sym === "TRX" || sym === "V2_1") return 6;
  if (sym.includes("SOL")) return 9;
  if (sym.includes("BTC") || sym.includes("WBTC") || sym.includes("LTC")) return 8;
  return 18;
}

export function resolveLedgerTokenMeta(
  originAssetId?: string,
  fromAsset?: string
): { symbol: string; decimals: number } {
  const match = SWAP_ALLOWED_TOKENS.find(
    (t) => t.assetId.toLowerCase() === (originAssetId || "").toLowerCase()
  );
  if (match) {
    return { symbol: match.symbol.toUpperCase(), decimals: match.decimals };
  }

  let sym = (fromAsset || "").trim().toUpperCase();
  if (sym === "BASE" || sym === "ARB") sym = "ETH";
  else if (sym === "BSC") sym = "BNB";
  else if (sym === "POLYGON") sym = "POL";
  else if (sym === "V2_1") {
    sym = originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") ? "USDT" : "USDC";
  }

  return {
    symbol: sym || "USDC",
    decimals: getFallbackDecimalsForSymbol(sym),
  };
}

function atomicToNumber(atomicStr?: string, decimals = 6): number {
  if (!atomicStr || atomicStr === "0") return 0;
  const clean = atomicStr.trim();
  if (!clean) return 0;
  try {
    if (clean.includes(".")) {
      const parsed = parseFloat(clean);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const raw = BigInt(clean);
    if (decimals <= 0) return Number(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const fracStr = frac.toString().padStart(decimals, "0");
    const parsed = parseFloat(`${whole.toString()}.${fracStr}`);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function computeProxySwapUsdEstimates(
  o: Pick<
    ProxySwapOrder,
    | "originAssetId"
    | "fromAsset"
    | "totalAmountFormatted"
    | "totalAmountIn"
    | "zkpayFeeBps"
    | "partnerFeeBps"
    | "feeAmount"
    | "fixedFeeAmount"
    | "zkpayFeeAmount"
    | "partnerFeeAmount"
    | "partnerFeeUsd"
    | "apiKeyId"
    | "partnerUserId"
    | "partnerFeeRecipient"
  >,
  priceUsd: number
): {
  amountUsdEstimate: number;
  zkpayFeeUsdEstimate: number;
  partnerFeeUsdEstimate: number;
} {
  const { decimals } = resolveLedgerTokenMeta(o.originAssetId, o.fromAsset);
  const parsedFormatted = parseFloat(o.totalAmountFormatted);
  const amountTokens =
    Number.isFinite(parsedFormatted) && parsedFormatted > 0
      ? parsedFormatted
      : atomicToNumber(o.totalAmountIn, decimals);

  const safePrice = Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : 0;
  const amountUsdEstimate = round4(amountTokens * safePrice);

  const hasPartner = Boolean(o.apiKeyId || o.partnerUserId || o.partnerFeeRecipient);
  const zkpayBps = o.zkpayFeeBps ?? (hasPartner ? 100 : 200);
  const partnerBps =
    o.partnerFeeBps ?? (o.zkpayFeeBps !== undefined ? 0 : hasPartner ? 100 : 0);
  const totalBps = zkpayBps + partnerBps;

  let zkpayFeeUsdEstimate = 0;
  if (o.zkpayFeeAmount !== undefined && o.zkpayFeeAmount !== "") {
    zkpayFeeUsdEstimate = atomicToNumber(o.zkpayFeeAmount, decimals) * safePrice;
  } else if (o.feeAmount !== undefined && o.feeAmount !== "") {
    const totalFeeTokens = atomicToNumber(o.feeAmount, decimals);
    const fixedFeeTokens = atomicToNumber(o.fixedFeeAmount, decimals);
    const variableFeeTokens = Math.max(0, totalFeeTokens - fixedFeeTokens);
    const zkpayVariableTokens =
      totalBps > 0 ? (variableFeeTokens * zkpayBps) / totalBps : variableFeeTokens;
    zkpayFeeUsdEstimate = (zkpayVariableTokens + fixedFeeTokens) * safePrice;
  } else {
    const fixedFeeUsd = atomicToNumber(o.fixedFeeAmount, decimals) * safePrice;
    zkpayFeeUsdEstimate = (amountUsdEstimate * zkpayBps) / 10000 + fixedFeeUsd;
  }

  let partnerFeeUsdEstimate = 0;
  if (typeof o.partnerFeeUsd === "number" && Number.isFinite(o.partnerFeeUsd)) {
    partnerFeeUsdEstimate = o.partnerFeeUsd;
  } else if (o.partnerFeeAmount !== undefined && o.partnerFeeAmount !== "") {
    partnerFeeUsdEstimate = atomicToNumber(o.partnerFeeAmount, decimals) * safePrice;
  } else if (o.feeAmount !== undefined && o.feeAmount !== "") {
    const totalFeeTokens = atomicToNumber(o.feeAmount, decimals);
    const fixedFeeTokens = atomicToNumber(o.fixedFeeAmount, decimals);
    const variableFeeTokens = Math.max(0, totalFeeTokens - fixedFeeTokens);
    const partnerTokens =
      totalBps > 0 ? (variableFeeTokens * partnerBps) / totalBps : 0;
    partnerFeeUsdEstimate = partnerTokens * safePrice;
  } else {
    partnerFeeUsdEstimate = (amountUsdEstimate * partnerBps) / 10000;
  }

  return {
    amountUsdEstimate,
    zkpayFeeUsdEstimate: round4(zkpayFeeUsdEstimate),
    partnerFeeUsdEstimate: round4(partnerFeeUsdEstimate),
  };
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

    const symbolsNeeded = new Set<string>();
    for (const o of proxySwaps) {
      symbolsNeeded.add(resolveLedgerTokenMeta(o.originAssetId, o.fromAsset).symbol);
    }
    for (const o of directSwaps) {
      symbolsNeeded.add(resolveLedgerTokenMeta(o.originAssetId, o.fromAsset).symbol);
    }

    const priceMap = new Map<string, number>();
    await Promise.all(
      Array.from(symbolsNeeded).map(async (sym) => {
        const price = await getLiveTokenPriceUsd(sym).catch(() => 0);
        priceMap.set(sym, price);
      })
    );

    for (const o of proxySwaps) {
      const txHash = o.forwardTxHash || o.depositTxHash || o.feeTxHash || null;
      const { symbol } = resolveLedgerTokenMeta(o.originAssetId, o.fromAsset);
      const priceUsd = priceMap.get(symbol) ?? 0;
      const { amountUsdEstimate, zkpayFeeUsdEstimate, partnerFeeUsdEstimate } =
        computeProxySwapUsdEstimates(o, priceUsd);
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
        amountUsdEstimate,
        zkpayFeeUsdEstimate,
        partnerFeeUsdEstimate,
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
      const { symbol, decimals } = resolveLedgerTokenMeta(o.originAssetId, o.fromAsset);
      const priceUsd = priceMap.get(symbol) ?? 0;
      const parsedFormatted = parseFloat(o.totalAmountFormatted);
      const amountTokens =
        Number.isFinite(parsedFormatted) && parsedFormatted > 0
          ? parsedFormatted
          : atomicToNumber(o.totalAmountIn, decimals);
      const usdEst = round4(amountTokens * priceUsd);
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
