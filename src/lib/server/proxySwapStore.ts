import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getMongoDb } from "./mongodb";
import { encryptKey } from "./payStore";

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
  feeAmount: string; // Atomic units
  gasBufferAmount: string; // Atomic units for Case B (0.01 USDT/USDC)
  solverDepositAddress: string; // Near Intents single-use address
  treasuryAddress: string;
  partnerFeeRecipient?: string | null;
  partnerFeeAmount?: string;
  zkpayFeeAmount?: string;
  status: "PENDING_DEPOSIT" | "DETECTED" | "FORWARDING" | "FORWARDED" | "SETTLED" | "FAILED" | "EXPIRED";
  depositTxHash?: string;
  feeTxHash?: string;
  forwardTxHash?: string;
  error?: string;
  createdAt: number;
  expiresAt: number;
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

  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const activeOrders = await collection
        .find({ expiresAt: { $gt: Date.now() - 24 * 60 * 60 * 1000 } })
        .toArray();

      for (const ord of activeOrders) {
        ordersByAddress.set(ord.proxyDepositAddress.toLowerCase(), ord);
        ordersBySwapId.set(ord.swapId, ord);
      }
      return;
    }
  } catch (err) {
    console.warn("[ProxySwapStore] MongoDB hydrate warning, trying local file:", err);
  }

  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf-8");
      const list: ProxySwapOrder[] = JSON.parse(raw);
      for (const ord of list) {
        ordersByAddress.set(ord.proxyDepositAddress.toLowerCase(), ord);
        ordersBySwapId.set(ord.swapId, ord);
      }
    }
  } catch (err) {
    console.warn("[ProxySwapStore] Local file hydrate warning:", err);
  }
}

// Persist order to MongoDB and fallback file
async function persistOrder(order: ProxySwapOrder) {
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      await collection.updateOne(
        { swapId: order.swapId },
        { $set: order },
        { upsert: true }
      );
      return;
    }
  } catch (err) {
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
  ordersBySwapId.set(order.swapId, order);
  await persistOrder(order);
}

/**
 * Retrieves a proxy swap order by its deposit address.
 */
export async function getProxyOrderByAddress(address: string): Promise<ProxySwapOrder | null> {
  await hydrateCache();
  return ordersByAddress.get(address.trim().toLowerCase()) || null;
}

/**
 * Retrieves a proxy swap order by its swapId.
 */
export async function getProxyOrderBySwapId(swapId: string): Promise<ProxySwapOrder | null> {
  await hydrateCache();
  return ordersBySwapId.get(swapId.trim()) || null;
}

/**
 * Retrieves all currently active PENDING_DEPOSIT proxy swap orders.
 */
export async function getPendingProxyOrders(): Promise<ProxySwapOrder[]> {
  await hydrateCache();
  try {
    const db = await getMongoDb();
    if (db) {
      const collection = db.collection<ProxySwapOrder>("proxy_swap_orders");
      const list = await collection
        .find({ status: "PENDING_DEPOSIT" })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      if (list && list.length > 0) {
        return list;
      }
    }
  } catch (e) {
    // Fall back to memory
  }

  return Array.from(ordersBySwapId.values()).filter(
    (o) => o.status === "PENDING_DEPOSIT"
  );
}

/**
 * Updates an existing proxy swap order with partial changes.
 */
export async function updateProxySwapOrder(
  swapId: string,
  updates: Partial<ProxySwapOrder>
): Promise<ProxySwapOrder | null> {
  await hydrateCache();
  const existing = ordersBySwapId.get(swapId);
  if (!existing) return null;

  const updated: ProxySwapOrder = { ...existing, ...updates };
  ordersByAddress.set(updated.proxyDepositAddress.toLowerCase(), updated);
  ordersBySwapId.set(updated.swapId, updated);

  persistOrder(updated).catch((err) =>
    console.warn("[ProxySwapStore] Async persist update error:", err)
  );

  return updated;
}

/**
 * Decrypts the proxy deposit private key for signing.
 */
export function getDecryptedProxyPrivateKey(order: ProxySwapOrder): `0x${string}` {
  if (!order.encryptedPrivateKey) {
    throw new Error(`Proxy swap order ${order.swapId} does not have an encrypted private key.`);
  }

  // Uses payStore's decryption logic
  const parts = order.encryptedPrivateKey.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format. Expected iv:authTag:ciphertext");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  // Candidate secrets to try in order (ensures backward compatibility across server restarts)
  const candidateSecrets = [
    process.env.PAYIN_MASTER_SECRET,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    "zkpay_default_secure_proxy_secret_v1",
  ].filter(Boolean) as string[];

  let decrypted: string | null = null;
  let lastErr: any = null;

  for (const secret of candidateSecrets) {
    try {
      const key = crypto.createHash("sha256").update(secret).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      let d = decipher.update(encryptedHex, "hex", "utf-8");
      d += decipher.final("utf-8");
      decrypted = d;
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!decrypted) {
    throw new Error(
      `Failed to decrypt proxy private key for order ${order.swapId}: ${lastErr?.message || "Invalid authentication tag"}. Ensure PAYIN_MASTER_SECRET is configured.`
    );
  }

  const clean = decrypted.trim();
  return (clean.startsWith("0x") ? clean : `0x${clean}`) as `0x${string}`;
}
