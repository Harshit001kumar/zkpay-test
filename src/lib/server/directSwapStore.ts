import { getMongoDb } from "./mongodb";

/**
 * Lightweight record for cross-chain swaps that route DIRECTLY to the NEAR Intents solver
 * (no ZkPay proxy wallet, e.g. ETH/BTC or zero-fee chains). These were previously not
 * persisted at all, so partners could not track them.
 *
 * Status is not stored here; it is fetched live from the solver by deposit address.
 */
export interface DirectSwapOrder {
  swapId: string;
  depositAddress: string;
  originAssetId: string;
  fromAsset: string;
  toAsset: string;
  originChain: string;
  destinationChain: string;
  recipient: string;
  refundTo: string;
  totalAmountIn: string; // atomic units
  totalAmountFormatted: string;
  estimatedAmountOut?: string;
  apiKeyId?: string | null;
  partnerUserId?: string | null;
  source?: "api" | "app";
  lastKnownStatus?: string;
  createdAt: number;
  expiresAt: number;
}

const COLLECTION = "direct_swap_orders";
const memory = new Map<string, DirectSwapOrder>();
const MAX_MEMORY = 2000;

export async function saveDirectSwapOrder(order: DirectSwapOrder): Promise<void> {
  memory.set(order.swapId, order);
  if (memory.size > MAX_MEMORY) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  try {
    const db = await getMongoDb();
    if (db) {
      await db
        .collection<DirectSwapOrder>(COLLECTION)
        .updateOne({ swapId: order.swapId }, { $set: order }, { upsert: true });
    }
  } catch (err) {
    console.warn("[DirectSwapStore] Mongo persist warning:", err);
  }
}

export async function updateDirectSwapStatus(swapId: string, lastKnownStatus: string): Promise<void> {
  const existing = memory.get(swapId);
  if (existing) existing.lastKnownStatus = lastKnownStatus;
  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection<DirectSwapOrder>(COLLECTION).updateOne({ swapId }, { $set: { lastKnownStatus } });
    }
  } catch {
    // non-fatal
  }
}

export async function listDirectSwapsByApiKeys(
  apiKeyIds: string[],
  sinceMs: number,
  limit: number
): Promise<DirectSwapOrder[]> {
  if (apiKeyIds.length === 0) return [];
  try {
    const db = await getMongoDb();
    if (db) {
      return await db
        .collection<DirectSwapOrder>(COLLECTION)
        .find({ apiKeyId: { $in: apiKeyIds }, createdAt: { $gte: sinceMs } }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    }
  } catch (err) {
    console.warn("[DirectSwapStore] Mongo query warning:", err);
  }
  return Array.from(memory.values())
    .filter((o) => o.apiKeyId && apiKeyIds.includes(o.apiKeyId) && o.createdAt >= sinceMs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getDirectSwapById(swapId: string): Promise<DirectSwapOrder | null> {
  const cached = memory.get(swapId);
  if (cached) return cached;
  try {
    const db = await getMongoDb();
    if (db) {
      return await db.collection<DirectSwapOrder>(COLLECTION).findOne({ swapId }, { projection: { _id: 0 } });
    }
  } catch {
    // ignore
  }
  return null;
}

export const getDirectSwapBySwapId = getDirectSwapById;
