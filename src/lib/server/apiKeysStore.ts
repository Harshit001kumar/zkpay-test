import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getMongoDb } from "./mongodb";

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

function getKeySalt(): string {
  return process.env.ZKPAY_API_KEY_HASH_SALT || "";
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(`${getKeySalt()}::${key}`).digest("hex");
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

function saveToFile() {
  try {
    ensureDir();
    fs.writeFileSync(
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
  saveToFile();
  try {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection("api_keys").updateOne(
      { _id: record.id as any },
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
    keyHash: hashApiKey(plaintextKey),
    status: "ACTIVE",
    createdAt,
  };

  apiKeys.set(id, record);
  await persistRecord(record);
  return { record, plaintextKey };
}

export async function listApiKeysForUser(userId: string): Promise<ApiKeyRecord[]> {
  await hydrate();
  return Array.from(apiKeys.values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeApiKeyForUser(userId: string, keyId: string): Promise<boolean> {
  await hydrate();
  const rec = apiKeys.get(keyId);
  if (!rec || rec.userId !== userId || rec.status !== "ACTIVE") return false;
  rec.status = "REVOKED";
  rec.revokedAt = now();
  apiKeys.set(rec.id, rec);
  await persistRecord(rec);
  return true;
}

export async function findActiveApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  await hydrate();
  const keyHash = hashApiKey(rawKey.trim());
  for (const rec of apiKeys.values()) {
    if (rec.status === "ACTIVE" && rec.keyHash === keyHash) {
      return rec;
    }
  }
  return null;
}

export async function touchApiKeyUsage(keyId: string): Promise<void> {
  await hydrate();
  const rec = apiKeys.get(keyId);
  if (!rec) return;
  rec.lastUsedAt = now();
  apiKeys.set(rec.id, rec);
  await persistRecord(rec);
}
