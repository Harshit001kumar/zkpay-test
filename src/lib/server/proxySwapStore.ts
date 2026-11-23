import fs from "fs";
import path from "path";
import { getMongoDb, isMongoConfigured } from "./mongodb";
import { decryptKey } from "./cryptoVault";

function requireDbInProduction(): boolean {
  return process.env.NODE_ENV === "production" || isMongoConfigured();
}

export interface ProxySwapOrder {
  swapId: string;
  proxyDepositAddress: string;
  encryptedPrivateKey?: string; // AES-256-GCM encrypted private key for sweeping
  chain: string;
  originAssetId: string;
  fromAsset: string;
  toAsset: string;
  destinationChain: string;
  recipient: string;
  refundTo: string;
  totalAmountIn: string; // Atomic units e.g. "100000000"
  totalAmountFormatted: string; // Human readable e.g. "100.00"
  netSwapAmount: string; // Atomic units sent to solver
  feeAmount: string; // Atomic units (total fee: zkpay % + fixed + partner %)
  gasBufferAmount: string; // Legacy (no longer charged on new orders)
  solverDepositAddress: string; // Near Intents single-use address
  solverQuoteAmount?: string; // Amount quoted to solver (net minus 1% FLEX buffer)
  treasuryAddress: string;
  partnerFeeRecipient?: string | null;
  partnerFeeAmount?: string;
  zkpayFeeAmount?: string;
  zkpayFeeBps?: number; // ZkPay share of % fee
  partnerFeeBps?: number; // Partner share of % fee
  fixedFeeAmount?: string; // Conditional 0.02 USDC/USDT in atomic units when zkpayPercentFee < $0.02 (ZkPay only)
  status:
    | "PENDING_DEPOSIT"
    | "DETECTED"
    | "PAYING_OUT"
    | "FORWARDING"
    | "FORWARDED"
    | "SETTLED"
    | "FAILED"
    | "REFUNDED"
    | "EXPIRED"
    | "REFUNDING"
    | "REFUND_PENDING"
    | "NEEDS_MANUAL_REVIEW"
    | "RECOVERED";
  depositTxHash?: string;
  feeTxHash?: string;
  feeConfirmedOnChain?: boolean;
  relayerGasAdvanceCount?: number;
  forwardTxHash?: string;
  destinationTxHash?: string;
  destinationExplorerUrl?: string;
  refundTxHash?: string;
  sweepStatus?: "PENDING_SWEEP" | "SWEPT" | "FAILED";
  sweepTxHash?: string;
  fulfillmentMode?: "SOLVER" | "INTERNAL_POOL";
  destinationAssetId?: string;
  expectedAmountOut?: string; // Atomic units of destination asset promised by internal liquidity pool
  expectedAmountOutFormatted?: string;
  settledAmountFormatted?: string;
  payoutStartedAt?: number;
  error?: string;
  feeNote?: string; // Why a fee output was skipped / rolled into the solver transfer (audit trail)
  lastAttemptAt?: number; // Timestamp of last forward sweep attempt (used for cooldown backoff)
  // Partner attribution (used by the /partner dashboard)
  apiKeyId?: string | null; // API key that created this order
  partnerUserId?: string | null; // Privy user ID owning that API key
  feeCredited?: boolean; // True once partner's USD share has been credited upon settlement
  feeCreditedAt?: number; // Timestamp of fee crediting
  partnerFeeUsd?: number; // USD value credited to partner
  source?: "api" | "app";
  swapType?: "FLEX_INPUT";
  creatorKey?: string;
  paylinkId?: string;
  paylinkSlug?: string;
  createdAt: number;
  expiresAt: number;
}

export type SanitizedProxySwapOrder = Omit<ProxySwapOrder, "encryptedPrivateKey">;

export function sanitizeProxyOrder(
  order: ProxySwapOrder | null | undefined
): SanitizedProxySwapOrder | null {
  if (!order) return null;
  const { encryptedPrivateKey: _secret, ...safe } = order;
  return safe;
}

// In-memory cache indexed by proxyDepositAddress and swapId
const ordersByAddress = new Map<string, ProxySwapOrder>();
const ordersBySwapId = new Map<string, ProxySwapOrder>();

const DATA_DIR = path.join(process.cwd(), "data");
const FALLBACK_FILE = path.join(DATA_DIR, "proxy_swap_orders.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    // Non-fatal if read-only filesystem
  }
}

let isHydrated = false;

async function hydrateCache() {
  if (isHydrated) return;
  isHydrated = true;

  // 1. First, read local fallback file if it exists (for seamless migration to MongoDB)
  const localOrders: ProxySwapOrder[] = [];
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf-8");
      const list: ProxySwapOrder[] = JSON.parse(raw);
      for (const ord of list) {
        ordersByAddress.set(ord.proxyDepositAddress.toLowerCase(), ord);
        ordersByAddress.set(ord.proxyDepositAddress, ord);
        ordersBySwapId.set(ord.swapId, ord);
        localOrders.push(ord);
      }
    }
  } catch (err) {
    console.warn("[ProxySwapStore] Local file hydrate warning:", err);
  }

  // 2. Then, read from MongoDB and merge (migrating any local orders into MongoDB)
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");

      if (localOrders.length > 0) {
        for (const ord of localOrders) {
          await collection.updateOne(
            { swapId: ord.swapId },
            { $set: ord },
            { upsert: true }
          ).catch(() => {});
        }
      }

      const activeOrders = await collection
        .find({
          status: { $in: ["PENDING_DEPOSIT", "FORWARDING", "REFUND_PENDING", "FORWARDED"] },
          expiresAt: { $gt: Date.now() - 48 * 60 * 60 * 1000 },
        } as any)
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();

      for (const ord of activeOrders) {
        ordersByAddress.set(ord.proxyDepositAddress.toLowerCase(), ord);
        ordersByAddress.set(ord.proxyDepositAddress, ord);
        ordersBySwapId.set(ord.swapId, ord);
      }
    }
  } catch (err) {
    console.warn("[ProxySwapStore] MongoDB hydrate warning:", err);
  }
}

// Persist order to MongoDB and fallback file (fail closed in production / when MongoDB is configured)
async function persistOrder(order: ProxySwapOrder) {
  const strictDb = requireDbInProduction();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const { _id, ...cleanOrder } = order as any;
      await collection.updateOne(
        { swapId: order.swapId },
        { $set: cleanOrder },
        { upsert: true }
      );
      return;
    }
    if (strictDb) {
      throw new Error("Database unavailable: refusing to write ephemeral deposit key to local disk.");
    }
  } catch (err) {
    if (strictDb) {
      throw err;
    }
    console.warn("[ProxySwapStore] MongoDB persist error:", err);
  }

  try {
    ensureDataDir();
    const all = Array.from(ordersBySwapId.values());
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(all, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ProxySwapStore] Local file persist error:", err);
  }
}

/**
 * Saves a new proxy swap order into the store.
 */
export async function saveProxySwapOrder(order: ProxySwapOrder): Promise<void> {
  await hydrateCache();
  ordersByAddress.set(order.proxyDepositAddress.toLowerCase(), order);
  ordersByAddress.set(order.proxyDepositAddress, order);
  ordersBySwapId.set(order.swapId, order);
  await persistOrder(order);
}

/**
 * Retrieves a proxy swap order by its deposit address.
 * Queries MongoDB first so multi-instance serverless deployments (Vercel)
 * never serve stale PENDING_DEPOSIT state from another container's RAM cache.
 */
export async function getProxyOrderByAddress(address: string): Promise<ProxySwapOrder | null> {
  const clean = address.trim();

  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const order = await collection.findOne({
        $or: [
          { proxyDepositAddress: clean },
          { proxyDepositAddress: clean.toLowerCase() },
          { swapId: clean },
        ],
      });
      if (order) {
        ordersByAddress.set(order.proxyDepositAddress.toLowerCase(), order);
        ordersByAddress.set(order.proxyDepositAddress, order);
        ordersBySwapId.set(order.swapId, order);
        return order;
      }
      return null;
    }
  } catch (e) {
    // Fall back to local cache if MongoDB is unreachable
  }

  await hydrateCache();
  return (
    ordersByAddress.get(clean.toLowerCase()) ||
    ordersByAddress.get(clean) ||
    ordersBySwapId.get(clean) ||
    null
  );
}

/**
 * Retrieves a proxy swap order by its swapId.
 * Queries MongoDB first to ensure fresh status and forwardTxHash guards across lambdas.
 */
export async function getProxyOrderBySwapId(swapId: string): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();

  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const order = await collection.findOne({
        $or: [
          { swapId: clean },
          { proxyDepositAddress: clean },
          { proxyDepositAddress: clean.toLowerCase() },
        ],
      });
      if (order) {
        ordersByAddress.set(order.proxyDepositAddress.toLowerCase(), order);
        ordersByAddress.set(order.proxyDepositAddress, order);
        ordersBySwapId.set(order.swapId, order);
        return order;
      }
      return null;
    }
  } catch (e) {
    // Fall back to local cache if MongoDB is unreachable
  }

  await hydrateCache();
  return (
    ordersBySwapId.get(clean) ||
    ordersByAddress.get(clean.toLowerCase()) ||
    ordersByAddress.get(clean) ||
    null
  );
}

/**
 * Retrieves all currently active pending/forwarding/refund-pending proxy swap orders.
 * Separates in-flight/refund orders, active PENDING_DEPOSIT orders, and expired PENDING_DEPOSIT
 * orders so active or old orders never starve behind a small descending limit.
 */
export async function getPendingProxyOrders(): Promise<ProxySwapOrder[]> {
  await hydrateCache();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const activeCutoff = Date.now() - 60_000;
      const [inFlightOrRefund, activePending, expiredPending] = await Promise.all([
        collection
          .find({ status: { $in: ["FORWARDING", "REFUNDING", "REFUND_PENDING", "PAYING_OUT"] } })
          .sort({ createdAt: 1 })
          .limit(50)
          .toArray(),
        collection
          .find({ status: { $in: ["PENDING_DEPOSIT", "DETECTED"] }, expiresAt: { $gte: activeCutoff } })
          .sort({ createdAt: 1 })
          .limit(50)
          .toArray(),
        collection
          .find({
            status: { $in: ["PENDING_DEPOSIT", "DETECTED"] },
            expiresAt: { $lt: activeCutoff, $gt: Date.now() - 24 * 60 * 60 * 1000 },
          })
          .sort({ createdAt: -1 })
          .limit(15)
          .toArray(),
      ]);

      const combined = [...inFlightOrRefund, ...activePending, ...expiredPending];
      const seen = new Set<string>();
      const deduped: ProxySwapOrder[] = [];
      for (const ord of combined) {
        if (!seen.has(ord.swapId)) {
          seen.add(ord.swapId);
          deduped.push(ord);
        }
      }
      return deduped;
    }
  } catch (e) {
    console.warn("[ProxySwapStore] getPendingProxyOrders MongoDB warning, falling back to memory:", e);
  }

  return Array.from(ordersBySwapId.values())
    .filter(
      (o) =>
        o.status === "PENDING_DEPOSIT" ||
        o.status === "DETECTED" ||
        o.status === "FORWARDING" ||
        o.status === "PAYING_OUT" ||
        o.status === "REFUNDING" ||
        o.status === "REFUND_PENDING"
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Retrieves recent proxy swap orders for the admin console.
 */
export async function getRecentProxyOrders(limit = 50): Promise<ProxySwapOrder[]> {
  await hydrateCache();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const list = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      if (list && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    // Fall back to memory
  }

  return Array.from(ordersBySwapId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Retrieves proxy swap orders that are either:
 * 1) In FORWARDED status (created within last 24h) awaiting upstream solver settlement check, OR
 * 2) In SETTLED status where partner fee credit has not yet been processed.
 */
export async function getForwardedOrUncreditedProxyOrders(limit = 30): Promise<ProxySwapOrder[]> {
  await hydrateCache();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const [forwardedList, uncreditedSettledList] = await Promise.all([
        collection
          .find({ status: "FORWARDED" } as any)
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray(),
        collection
          .find({
            status: "SETTLED",
            feeCredited: { $ne: true },
            $or: [
              { partnerUserId: { $exists: true, $ne: null } },
              { apiKeyId: { $exists: true, $ne: null } },
              { partnerFeeRecipient: { $exists: true, $ne: null } },
            ],
          } as any)
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray(),
      ]);
      const combined = [...(forwardedList || []), ...(uncreditedSettledList || [])];
      if (combined.length > 0) {
        const seen = new Set<string>();
        const deduped: ProxySwapOrder[] = [];
        for (const item of combined) {
          if (!seen.has(item.swapId)) {
            seen.add(item.swapId);
            deduped.push(item as ProxySwapOrder);
          }
        }
        return deduped;
      }
    }
  } catch (e) {
    // Fall back to memory
  }

  return Array.from(ordersBySwapId.values())
    .filter(
      (o) =>
        o.status === "FORWARDED" ||
        (o.status === "SETTLED" &&
          !o.feeCredited &&
          Boolean(o.partnerUserId || o.apiKeyId || o.partnerFeeRecipient))
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Updates an existing proxy swap order with partial changes.
 * Uses atomic $set in MongoDB to prevent stale in-memory cache overwriting the database.
 */
export async function updateProxySwapOrder(
  swapId: string,
  updates: Partial<ProxySwapOrder>
): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();
  const { _id, ...cleanUpdates } = updates as any;

  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const res = await collection.findOneAndUpdate(
        { $or: [{ swapId: clean }, { proxyDepositAddress: clean }, { proxyDepositAddress: clean.toLowerCase() }] } as any,
        { $set: cleanUpdates },
        { returnDocument: "after" }
      );
      const updatedDoc = (res && typeof res === "object" && "value" in res ? (res as any).value : res) as ProxySwapOrder | null;
      if (updatedDoc) {
        // Invalidate stale in-memory cached entries and set the fresh atomic document
        ordersBySwapId.set(updatedDoc.swapId, updatedDoc);
        ordersByAddress.set(updatedDoc.proxyDepositAddress.toLowerCase(), updatedDoc);
        ordersByAddress.set(updatedDoc.proxyDepositAddress, updatedDoc);
        return updatedDoc;
      }
    }
  } catch (err) {
    console.warn("[ProxySwapStore] MongoDB atomic update error:", err);
  }

  // Fallback to in-memory store if DB is offline
  await hydrateCache();
  let existing =
    ordersBySwapId.get(clean) ||
    ordersByAddress.get(clean.toLowerCase()) ||
    ordersByAddress.get(clean);
  if (!existing) return null;

  const updated: ProxySwapOrder = { ...existing, ...cleanUpdates };
  ordersByAddress.set(updated.proxyDepositAddress.toLowerCase(), updated);
  ordersByAddress.set(updated.proxyDepositAddress, updated);
  ordersBySwapId.set(updated.swapId, updated);

  try {
    ensureDataDir();
    const all = Array.from(ordersBySwapId.values());
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(all, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ProxySwapStore] Local file persist error:", err);
  }

  return updated;
}

/**
 * Decrypts the proxy deposit private key for signing.
 */
export function getDecryptedProxyPrivateKey(order: ProxySwapOrder): `0x${string}` {
  if (!order.encryptedPrivateKey) {
    throw new Error(`Proxy swap order ${order.swapId} does not have an encrypted private key.`);
  }
  const clean = decryptKey(order.encryptedPrivateKey).trim();
  return (clean.startsWith("0x") ? clean : `0x${clean}`) as `0x${string}`;
}

/**
 * Atomically transitions an INTERNAL_POOL order from PENDING_DEPOSIT/DETECTED -> PAYING_OUT,
 * and refuses expired orders so payout and expired-order auto-refund can never race.
 */
export async function claimOrderForPayout(swapId: string): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();
  const now = Date.now();
  const strictDb = requireDbInProduction();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const res = await collection.findOneAndUpdate(
        {
          swapId: clean,
          status: { $in: ["PENDING_DEPOSIT", "DETECTED"] },
          expiresAt: { $gt: now },
        } as any,
        {
          $set: {
            status: "PAYING_OUT",
            payoutStartedAt: now,
            lastAttemptAt: now,
          },
        },
        { returnDocument: "after" }
      );
      const doc = (res && typeof res === "object" && "value" in res ? (res as any).value : res) as ProxySwapOrder | null;
      if (doc) {
        ordersBySwapId.set(doc.swapId, doc);
        ordersByAddress.set(doc.proxyDepositAddress.toLowerCase(), doc);
        ordersByAddress.set(doc.proxyDepositAddress, doc);
        return doc;
      }
      return null;
    }
    if (strictDb) return null;
  } catch (err) {
    console.warn("[ProxySwapStore] claimOrderForPayout MongoDB warning:", err);
    if (strictDb) return null;
  }

  await hydrateCache();
  const existing = ordersBySwapId.get(clean);
  if (
    !existing ||
    (existing.status !== "PENDING_DEPOSIT" && existing.status !== "DETECTED") ||
    (existing.expiresAt && existing.expiresAt <= now)
  ) {
    return null;
  }
  return updateProxySwapOrder(clean, {
    status: "PAYING_OUT",
    payoutStartedAt: now,
    lastAttemptAt: now,
  });
}

/**
 * Atomically claims an order for expired/failed refund, blocking PAYING_OUT and SETTLED orders.
 */
export async function claimOrderForRefund(swapId: string): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();
  const now = Date.now();
  const strictDb = requireDbInProduction();
  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection<ProxySwapOrder>("proxy_swap_orders").findOneAndUpdate(
        {
          swapId: clean,
          status: { $in: ["PENDING_DEPOSIT", "DETECTED", "REFUND_PENDING"] },
        } as any,
        { $set: { status: "REFUNDING", lastAttemptAt: now } },
        { returnDocument: "after" }
      );
      const doc = (res && typeof res === "object" && "value" in res ? (res as any).value : res) as ProxySwapOrder | null;
      if (doc) {
        ordersBySwapId.set(doc.swapId, doc);
        ordersByAddress.set(doc.proxyDepositAddress.toLowerCase(), doc);
        ordersByAddress.set(doc.proxyDepositAddress, doc);
        return doc;
      }
      return null;
    }
    if (strictDb) return null;
  } catch (err) {
    console.warn("[ProxySwapStore] claimOrderForRefund MongoDB warning:", err);
    if (strictDb) return null;
  }

  await hydrateCache();
  const existing = ordersBySwapId.get(clean);
  if (
    !existing ||
    (existing.status !== "PENDING_DEPOSIT" &&
      existing.status !== "DETECTED" &&
      existing.status !== "REFUND_PENDING")
  ) {
    return null;
  }
  return updateProxySwapOrder(clean, { status: "REFUNDING", lastAttemptAt: now });
}

/**
 * Atomically claims a non-pool proxy order for forwarding across serverless instances.
 */
export async function claimOrderForForwarding(swapId: string): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();
  const now = Date.now();
  const strictDb = requireDbInProduction();
  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection<ProxySwapOrder>("proxy_swap_orders").findOneAndUpdate(
        {
          swapId: clean,
          fulfillmentMode: { $ne: "INTERNAL_POOL" },
          $or: [
            { status: { $in: ["PENDING_DEPOSIT", "DETECTED"] } },
            { status: "FORWARDING", lastAttemptAt: { $lt: now - 120_000 } },
          ],
        } as any,
        { $set: { status: "FORWARDING", lastAttemptAt: now } },
        { returnDocument: "after" }
      );
      const doc = (res && typeof res === "object" && "value" in res ? (res as any).value : res) as ProxySwapOrder | null;
      if (doc) {
        ordersBySwapId.set(doc.swapId, doc);
        ordersByAddress.set(doc.proxyDepositAddress.toLowerCase(), doc);
        ordersByAddress.set(doc.proxyDepositAddress, doc);
        return doc;
      }
      return null;
    }
    if (strictDb) return null;
  } catch (err) {
    console.warn("[ProxySwapStore] claimOrderForForwarding MongoDB warning:", err);
    if (strictDb) return null;
  }

  await hydrateCache();
  const existing = ordersBySwapId.get(clean);
  if (!existing || existing.fulfillmentMode === "INTERNAL_POOL") return null;
  const staleForward = existing.status === "FORWARDING" && (!existing.lastAttemptAt || now - existing.lastAttemptAt > 120_000);
  if (existing.status !== "PENDING_DEPOSIT" && existing.status !== "DETECTED" && !staleForward) {
    return null;
  }
  return updateProxySwapOrder(clean, { status: "FORWARDING", lastAttemptAt: now });
}

/**
 * Atomically claims an order for recovery so concurrent auto-forward/payout/refund cannot collide.
 */
export async function claimOrderForRecovery(
  swapId: string,
  options?: { allowFromPayingOut?: boolean; adminOverride?: boolean }
): Promise<ProxySwapOrder | null> {
  const clean = swapId.trim();
  const now = Date.now();
  const strictDb = requireDbInProduction();
  const allowedStatuses = options?.adminOverride
    ? [
        "PENDING_DEPOSIT",
        "DETECTED",
        "REFUND_PENDING",
        "REFUNDING",
        "FORWARDED",
        "EXPIRED",
        "FAILED",
        "NEEDS_MANUAL_REVIEW",
        ...(options.allowFromPayingOut ? ["PAYING_OUT"] : []),
      ]
    : [
        "PENDING_DEPOSIT",
        "DETECTED",
        "REFUND_PENDING",
        "EXPIRED",
        ...(options?.allowFromPayingOut ? ["PAYING_OUT"] : []),
      ];

  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection<ProxySwapOrder>("proxy_swap_orders").findOneAndUpdate(
        {
          swapId: clean,
          $or: [
            { status: { $in: allowedStatuses } },
            { status: "FORWARDING", lastAttemptAt: { $lt: now - 120_000 } },
          ],
        } as any,
        { $set: { lastAttemptAt: now } },
        { returnDocument: "after" }
      );
      const doc = (res && typeof res === "object" && "value" in res ? (res as any).value : res) as ProxySwapOrder | null;
      if (doc) {
        ordersBySwapId.set(doc.swapId, doc);
        ordersByAddress.set(doc.proxyDepositAddress.toLowerCase(), doc);
        ordersByAddress.set(doc.proxyDepositAddress, doc);
        return doc;
      }
      return null;
    }
    if (strictDb) return null;
  } catch (err) {
    console.warn("[ProxySwapStore] claimOrderForRecovery MongoDB warning:", err);
    if (strictDb) return null;
  }
  return ordersBySwapId.get(clean) || null;
}

/**
 * Counts currently open unpaid INTERNAL_POOL orders created by a given caller/IP.
 */
export async function countActiveUnpaidPoolOrdersForCaller(creatorKey: string): Promise<number> {
  const cleanKey = (creatorKey || "").trim();
  if (!cleanKey) return 0;
  const now = Date.now();
  try {
    const db = await getMongoDb();
    if (db) {
      return await db.collection<ProxySwapOrder>("proxy_swap_orders").countDocuments({
        fulfillmentMode: "INTERNAL_POOL",
        status: "PENDING_DEPOSIT",
        creatorKey: cleanKey,
        expiresAt: { $gt: now },
      } as any);
    }
  } catch (err) {
    console.warn("[ProxySwapStore] countActiveUnpaidPoolOrdersForCaller warning:", err);
  }

  await hydrateCache();
  let count = 0;
  for (const o of ordersBySwapId.values()) {
    if (
      o.fulfillmentMode === "INTERNAL_POOL" &&
      o.status === "PENDING_DEPOSIT" &&
      o.creatorKey === cleanKey &&
      o.expiresAt > now
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Sums currently reserved destination liquidity across active unfulfilled INTERNAL_POOL orders.
 * Keyed by destinationChain:toAsset (e.g. "ltc:LTC", "sol:SOL", "polygon:USDT").
 */
export async function getActiveReservedLiquidityByAsset(options?: {
  confirmedOnly?: boolean;
}): Promise<Record<string, bigint>> {
  const totals: Record<string, bigint> = {};
  const now = Date.now();
  const confirmedOnly = Boolean(options?.confirmedOnly);
  const unpaidHoldMs = 5 * 60_000; // shortcut: 5m unpaid reservation window limits zero-cost pool lockout; upgrade to deposit-only reservation at higher volume

  const accumulate = (list: ProxySwapOrder[]) => {
    for (const o of list) {
      if (o.fulfillmentMode !== "INTERNAL_POOL") continue;
      if (
        o.status !== "PENDING_DEPOSIT" &&
        o.status !== "DETECTED" &&
        o.status !== "PAYING_OUT"
      ) {
        continue;
      }
      if (confirmedOnly && o.status === "PENDING_DEPOSIT") continue;
      if (o.status === "PENDING_DEPOSIT" && o.createdAt && now - o.createdAt > unpaidHoldMs) {
        continue;
      }
      if (o.status !== "PAYING_OUT" && o.expiresAt < now) continue;
      if (!o.expectedAmountOut) continue;
      try {
        const key = `${(o.destinationChain || "").toLowerCase()}:${(o.toAsset || "").toUpperCase()}`;
        totals[key] = (totals[key] || 0n) + BigInt(o.expectedAmountOut);
      } catch {}
    }
  };

  try {
    const db = await getMongoDb();
    if (db) {
      const list = await db
        .collection<ProxySwapOrder>("proxy_swap_orders")
        .find({
          fulfillmentMode: "INTERNAL_POOL",
          status: { $in: ["PENDING_DEPOSIT", "DETECTED", "PAYING_OUT"] },
          expiresAt: { $gt: now - 10 * 60_000 },
        } as any)
        .limit(200)
        .toArray();
      accumulate(list as ProxySwapOrder[]);
      return totals;
    }
    if (requireDbInProduction()) {
      throw new Error("Database unavailable for liquidity reservation check.");
    }
  } catch (err) {
    if (requireDbInProduction()) throw err;
    console.warn("[ProxySwapStore] getActiveReservedLiquidityByAsset warning:", err);
  }

  await hydrateCache();
  accumulate(Array.from(ordersBySwapId.values()));
  return totals;
}

/**
 * Returns settled INTERNAL_POOL orders whose proxy deposit still needs to be swept into our liquidity wallet.
 */
export async function getPendingInternalSweeps(limit = 20): Promise<ProxySwapOrder[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const list = await db
        .collection<ProxySwapOrder>("proxy_swap_orders")
        .find({
          fulfillmentMode: "INTERNAL_POOL",
          status: "SETTLED",
          sweepStatus: "PENDING_SWEEP",
        } as any)
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
      return (list || []) as ProxySwapOrder[];
    }
  } catch {}

  await hydrateCache();
  return Array.from(ordersBySwapId.values())
    .filter(
      (o) =>
        o.fulfillmentMode === "INTERNAL_POOL" &&
        o.status === "SETTLED" &&
        o.sweepStatus === "PENDING_SWEEP"
    )
    .slice(0, limit);
}
