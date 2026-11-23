import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getMongoDb, isMongoConfigured } from "./mongodb";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  walletAddress?: string;
  label: string;
  keyPrefix: string;
  keyLast4: string;
  keyHash: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

const apiKeys = new Map<string, ApiKeyRecord>();
let hydrated = false;

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "api_keys.json");

function now() {
  return Date.now();
}

function makeId(): string {
  return `ak_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

let warnedSaltFallback = false;

function getKeySalt(): string {
  const dedicated = process.env.ZKPAY_API_KEY_HASH_SALT?.trim();
  if (dedicated) return dedicated;

  const fallback = (process.env.PAYIN_MASTER_SECRET || process.env.AUTH_SECRET || "").trim();
  if (!fallback && process.env.NODE_ENV === "production") {
    throw new Error("Missing ZKPAY_API_KEY_HASH_SALT in production.");
  }
  if (!warnedSaltFallback) {
    warnedSaltFallback = true;
    console.warn("[ApiKeysStore] ZKPAY_API_KEY_HASH_SALT unset; deriving domain-separated HMAC key via HKDF.");
  }
  return fallback;
}

function getHmacKeyBytes(): Buffer {
  const dedicated = process.env.ZKPAY_API_KEY_HASH_SALT?.trim();
  const base = dedicated || getKeySalt();
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(base, "utf8"),
      Buffer.from("zkpay-api-key-salt-v2", "utf8"),
      Buffer.from("api-key-hmac", "utf8"),
      32
    )
  );
}

function hashEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function hashApiKeyV2(key: string): string {
  return crypto.createHmac("sha256", getHmacKeyBytes()).update(key).digest("hex");
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(`${getKeySalt()}::${key}`).digest("hex");
}

function hashApiKeyUnsalted(key: string): string {
  return crypto.createHash("sha256").update(`::${key}`).digest("hex");
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromFile() {
  try {
    ensureDir();
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const items: ApiKeyRecord[] = Array.isArray(parsed?.items) ? parsed.items : [];
    for (const item of items) {
      if (item?.id && item?.userId && item?.keyHash) {
        apiKeys.set(item.id, item);
      }
    }
  } catch (err) {
    console.warn("[ApiKeysStore] Failed loading fallback file:", err);
  }
}

async function saveToFile() {
  try {
    ensureDir();
    await fs.promises.writeFile(
      DATA_FILE,
      JSON.stringify({ items: Array.from(apiKeys.values()) }, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.warn("[ApiKeysStore] Failed writing fallback file:", err);
  }
}

async function hydrate() {
  if (hydrated) return;
  loadFromFile();

  try {
    const db = await getMongoDb();
    if (!db) {
      hydrated = true;
      return;
    }
    const docs = await db.collection("api_keys").find({}).toArray();
    for (const doc of docs) {
      if (doc?.id && doc?.userId && doc?.keyHash) {
        apiKeys.set(doc.id, {
          id: doc.id,
          userId: doc.userId,
          walletAddress: doc.walletAddress,
          label: doc.label || "Default",
          keyPrefix: doc.keyPrefix,
          keyLast4: doc.keyLast4,
          keyHash: doc.keyHash,
          status: doc.status === "REVOKED" ? "REVOKED" : "ACTIVE",
          createdAt: Number(doc.createdAt || now()),
          lastUsedAt: doc.lastUsedAt ? Number(doc.lastUsedAt) : undefined,
          revokedAt: doc.revokedAt ? Number(doc.revokedAt) : undefined,
        });
      }
    }
  } catch (err) {
    console.warn("[ApiKeysStore] Mongo hydrate warning:", err);
  }

  hydrated = true;
}

async function persistRecord(record: ApiKeyRecord) {
  saveToFile().catch(() => {});
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("api_keys").updateOne(
      { id: record.id },
      { $set: record },
      { upsert: true }
    );
  } catch (err) {
    console.warn("[ApiKeysStore] Mongo persist warning:", err);
  }
}

export async function issueApiKey(params: {
  userId: string;
  walletAddress?: string;
  label?: string;
}): Promise<{ record: ApiKeyRecord; plaintextKey: string }> {
  await hydrate();

  const db = await getMongoDb();
  if (db) {
    const activeCount = await db
      .collection("api_keys")
      .countDocuments({ userId: params.userId, status: "ACTIVE" });
    if (activeCount >= 5) {
      throw new Error("Maximum limit of 5 active API keys reached per user.");
    }
  } else {
    const userKeys = await listApiKeysForUser(params.userId);
    const activeKeys = userKeys.filter((k) => k.status === "ACTIVE");
    if (activeKeys.length >= 5) {
      throw new Error("Maximum limit of 5 active API keys reached per user.");
    }
  }

  const plaintextKey = `zkpay_live_${crypto.randomBytes(24).toString("hex")}`;
  const id = makeId();
  const keyPrefix = plaintextKey.slice(0, 14);
  const keyLast4 = plaintextKey.slice(-4);
  const createdAt = now();
  const record: ApiKeyRecord = {
    id,
    userId: params.userId,
    walletAddress: params.walletAddress?.toLowerCase(),
    label: (params.label || "Default").trim().slice(0, 40) || "Default",
    keyPrefix,
    keyLast4,
    keyHash: hashApiKeyV2(plaintextKey),
    status: "ACTIVE",
    createdAt,
  };

  apiKeys.set(id, record);
  await persistRecord(record);
  return { record, plaintextKey };
}

export async function listApiKeysForUser(userId: string): Promise<ApiKeyRecord[]> {
  await hydrate();
  try {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection("api_keys").find({ userId }).toArray();
      for (const doc of docs) {
        if (doc?.id && doc?.userId && doc?.keyHash) {
          apiKeys.set(doc.id, {
            id: doc.id,
            userId: doc.userId,
            walletAddress: doc.walletAddress,
            label: doc.label || "Default",
            keyPrefix: doc.keyPrefix,
            keyLast4: doc.keyLast4,
            keyHash: doc.keyHash,
            status: doc.status === "REVOKED" ? "REVOKED" : "ACTIVE",
            createdAt: Number(doc.createdAt || now()),
            lastUsedAt: doc.lastUsedAt ? Number(doc.lastUsedAt) : undefined,
            revokedAt: doc.revokedAt ? Number(doc.revokedAt) : undefined,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[ApiKeysStore] Mongo listApiKeysForUser warning:", err);
  }

  return Array.from(apiKeys.values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listAllApiKeys(): Promise<ApiKeyRecord[]> {
  await hydrate();
  return Array.from(apiKeys.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getApiKeyById(keyId: string): Promise<ApiKeyRecord | null> {
  await hydrate();
  const inMemory = apiKeys.get(keyId);
  if (inMemory) return inMemory;

  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection("api_keys").findOne({ id: keyId });
      if (doc && doc.id && doc.userId) {
        const record: ApiKeyRecord = {
          id: doc.id,
          userId: doc.userId,
          walletAddress: doc.walletAddress,
          label: doc.label || "Default",
          keyPrefix: doc.keyPrefix,
          keyLast4: doc.keyLast4,
          keyHash: doc.keyHash,
          status: doc.status === "REVOKED" ? "REVOKED" : "ACTIVE",
          createdAt: Number(doc.createdAt || now()),
          lastUsedAt: doc.lastUsedAt ? Number(doc.lastUsedAt) : undefined,
          revokedAt: doc.revokedAt ? Number(doc.revokedAt) : undefined,
        };
        apiKeys.set(record.id, record);
        return record;
      }
    }
  } catch (err) {
    console.warn("[ApiKeysStore] Mongo getApiKeyById warning:", err);
  }

  return null;
}

export async function findUserIdByWalletAddress(walletAddress: string): Promise<string | null> {
  const clean = (walletAddress || "").trim().toLowerCase();
  if (!clean) return null;

  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection("api_keys").findOne({ walletAddress: clean });
      if (doc?.userId) return String(doc.userId);
      return null;
    }
  } catch (err) {
    console.warn("[ApiKeysStore] findUserIdByWalletAddress warning:", err);
  }

  await hydrate();
  for (const rec of apiKeys.values()) {
    if (rec.walletAddress && rec.walletAddress.toLowerCase() === clean && rec.userId) {
      return rec.userId;
    }
  }
  return null;
}

export async function revokeApiKeyForUser(userId: string, keyId: string): Promise<boolean> {
  await hydrate();
  let rec = apiKeys.get(keyId);
  if (!rec) {
    rec = (await getApiKeyById(keyId)) || undefined;
  }
  if (!rec || rec.userId !== userId || rec.status !== "ACTIVE") return false;
  rec.status = "REVOKED";
  rec.revokedAt = now();
  apiKeys.set(rec.id, rec);
  await persistRecord(rec);
  return true;
}

export async function findActiveApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const clean = rawKey.trim();
  const keyHashV2 = hashApiKeyV2(clean);
  const keyHashV1 = hashApiKey(clean);
  const legacyHash = hashApiKeyUnsalted(clean);
  const strictDb = process.env.NODE_ENV === "production" || isMongoConfigured();

  // Query MongoDB first so key revocations propagate immediately across all instances.
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection("api_keys").findOne({
        keyHash: { $in: [keyHashV2, keyHashV1, legacyHash] },
        status: "ACTIVE",
      });
      if (doc && doc.id && doc.userId) {
        const record: ApiKeyRecord = {
          id: doc.id,
          userId: doc.userId,
          walletAddress: doc.walletAddress,
          label: doc.label || "Default",
          keyPrefix: doc.keyPrefix,
          keyLast4: doc.keyLast4,
          keyHash: doc.keyHash,
          status: "ACTIVE",
          createdAt: Number(doc.createdAt || now()),
          lastUsedAt: doc.lastUsedAt ? Number(doc.lastUsedAt) : undefined,
          revokedAt: doc.revokedAt ? Number(doc.revokedAt) : undefined,
        };
        apiKeys.set(record.id, record);
        return record;
      }
      for (const [id, rec] of apiKeys.entries()) {
        if (
          hashEqualHex(rec.keyHash, keyHashV2) ||
          hashEqualHex(rec.keyHash, keyHashV1) ||
          hashEqualHex(rec.keyHash, legacyHash)
        ) {
          apiKeys.delete(id);
        }
      }
      return null;
    }
    if (strictDb) return null;
  } catch (err) {
    console.warn("[ApiKeysStore] Mongo findActiveApiKey warning:", err);
    if (strictDb) return null;
  }

  await hydrate();
  for (const rec of apiKeys.values()) {
    if (
      rec.status === "ACTIVE" &&
      (hashEqualHex(rec.keyHash, keyHashV2) ||
        hashEqualHex(rec.keyHash, keyHashV1) ||
        hashEqualHex(rec.keyHash, legacyHash))
    ) {
      return rec;
    }
  }

  return null;
}

export async function touchApiKeyUsage(keyId: string): Promise<void> {
  const ts = now();
  const rec = apiKeys.get(keyId);
  if (rec && rec.status === "ACTIVE") {
    rec.lastUsedAt = ts;
  }
  try {
    const db = await getMongoDb();
    if (db) {
      await db
        .collection("api_keys")
        .updateOne({ id: keyId, status: "ACTIVE" }, { $set: { lastUsedAt: ts } });
    }
  } catch (err) {
    console.warn("[ApiKeysStore] touchApiKeyUsage warning:", err);
  }
}
