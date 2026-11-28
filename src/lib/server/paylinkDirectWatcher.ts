import crypto from "crypto";
import { parseAbi, formatUnits, getAddress } from "viem";
import { normalizeChain, SWAP_ALLOWED_TOKENS } from "@/lib/constants";
import { getMongoDb } from "./mongodb";
import {
  getResilientPublicClientForChain,
  fetchResilientSolanaRpc,
} from "./rpcConfig";
import type { PaylinkRecord } from "./paylinkStore";

export type DirectWatchStatus = "AWAITING_TX" | "DETECTED" | "CONFIRMED" | "EXPIRED";

export interface PaylinkDirectWatch {
  watchId: string;
  paylinkId: string;
  slug: string;
  assetId: string;
  symbol: string;
  chain: string;
  decimals: number;
  recipientAddress: string;
  expectedAmountAtomic: string;
  expectedAmountFormatted: string;
  baselineBalanceAtomic: string;
  startBlock?: string;
  startedAt: number;
  expiresAt: number;
  status: DirectWatchStatus;
  txHash?: string;
  claimedTxKey?: string;
  receivedAmountAtomic?: string;
  receivedAmountFormatted?: string;
  explorerUrl?: string;
  confirmations?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const WATCH_COLLECTION = "paylink_direct_watches";
const memoryWatches = new Map<string, PaylinkDirectWatch>();
const memoryClaimedTxKeys = new Map<string, string>(); // claimedTxKey -> watchId
const recentWatchCheckAt = new Map<string, number>();

const ERC20_TRANSFER_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const EVM_TOKEN_CONTRACTS: Record<string, Record<string, `0x${string}`>> = {
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
  polygon: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
  eth: {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  bsc: {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  },
};

const SOL_SPL_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
};

const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/**
 * Pure helper: accepts >= 98% of expected fixed amount, or any positive amount for OPEN invoices.
 */
export function isDirectAmountSufficient(
  receivedAtomic: bigint,
  expectedAtomic: bigint
): boolean {
  if (receivedAtomic <= 0n) return false;
  if (expectedAtomic <= 0n) return true;
  return receivedAtomic * 10000n >= expectedAtomic * 9800n;
}

export function buildClaimedTxKey(chain: string, txHash: string): string {
  const c = normalizeChain(chain) || chain.toLowerCase();
  return `${c}:${(txHash || "").trim().toLowerCase()}`;
}

export function getDirectExplorerTxUrl(chain: string, txHash: string): string {
  const c = normalizeChain(chain) || chain.toLowerCase();
  const h = (txHash || "").trim();
  if (c === "sol") return `https://solscan.io/tx/${h}`;
  if (c === "ltc") return `https://litecoinspace.org/tx/${h}`;
  if (c === "btc") return `https://mempool.space/tx/${h}`;
  if (c === "tron") return `https://tronscan.org/#/transaction/${h}`;
  if (c === "polygon") return `https://polygonscan.com/tx/${h}`;
  if (c === "arb") return `https://arbiscan.io/tx/${h}`;
  if (c === "bsc") return `https://bscscan.com/tx/${h}`;
  if (c === "eth") return `https://etherscan.io/tx/${h}`;
  return `https://basescan.org/tx/${h}`;
}

function formatWatchAmount(atomic: bigint, decimals: number): string {
  const raw = formatUnits(atomic, decimals);
  if (!raw.includes(".")) return raw;
  const [w, f] = raw.split(".");
  const trim = f.slice(0, Math.min(6, decimals)).replace(/0+$/, "");
  return trim ? `${w}.${trim}` : w;
}

function resolveEvmContract(chain: string, symbol: string, assetId: string): `0x${string}` | null {
  const normChain = normalizeChain(chain) || chain.toLowerCase();
  const upperSym = symbol.toUpperCase();
  if (upperSym === "ETH" || upperSym === "BNB" || upperSym === "POL" || upperSym === "MATIC") {
    return null;
  }
  const byMap = EVM_TOKEN_CONTRACTS[normChain]?.[upperSym];
  if (byMap) return byMap;
  const match = assetId.match(/0x[a-fA-F0-9]{40}/);
  return match ? getAddress(match[0]) : null;
}

function isValidTxHashForChain(chain: string, txHash: string): boolean {
  const c = normalizeChain(chain) || chain.toLowerCase();
  const h = txHash.trim();
  if (c === "polygon" || c === "base" || c === "eth" || c === "bsc" || c === "arb") {
    return /^0x[a-fA-F0-9]{64}$/.test(h);
  }
  if (c === "sol") {
    return /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(h);
  }
  if (c === "ltc" || c === "btc" || c === "tron") {
    return /^[a-fA-F0-9]{64}$/.test(h);
  }
  return h.length >= 16;
}

async function saveWatch(w: PaylinkDirectWatch): Promise<void> {
  memoryWatches.set(w.watchId, { ...w });
  try {
    const db = await getMongoDb();
    if (db) {
      const { _id, ...clean } = w as any;
      await db
        .collection(WATCH_COLLECTION)
        .updateOne({ watchId: w.watchId }, { $set: clean }, { upsert: true });
    }
  } catch (err) {
    console.warn("[DirectWatch] saveWatch Mongo warning:", err);
  }
}

async function getWatchById(watchId: string): Promise<PaylinkDirectWatch | null> {
  const cleanId = (watchId || "").trim();
  if (!cleanId) return null;
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db
        .collection<PaylinkDirectWatch>(WATCH_COLLECTION)
        .findOne({ watchId: cleanId }, { projection: { _id: 0 } });
      if (doc) {
        memoryWatches.set(doc.watchId, doc);
        return doc;
      }
    }
  } catch {}
  return memoryWatches.get(cleanId) || null;
}

async function isTxKeyClaimedElsewhere(
  claimedTxKey: string,
  currentWatchId: string
): Promise<boolean> {
  const owner = memoryClaimedTxKeys.get(claimedTxKey);
  if (owner && owner !== currentWatchId) return true;
  try {
    const db = await getMongoDb();
    if (db) {
      const existing = await db
        .collection(WATCH_COLLECTION)
        .findOne(
          { claimedTxKey, watchId: { $ne: currentWatchId } } as any,
          { projection: { watchId: 1 } }
        );
      if (existing) return true;
    }
  } catch {}
  return false;
}

/**
 * Starts a tracked direct-transfer watch for same-chain + same-asset invoice payments.
 */
export async function startDirectPaylinkWatch(params: {
  paylink: PaylinkRecord;
  expectedAmountAtomic?: string | null;
  expectedAmountFormatted?: string | null;
}): Promise<PaylinkDirectWatch> {
  const { paylink } = params;
  const chain = normalizeChain(paylink.receiveChain) || paylink.receiveChain.toLowerCase();
  const symbol = paylink.receiveSymbol.toUpperCase();
  const tokenMeta = SWAP_ALLOWED_TOKENS.find(
    (t) => t.assetId.toLowerCase() === paylink.receiveAssetId.toLowerCase()
  );
  const decimals = tokenMeta?.decimals ?? paylink.receiveDecimals;

  const expectedAtomic =
    params.expectedAmountAtomic && /^\d+$/.test(params.expectedAmountAtomic)
      ? params.expectedAmountAtomic
      : "0";
  const expectedFormatted =
    params.expectedAmountFormatted ||
    (expectedAtomic !== "0" ? formatWatchAmount(BigInt(expectedAtomic), decimals) : "0");

  const now = Date.now();
  let startBlock: string | undefined;
  let baselineBalanceAtomic = "0";

  if (chain === "polygon" || chain === "base" || chain === "eth" || chain === "bsc" || chain === "arb") {
    try {
      const client = getResilientPublicClientForChain(chain);
      const addr = getAddress(paylink.recipientAddress as `0x${string}`);
      const contract = resolveEvmContract(chain, symbol, paylink.receiveAssetId);
      const [blk, bal] = await Promise.all([
        client.getBlockNumber(),
        contract
          ? (client.readContract({
              address: contract,
              abi: ERC20_TRANSFER_ABI,
              functionName: "balanceOf",
              args: [addr],
            }) as Promise<bigint>)
          : client.getBalance({ address: addr }),
      ]);
      startBlock = blk.toString();
      baselineBalanceAtomic = bal.toString();
    } catch {}
  } else if (chain === "sol" && symbol === "SOL") {
    try {
      const balRes = await fetchResilientSolanaRpc("getBalance", [
        paylink.recipientAddress,
        { commitment: "confirmed" },
      ]);
      baselineBalanceAtomic = String(balRes?.value || 0);
    } catch {}
  }

  const windowMin = chain === "btc" ? 90 : chain === "ltc" ? 45 : 30;
  const watch: PaylinkDirectWatch = {
    watchId: `dw_${now}_${crypto.randomBytes(4).toString("hex")}`,
    paylinkId: paylink.id,
    slug: paylink.slug,
    assetId: paylink.receiveAssetId,
    symbol,
    chain,
    decimals,
    recipientAddress: paylink.recipientAddress,
    expectedAmountAtomic: expectedAtomic,
    expectedAmountFormatted: expectedFormatted,
    baselineBalanceAtomic,
    ...(startBlock ? { startBlock } : {}),
    startedAt: now - 30_000, // 30s grace window for clock drift / fast senders
    expiresAt: now + windowMin * 60_000,
    status: "AWAITING_TX",
    createdAt: now,
    updatedAt: now,
  };

  await saveWatch(watch);
  return watch;
}

async function applyWatchDetectionResult(
  watch: PaylinkDirectWatch,
  match: {
    txHash: string;
    receivedAtomic: bigint;
    confirmed: boolean;
    confirmations?: number;
  }
): Promise<PaylinkDirectWatch> {
  const claimedTxKey = buildClaimedTxKey(watch.chain, match.txHash);
  if (await isTxKeyClaimedElsewhere(claimedTxKey, watch.watchId)) {
    return watch;
  }

  memoryClaimedTxKeys.set(claimedTxKey, watch.watchId);
  const nextStatus: DirectWatchStatus = match.confirmed ? "CONFIRMED" : "DETECTED";
  const receivedFormatted = formatWatchAmount(match.receivedAtomic, watch.decimals);
  const explorerUrl = getDirectExplorerTxUrl(watch.chain, match.txHash);

  const updated: PaylinkDirectWatch = {
    ...watch,
    status: nextStatus,
    txHash: match.txHash,
    claimedTxKey,
    receivedAmountAtomic: match.receivedAtomic.toString(),
    receivedAmountFormatted: receivedFormatted,
    explorerUrl,
    confirmations: match.confirmations ?? (match.confirmed ? 1 : 0),
    error: undefined,
    updatedAt: Date.now(),
  };

  try {
    const db = await getMongoDb();
    if (db) {
      const { _id, ...clean } = updated as any;
      await db
        .collection(WATCH_COLLECTION)
        .updateOne({ watchId: watch.watchId }, { $set: clean }, { upsert: true });
    }
    memoryWatches.set(watch.watchId, updated);
  } catch (err: any) {
    if (err?.code === 11000) {
      return watch; // Duplicate tx claim rejected atomically by unique index
    }
    console.warn("[DirectWatch] Failed persisting detection:", err);
  }

  const paylinkMod = await import("./paylinkStore");
  if (nextStatus === "DETECTED") {
    await paylinkMod.markPaylinkProcessing(watch.paylinkId, watch.watchId).catch(() => {});
  } else if (nextStatus === "CONFIRMED") {
    await paylinkMod
      .markPaylinkPaidIfSingleUse(watch.paylinkId, {
        swapId: watch.watchId,
        txHash: match.txHash,
        explorerUrl,
        fromAsset: watch.symbol,
        fromChain: watch.chain,
        amountIn: receivedFormatted,
        amountOut: receivedFormatted,
        mode: "DIRECT_SAME_ASSET",
      })
      .catch(() => {});
  }

  return updated;
}

async function detectEvmTransfer(watch: PaylinkDirectWatch): Promise<{
  txHash: string;
  receivedAtomic: bigint;
  confirmed: boolean;
  confirmations?: number;
} | null> {
  const client = getResilientPublicClientForChain(watch.chain);
  const recipient = getAddress(watch.recipientAddress as `0x${string}`);
  const contract = resolveEvmContract(watch.chain, watch.symbol, watch.assetId);
  const expected = BigInt(watch.expectedAmountAtomic || "0");
  const latestBlock = await client.getBlockNumber();
  const minConfs = watch.chain === "polygon" ? 8n : 1n;

  if (contract) {
    const startBlk = watch.startBlock ? BigInt(watch.startBlock) : latestBlock > 500n ? latestBlock - 500n : 0n;
    const fromBlock = latestBlock - startBlk > 1500n ? latestBlock - 1500n : startBlk;
    const logs = await client.getLogs({
      address: contract,
      event: ERC20_TRANSFER_ABI[1],
      args: { to: recipient },
      fromBlock,
      toBlock: latestBlock,
    });

    for (const log of logs) {
      const val = (log.args as any)?.value as bigint | undefined;
      const hash = log.transactionHash;
      if (!val || !hash) continue;
      if (!isDirectAmountSufficient(val, expected)) continue;
      const txKey = buildClaimedTxKey(watch.chain, hash);
      if (await isTxKeyClaimedElsewhere(txKey, watch.watchId)) continue;
      const confs = log.blockNumber ? Number(latestBlock - log.blockNumber) + 1 : 0;
      return {
        txHash: hash,
        receivedAtomic: val,
        confirmed: confs >= Number(minConfs),
        confirmations: confs,
      };
    }
    return null;
  }

  // Native EVM balance delta fallback when no specific txHash was provided yet
  const baseline = BigInt(watch.baselineBalanceAtomic || "0");
  const current = await client.getBalance({ address: recipient });
  const delta = current > baseline ? current - baseline : 0n;
  if (isDirectAmountSufficient(delta, expected)) {
    const syntheticKey = `native_delta_${watch.watchId}_${latestBlock}`;
    return {
      txHash: watch.txHash || syntheticKey,
      receivedAtomic: delta,
      confirmed: true,
      confirmations: 1,
    };
  }
  return null;
}

async function detectUtxoTransfer(watch: PaylinkDirectWatch): Promise<{
  txHash: string;
  receivedAtomic: bigint;
  confirmed: boolean;
  confirmations?: number;
} | null> {
  const baseUrl =
    watch.chain === "btc" ? "https://mempool.space/api" : "https://litecoinspace.org/api";
  const res = await fetch(`${baseUrl}/address/${encodeURIComponent(watch.recipientAddress)}/txs`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const txs = (await res.json()) as any[];
  if (!Array.isArray(txs)) return null;

  const targetLower = watch.recipientAddress.toLowerCase();
  const expected = BigInt(watch.expectedAmountAtomic || "0");

  for (const tx of txs.slice(0, 15)) {
    const isConf = Boolean(tx?.status?.confirmed);
    const blockTimeMs = Number(tx?.status?.block_time || 0) * 1000;
    if (isConf && blockTimeMs > 0 && blockTimeMs < watch.startedAt) continue;

    let received = 0n;
    for (const vout of tx?.vout || []) {
      const addr = String(vout?.scriptpubkey_address || "");
      const match =
        addr.toLowerCase().startsWith("ltc1") || addr.toLowerCase().startsWith("bc1")
          ? addr.toLowerCase() === targetLower
          : addr === watch.recipientAddress;
      if (match) {
        received += BigInt(vout?.value || 0);
      }
    }

    if (!isDirectAmountSufficient(received, expected)) continue;
    const txid = String(tx?.txid || "");
    if (!txid) continue;
    if (await isTxKeyClaimedElsewhere(buildClaimedTxKey(watch.chain, txid), watch.watchId)) {
      continue;
    }

    return {
      txHash: txid,
      receivedAtomic: received,
      confirmed: isConf,
      confirmations: isConf ? 1 : 0,
    };
  }
  return null;
}

function extractSolanaReceivedAmount(
  tx: any,
  recipientAddress: string,
  symbol: string
): bigint {
  if (!tx || tx?.meta?.err) return 0n;
  if (symbol === "SOL") {
    const keys: any[] = tx?.transaction?.message?.accountKeys || [];
    const idx = keys.findIndex(
      (k: any) => (typeof k === "string" ? k : k?.pubkey) === recipientAddress
    );
    if (idx < 0) return 0n;
    const pre = BigInt(tx.meta?.preBalances?.[idx] || 0);
    const post = BigInt(tx.meta?.postBalances?.[idx] || 0);
    return post > pre ? post - pre : 0n;
  }

  const mint = SOL_SPL_MINTS[symbol];
  if (!mint) return 0n;
  const preBals: any[] = tx.meta?.preTokenBalances || [];
  const postBals: any[] = tx.meta?.postTokenBalances || [];
  let postSum = 0n;
  let preSum = 0n;
  for (const b of postBals) {
    if (b?.mint === mint && b?.owner === recipientAddress) {
      postSum += BigInt(b?.uiTokenAmount?.amount || 0);
    }
  }
  for (const b of preBals) {
    if (b?.mint === mint && b?.owner === recipientAddress) {
      preSum += BigInt(b?.uiTokenAmount?.amount || 0);
    }
  }
  return postSum > preSum ? postSum - preSum : 0n;
}

async function detectSolanaTransfer(watch: PaylinkDirectWatch): Promise<{
  txHash: string;
  receivedAtomic: bigint;
  confirmed: boolean;
} | null> {
  const sigs = await fetchResilientSolanaRpc("getSignaturesForAddress", [
    watch.recipientAddress,
    { limit: 10, commitment: "confirmed" },
  ]);
  if (!Array.isArray(sigs)) return null;

  const expected = BigInt(watch.expectedAmountAtomic || "0");
  for (const s of sigs) {
    if (s?.err || !s?.signature) continue;
    const btMs = Number(s?.blockTime || 0) * 1000;
    if (btMs > 0 && btMs < watch.startedAt) break;

    const tx = await fetchResilientSolanaRpc("getTransaction", [
      s.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    ]).catch(() => null);
    if (!tx) continue;

    const received = extractSolanaReceivedAmount(tx, watch.recipientAddress, watch.symbol);
    if (!isDirectAmountSufficient(received, expected)) continue;
    if (await isTxKeyClaimedElsewhere(buildClaimedTxKey("sol", s.signature), watch.watchId)) {
      continue;
    }

    const isFinalized = s.confirmationStatus === "finalized";
    return {
      txHash: s.signature,
      receivedAtomic: received,
      confirmed: isFinalized,
    };
  }
  return null;
}

async function detectTronTransfer(watch: PaylinkDirectWatch): Promise<{
  txHash: string;
  receivedAtomic: bigint;
  confirmed: boolean;
} | null> {
  const expected = BigInt(watch.expectedAmountAtomic || "0");
  if (watch.symbol === "USDT") {
    const res = await fetch(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(watch.recipientAddress)}/transactions/trc20?only_to=true&limit=10&contract_address=${TRON_USDT_CONTRACT}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    for (const item of json?.data || []) {
      if (Number(item?.block_timestamp || 0) < watch.startedAt) continue;
      if (String(item?.to || "") !== watch.recipientAddress) continue;
      const val = BigInt(item?.value || 0);
      if (!isDirectAmountSufficient(val, expected)) continue;
      const txid = String(item?.transaction_id || "");
      if (!txid) continue;
      if (await isTxKeyClaimedElsewhere(buildClaimedTxKey("tron", txid), watch.watchId)) {
        continue;
      }
      return { txHash: txid, receivedAtomic: val, confirmed: true };
    }
    return null;
  }

  // Native TRX
  const res = await fetch(
    `https://api.trongrid.io/v1/accounts/${encodeURIComponent(watch.recipientAddress)}/transactions?only_to=true&limit=10`,
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return null;
  const json = await res.json();
  for (const tx of json?.data || []) {
    if (Number(tx?.raw_data?.timestamp || 0) < watch.startedAt) continue;
    const contract = tx?.raw_data?.contract?.[0];
    if (contract?.type !== "TransferContract") continue;
    const amt = BigInt(contract?.parameter?.value?.amount || 0);
    if (!isDirectAmountSufficient(amt, expected)) continue;
    const txid = String(tx?.txID || "");
    if (!txid) continue;
    if (await isTxKeyClaimedElsewhere(buildClaimedTxKey("tron", txid), watch.watchId)) {
      continue;
    }
    const ret = tx?.ret?.[0]?.contractRet;
    if (ret && ret !== "SUCCESS") continue;
    return { txHash: txid, receivedAtomic: amt, confirmed: true };
  }
  return null;
}

/**
 * Checks an active direct watch on-chain and updates both the watch and the parent invoice.
 */
export async function checkDirectPaylinkWatch(
  watchIdOrDoc: string | PaylinkDirectWatch
): Promise<PaylinkDirectWatch | null> {
  const watch =
    typeof watchIdOrDoc === "string" ? await getWatchById(watchIdOrDoc) : watchIdOrDoc;
  if (!watch) return null;
  if (watch.status === "CONFIRMED" || watch.status === "EXPIRED") return watch;

  if (Date.now() > watch.expiresAt && watch.status === "AWAITING_TX") {
    const expired: PaylinkDirectWatch = {
      ...watch,
      status: "EXPIRED",
      updatedAt: Date.now(),
    };
    await saveWatch(expired);
    return expired;
  }

  const detectedTimedOut =
    watch.status === "DETECTED" && Date.now() > watch.expiresAt + 3600_000;

  const lastCheck = recentWatchCheckAt.get(watch.watchId) || 0;
  if (!detectedTimedOut && Date.now() - lastCheck < 5000) {
    return watch;
  }
  recentWatchCheckAt.set(watch.watchId, Date.now());
  if (recentWatchCheckAt.size > 1000) {
    const oldest = recentWatchCheckAt.keys().next().value;
    if (oldest) recentWatchCheckAt.delete(oldest);
  }

  try {
    let match: {
      txHash: string;
      receivedAtomic: bigint;
      confirmed: boolean;
      confirmations?: number;
    } | null = null;

    if (
      watch.chain === "polygon" ||
      watch.chain === "base" ||
      watch.chain === "eth" ||
      watch.chain === "bsc" ||
      watch.chain === "arb"
    ) {
      match = await detectEvmTransfer(watch);
    } else if (watch.chain === "ltc" || watch.chain === "btc") {
      match = await detectUtxoTransfer(watch);
    } else if (watch.chain === "sol") {
      match = await detectSolanaTransfer(watch);
    } else if (watch.chain === "tron") {
      match = await detectTronTransfer(watch);
    }

    if (match) {
      if (detectedTimedOut && !match.confirmed) {
        // 0-conf tx remained unconfirmed >1h past expiry; release single-use lock
      } else {
        return await applyWatchDetectionResult(watch, match);
      }
    }

    if (detectedTimedOut) {
      const expired: PaylinkDirectWatch = {
        ...watch,
        status: "EXPIRED",
        error: "Unconfirmed transaction timed out or was dropped from mempool.",
        updatedAt: Date.now(),
      };
      await saveWatch(expired);
      const paylinkMod = await import("./paylinkStore");
      await paylinkMod.unlockPaylinkIfFailed(watch.paylinkId, watch.watchId).catch(() => {});
      return expired;
    }
  } catch (err) {
    console.warn(`[DirectWatch] Check failed for ${watch.watchId} (${watch.chain}):`, err);
  }

  return watch;
}

/**
 * Instant fallback verification when a payer pastes their on-chain transaction hash.
 */
export async function verifyDirectPaylinkTxHash(
  watchId: string,
  rawTxHash: string
): Promise<{ verified: boolean; watch?: PaylinkDirectWatch; error?: string }> {
  const watch = await getWatchById(watchId);
  if (!watch) {
    return { verified: false, error: "Payment watch session not found." };
  }
  if (watch.status === "CONFIRMED") {
    return { verified: true, watch };
  }

  const txHash = (rawTxHash || "").trim();
  if (!isValidTxHashForChain(watch.chain, txHash)) {
    return {
      verified: false,
      error: `Invalid ${watch.chain.toUpperCase()} transaction hash format.`,
    };
  }

  const txKey = buildClaimedTxKey(watch.chain, txHash);
  if (await isTxKeyClaimedElsewhere(txKey, watch.watchId)) {
    return {
      verified: false,
      error: "This transaction hash has already been claimed by another invoice.",
    };
  }

  const expected = BigInt(watch.expectedAmountAtomic || "0");
  const minBlockTimeMs = watch.startedAt - 60_000;

  try {
    if (
      watch.chain === "polygon" ||
      watch.chain === "base" ||
      watch.chain === "eth" ||
      watch.chain === "bsc" ||
      watch.chain === "arb"
    ) {
      const client = getResilientPublicClientForChain(watch.chain);
      const receipt = await client
        .getTransactionReceipt({ hash: txHash as `0x${string}` })
        .catch(() => null);
      if (!receipt) {
        return { verified: false, error: "Transaction not found yet on-chain. Wait a few seconds and retry." };
      }
      if (receipt.status !== "success") {
        return { verified: false, error: "Transaction reverted on-chain." };
      }
      const blk = await client.getBlock({ blockNumber: receipt.blockNumber });
      if (Number(blk.timestamp) * 1000 < minBlockTimeMs) {
        return { verified: false, error: "Transaction predates this invoice session." };
      }

      const recipientLower = watch.recipientAddress.toLowerCase();
      const contract = resolveEvmContract(watch.chain, watch.symbol, watch.assetId);
      let received = 0n;

      if (contract) {
        const transferSig =
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
          if ((log.topics[0] || "").toLowerCase() !== transferSig) continue;
          const toTopic = log.topics[2];
          if (!toTopic || toTopic.length < 42) continue;
          const toAddr = `0x${toTopic.slice(-40)}`.toLowerCase();
          if (toAddr === recipientLower) {
            received += BigInt(log.data || "0");
          }
        }
      } else {
        const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
        if (tx.to?.toLowerCase() === recipientLower) {
          received = tx.value;
        }
      }

      if (!isDirectAmountSufficient(received, expected)) {
        return {
          verified: false,
          error: `Transaction amount (${formatWatchAmount(received, watch.decimals)} ${watch.symbol}) is below the required invoice amount.`,
        };
      }

      const updated = await applyWatchDetectionResult(watch, {
        txHash,
        receivedAtomic: received,
        confirmed: true,
        confirmations: 1,
      });
      return { verified: true, watch: updated };
    }

    if (watch.chain === "ltc" || watch.chain === "btc") {
      const baseUrl =
        watch.chain === "btc" ? "https://mempool.space/api" : "https://litecoinspace.org/api";
      const res = await fetch(`${baseUrl}/tx/${encodeURIComponent(txHash)}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        return { verified: false, error: "Transaction not found on explorer yet." };
      }
      const tx = await res.json();
      const isConf = Boolean(tx?.status?.confirmed);
      const blockTimeMs = Number(tx?.status?.block_time || 0) * 1000;
      if (isConf && blockTimeMs > 0 && blockTimeMs < minBlockTimeMs) {
        return { verified: false, error: "Transaction predates this invoice session." };
      }
      const targetLower = watch.recipientAddress.toLowerCase();
      let received = 0n;
      for (const vout of tx?.vout || []) {
        const addr = String(vout?.scriptpubkey_address || "");
        const match =
          addr.toLowerCase().startsWith("ltc1") || addr.toLowerCase().startsWith("bc1")
            ? addr.toLowerCase() === targetLower
            : addr === watch.recipientAddress;
        if (match) received += BigInt(vout?.value || 0);
      }
      if (!isDirectAmountSufficient(received, expected)) {
        return {
          verified: false,
          error: `Transaction output (${formatWatchAmount(received, watch.decimals)} ${watch.symbol}) is below the required invoice amount.`,
        };
      }
      const updated = await applyWatchDetectionResult(watch, {
        txHash,
        receivedAtomic: received,
        confirmed: isConf,
        confirmations: isConf ? 1 : 0,
      });
      return { verified: true, watch: updated };
    }

    if (watch.chain === "sol") {
      const tx = await fetchResilientSolanaRpc("getTransaction", [
        txHash,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
      ]).catch(() => null);
      if (!tx) {
        return { verified: false, error: "Solana transaction not found yet." };
      }
      const blockTimeMs = Number(tx?.blockTime || 0) * 1000;
      if (blockTimeMs > 0 && blockTimeMs < minBlockTimeMs) {
        return { verified: false, error: "Transaction predates this invoice session." };
      }
      const received = extractSolanaReceivedAmount(tx, watch.recipientAddress, watch.symbol);
      if (!isDirectAmountSufficient(received, expected)) {
        return {
          verified: false,
          error: `Transaction transfer (${formatWatchAmount(received, watch.decimals)} ${watch.symbol}) is below the required invoice amount.`,
        };
      }
      const updated = await applyWatchDetectionResult(watch, {
        txHash,
        receivedAtomic: received,
        confirmed: true,
        confirmations: 1,
      });
      return { verified: true, watch: updated };
    }

    if (watch.chain === "tron") {
      // Trigger direct address scan first which matches TronGrid incoming txs >= startedAt
      const scanned = await detectTronTransfer(watch);
      if (scanned && scanned.txHash.toLowerCase() === txHash.toLowerCase()) {
        const updated = await applyWatchDetectionResult(watch, scanned);
        return { verified: true, watch: updated };
      }
      return {
        verified: false,
        error: "Tron transaction not indexed yet or below required invoice amount.",
      };
    }

    return { verified: false, error: `Unsupported chain '${watch.chain}' for verification.` };
  } catch (err: any) {
    return {
      verified: false,
      error: err?.message || "Failed verifying transaction hash on-chain.",
    };
  }
}

/**
 * Background sweeper hook: polls active same-asset watches so invoices flip to PAID even if payer closes browser.
 */
export async function pollActiveDirectPaylinkWatches(limit = 15): Promise<number> {
  let active: PaylinkDirectWatch[] = [];
  const now = Date.now();
  try {
    const db = await getMongoDb();
    if (db) {
      active = await db
        .collection<PaylinkDirectWatch>(WATCH_COLLECTION)
        .find({ status: { $in: ["AWAITING_TX", "DETECTED"] } } as any)
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
    } else {
      active = Array.from(memoryWatches.values())
        .filter((w) => w.status === "AWAITING_TX" || w.status === "DETECTED")
        .slice(0, limit);
    }
  } catch {
    active = Array.from(memoryWatches.values())
      .filter((w) => w.status === "AWAITING_TX" || w.status === "DETECTED")
      .slice(0, limit);
  }

  let updatedCount = 0;
  for (const w of active) {
    if (w.status === "AWAITING_TX" && now > w.expiresAt) {
      await checkDirectPaylinkWatch(w);
      updatedCount++;
      continue;
    }
    const before = w.status;
    const res = await checkDirectPaylinkWatch(w);
    if (res && res.status !== before) updatedCount++;
  }
  return updatedCount;
}

/**
 * Targeted poll for a single invoice's active direct watches on public GET /api/paylinks/[slug].
 */
export async function pollDirectWatchesForPaylink(paylinkId: string): Promise<number> {
  let active: PaylinkDirectWatch[] = [];
  try {
    const db = await getMongoDb();
    if (db) {
      active = await db
        .collection<PaylinkDirectWatch>(WATCH_COLLECTION)
        .find({ paylinkId, status: { $in: ["AWAITING_TX", "DETECTED"] } } as any)
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray();
    } else {
      active = Array.from(memoryWatches.values())
        .filter(
          (w) =>
            w.paylinkId === paylinkId &&
            (w.status === "AWAITING_TX" || w.status === "DETECTED")
        )
        .slice(0, 5);
    }
  } catch {
    active = Array.from(memoryWatches.values())
      .filter(
        (w) =>
          w.paylinkId === paylinkId &&
          (w.status === "AWAITING_TX" || w.status === "DETECTED")
      )
      .slice(0, 5);
  }

  let updatedCount = 0;
  for (const w of active) {
    const before = w.status;
    const res = await checkDirectPaylinkWatch(w);
    if (res && res.status !== before) updatedCount++;
  }
  return updatedCount;
}
