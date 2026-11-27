import crypto from "crypto";
import { parseUnits, formatUnits } from "viem";
import {
  POOL_SUPPORTED_ASSETS,
  type PoolAssetDefinition,
  recordLiquidityTransfer,
} from "./liquidityConfig";
import {
  getLiquidityBalances,
  getLiquidityWalletAddress,
  sendFromLiquidityWallet,
} from "./liquidityWallets";
import { getActiveReservedLiquidityByAsset } from "./proxySwapStore";
import {
  notifyNearIntentsDepositSubmit,
  getExplorerTxUrl,
} from "./proxyForwarder";
import { getLiveTokenPriceUsd } from "./priceService";
import { isValidAddressForOriginAsset } from "@/lib/refundAddress";
import { getMongoDb } from "./mongodb";
import { recordAdminAudit } from "./adminAuth";

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

const ALLOWED_EXPLORER_HOSTS = new Set([
  "basescan.org",
  "etherscan.io",
  "arbiscan.io",
  "polygonscan.com",
  "bscscan.com",
  "solscan.io",
  "explorer.solana.com",
  "solana.fm",
  "litecoinspace.org",
  "blockchair.com",
  "tronscan.org",
  "mempool.space",
]);

export type LiquidityRebalanceStatus =
  | "PENDING_BROADCAST"
  | "SUBMITTED"
  | "PROCESSING"
  | "SETTLED"
  | "REFUNDED"
  | "FAILED";

export interface LiquidityRebalanceRecord {
  rebalanceId: string;
  fromAssetKey: PoolAssetDefinition["assetKey"];
  toAssetKey: PoolAssetDefinition["assetKey"];
  fromChain: string;
  toChain: string;
  fromSymbol: string;
  toSymbol: string;
  fromWalletAddress: string;
  toWalletAddress: string;
  amountInAtomic: string;
  amountInFormatted: string;
  amountInUsd: number;
  estimatedAmountOutAtomic: string;
  estimatedAmountOutFormatted: string;
  minAmountOutAtomic: string;
  minAmountOutFormatted: string;
  settledAmountOutAtomic?: string;
  settledAmountOutFormatted?: string;
  settledAmountOutUsd?: number;
  slippageBps: number;
  deadline: string;
  solverDepositAddress: string;
  quoteCorrelationId?: string;
  originTxHash?: string;
  originExplorerUrl?: string;
  destinationTxHash?: string;
  destinationExplorerUrl?: string;
  refundTxHash?: string;
  status: LiquidityRebalanceStatus;
  solverStatus?: string;
  error?: string;
  initiatedBy: string;
  createdAt: number;
  broadcastedAt?: number;
  settledAt?: number;
  updatedAt: number;
}

export interface RebalanceQuotePreview {
  fromAssetKey: PoolAssetDefinition["assetKey"];
  toAssetKey: PoolAssetDefinition["assetKey"];
  fromSymbol: string;
  toSymbol: string;
  fromName: string;
  toName: string;
  fromWalletAddress: string;
  toWalletAddress: string;
  availableFormatted: string;
  amountInAtomic: string;
  amountInFormatted: string;
  amountInUsd: number;
  estimatedAmountOutAtomic: string;
  estimatedAmountOutFormatted: string;
  estimatedAmountOutUsd: number;
  minAmountOutAtomic: string;
  minAmountOutFormatted: string;
  slippageBps: number;
  zkpayFeeBps: 0;
  timeEstimateSeconds: number;
  expiresAt: string;
}

const memoryRebalances: LiquidityRebalanceRecord[] = [];
const recentRebalancePollAt = new Map<string, number>();

function buildOneClickHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 ZkPay/1.0",
  };
  const apiKey = process.env.NEAR_INTENTS_API_KEY?.trim();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

function sanitizeExplorerUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl || typeof rawUrl !== "string") return undefined;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:") return undefined;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!ALLOWED_EXPLORER_HOSTS.has(host)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function clampRebalanceSlippageBps(raw?: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 100;
  return Math.min(300, Math.max(50, Math.round(raw)));
}

/**
 * Builds the exact NEAR Intents 1Click /v0/quote payload for admin pool rebalancing.
 * Hard-locks appFees to [] (0% ZkPay fee) and binds recipient/refundTo to server-resolved pool wallets.
 */
export function buildRebalanceOneClickPayload(params: {
  dry: boolean;
  fromDef: PoolAssetDefinition;
  toDef: PoolAssetDefinition;
  amountAtomic: bigint;
  fromWalletAddress: string;
  toWalletAddress: string;
  slippageBps: number;
  deadlineIso: string;
}) {
  return {
    dry: params.dry,
    swapType: "FLEX_INPUT" as const,
    slippageTolerance: params.slippageBps,
    originAsset: params.fromDef.assetId,
    depositType: "ORIGIN_CHAIN" as const,
    destinationAsset: params.toDef.assetId,
    recipientType: "DESTINATION_CHAIN" as const,
    amount: params.amountAtomic.toString(),
    recipient: params.toWalletAddress,
    refundTo: params.fromWalletAddress,
    refundType: "ORIGIN_CHAIN" as const,
    deadline: params.deadlineIso,
    appFees: [] as never[],
  };
}

/**
 * Ensures the live wet quote hasn't dropped more than `maxDropBps` (default 200 bps = 2%)
 * below the preview quote the admin inspected before clicking Confirm.
 */
export function isWithinPreviewDriftGuard(
  previewAmountOutAtomic?: string | null,
  wetAmountOutAtomic?: string | null,
  maxDropBps = 200
): boolean {
  if (!previewAmountOutAtomic || !previewAmountOutAtomic.trim()) return true;
  if (!wetAmountOutAtomic || !wetAmountOutAtomic.trim()) return false;
  try {
    const preview = BigInt(previewAmountOutAtomic.trim());
    const wet = BigInt(wetAmountOutAtomic.trim());
    if (preview <= 0n) return true;
    if (wet <= 0n) return false;
    return wet * 10000n >= preview * BigInt(10000 - maxDropBps);
  } catch {
    return false;
  }
}

async function fetchOneClickJson(
  endpoint: string,
  options: RequestInit,
  fromDef?: PoolAssetDefinition
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      ...options,
      signal: options.signal || AbortSignal.timeout(10_000),
    });
  } catch {
    const err: any = new Error(
      "NEAR Intents 1Click network is temporarily unreachable. Please retry shortly."
    );
    err.statusCode = 503;
    throw err;
  }

  const text = await res.text();
  const trimmed = text.trim();
  if (
    res.status === 521 ||
    res.status === 502 ||
    res.status === 503 ||
    res.status === 504 ||
    trimmed.startsWith("<") ||
    trimmed.includes("<!DOCTYPE")
  ) {
    const err: any = new Error(
      "NEAR Intents 1Click solver network is temporarily unavailable. Please retry in a moment."
    );
    err.statusCode = 503;
    throw err;
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    const err: any = new Error("Unexpected response from 1Click solver API.");
    err.statusCode = 502;
    throw err;
  }

  if (!res.ok) {
    const rawMsg =
      data?.message ||
      (typeof data?.error === "string"
        ? data.error
        : "1Click solver rejected the rebalance quote.");
    const minMatch =
      rawMsg.match(/try at least\s+(\d+)/i) || rawMsg.match(/minimum\s+.*?(\d+)/i);
    if (minMatch && fromDef) {
      const minHuman = Number(formatUnits(BigInt(minMatch[1]), fromDef.decimals))
        .toFixed(6)
        .replace(/\.?0+$/, "");
      const err: any = new Error(
        `Amount is below 1Click minimum (~${minHuman} ${fromDef.symbol} required).`
      );
      err.statusCode = 400;
      throw err;
    }
    const err: any = new Error(rawMsg);
    err.statusCode = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw err;
  }

  return data;
}

async function saveRebalanceRecord(rec: LiquidityRebalanceRecord): Promise<void> {
  const existingIdx = memoryRebalances.findIndex((r) => r.rebalanceId === rec.rebalanceId);
  if (existingIdx >= 0) {
    memoryRebalances[existingIdx] = { ...rec };
  } else {
    memoryRebalances.unshift({ ...rec });
    if (memoryRebalances.length > 200) memoryRebalances.length = 200;
  }

  try {
    const db = await getMongoDb();
    if (db) {
      const { _id, ...clean } = rec as any;
      await db
        .collection("liquidity_rebalances")
        .updateOne({ rebalanceId: rec.rebalanceId }, { $set: clean }, { upsert: true });
    }
  } catch (err) {
    console.warn("[LiquidityRebalance] Failed saving record to MongoDB:", err);
  }
}

async function patchRebalanceRecord(
  rebalanceId: string,
  patch: Partial<LiquidityRebalanceRecord>
): Promise<LiquidityRebalanceRecord | null> {
  const updatedPatch = { ...patch, updatedAt: Date.now() };
  const memIdx = memoryRebalances.findIndex((r) => r.rebalanceId === rebalanceId);
  if (memIdx >= 0) {
    memoryRebalances[memIdx] = { ...memoryRebalances[memIdx], ...updatedPatch };
  }

  try {
    const db = await getMongoDb();
    if (db) {
      await db
        .collection("liquidity_rebalances")
        .updateOne({ rebalanceId }, { $set: updatedPatch });
      const fresh = await db
        .collection<LiquidityRebalanceRecord>("liquidity_rebalances")
        .findOne({ rebalanceId } as any);
      if (fresh) {
        if (memIdx >= 0) memoryRebalances[memIdx] = fresh;
        return fresh;
      }
    }
  } catch (err) {
    console.warn("[LiquidityRebalance] Failed patching record in MongoDB:", err);
  }

  return memIdx >= 0 ? memoryRebalances[memIdx] : null;
}

async function validateAndPrepareRebalanceInput(params: {
  fromAssetKey: string;
  toAssetKey: string;
  amountHuman: string;
  slippageBps?: number;
}) {
  const fromKey = (params.fromAssetKey || "").trim() as PoolAssetDefinition["assetKey"];
  const toKey = (params.toAssetKey || "").trim() as PoolAssetDefinition["assetKey"];
  const fromDef = POOL_SUPPORTED_ASSETS[fromKey];
  const toDef = POOL_SUPPORTED_ASSETS[toKey];

  if (!fromDef || !toDef) {
    const err: any = new Error(
      "Invalid pool asset selection. Supported assets: ltc:LTC, sol:SOL, polygon:USDT."
    );
    err.statusCode = 400;
    throw err;
  }
  if (fromKey === toKey) {
    const err: any = new Error("Source and destination liquidity wallets must be different.");
    err.statusCode = 400;
    throw err;
  }

  const cleanAmount = (params.amountHuman || "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleanAmount) || Number(cleanAmount) <= 0) {
    const err: any = new Error("Enter a valid positive rebalance amount.");
    err.statusCode = 400;
    throw err;
  }

  let amountAtomic: bigint;
  try {
    amountAtomic = parseUnits(cleanAmount, fromDef.decimals);
  } catch {
    const err: any = new Error(
      `Invalid decimal precision for ${fromDef.symbol} (max ${fromDef.decimals} decimals).`
    );
    err.statusCode = 400;
    throw err;
  }
  if (amountAtomic <= 0n) {
    const err: any = new Error("Rebalance amount must be greater than zero.");
    err.statusCode = 400;
    throw err;
  }

  const fromWalletAddress = getLiquidityWalletAddress(fromKey)?.trim() || "";
  const toWalletAddress = getLiquidityWalletAddress(toKey)?.trim() || "";
  if (!fromWalletAddress) {
    const err: any = new Error(`Source ${fromDef.name} liquidity wallet is not configured.`);
    err.statusCode = 400;
    throw err;
  }
  if (!toWalletAddress) {
    const err: any = new Error(`Destination ${toDef.name} liquidity wallet is not configured.`);
    err.statusCode = 400;
    throw err;
  }
  if (!isValidAddressForOriginAsset(fromDef.assetId, fromWalletAddress)) {
    const err: any = new Error(`Configured ${fromDef.name} wallet address failed validation.`);
    err.statusCode = 500;
    throw err;
  }
  if (!isValidAddressForOriginAsset(toDef.assetId, toWalletAddress)) {
    const err: any = new Error(`Configured ${toDef.name} wallet address failed validation.`);
    err.statusCode = 500;
    throw err;
  }

  const [balances, confirmedReservedMap] = await Promise.all([
    getLiquidityBalances(),
    getActiveReservedLiquidityByAsset({ confirmedOnly: true }),
  ]);

  const fromStatus = balances[fromKey];
  const toStatus = balances[toKey];
  if (!fromStatus?.configured) {
    const err: any = new Error(`${fromDef.name} liquidity wallet is not configured.`);
    err.statusCode = 400;
    throw err;
  }
  if (fromStatus.error) {
    const err: any = new Error(
      `Cannot verify live ${fromDef.name} balance right now: ${fromStatus.error}`
    );
    err.statusCode = 503;
    throw err;
  }
  if (!fromStatus.gasHealthy) {
    const err: any = new Error(
      `Source ${fromDef.name} wallet has insufficient gas (${fromStatus.gasBalanceFormatted} ${fromStatus.gasSymbol}) to broadcast.`
    );
    err.statusCode = 400;
    throw err;
  }

  const confirmedReserved = confirmedReservedMap[fromKey] || 0n;
  const confirmedOnChain = BigInt(
    fromStatus.confirmedBalanceAtomic || fromStatus.onChainBalanceAtomic || "0"
  );
  const minReserveAtomic = BigInt(fromStatus.minReserveAtomic || "0");
  const availableAtomic =
    confirmedOnChain > confirmedReserved + minReserveAtomic
      ? confirmedOnChain - confirmedReserved - minReserveAtomic
      : 0n;

  if (amountAtomic > availableAtomic) {
    const availHuman = Number(formatUnits(availableAtomic, fromDef.decimals))
      .toFixed(fromDef.decimals === 6 ? 2 : 4)
      .replace(/\.?0+$/, "");
    const err: any = new Error(
      `Requested ${cleanAmount} ${fromDef.symbol} exceeds confirmed unreserved liquidity (${availHuman || "0"} ${fromDef.symbol}). Active swaps and min reserves are protected.`
    );
    err.statusCode = 400;
    throw err;
  }

  return {
    fromKey,
    toKey,
    fromDef,
    toDef,
    fromWalletAddress,
    toWalletAddress,
    fromStatus,
    toStatus,
    cleanAmount,
    amountAtomic,
    availableAtomic,
    slippageBps: clampRebalanceSlippageBps(params.slippageBps),
  };
}

/**
 * Dry-run 1Click quote preview between two pool hot wallets (0% ZkPay fee).
 */
export async function getRebalanceQuote(params: {
  fromAssetKey: string;
  toAssetKey: string;
  amountHuman: string;
  slippageBps?: number;
}): Promise<RebalanceQuotePreview> {
  const prep = await validateAndPrepareRebalanceInput(params);
  const deadlineIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = buildRebalanceOneClickPayload({
    dry: true,
    fromDef: prep.fromDef,
    toDef: prep.toDef,
    amountAtomic: prep.amountAtomic,
    fromWalletAddress: prep.fromWalletAddress,
    toWalletAddress: prep.toWalletAddress,
    slippageBps: prep.slippageBps,
    deadlineIso,
  });

  const data = await fetchOneClickJson(
    `${ONECLICK_API}/quote`,
    {
      method: "POST",
      headers: buildOneClickHeaders(),
      body: JSON.stringify(payload),
    },
    prep.fromDef
  );

  const quote = data?.quote;
  if (!quote?.amountOut) {
    const err: any = new Error("1Click solver did not return a valid quote for this pair.");
    err.statusCode = 502;
    throw err;
  }

  const amountInNum = Number(formatUnits(prep.amountAtomic, prep.fromDef.decimals));
  const estOutNum = Number(formatUnits(BigInt(quote.amountOut), prep.toDef.decimals));
  const minOutAtomic = String(quote.minAmountOut || quote.amountOut);
  const minOutFormatted =
    quote.minAmountOutFormatted ||
    Number(formatUnits(BigInt(minOutAtomic), prep.toDef.decimals)).toFixed(
      prep.toDef.decimals === 6 ? 2 : 6
    );
  const estOutFormatted =
    quote.amountOutFormatted ||
    estOutNum.toFixed(prep.toDef.decimals === 6 ? 2 : 6);

  return {
    fromAssetKey: prep.fromKey,
    toAssetKey: prep.toKey,
    fromSymbol: prep.fromDef.symbol,
    toSymbol: prep.toDef.symbol,
    fromName: prep.fromDef.name,
    toName: prep.toDef.name,
    fromWalletAddress: prep.fromWalletAddress,
    toWalletAddress: prep.toWalletAddress,
    availableFormatted: prep.fromStatus.availableFormatted,
    amountInAtomic: prep.amountAtomic.toString(),
    amountInFormatted: prep.cleanAmount,
    amountInUsd: Math.round(amountInNum * (prep.fromStatus.priceUsd || 0) * 100) / 100,
    estimatedAmountOutAtomic: String(quote.amountOut),
    estimatedAmountOutFormatted: estOutFormatted,
    estimatedAmountOutUsd: Math.round(estOutNum * (prep.toStatus?.priceUsd || 0) * 100) / 100,
    minAmountOutAtomic: minOutAtomic,
    minAmountOutFormatted: minOutFormatted,
    slippageBps: prep.slippageBps,
    zkpayFeeBps: 0,
    timeEstimateSeconds: Number(quote.timeEstimate || 60),
    expiresAt: quote.deadline || deadlineIso,
  };
}

/**
 * Executes an on-chain pool-to-pool rebalance via NEAR Intents 1Click with 0% ZkPay fee.
 */
export async function executeLiquidityRebalance(params: {
  fromAssetKey: string;
  toAssetKey: string;
  amountHuman: string;
  slippageBps?: number;
  previewAmountOutAtomic?: string;
  adminUserId?: string;
  adminWallet?: string;
  clientIp?: string;
}): Promise<{
  rebalance: LiquidityRebalanceRecord;
  pendingConfirmation: boolean;
}> {
  const prep = await validateAndPrepareRebalanceInput(params);
  const deadlineIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const payload = buildRebalanceOneClickPayload({
    dry: false,
    fromDef: prep.fromDef,
    toDef: prep.toDef,
    amountAtomic: prep.amountAtomic,
    fromWalletAddress: prep.fromWalletAddress,
    toWalletAddress: prep.toWalletAddress,
    slippageBps: prep.slippageBps,
    deadlineIso,
  });

  const data = await fetchOneClickJson(
    `${ONECLICK_API}/quote`,
    {
      method: "POST",
      headers: buildOneClickHeaders(),
      body: JSON.stringify(payload),
    },
    prep.fromDef
  );

  const quote = data?.quote;
  const depositAddress = typeof quote?.depositAddress === "string" ? quote.depositAddress.trim() : "";
  if (!depositAddress || !quote?.amountOut) {
    const err: any = new Error("1Click did not return a valid deposit address for rebalance.");
    err.statusCode = 502;
    throw err;
  }
  if (quote.depositMemo && String(quote.depositMemo).trim()) {
    const err: any = new Error(
      "1Click returned a memo-gated deposit address, which is unsupported for direct hot-wallet transfers."
    );
    err.statusCode = 400;
    throw err;
  }
  if (!isValidAddressForOriginAsset(prep.fromDef.assetId, depositAddress)) {
    const err: any = new Error(
      `1Click returned an invalid ${prep.fromDef.chain.toUpperCase()} deposit address.`
    );
    err.statusCode = 502;
    throw err;
  }
  if (!isWithinPreviewDriftGuard(params.previewAmountOutAtomic, String(quote.amountOut), 200)) {
    const err: any = new Error(
      "Market rate moved more than 2% below your preview quote. Please preview a fresh quote and confirm again."
    );
    err.statusCode = 409;
    throw err;
  }

  const now = Date.now();
  const rebalanceId = `rebal_${now}_${crypto.randomBytes(3).toString("hex")}`;
  const amountInNum = Number(formatUnits(prep.amountAtomic, prep.fromDef.decimals));
  const amountInUsd = Math.round(amountInNum * (prep.fromStatus.priceUsd || 0) * 10000) / 10000;
  const minOutAtomic = String(quote.minAmountOut || quote.amountOut);

  const initialRecord: LiquidityRebalanceRecord = {
    rebalanceId,
    fromAssetKey: prep.fromKey,
    toAssetKey: prep.toKey,
    fromChain: prep.fromDef.chain,
    toChain: prep.toDef.chain,
    fromSymbol: prep.fromDef.symbol,
    toSymbol: prep.toDef.symbol,
    fromWalletAddress: prep.fromWalletAddress,
    toWalletAddress: prep.toWalletAddress,
    amountInAtomic: prep.amountAtomic.toString(),
    amountInFormatted: prep.cleanAmount,
    amountInUsd: Math.round(amountInUsd * 100) / 100,
    estimatedAmountOutAtomic: String(quote.amountOut),
    estimatedAmountOutFormatted:
      quote.amountOutFormatted ||
      Number(formatUnits(BigInt(quote.amountOut), prep.toDef.decimals)).toFixed(
        prep.toDef.decimals === 6 ? 2 : 6
      ),
    minAmountOutAtomic: minOutAtomic,
    minAmountOutFormatted:
      quote.minAmountOutFormatted ||
      Number(formatUnits(BigInt(minOutAtomic), prep.toDef.decimals)).toFixed(
        prep.toDef.decimals === 6 ? 2 : 6
      ),
    slippageBps: prep.slippageBps,
    deadline: quote.deadline || deadlineIso,
    solverDepositAddress: depositAddress,
    quoteCorrelationId: data?.correlationId || undefined,
    status: "PENDING_BROADCAST",
    initiatedBy: params.adminWallet || params.adminUserId || "admin",
    createdAt: now,
    updatedAt: now,
  };

  await saveRebalanceRecord(initialRecord);

  let broadcastedHash: string | null = null;

  try {
    const txRes = await sendFromLiquidityWallet({
      assetKey: prep.fromKey,
      toAddress: depositAddress,
      amountAtomic: prep.amountAtomic,
      enforceMinReserve: true,
      enforceConfirmedUnreserved: true,
      onBroadcast: async (txHash) => {
        broadcastedHash = txHash;
        await patchRebalanceRecord(rebalanceId, {
          status: "SUBMITTED",
          originTxHash: txHash,
          originExplorerUrl: getExplorerTxUrl(prep.fromDef.chain, txHash),
          broadcastedAt: Date.now(),
        });
      },
    });

    const updated =
      (await patchRebalanceRecord(rebalanceId, {
        status: "SUBMITTED",
        originTxHash: txRes.txHash,
        originExplorerUrl: txRes.explorerUrl,
        broadcastedAt: Date.now(),
      })) || {
        ...initialRecord,
        status: "SUBMITTED" as const,
        originTxHash: txRes.txHash,
        originExplorerUrl: txRes.explorerUrl,
        broadcastedAt: Date.now(),
        updatedAt: Date.now(),
      };

    await notifyNearIntentsDepositSubmit(depositAddress, txRes.txHash).catch(() => false);

    await recordLiquidityTransfer({
      type: "REBALANCE_OUT",
      assetKey: prep.fromDef.assetKey,
      chain: prep.fromDef.chain,
      symbol: prep.fromDef.symbol,
      amountAtomic: prep.amountAtomic.toString(),
      amountFormatted: prep.cleanAmount,
      amountUsd: amountInUsd,
      txHash: txRes.txHash,
      explorerUrl: txRes.explorerUrl,
      fromAddress: txRes.fromAddress,
      toAddress: depositAddress,
      note: `1Click pool rebalance → ${prep.toDef.symbol} (${rebalanceId})`,
    });

    await recordAdminAudit({
      adminUserId: params.adminUserId,
      adminWallet: params.adminWallet,
      clientIp: params.clientIp,
      action: "LIQUIDITY_REBALANCE",
      target: `${prep.fromKey}->${prep.toKey}`,
      amount: `${prep.cleanAmount} ${prep.fromDef.symbol}`,
      destination: prep.toWalletAddress,
      txHash: txRes.txHash,
      status: "SUCCESS",
    });

    return { rebalance: updated, pendingConfirmation: false };
  } catch (sendErr: any) {
    const errTxHash = sendErr?.txHash || broadcastedHash;
    const wasBroadcasted = Boolean((sendErr?.broadcasted || broadcastedHash) && errTxHash);
    const wasReverted = Boolean(sendErr?.reverted);

    if (wasBroadcasted && !wasReverted && errTxHash) {
      const explorerUrl = getExplorerTxUrl(prep.fromDef.chain, errTxHash);
      const updated =
        (await patchRebalanceRecord(rebalanceId, {
          status: "SUBMITTED",
          originTxHash: errTxHash,
          originExplorerUrl: explorerUrl,
          broadcastedAt: Date.now(),
        })) || {
          ...initialRecord,
          status: "SUBMITTED" as const,
          originTxHash: errTxHash,
          originExplorerUrl: explorerUrl,
          broadcastedAt: Date.now(),
          updatedAt: Date.now(),
        };

      await notifyNearIntentsDepositSubmit(depositAddress, errTxHash).catch(() => false);

      await recordLiquidityTransfer({
        type: "REBALANCE_OUT",
        assetKey: prep.fromDef.assetKey,
        chain: prep.fromDef.chain,
        symbol: prep.fromDef.symbol,
        amountAtomic: prep.amountAtomic.toString(),
        amountFormatted: prep.cleanAmount,
        amountUsd: amountInUsd,
        txHash: errTxHash,
        explorerUrl,
        fromAddress: prep.fromWalletAddress,
        toAddress: depositAddress,
        note: `1Click pool rebalance → ${prep.toDef.symbol} (${rebalanceId}, awaiting origin conf)`,
      });

      await recordAdminAudit({
        adminUserId: params.adminUserId,
        adminWallet: params.adminWallet,
        clientIp: params.clientIp,
        action: "LIQUIDITY_REBALANCE",
        target: `${prep.fromKey}->${prep.toKey}`,
        amount: `${prep.cleanAmount} ${prep.fromDef.symbol}`,
        destination: prep.toWalletAddress,
        txHash: errTxHash,
        status: "SUCCESS",
      });

      return { rebalance: updated, pendingConfirmation: true };
    }

    const errMsg = sendErr?.message || "Failed broadcasting rebalance transfer.";
    await patchRebalanceRecord(rebalanceId, {
      status: "FAILED",
      ...(errTxHash ? { originTxHash: errTxHash } : {}),
      error: errMsg,
    });

    await recordAdminAudit({
      adminUserId: params.adminUserId,
      adminWallet: params.adminWallet,
      clientIp: params.clientIp,
      action: "LIQUIDITY_REBALANCE",
      target: `${prep.fromKey}->${prep.toKey}`,
      amount: `${prep.cleanAmount} ${prep.fromDef.symbol}`,
      destination: prep.toWalletAddress,
      ...(errTxHash ? { txHash: errTxHash } : {}),
      status: "ERROR",
      error: errMsg,
    });

    throw sendErr;
  }
}

/**
 * Atomically marks a rebalance SETTLED (returning true at most once per rebalanceId)
 * so REBALANCE_IN is never double-recorded under concurrent polls.
 */
async function tryAtomicMarkSettled(
  rebalanceId: string,
  settlementFields: Partial<LiquidityRebalanceRecord>
): Promise<{ transitioned: boolean; record: LiquidityRebalanceRecord | null }> {
  const fullSet = {
    ...settlementFields,
    status: "SETTLED" as const,
    settledAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection("liquidity_rebalances").updateOne(
        {
          rebalanceId,
          status: { $nin: ["SETTLED", "REFUNDED"] },
        } as any,
        { $set: fullSet }
      );
      const doc = await db
        .collection<LiquidityRebalanceRecord>("liquidity_rebalances")
        .findOne({ rebalanceId } as any);
      const memIdx = memoryRebalances.findIndex((r) => r.rebalanceId === rebalanceId);
      if (doc && memIdx >= 0) memoryRebalances[memIdx] = doc;
      return { transitioned: res.modifiedCount === 1, record: doc };
    }
  } catch (err) {
    console.warn("[LiquidityRebalance] Atomic settle update warning:", err);
  }

  const memIdx = memoryRebalances.findIndex((r) => r.rebalanceId === rebalanceId);
  if (memIdx < 0) return { transitioned: false, record: null };
  const current = memoryRebalances[memIdx];
  if (current.status === "SETTLED" || current.status === "REFUNDED") {
    return { transitioned: false, record: current };
  }
  const next = { ...current, ...fullSet };
  memoryRebalances[memIdx] = next;
  return { transitioned: true, record: next };
}

export async function reconcileRebalanceRecord(
  rec: LiquidityRebalanceRecord
): Promise<LiquidityRebalanceRecord> {
  if (
    rec.status === "SETTLED" ||
    rec.status === "REFUNDED" ||
    rec.status === "FAILED"
  ) {
    return rec;
  }

  if (rec.status === "PENDING_BROADCAST" && !rec.originTxHash) {
    if (Date.now() - rec.createdAt > 5 * 60 * 1000) {
      return (
        (await patchRebalanceRecord(rec.rebalanceId, {
          status: "FAILED",
          error: "Broadcast interrupted before transaction hash was recorded.",
        })) || rec
      );
    }
    return rec;
  }

  if (!rec.solverDepositAddress) return rec;

  const lastCheck = recentRebalancePollAt.get(rec.rebalanceId) || 0;
  if (Date.now() - lastCheck < 8_000) {
    return rec;
  }
  recentRebalancePollAt.set(rec.rebalanceId, Date.now());
  if (recentRebalancePollAt.size > 500) {
    const oldest = recentRebalancePollAt.keys().next().value;
    if (oldest) recentRebalancePollAt.delete(oldest);
  }

  const statusUrl = `${ONECLICK_API}/status?depositAddress=${encodeURIComponent(
    rec.solverDepositAddress.trim()
  )}`;
  const res = await fetch(statusUrl, {
    headers: buildOneClickHeaders(),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (!res || !res.ok) {
    recentRebalancePollAt.delete(rec.rebalanceId);
    return rec;
  }

  let data = await res.json().catch(() => null);
  let rawSt = String(data?.status || "").toUpperCase();
  if (!rawSt) {
    recentRebalancePollAt.delete(rec.rebalanceId);
    return rec;
  }

  if (rawSt === "PENDING_DEPOSIT" && rec.originTxHash) {
    const submitted = await notifyNearIntentsDepositSubmit(
      rec.solverDepositAddress,
      rec.originTxHash
    ).catch(() => false);
    if (submitted) {
      const reRes = await fetch(statusUrl, {
        headers: buildOneClickHeaders(),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (reRes && reRes.ok) {
        data = await reRes.json().catch(() => data);
        rawSt = String(data?.status || "").toUpperCase() || rawSt;
      }
    }
  }

  if (rawSt === "SUCCESS" || rawSt === "SETTLED") {
    const toDef = POOL_SUPPORTED_ASSETS[rec.toAssetKey];
    const swapDetails = data?.swapDetails || {};
    const rawDestHash = swapDetails?.destinationChainTxHashes?.[0]?.hash;
    const safeDestHash =
      typeof rawDestHash === "string" && /^[a-zA-Z0-9x_-]{8,128}$/.test(rawDestHash)
        ? rawDestHash
        : undefined;
    const safeDestExplorer =
      sanitizeExplorerUrl(swapDetails?.destinationChainTxHashes?.[0]?.explorerUrl) ||
      (safeDestHash && toDef ? `${toDef.explorerTxPrefix}${safeDestHash}` : undefined);

    const settledAtomic =
      typeof swapDetails?.amountOut === "string" && /^\d+$/.test(swapDetails.amountOut.trim())
        ? swapDetails.amountOut.trim()
        : rec.estimatedAmountOutAtomic;
    const settledFormatted =
      typeof swapDetails?.amountOutFormatted === "string" &&
      swapDetails.amountOutFormatted.trim()
        ? swapDetails.amountOutFormatted.trim()
        : toDef
        ? Number(formatUnits(BigInt(settledAtomic), toDef.decimals)).toFixed(
            toDef.decimals === 6 ? 2 : 6
          )
        : rec.estimatedAmountOutFormatted;

    const toPrice = toDef ? await getLiveTokenPriceUsd(toDef.symbol) : 0;
    const settledNum = toDef
      ? Number(formatUnits(BigInt(settledAtomic), toDef.decimals))
      : parseFloat(settledFormatted) || 0;
    const settledUsd = Math.round(settledNum * (toPrice || 0) * 10000) / 10000;

    const { transitioned, record } = await tryAtomicMarkSettled(rec.rebalanceId, {
      solverStatus: rawSt,
      settledAmountOutAtomic: settledAtomic,
      settledAmountOutFormatted: settledFormatted,
      settledAmountOutUsd: Math.round(settledUsd * 100) / 100,
      ...(safeDestHash ? { destinationTxHash: safeDestHash } : {}),
      ...(safeDestExplorer ? { destinationExplorerUrl: safeDestExplorer } : {}),
    });

    if (transitioned && toDef) {
      await recordLiquidityTransfer({
        type: "REBALANCE_IN",
        assetKey: toDef.assetKey,
        chain: toDef.chain,
        symbol: toDef.symbol,
        amountAtomic: settledAtomic,
        amountFormatted: settledFormatted,
        amountUsd: settledUsd,
        txHash: safeDestHash || rec.originTxHash || "",
        explorerUrl: safeDestExplorer || rec.originExplorerUrl || "",
        fromAddress: rec.solverDepositAddress,
        toAddress: rec.toWalletAddress,
        note: `1Click rebalance settled from ${rec.amountInFormatted} ${rec.fromSymbol} (${rec.rebalanceId})`,
      });
    }

    return record || rec;
  }

  if (rawSt === "KNOWN_DEPOSIT_TX" || rawSt === "PROCESSING") {
    if (rec.status !== "PROCESSING" || rec.solverStatus !== rawSt) {
      return (
        (await patchRebalanceRecord(rec.rebalanceId, {
          status: "PROCESSING",
          solverStatus: rawSt,
        })) || rec
      );
    }
    return rec;
  }

  if (rawSt === "REFUNDED" || rawSt === "INCOMPLETE_DEPOSIT") {
    const rawRefundHash = data?.swapDetails?.originChainTxHashes?.[1]?.hash;
    const safeRefundHash =
      typeof rawRefundHash === "string" && /^[a-zA-Z0-9x_-]{8,128}$/.test(rawRefundHash)
        ? rawRefundHash
        : undefined;
    return (
      (await patchRebalanceRecord(rec.rebalanceId, {
        status: "REFUNDED",
        solverStatus: rawSt,
        ...(safeRefundHash ? { refundTxHash: safeRefundHash } : {}),
        error: `Solver refunded rebalance (${rawSt}) back to ${rec.fromSymbol} liquidity wallet.`,
      })) || rec
    );
  }

  if (rawSt === "FAILED") {
    return (
      (await patchRebalanceRecord(rec.rebalanceId, {
        status: "FAILED",
        solverStatus: rawSt,
        error: "1Click solver marked rebalance swap as FAILED.",
      })) || rec
    );
  }

  return rec;
}

export async function getRecentRebalances(limit = 25): Promise<LiquidityRebalanceRecord[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const list = await db
        .collection<LiquidityRebalanceRecord>("liquidity_rebalances")
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      if (list) return list;
    }
  } catch (err) {
    console.warn("[LiquidityRebalance] Failed loading rebalances:", err);
  }
  return memoryRebalances.slice(0, limit);
}

export async function reconcileRebalanceById(
  rebalanceId: string
): Promise<LiquidityRebalanceRecord | null> {
  const cleanId = (rebalanceId || "").trim();
  if (!cleanId) return null;

  let rec: LiquidityRebalanceRecord | null = null;
  try {
    const db = await getMongoDb();
    if (db) {
      rec = await db
        .collection<LiquidityRebalanceRecord>("liquidity_rebalances")
        .findOne({ rebalanceId: cleanId } as any);
    }
  } catch {}

  if (!rec) {
    rec = memoryRebalances.find((r) => r.rebalanceId === cleanId) || null;
  }
  if (!rec) return null;
  return reconcileRebalanceRecord(rec);
}

export async function reconcileActiveRebalances(): Promise<void> {
  let active: LiquidityRebalanceRecord[] = [];
  try {
    const db = await getMongoDb();
    if (db) {
      active = await db
        .collection<LiquidityRebalanceRecord>("liquidity_rebalances")
        .find({
          status: { $in: ["PENDING_BROADCAST", "SUBMITTED", "PROCESSING"] },
        } as any)
        .sort({ createdAt: 1 })
        .limit(10)
        .toArray();
    } else {
      active = memoryRebalances.filter(
        (r) =>
          r.status === "PENDING_BROADCAST" ||
          r.status === "SUBMITTED" ||
          r.status === "PROCESSING"
      );
    }
  } catch {
    active = memoryRebalances.filter(
      (r) =>
        r.status === "PENDING_BROADCAST" ||
        r.status === "SUBMITTED" ||
        r.status === "PROCESSING"
    );
  }

  if (active.length === 0) return;
  await Promise.all(active.map((r) => reconcileRebalanceRecord(r).catch(() => r)));
}
