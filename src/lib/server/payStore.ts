import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getMongoDb } from "./mongodb";

export type PayLinkMode = "request" | "disburse";

export type PayLinkStatus =
  | "AWAITING_FUNDING" // Disburse mode: waiting for creator USDC deposit
  | "ACTIVE"           // Ready for payment (request) or claim (disburse)
  | "CLAIMING"         // Disburse mode: claim transaction currently processing
  | "PAID"             // Fully settled
  | "PIN_LOCKED"       // Disburse mode: exceeded 5 failed PIN attempts
  | "EXPIRED"          // Past validity window
  | "REFUNDED"         // Disburse mode: funds returned to creator
  | "CANCELLED";       // Manually deactivated by creator

export interface PayLink {
  id: string;
  mode: PayLinkMode; // "request" (standard invoice) or "disburse" (claimable escrow)
  title: string;
  amountINR: number;
  recipientUpi?: string; // Pre-configured in request mode; entered upon claim in disburse mode
  type: "one_time" | "reusable";
  status: PayLinkStatus;
  webhookUrl?: string;
  redirectUrl?: string;
  estimatedUsdc: string;
  rate: number;
  createdAt: number;
  expiresAt?: number;
  paidAt?: number;
  txHash?: string;
  p2pOrderId?: string;
  creatorUserId?: string;
  creatorWalletAddress?: string;
  apiKeyId?: string;

  // Reusable Link Metrics
  totalPaidCount?: number;
  totalVolumeINR?: number;
  parentLinkId?: string;

  // Claimable Escrow Security Fields (mode === "disburse")
  pinHash?: string; // Salted HMAC-SHA256 (NEVER returned to client)
  pinSalt?: string; // 32-byte hex salt (NEVER returned to client)
  failedAttempts: number; // Failed PIN attempts (max 5)
  escrowAddress?: string; // Ephemeral Base address holding deposited USDC
  encryptedEscrowKey?: string; // AES-256-GCM encrypted private key
  creatorSecret?: string; // Secret token allowing creator to refund or unlock
  creatorRefundAddress?: string; // Base address to return funds to if unclaimed
  claimantUpi?: string; // The UPI ID submitted during claim
  claimedAt?: number; // Timestamp of successful claim
}

export interface SanitizedPayLink
  extends Omit<PayLink, "pinHash" | "pinSalt" | "encryptedEscrowKey" | "creatorSecret"> {
  hasPin: boolean;
  failedAttemptsRemaining: number;
}

export function sanitizePayLink(link: PayLink): SanitizedPayLink {
  const { pinHash, pinSalt, encryptedEscrowKey, creatorSecret, ...safe } = link;
  return {
    ...safe,
    hasPin: Boolean(pinHash),
    failedAttemptsRemaining: Math.max(0, 5 - (link.failedAttempts || 0)),
  };
}

export type PayInStatus =
  | "AWAITING_PAYMENT"
  | "DETECTED"
  | "PROCESSING"
  | "ORDER_PLACED"
  | "DELIVERING_HANDSHAKE"
  | "AWAITING_FIAT_PAYMENT"
  | "SETTLED"
  | "REJECTED_UNDER_MINIMUM"
  | "STORED_IN_REFUND_WALLET"
  | "REFUNDED_TO_USER"
  | "CANCELLED_AND_REFUNDED"
  | "FAILED_AND_REFUNDED"
  | "EXPIRED";

export type DepositDiscrepancyType =
  | "EXACT"
  | "UNDERPAID_ACCEPTED"    // Sent less than expected, but >= $0.95 (No fine, pro-rated fiat)
  | "UNDERPAID_REJECTED"    // Sent < $0.95 (Fined $0.15, remainder refunded)
  | "OVERPAID_ACCEPTED";    // Sent more than expected (No fine, higher pro-rated fiat)

export interface PayInSession {
  id: string;
  clientSecret?: string; // Secret token for public checkout polling
  recipientUpi: string;
  amountINR: number;
  expectedUsdc: string;
  feeUsdc: string;
  rate: number;
  payinAddress: string;
  encryptedPrivateKey?: string; // AES-256-GCM encrypted ephemeral key (raw key is NEVER stored)
  payinPrivateKey?: string; // Backwards-compatible property (deprecated)
  sweepLock?: boolean; // Concurrency lock for EIP-3009 relay
  status: PayInStatus;
  webhookUrl?: string;
  createdAt: number;
  expiresAt: number;
  receivedUsdc?: string;
  txHash?: string;
  p2pOrderId?: string;
  creatorUserId?: string;
  creatorWalletAddress?: string;
  apiKeyId?: string;

  // Gas, Tip & Refund Fields
  gasFeeUsdc?: string; // Gas fee paid in USDC by user (if operation failed or was cancelled)
  tipUsdc?: string; // Explicit tip for provider (swept to treasury)
  tipTxHash?: string; // Tx hash of the tip sweep
  refundAddress?: string; // User-provided refund destination address
  underpaidPenaltyUsdc?: string; // Deducted penalty fee if < $0.95
  refundTxHash?: string; // Tx hash of refund transfer
  refundStatus?: "PENDING" | "REFUNDED_TO_USER" | "STORED_IN_REFUND_WALLET" | "MANUALLY_REFUNDED";

  // Discrepancy & Tolerance Metadata
  discrepancyType?: DepositDiscrepancyType;
  toleranceAppliedUsdc?: string; // e.g. "0.05"
  detectedSenderAddress?: string; // Auto-detected from on-chain ERC20 Transfer event

  // Payment proof metadata
  actualFiatAmount?: number; // Exact INR amount delivered
  actualUsdcAmount?: string; // Exact USDC released from escrow
  completedTxHash?: string; // On-chain completion tx hash on Base
  settledAt?: number; // Timestamp of completion
}

// In-memory stores — backed by fast cache + persistent file/MongoDB hydration
const payLinks = new Map<string, PayLink>();
const payInSessions = new Map<string, PayInSession>();
const claimLocks = new Set<string>();

// ────────────────── File & MongoDB Persistence ──────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const PAYLINKS_FILE = path.join(DATA_DIR, "pay_links.json");
const PAYIN_SESSIONS_FILE = path.join(DATA_DIR, "payin_sessions.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

let isHydrated = false;

async function hydratePayStore() {
  if (isHydrated) return;
  isHydrated = true;

  // 1. Read local JSON fallback files if present
  try {
    if (fs.existsSync(PAYLINKS_FILE)) {
      const raw = fs.readFileSync(PAYLINKS_FILE, "utf-8");
      const list: PayLink[] = JSON.parse(raw);
      for (const item of list) {
        payLinks.set(item.id, item);
      }
    }
  } catch (err) {
    console.warn("[PayStore] Local payLinks hydrate warning:", err);
  }

  try {
    if (fs.existsSync(PAYIN_SESSIONS_FILE)) {
      const raw = fs.readFileSync(PAYIN_SESSIONS_FILE, "utf-8");
      const list: PayInSession[] = JSON.parse(raw);
      for (const item of list) {
        payInSessions.set(item.id, item);
      }
    }
  } catch (err) {
    console.warn("[PayStore] Local payInSessions hydrate warning:", err);
  }

  // 2. Read from MongoDB and merge if configured
  try {
    const db = await getMongoDb();
    if (db) {
      const linksCol = db.collection<PayLink>("pay_links");
      const dbLinks = await linksCol.find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      for (const l of dbLinks) {
        payLinks.set(l.id, l);
      }

      const sessionsCol = db.collection<PayInSession>("payin_sessions");
      const dbSessions = await sessionsCol.find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      for (const s of dbSessions) {
        payInSessions.set(s.id, s);
      }
    }
  } catch (err) {
    console.warn("[PayStore] MongoDB hydrate warning:", err);
  }
}

// Auto-hydrate on module load
hydratePayStore().catch(() => {});

// Debounced file write
let savePayLinksTimer: NodeJS.Timeout | null = null;
function triggerSavePayLinks() {
  if (savePayLinksTimer) return;
  savePayLinksTimer = setTimeout(() => {
    savePayLinksTimer = null;
    try {
      ensureDataDir();
      const all = Array.from(payLinks.values());
      fs.writeFileSync(PAYLINKS_FILE, JSON.stringify(all, null, 2), "utf-8");
    } catch {}
  }, 1000);
}

let saveSessionsTimer: NodeJS.Timeout | null = null;
function triggerSavePayInSessions() {
  if (saveSessionsTimer) return;
  saveSessionsTimer = setTimeout(() => {
    saveSessionsTimer = null;
    try {
      ensureDataDir();
      const all = Array.from(payInSessions.values());
      fs.writeFileSync(PAYIN_SESSIONS_FILE, JSON.stringify(all, null, 2), "utf-8");
    } catch {}
  }, 1000);
}

function syncPayLinkToMongo(link: PayLink) {
  getMongoDb()
    .then((db) => {
      if (db) {
        db.collection<PayLink>("pay_links")
          .updateOne({ id: link.id }, { $set: link }, { upsert: true })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

function syncPayInSessionToMongo(session: PayInSession) {
  getMongoDb()
    .then((db) => {
      if (db) {
        db.collection<PayInSession>("payin_sessions")
          .updateOne({ id: session.id }, { $set: session }, { upsert: true })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

// ────────────────── Encryption & PIN Security ──────────────────

function getMasterEncryptionKey(): Buffer {
  const secret =
    process.env.PAYIN_MASTER_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "zkpay_default_secure_proxy_secret_v1";

  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts private key using AES-256-GCM with unique 96-bit initialization vector.
 */
export function encryptKey(plainKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterEncryptionKey(), iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM cipher payload on-the-fly for off-chain message signing.
 */
export function decryptKey(cipherPayload: string): string {
  if (cipherPayload.startsWith("0x") && !cipherPayload.includes(":")) {
    return cipherPayload;
  }
  const parts = cipherPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format");
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getMasterEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Retrieves and temporarily decrypts payin private key for off-chain EIP-712 signing.
 */
export function getDecryptedPayinKey(session: PayInSession): `0x${string}` {
  if (session.encryptedPrivateKey) {
    let key = decryptKey(session.encryptedPrivateKey).trim();
    if (!key.startsWith("0x")) key = `0x${key}`;
    return key as `0x${string}`;
  }
  if (session.payinPrivateKey) {
    let key = session.payinPrivateKey.trim();
    if (!key.startsWith("0x")) key = `0x${key}`;
    return key as `0x${string}`;
  }
  throw new Error(`No private key found for session ${session.id}`);
}

/**
 * Retrieves and temporarily decrypts escrow private key for gasless EIP-3009 sweep.
 */
export function getDecryptedEscrowKey(link: PayLink): `0x${string}` {
  if (!link.encryptedEscrowKey) {
    throw new Error(`No encrypted escrow key found for paylink ${link.id}`);
  }
  let key = decryptKey(link.encryptedEscrowKey).trim();
  if (!key.startsWith("0x")) key = `0x${key}`;
  return key as `0x${string}`;
}

/**
 * Generates a cryptographically random 32-byte hex salt for PIN hashing.
 */
export function generatePinSalt(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a salted HMAC-SHA256 hash of a 4-digit PIN combined with linkId and salt.
 */
export function hashPayLinkPin(pin: string, salt: string, linkId: string): string {
  const normalizedPin = pin.trim();
  return crypto
    .createHmac("sha256", Buffer.from(salt, "hex"))
    .update(`${linkId}:${normalizedPin}`)
    .digest("hex");
}

/**
 * Constant-time PIN verification to eliminate timing side-channel attacks.
 */
export function verifyPayLinkPin(link: PayLink, candidatePin: string): boolean {
  if (!link.pinHash || !link.pinSalt) return false;
  const candidateHash = hashPayLinkPin(candidatePin, link.pinSalt, link.id);
  const bufA = Buffer.from(link.pinHash, "hex");
  const bufB = Buffer.from(candidateHash, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Atomically acquires claim mutex lock for a paylink.
 */
export function acquirePayLinkClaimLock(id: string): boolean {
  if (claimLocks.has(id)) return false;
  claimLocks.add(id);
  return true;
}

/**
 * Releases claim mutex lock for a paylink.
 */
export function releasePayLinkClaimLock(id: string): void {
  claimLocks.delete(id);
}

/**
 * Atomically acquires a sweep mutex lock for this payin session.
 */
export function acquireSessionSweepLock(id: string): boolean {
  const session = payInSessions.get(id);
  if (!session || session.sweepLock) return false;
  session.sweepLock = true;
  return true;
}

/**
 * Releases the sweep mutex lock for this payin session.
 */
export function releaseSessionSweepLock(id: string): void {
  const session = payInSessions.get(id);
  if (session) {
    session.sweepLock = false;
  }
}

// Generates a cryptographically-secure unique ID with prefix
function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}

// ────────────────── Pay Links ──────────────────

export function createPayLink(
  data: Omit<PayLink, "id" | "status" | "createdAt" | "failedAttempts"> & {
    status?: PayLinkStatus;
    failedAttempts?: number;
    pin?: string;
  }
): PayLink {
  const mode = data.mode || "request";
  const prefix = mode === "disburse" ? "cl" : "pl";
  const initialStatus: PayLinkStatus =
    data.status || (mode === "disburse" ? "AWAITING_FUNDING" : "ACTIVE");

  const id = generateId(prefix);
  let pinHash = data.pinHash;
  let pinSalt = data.pinSalt;
  if (data.pin) {
    pinSalt = generatePinSalt();
    pinHash = hashPayLinkPin(data.pin, pinSalt, id);
  }

  const creatorSecret = data.creatorSecret || (mode === "disburse" ? generateId("sec") : undefined);
  const { pin: _rawPin, ...safeData } = data;

  const link: PayLink = {
    ...safeData,
    id,
    mode,
    status: initialStatus,
    pinHash,
    pinSalt,
    creatorSecret,
    failedAttempts: data.failedAttempts || 0,
    createdAt: Date.now(),
  };

  payLinks.set(link.id, link);
  triggerSavePayLinks();
  syncPayLinkToMongo(link);
  return link;
}

export function getPayLink(id: string): PayLink | undefined {
  return payLinks.get(id);
}

export function updatePayLink(id: string, updates: Partial<PayLink>): PayLink | undefined {
  const link = payLinks.get(id);
  if (!link) return undefined;
  const updated = { ...link, ...updates };
  payLinks.set(id, updated);
  triggerSavePayLinks();
  syncPayLinkToMongo(updated);
  return updated;
}

export function findPayLinkByTxHash(rawTxHash: string): PayLink | undefined {
  const txHash = rawTxHash.toLowerCase().trim();
  if (!txHash) return undefined;
  for (const link of payLinks.values()) {
    if (link.txHash?.toLowerCase() === txHash) {
      return link;
    }
  }
  return undefined;
}

export function listPayLinks(filter?: {
  creatorUserId?: string;
  creatorWalletAddress?: string;
  apiKeyId?: string;
}): PayLink[] {
  let list = Array.from(payLinks.values());
  if (filter?.creatorUserId) {
    list = list.filter((l) => l.creatorUserId === filter.creatorUserId);
  } else if (filter?.creatorWalletAddress) {
    const target = filter.creatorWalletAddress.toLowerCase();
    list = list.filter((l) => l.creatorWalletAddress?.toLowerCase() === target);
  } else if (filter?.apiKeyId) {
    list = list.filter((l) => l.apiKeyId === filter.apiKeyId);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

// ────────────────── Pay-In Sessions ──────────────────

export function createPayInSession(
  data: Omit<PayInSession, "id" | "status" | "createdAt"> & {
    payinPrivateKey?: string;
  }
): PayInSession {
  const clientSecret = data.clientSecret || crypto.randomUUID().replace(/-/g, "");
  const rawKey = data.payinPrivateKey;
  const encryptedPrivateKey = rawKey ? encryptKey(rawKey) : data.encryptedPrivateKey;

  // Clone data and omit raw private key to ensure it is NEVER stored in plaintext memory
  const { payinPrivateKey: _raw, ...safeData } = data;

  const session: PayInSession = {
    ...safeData,
    id: generateId("ses"),
    clientSecret,
    encryptedPrivateKey,
    status: "AWAITING_PAYMENT",
    createdAt: Date.now(),
  };
  payInSessions.set(session.id, session);
  triggerSavePayInSessions();
  syncPayInSessionToMongo(session);
  return session;
}

export function getPayInSession(id: string): PayInSession | undefined {
  return payInSessions.get(id);
}

export function updatePayInSession(
  id: string,
  updates: Partial<PayInSession>
): PayInSession | undefined {
  const session = payInSessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates };
  payInSessions.set(id, updated);
  triggerSavePayInSessions();
  syncPayInSessionToMongo(updated);
  return updated;
}

export function getActivePayInSessions(): PayInSession[] {
  return Array.from(payInSessions.values()).filter(
    (s) => s.status === "AWAITING_PAYMENT" && s.expiresAt > Date.now()
  );
}

export function expireOldSessions(): number {
  let expired = 0;
  const now = Date.now();
  for (const [id, session] of payInSessions.entries()) {
    if (session.status === "AWAITING_PAYMENT" && session.expiresAt <= now) {
      const updated = { ...session, status: "EXPIRED" as PayInStatus };
      payInSessions.set(id, updated);
      syncPayInSessionToMongo(updated);
      expired++;
    }
  }
  if (expired > 0) {
    triggerSavePayInSessions();
  }
  return expired;
}

export function listAllPayInSessions(): PayInSession[] {
  return Array.from(payInSessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}
