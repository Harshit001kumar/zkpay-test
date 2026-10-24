import crypto from "crypto";

export interface PayLink {
  id: string;
  title: string;
  amountINR: number;
  recipientUpi: string;
  type: "one_time" | "reusable";
  status: "ACTIVE" | "PAID" | "EXPIRED";
  webhookUrl?: string;
  redirectUrl?: string;
  estimatedUsdc: string;
  rate: number;
  createdAt: number;
  paidAt?: number;
  txHash?: string;
  p2pOrderId?: string;
  creatorUserId?: string;
  creatorWalletAddress?: string;
  apiKeyId?: string;
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
  underpaidPenaltyUsdc?: string; // Deducted penalty fee if < $1.00
  refundTxHash?: string; // Tx hash of refund transfer
  refundStatus?: "PENDING" | "REFUNDED_TO_USER" | "STORED_IN_REFUND_WALLET" | "MANUALLY_REFUNDED";

  // Payment proof metadata
  actualFiatAmount?: number; // Exact INR amount delivered
  actualUsdcAmount?: string; // Exact USDC released from escrow
  completedTxHash?: string; // On-chain completion tx hash on Base
  settledAt?: number; // Timestamp of completion
}

// In-memory stores — MVP, with TTL and secure key isolation
const payLinks = new Map<string, PayLink>();
const payInSessions = new Map<string, PayInSession>();

// In-memory runtime fallback generated if no env secret is supplied (never a static public string)
let _runtimeFallbackSecret: string | null = null;

// Generates master 256-bit encryption key from environment secret
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
 * Atomically acquires a sweep mutex lock for this session.
 */
export function acquireSessionSweepLock(id: string): boolean {
  const session = payInSessions.get(id);
  if (!session || session.sweepLock) return false;
  session.sweepLock = true;
  return true;
}

/**
 * Releases the sweep mutex lock for this session.
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

export function createPayLink(data: Omit<PayLink, "id" | "status" | "createdAt">): PayLink {
  const link: PayLink = {
    ...data,
    id: generateId("pl"),
    status: "ACTIVE",
    createdAt: Date.now(),
  };
  payLinks.set(link.id, link);
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

export function listPayLinks(): PayLink[] {
  return Array.from(payLinks.values()).sort((a, b) => b.createdAt - a.createdAt);
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
  return session;
}

export function getPayInSession(id: string): PayInSession | undefined {
  return payInSessions.get(id);
}

export function updatePayInSession(id: string, updates: Partial<PayInSession>): PayInSession | undefined {
  const session = payInSessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates };
  payInSessions.set(id, updated);
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
      payInSessions.set(id, { ...session, status: "EXPIRED" });
      expired++;
    }
  }
  return expired;
}

export function listAllPayInSessions(): PayInSession[] {
  return Array.from(payInSessions.values()).sort((a, b) => b.createdAt - a.createdAt);
}
