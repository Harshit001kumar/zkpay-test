import crypto from "crypto";
import { getMongoDb } from "./mongodb";

export interface PoolAssetDefinition {
  assetKey: "ltc:LTC" | "sol:SOL" | "polygon:USDT";
  chain: "ltc" | "sol" | "polygon";
  symbol: "LTC" | "SOL" | "USDT";
  name: string;
  assetId: string;
  decimals: number;
  tokenAddress?: `0x${string}`;
  defaultMinReserveHuman: string;
  explorerAddressPrefix: string;
  explorerTxPrefix: string;
}

export const POOL_SUPPORTED_ASSETS: Record<PoolAssetDefinition["assetKey"], PoolAssetDefinition> = {
  "ltc:LTC": {
    assetKey: "ltc:LTC",
    chain: "ltc",
    symbol: "LTC",
    name: "Litecoin",
    assetId: "nep141:ltc.omft.near",
    decimals: 8,
    defaultMinReserveHuman: "0.05",
    explorerAddressPrefix: "https://litecoinspace.org/address/",
    explorerTxPrefix: "https://litecoinspace.org/tx/",
  },
  "sol:SOL": {
    assetKey: "sol:SOL",
    chain: "sol",
    symbol: "SOL",
    name: "Solana",
    assetId: "nep141:sol.omft.near",
    decimals: 9,
    defaultMinReserveHuman: "0.05",
    explorerAddressPrefix: "https://solscan.io/account/",
    explorerTxPrefix: "https://solscan.io/tx/",
  },
  "polygon:USDT": {
    assetKey: "polygon:USDT",
    chain: "polygon",
    symbol: "USDT",
    name: "Tether (Polygon)",
    assetId: "nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr",
    decimals: 6,
    tokenAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    defaultMinReserveHuman: "5",
    explorerAddressPrefix: "https://polygonscan.com/address/",
    explorerTxPrefix: "https://polygonscan.com/tx/",
  },
};

export function resolvePoolAsset(
  assetIdOrSymbol: string,
  chainHint?: string | null
): PoolAssetDefinition | null {
  const clean = (assetIdOrSymbol || "").trim();
  const lower = clean.toLowerCase();
  const normChain = (chainHint || "").trim().toLowerCase();

  for (const def of Object.values(POOL_SUPPORTED_ASSETS)) {
    if (def.assetId.toLowerCase() === lower || def.assetKey.toLowerCase() === lower) {
      return def;
    }
  }

  const upperSym = clean.toUpperCase();
  if (upperSym === "LTC" && (!normChain || normChain === "ltc" || normChain === "litecoin")) {
    return POOL_SUPPORTED_ASSETS["ltc:LTC"];
  }
  if (upperSym === "SOL" && (!normChain || normChain === "sol" || normChain === "solana")) {
    return POOL_SUPPORTED_ASSETS["sol:SOL"];
  }
  if (
    upperSym === "USDT" &&
    (normChain === "polygon" || normChain === "pol" || normChain === "matic" || normChain === "137")
  ) {
    return POOL_SUPPORTED_ASSETS["polygon:USDT"];
  }
  return null;
}

export interface LiquidityPoolConfig {
  id: "default";
  enabled: boolean;
  pausedAssets: string[];
  maxSwapUsd: number;
  minReserveByAsset: Record<string, string>;
  spreadBufferBps: number;
  updatedAt: number;
  updatedBy?: string;
}

export type LiquidityTransferType =
  | "SWEEP_IN"
  | "PAYOUT_OUT"
  | "ADMIN_WITHDRAW"
  | "FEE_HARVEST"
  | "AUTO_REFUND";

export interface LiquidityTransferRecord {
  id: string;
  type: LiquidityTransferType;
  assetKey: string;
  chain: string;
  symbol: string;
  amountAtomic: string;
  amountFormatted: string;
  amountUsd: number;
  txHash: string;
  explorerUrl: string;
  fromAddress?: string;
  toAddress: string;
  swapId?: string;
  note?: string;
  createdAt: number;
}

const DEFAULT_CONFIG: LiquidityPoolConfig = {
  id: "default",
  enabled: true,
  pausedAssets: [],
  maxSwapUsd: 500,
  minReserveByAsset: {
    "ltc:LTC": "0.05",
    "sol:SOL": "0.05",
    "polygon:USDT": "5",
  },
  spreadBufferBps: 0,
  updatedAt: Date.now(),
};

let cachedConfig: LiquidityPoolConfig | null = null;
let cachedConfigAt = 0;
const CONFIG_TTL_MS = 15_000;
const memoryTransfers: LiquidityTransferRecord[] = [];

export async function getLiquidityPoolConfig(forceRefresh = false): Promise<LiquidityPoolConfig> {
  if (!forceRefresh && cachedConfig && Date.now() - cachedConfigAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }

  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db
        .collection<LiquidityPoolConfig>("liquidity_config")
        .findOne({ id: "default" } as any);
      if (doc) {
        const merged: LiquidityPoolConfig = {
          ...DEFAULT_CONFIG,
          ...doc,
          minReserveByAsset: {
            ...DEFAULT_CONFIG.minReserveByAsset,
            ...(doc.minReserveByAsset || {}),
          },
        };
        cachedConfig = merged;
        cachedConfigAt = Date.now();
        return merged;
      }
    }
  } catch (err) {
    console.warn("[LiquidityConfig] Failed reading config from MongoDB:", err);
  }

  if (!cachedConfig) {
    cachedConfig = { ...DEFAULT_CONFIG };
    cachedConfigAt = Date.now();
  }
  return cachedConfig;
}

export async function updateLiquidityPoolConfig(
  patch: Partial<Omit<LiquidityPoolConfig, "id">>,
  updatedBy?: string
): Promise<LiquidityPoolConfig> {
  const current = await getLiquidityPoolConfig(true);
  const next: LiquidityPoolConfig = {
    ...current,
    ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
    ...(Array.isArray(patch.pausedAssets) ? { pausedAssets: patch.pausedAssets } : {}),
    ...(typeof patch.maxSwapUsd === "number" && patch.maxSwapUsd > 0
      ? { maxSwapUsd: patch.maxSwapUsd }
      : {}),
    ...(typeof patch.spreadBufferBps === "number" && patch.spreadBufferBps >= 0
      ? { spreadBufferBps: patch.spreadBufferBps }
      : {}),
    minReserveByAsset: {
      ...current.minReserveByAsset,
      ...(patch.minReserveByAsset || {}),
    },
    updatedAt: Date.now(),
    ...(updatedBy ? { updatedBy } : {}),
  };

  cachedConfig = next;
  cachedConfigAt = Date.now();

  try {
    const db = await getMongoDb();
    if (db) {
      const { _id, ...cleanNext } = next as any;
      await db
        .collection("liquidity_config")
        .updateOne({ id: "default" }, { $set: cleanNext }, { upsert: true });
    }
  } catch (err) {
    console.warn("[LiquidityConfig] Failed persisting config to MongoDB:", err);
  }

  return next;
}

export async function recordLiquidityTransfer(
  entry: Omit<LiquidityTransferRecord, "id" | "createdAt">
): Promise<LiquidityTransferRecord> {
  const full: LiquidityTransferRecord = {
    ...entry,
    id: `ltx_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    createdAt: Date.now(),
  };

  memoryTransfers.unshift(full);
  if (memoryTransfers.length > 500) memoryTransfers.length = 500;

  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection("liquidity_transfers").insertOne({ ...full });
    }
  } catch (err) {
    console.warn("[LiquidityConfig] Failed recording liquidity transfer:", err);
  }

  return full;
}

export async function getRecentLiquidityTransfers(limit = 50): Promise<LiquidityTransferRecord[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const list = await db
        .collection<LiquidityTransferRecord>("liquidity_transfers")
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      if (list) return list;
    }
  } catch (err) {
    console.warn("[LiquidityConfig] Failed loading liquidity transfers:", err);
  }
  return memoryTransfers.slice(0, limit);
}
