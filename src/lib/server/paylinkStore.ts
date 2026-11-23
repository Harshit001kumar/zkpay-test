import crypto from "crypto";
import {
  SWAP_ALLOWED_TOKENS,
  TEMPORARILY_DISABLED_CHAINS,
  isZeroFeeChain,
  normalizeChain,
} from "@/lib/constants";
import type { SwapTokenItem } from "@/lib/types";
import { isValidAddressForOriginAsset } from "@/lib/refundAddress";
import { getMongoDb, isMongoConfigured } from "./mongodb";
import { getLiveTokenPriceUsd } from "./priceService";
import { isProxySupportedChain } from "./proxyWallets";
import { getRecentProxyOrders, type ProxySwapOrder } from "./proxySwapStore";
import type { DirectSwapOrder } from "./directSwapStore";
import { getSwapQuote } from "./swapRouter";

export interface SavedReceivingAddress {
  id: string;
  userId: string;
  label: string;
  chain: string;
  address: string;
  createdAt: number;
}

export interface PaylinkRecord {
  id: string;
  slug: string;
  creatorUserId: string;
  title: string;
  description?: string;
  receiveAssetId: string;
  receiveSymbol: string;
  receiveChain: string;
  receiveDecimals: number;
  recipientAddress: string;
  amountMode: "OPEN" | "FIXED";
  fixedAmount?: string;
  fixedCurrency?: "USD" | "ASSET";
  singleUse: boolean;
  status: "ACTIVE" | "PAUSED" | "PAID";
  paidSwapId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PublicPaylinkView = Omit<PaylinkRecord, "creatorUserId">;

export interface PaylinkPaymentSummary {
  swapId: string;
  fromAsset: string;
  originChain: string;
  amountInFormatted: string;
  toAsset: string;
  destinationChain: string;
  amountOutFormatted: string;
  status: string;
  destinationTxHash: string | null;
  destinationExplorerUrl: string | null;
  createdAt: number;
}

export interface PaylinkPaymentStats {
  totalCount: number;
  settledCount: number;
  pendingCount: number;
  payments: PaylinkPaymentSummary[];
}

export interface DirectPaylinkQuoteResult {
  mode: "DIRECT_SAME_ASSET";
  originToken: SwapTokenItem;
  receiveToken: SwapTokenItem;
  depositAddress: string;
  amountInFormatted: string | null;
  amountOutFormatted: string | null;
  targetReceiveTokens?: string | null;
  targetReceiveUsd?: number | null;
  feeBps: 0;
  timeEstimateSeconds: number;
}

export interface SwapPaylinkQuoteResult {
  mode: "SWAP";
  originToken: SwapTokenItem;
  receiveToken: SwapTokenItem;
  inputAmountAtomic: string;
  inputAmountFormatted: string;
  targetReceiveTokens?: string | null;
  targetReceiveUsd?: number | null;
  quote: Awaited<ReturnType<typeof getSwapQuote>>;
}

export type PaylinkQuoteResult = DirectPaylinkQuoteResult | SwapPaylinkQuoteResult;

const PAYLINKS_COLLECTION = "paylinks";
const ADDRESSES_COLLECTION = "paylink_addresses";
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const RESERVED_SLUGS = new Set([
  "api",
  "new",
  "create",
  "addresses",
  "admin",
  "docs",
  "partner",
  "wallet",
  "tx",
  "pay",
  "privacy",
  "terms",
]);
const EVM_CHAINS = new Set(["base", "eth", "arb", "polygon", "bsc"]);
const MAX_ACTIVE_PAYLINKS_PER_USER = 25;

// In-memory fallbacks when MongoDB is offline (used in local verification or dev mode)
const paylinksBySlug = new Map<string, PaylinkRecord>();
const paylinksById = new Map<string, PaylinkRecord>();
const addressesByUser = new Map<string, SavedReceivingAddress[]>();

function makeError(message: string, code: string, statusCode: number): Error {
  const err: any = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

export function normalizeAddressForChain(chain: string, address: string): string {
  const clean = (address || "").trim();
  const c = normalizeChain(chain) || chain.toLowerCase();
  if (EVM_CHAINS.has(c)) return clean.toLowerCase();
  if (c === "ltc" && clean.toLowerCase().startsWith("ltc1")) return clean.toLowerCase();
  if (c === "btc" && clean.toLowerCase().startsWith("bc1")) return clean.toLowerCase();
  return clean;
}

export function formatCleanDecimal(num: number, maxDecimals: number): string {
  if (!Number.isFinite(num) || num <= 0) return "0";
  const frac = Math.min(8, Math.max(0, maxDecimals));
  return num.toFixed(frac).replace(/\.?0+$/, "") || "0";
}

/**
 * Converts a positive human decimal amount string (e.g. "0.25", "10") into exact integer atomic units.
 * Returns null for zero, negative, or unparseable inputs.
 */
export function toAtomicUnitsString(humanStr: string, decimals: number): string | null {
  let clean = (humanStr || "").trim();
  if (!clean || isNaN(Number(clean)) || Number(clean) <= 0) return null;
  try {
    if (/[eE]/.test(clean)) {
      clean = Number(clean).toFixed(Math.min(Math.max(decimals, 0), 18));
    }
    if (!/^\d+(\.\d+)?$/.test(clean)) return null;
    const [whole = "0", frac = ""] = clean.split(".");
    const paddedFrac = frac.slice(0, decimals).padEnd(decimals, "0");
    const combined = `${whole}${paddedFrac}`.replace(/^0+/, "") || "0";
    const bi = BigInt(combined);
    return bi > 0n ? bi.toString() : null;
  } catch {
    return null;
  }
}

export function atomicToHumanFormatted(atomicStr: string, decimals: number): string {
  try {
    const val = BigInt(atomicStr);
    if (val <= 0n) return "0";
    const base = 10n ** BigInt(decimals);
    const whole = val / base;
    const rem = val % base;
    if (rem === 0n) return whole.toString();
    const fracFull = rem.toString().padStart(decimals, "0");
    const maxDisplay = Math.min(6, decimals);
    const fracTrimmed = fracFull.slice(0, maxDisplay).replace(/0+$/, "");
    if (fracTrimmed.length > 0) return `${whole.toString()}.${fracTrimmed}`;
    // Preserve first significant fractional digits for tiny amounts
    const sigMatch = fracFull.match(/^0*[1-9]\d{0,2}/);
    return sigMatch ? `${whole.toString()}.${sigMatch[0]}` : whole.toString();
  } catch {
    return "0";
  }
}

export function resolveAllowedToken(
  assetIdOrSymbol: string,
  chainHint?: string | null
): SwapTokenItem | null {
  const clean = (assetIdOrSymbol || "").trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const normChain = chainHint ? normalizeChain(chainHint) : undefined;

  const exactAsset = SWAP_ALLOWED_TOKENS.find((t) => t.assetId.toLowerCase() === lower);
  if (exactAsset) {
    if (TEMPORARILY_DISABLED_CHAINS.has(exactAsset.blockchain)) return null;
    return exactAsset as SwapTokenItem;
  }

  const upperSym = clean.toUpperCase();
  const bySymbol = SWAP_ALLOWED_TOKENS.filter((t) => t.symbol.toUpperCase() === upperSym);
  if (bySymbol.length === 0) return null;

  if (normChain) {
    const matched = bySymbol.find((t) => normalizeChain(t.blockchain) === normChain);
    if (!matched || TEMPORARILY_DISABLED_CHAINS.has(matched.blockchain)) return null;
    return matched as SwapTokenItem;
  }

  if (bySymbol.length === 1 && !TEMPORARILY_DISABLED_CHAINS.has(bySymbol[0].blockchain)) {
    return bySymbol[0] as SwapTokenItem;
  }
  return null;
}

export function getSampleAssetIdForChain(chain: string): string | null {
  const norm = normalizeChain(chain);
  if (!norm) return null;
  const tok = SWAP_ALLOWED_TOKENS.find((t) => normalizeChain(t.blockchain) === norm);
  return tok ? tok.assetId : null;
}

export function generatePaylinkSlug(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export function validateCustomSlug(raw: string): string {
  const clean = (raw || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/.test(clean) || clean.includes("--")) {
    throw makeError(
      "Custom slug must be 4-32 characters using lowercase letters, numbers, and single hyphens.",
      "INVALID_SLUG",
      400
    );
  }
  if (RESERVED_SLUGS.has(clean)) {
    throw makeError(`Slug '${clean}' is reserved.`, "RESERVED_SLUG", 400);
  }
  return clean;
}

export function sanitizePublicPaylink(rec: PaylinkRecord): PublicPaylinkView {
  const { creatorUserId: _hidden, ...pub } = rec;
  return pub;
}

function cachePaylink(rec: PaylinkRecord) {
  paylinksBySlug.set(rec.slug.toLowerCase(), rec);
  paylinksById.set(rec.id, rec);
}

// ─────────────────────────────────────────────────────────────
// Saved Receiving Address Book CRUD
// ─────────────────────────────────────────────────────────────

export async function listSavedAddressesForUser(
  userId: string
): Promise<SavedReceivingAddress[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const docs = await db
        .collection<SavedReceivingAddress>(ADDRESSES_COLLECTION)
        .find({ userId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
      addressesByUser.set(userId, docs);
      return docs;
    }
  } catch (err) {
    console.warn("[PaylinkStore] listSavedAddresses Mongo warning:", err);
  }
  return [...(addressesByUser.get(userId) || [])].sort((a, b) => b.createdAt - a.createdAt);
}

export async function upsertSavedAddressForUser(params: {
  userId: string;
  chain: string;
  address: string;
  label?: string;
}): Promise<SavedReceivingAddress> {
  const normChain = normalizeChain(params.chain);
  if (!normChain || TEMPORARILY_DISABLED_CHAINS.has(normChain)) {
    throw makeError("Unsupported or disabled blockchain.", "INVALID_CHAIN", 400);
  }

  const sampleAssetId = getSampleAssetIdForChain(normChain);
  if (!sampleAssetId || !isValidAddressForOriginAsset(sampleAssetId, params.address)) {
    throw makeError(
      `Invalid receiving address for ${normChain.toUpperCase()}.`,
      "INVALID_ADDRESS",
      400
    );
  }

  const normalizedAddr = normalizeAddressForChain(normChain, params.address);
  const cleanLabel =
    (params.label || "").trim().slice(0, 40) ||
    `${normChain.toUpperCase()} Wallet`;

  const record: SavedReceivingAddress = {
    id: `addr_${crypto.randomBytes(6).toString("hex")}`,
    userId: params.userId,
    label: cleanLabel,
    chain: normChain,
    address: normalizedAddr,
    createdAt: Date.now(),
  };

  try {
    const db = await getMongoDb();
    if (db) {
      const coll = db.collection<SavedReceivingAddress>(ADDRESSES_COLLECTION);
      const existing = await coll.findOne(
        { userId: params.userId, chain: normChain, address: normalizedAddr },
        { projection: { _id: 0 } }
      );
      if (existing) {
        if (params.label && params.label.trim() && params.label.trim() !== existing.label) {
          const nextLabel = params.label.trim().slice(0, 40);
          await coll.updateOne({ id: existing.id, userId: params.userId }, { $set: { label: nextLabel } });
          return { ...existing, label: nextLabel };
        }
        return existing;
      }
      await coll.insertOne(record as any);
      return record;
    }
  } catch (err) {
    console.warn("[PaylinkStore] upsertSavedAddress Mongo warning:", err);
  }

  const list = addressesByUser.get(params.userId) || [];
  const idx = list.findIndex(
    (a) => a.chain === normChain && a.address === normalizedAddr
  );
  if (idx >= 0) {
    if (params.label && params.label.trim()) {
      list[idx] = { ...list[idx], label: cleanLabel };
    }
    addressesByUser.set(params.userId, list);
    return list[idx];
  }
  const updated = [record, ...list].slice(0, 50);
  addressesByUser.set(params.userId, updated);
  return record;
}

export async function deleteSavedAddressForUser(
  userId: string,
  addressId: string
): Promise<boolean> {
  const cleanId = (addressId || "").trim();
  if (!cleanId) return false;
  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db
        .collection<SavedReceivingAddress>(ADDRESSES_COLLECTION)
        .deleteOne({ id: cleanId, userId });
      if (res.deletedCount > 0) {
        const list = (addressesByUser.get(userId) || []).filter((a) => a.id !== cleanId);
        addressesByUser.set(userId, list);
        return true;
      }
      return false;
    }
  } catch (err) {
    console.warn("[PaylinkStore] deleteSavedAddress Mongo warning:", err);
  }

  const list = addressesByUser.get(userId) || [];
  const next = list.filter((a) => a.id !== cleanId);
  if (next.length === list.length) return false;
  addressesByUser.set(userId, next);
  return true;
}

// ─────────────────────────────────────────────────────────────
// Paylink CRUD
// ─────────────────────────────────────────────────────────────

export async function getPaylinkBySlug(slug: string): Promise<PaylinkRecord | null> {
  const cleanSlug = (slug || "").trim().toLowerCase();
  if (!cleanSlug) return null;
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db
        .collection<PaylinkRecord>(PAYLINKS_COLLECTION)
        .findOne({ slug: cleanSlug }, { projection: { _id: 0 } });
      if (doc) {
        cachePaylink(doc);
        return doc;
      }
      return null;
    }
  } catch (err) {
    console.warn("[PaylinkStore] getPaylinkBySlug Mongo warning:", err);
  }
  return paylinksBySlug.get(cleanSlug) || null;
}

export async function getPaylinkById(id: string): Promise<PaylinkRecord | null> {
  const cleanId = (id || "").trim();
  if (!cleanId) return null;
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db
        .collection<PaylinkRecord>(PAYLINKS_COLLECTION)
        .findOne({ id: cleanId }, { projection: { _id: 0 } });
      if (doc) {
        cachePaylink(doc);
        return doc;
      }
      return null;
    }
  } catch (err) {
    console.warn("[PaylinkStore] getPaylinkById Mongo warning:", err);
  }
  return paylinksById.get(cleanId) || null;
}

export async function listPaylinksForUser(userId: string): Promise<PaylinkRecord[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      const docs = await db
        .collection<PaylinkRecord>(PAYLINKS_COLLECTION)
        .find({ creatorUserId: userId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      for (const doc of docs) cachePaylink(doc);
      return docs;
    }
  } catch (err) {
    console.warn("[PaylinkStore] listPaylinksForUser Mongo warning:", err);
  }
  return Array.from(paylinksById.values())
    .filter((p) => p.creatorUserId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPaylink(params: {
  creatorUserId: string;
  title?: string;
  description?: string;
  receiveAssetId: string;
  receiveChain?: string;
  recipientAddress: string;
  amountMode?: "OPEN" | "FIXED";
  fixedAmount?: string;
  fixedCurrency?: "USD" | "ASSET";
  singleUse?: boolean;
  customSlug?: string;
  addressLabel?: string;
}): Promise<PaylinkRecord> {
  const token = resolveAllowedToken(params.receiveAssetId, params.receiveChain);
  if (!token) {
    throw makeError(
      "Selected receiving currency is not supported.",
      "UNSUPPORTED_RECEIVE_ASSET",
      400
    );
  }

  if (!isValidAddressForOriginAsset(token.assetId, params.recipientAddress)) {
    throw makeError(
      `Receiving address is invalid for ${token.symbol} on ${token.blockchain.toUpperCase()}.`,
      "INVALID_RECIPIENT",
      400
    );
  }

  const amountMode: "OPEN" | "FIXED" = params.amountMode === "FIXED" ? "FIXED" : "OPEN";
  let cleanFixedAmount: string | undefined;
  let cleanFixedCurrency: "USD" | "ASSET" | undefined;

  if (amountMode === "FIXED") {
    const rawAmt = (params.fixedAmount || "").trim();
    const numAmt = Number(rawAmt);
    if (!rawAmt || !/^\d+(\.\d+)?$/.test(rawAmt) || !Number.isFinite(numAmt) || numAmt <= 0) {
      throw makeError(
        "Fixed amount must be a positive number.",
        "INVALID_FIXED_AMOUNT",
        400
      );
    }
    cleanFixedCurrency = params.fixedCurrency === "ASSET" ? "ASSET" : "USD";
    const maxDecimals = cleanFixedCurrency === "USD" ? 2 : token.decimals;
    const parts = rawAmt.split(".");
    if (parts[1] && parts[1].length > maxDecimals) {
      throw makeError(
        `Amount cannot have more than ${maxDecimals} decimal places.`,
        "INVALID_FIXED_AMOUNT",
        400
      );
    }
    cleanFixedAmount = rawAmt;
  }

  const existingUserLinks = await listPaylinksForUser(params.creatorUserId);
  const activeCount = existingUserLinks.filter((l) => l.status === "ACTIVE").length;
  if (activeCount >= MAX_ACTIVE_PAYLINKS_PER_USER) {
    throw makeError(
      `Maximum of ${MAX_ACTIVE_PAYLINKS_PER_USER} active Paylinks reached. Pause or delete an existing link first.`,
      "PAYLINK_LIMIT_REACHED",
      400
    );
  }

  let slug = "";
  if (params.customSlug && params.customSlug.trim() !== "") {
    slug = validateCustomSlug(params.customSlug);
    const existing = await getPaylinkBySlug(slug);
    if (existing) {
      throw makeError(
        `Custom Paylink URL '/pay/${slug}' is already taken.`,
        "SLUG_TAKEN",
        409
      );
    }
  } else {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generatePaylinkSlug(8);
      if (RESERVED_SLUGS.has(candidate)) continue;
      const clash = await getPaylinkBySlug(candidate);
      if (!clash) {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      throw makeError("Unable to allocate unique Paylink slug. Please retry.", "SLUG_GENERATION_FAILED", 500);
    }
  }

  const normalizedRecipient = normalizeAddressForChain(token.blockchain, params.recipientAddress);
  const cleanTitle = (params.title || "").trim().slice(0, 80) || `Pay ${token.symbol}`;
  const cleanDesc = (params.description || "").trim().slice(0, 160) || undefined;
  const now = Date.now();

  const record: PaylinkRecord = {
    id: `pl_${crypto.randomBytes(8).toString("hex")}`,
    slug,
    creatorUserId: params.creatorUserId,
    title: cleanTitle,
    ...(cleanDesc ? { description: cleanDesc } : {}),
    receiveAssetId: token.assetId,
    receiveSymbol: token.symbol,
    receiveChain: token.blockchain,
    receiveDecimals: token.decimals,
    recipientAddress: normalizedRecipient,
    amountMode,
    ...(cleanFixedAmount ? { fixedAmount: cleanFixedAmount, fixedCurrency: cleanFixedCurrency } : {}),
    singleUse: Boolean(params.singleUse),
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection<PaylinkRecord>(PAYLINKS_COLLECTION).insertOne(record as any);
    }
  } catch (err: any) {
    if (err?.code === 11000) {
      throw makeError(`Paylink slug '/pay/${slug}' is already taken.`, "SLUG_TAKEN", 409);
    }
    console.warn("[PaylinkStore] createPaylink Mongo warning:", err);
  }

  cachePaylink(record);

  // Auto-save receiving address to user's address book (best-effort)
  upsertSavedAddressForUser({
    userId: params.creatorUserId,
    chain: token.blockchain,
    address: normalizedRecipient,
    label: params.addressLabel || `${token.symbol} (${token.blockchain.toUpperCase()})`,
  }).catch(() => {});

  return record;
}

export async function updatePaylinkForUser(
  userId: string,
  slugOrId: string,
  patch: {
    status?: "ACTIVE" | "PAUSED";
    title?: string;
    description?: string;
  }
): Promise<PaylinkRecord | null> {
  const cleanKey = (slugOrId || "").trim().toLowerCase();
  if (!cleanKey) return null;

  const updates: Partial<PaylinkRecord> = { updatedAt: Date.now() };
  if (patch.status === "ACTIVE" || patch.status === "PAUSED") {
    updates.status = patch.status;
  }
  if (typeof patch.title === "string") {
    const t = patch.title.trim().slice(0, 80);
    if (t) updates.title = t;
  }
  if (typeof patch.description === "string") {
    updates.description = patch.description.trim().slice(0, 160);
  }

  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection<PaylinkRecord>(PAYLINKS_COLLECTION).findOneAndUpdate(
        {
          creatorUserId: userId,
          $or: [{ slug: cleanKey }, { id: (slugOrId || "").trim() }],
        } as any,
        { $set: updates },
        { returnDocument: "after", projection: { _id: 0 } }
      );
      const updatedDoc = (
        res && typeof res === "object" && "value" in res ? (res as any).value : res
      ) as PaylinkRecord | null;
      if (updatedDoc) {
        cachePaylink(updatedDoc);
        return updatedDoc;
      }
      return null;
    }
  } catch (err) {
    console.warn("[PaylinkStore] updatePaylink Mongo warning:", err);
  }

  const existing =
    paylinksBySlug.get(cleanKey) || paylinksById.get((slugOrId || "").trim()) || null;
  if (!existing || existing.creatorUserId !== userId) return null;
  const merged = { ...existing, ...updates };
  cachePaylink(merged);
  return merged;
}

export async function deletePaylinkForUser(
  userId: string,
  slugOrId: string
): Promise<boolean> {
  const raw = (slugOrId || "").trim();
  const cleanSlug = raw.toLowerCase();
  if (!raw) return false;

  try {
    const db = await getMongoDb();
    if (db) {
      const res = await db.collection<PaylinkRecord>(PAYLINKS_COLLECTION).findOneAndDelete({
        creatorUserId: userId,
        $or: [{ slug: cleanSlug }, { id: raw }],
      } as any);
      const deletedDoc = (
        res && typeof res === "object" && "value" in res ? (res as any).value : res
      ) as PaylinkRecord | null;
      if (deletedDoc) {
        paylinksBySlug.delete(deletedDoc.slug.toLowerCase());
        paylinksById.delete(deletedDoc.id);
        return true;
      }
      return false;
    }
  } catch (err) {
    console.warn("[PaylinkStore] deletePaylink Mongo warning:", err);
  }

  const existing = paylinksBySlug.get(cleanSlug) || paylinksById.get(raw) || null;
  if (!existing || existing.creatorUserId !== userId) return false;
  paylinksBySlug.delete(existing.slug.toLowerCase());
  paylinksById.delete(existing.id);
  return true;
}

export async function markPaylinkPaidIfSingleUse(
  paylinkId: string,
  swapId?: string
): Promise<void> {
  const cleanId = (paylinkId || "").trim();
  if (!cleanId) return;
  const now = Date.now();

  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection<PaylinkRecord>(PAYLINKS_COLLECTION).updateOne(
        { id: cleanId, singleUse: true, status: "ACTIVE" } as any,
        {
          $set: {
            status: "PAID",
            ...(swapId ? { paidSwapId: swapId } : {}),
            updatedAt: now,
          },
        }
      );
    }
  } catch (err) {
    console.warn("[PaylinkStore] markPaylinkPaidIfSingleUse warning:", err);
  }

  const cached = paylinksById.get(cleanId);
  if (cached && cached.singleUse && cached.status === "ACTIVE") {
    const updated: PaylinkRecord = {
      ...cached,
      status: "PAID",
      ...(swapId ? { paidSwapId: swapId } : {}),
      updatedAt: now,
    };
    cachePaylink(updated);
  }
}

// ─────────────────────────────────────────────────────────────
// Payment Attribution Query (Reads Existing Swap Orders)
// ─────────────────────────────────────────────────────────────

export async function getPaylinkPaymentsByIds(
  paylinkIds: string[]
): Promise<Record<string, PaylinkPaymentStats>> {
  const out: Record<string, PaylinkPaymentStats> = {};
  for (const id of paylinkIds) {
    out[id] = { totalCount: 0, settledCount: 0, pendingCount: 0, payments: [] };
  }
  if (paylinkIds.length === 0) return out;

  let proxyOrders: ProxySwapOrder[] = [];
  let directOrders: DirectSwapOrder[] = [];

  try {
    const db = await getMongoDb();
    if (db) {
      const [pDocs, dDocs] = await Promise.all([
        db
          .collection<ProxySwapOrder>("proxy_swap_orders")
          .find({ paylinkId: { $in: paylinkIds } } as any, { projection: { _id: 0, encryptedPrivateKey: 0 } })
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
        db
          .collection<DirectSwapOrder>("direct_swap_orders")
          .find({ paylinkId: { $in: paylinkIds } } as any, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(200)
          .toArray(),
      ]);
      proxyOrders = pDocs;
      directOrders = dDocs;
    } else {
      const recent = await getRecentProxyOrders(100);
      proxyOrders = recent.filter((o) => o.paylinkId && paylinkIds.includes(o.paylinkId));
    }
  } catch (err) {
    console.warn("[PaylinkStore] getPaylinkPaymentsByIds warning:", err);
  }

  const pushEntry = (pid: string, summary: PaylinkPaymentSummary) => {
    const bucket = out[pid];
    if (!bucket) return;
    bucket.totalCount += 1;
    const st = summary.status.toUpperCase();
    if (st === "SETTLED" || st === "SUCCESS") bucket.settledCount += 1;
    else if (
      st === "PENDING_DEPOSIT" ||
      st === "DETECTED" ||
      st === "PAYING_OUT" ||
      st === "FORWARDING" ||
      st === "FORWARDED"
    ) {
      bucket.pendingCount += 1;
    }
    if (bucket.payments.length < 25) {
      bucket.payments.push(summary);
    }
  };

  const resolveSymbol = (raw: string, chain: string) =>
    resolveAllowedToken(raw, chain)?.symbol || raw;

  for (const o of proxyOrders) {
    if (!o.paylinkId) continue;
    pushEntry(o.paylinkId, {
      swapId: o.swapId,
      fromAsset: resolveSymbol(o.fromAsset, o.chain),
      originChain: o.chain,
      amountInFormatted: o.totalAmountFormatted || "0",
      toAsset: resolveSymbol(o.toAsset, o.destinationChain),
      destinationChain: o.destinationChain,
      amountOutFormatted: o.settledAmountFormatted || o.expectedAmountOutFormatted || "—",
      status: o.status,
      destinationTxHash: o.destinationTxHash || o.forwardTxHash || null,
      destinationExplorerUrl: o.destinationExplorerUrl || null,
      createdAt: o.createdAt,
    });
  }

  for (const d of directOrders) {
    if (!d.paylinkId) continue;
    pushEntry(d.paylinkId, {
      swapId: d.swapId,
      fromAsset: resolveSymbol(d.fromAsset, d.originChain),
      originChain: d.originChain,
      amountInFormatted: d.totalAmountFormatted || "0",
      toAsset: resolveSymbol(d.toAsset, d.destinationChain),
      destinationChain: d.destinationChain,
      amountOutFormatted: d.estimatedAmountOut || "—",
      status: d.lastKnownStatus || "PENDING_DEPOSIT",
      destinationTxHash: null,
      destinationExplorerUrl: null,
      createdAt: d.createdAt,
    });
  }

  for (const pid of paylinkIds) {
    out[pid].payments.sort((a, b) => b.createdAt - a.createdAt);
  }

  return out;
}

/**
 * Checks whether a single-use Paylink already has an active funded/in-flight payment
 * so concurrent payers cannot obtain duplicate active settlement orders before it transitions to PAID.
 */
export async function hasInFlightSingleUsePayment(paylinkId: string): Promise<boolean> {
  if (!paylinkId || !isMongoConfigured()) return false;
  try {
    const db = await getMongoDb();
    if (!db) return false;
    const cutoff = Date.now() - 15 * 60_000;

    const [activeProxy, activeDirect] = await Promise.all([
      db.collection("proxy_swap_orders").findOne(
        {
          paylinkId,
          createdAt: { $gt: cutoff },
          status: { $in: ["DETECTED", "PAYING_OUT", "FORWARDING", "FORWARDED", "SETTLED"] },
        },
        { projection: { swapId: 1 } }
      ),
      db.collection("direct_swap_orders").findOne(
        {
          paylinkId,
          createdAt: { $gt: cutoff },
          lastKnownStatus: { $in: ["PROCESSING", "SETTLED"] },
        },
        { projection: { swapId: 1 } }
      ),
    ]);

    return Boolean(activeProxy || activeDirect);
  } catch (err) {
    console.warn("[PaylinkStore] hasInFlightSingleUsePayment failed:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Shared Quote & Fixed-Amount Reverse Calculation
// ─────────────────────────────────────────────────────────────

export async function resolveOpenPaylinkInputAtomic(params: {
  originToken: SwapTokenItem;
  amountHuman?: string | null;
  amountAtomic?: string | null;
  amountUsd?: number | null;
}): Promise<{ atomic: string; formatted: string }> {
  const { originToken } = params;
  if (
    params.amountAtomic &&
    /^\d+$/.test(params.amountAtomic.trim()) &&
    BigInt(params.amountAtomic.trim()) > 0n
  ) {
    const atomic = params.amountAtomic.trim();
    return { atomic, formatted: atomicToHumanFormatted(atomic, originToken.decimals) };
  }
  if (params.amountHuman && params.amountHuman.trim() !== "") {
    const atomic = toAtomicUnitsString(params.amountHuman, originToken.decimals);
    if (!atomic) {
      throw makeError("Payment amount must be greater than zero.", "INVALID_AMOUNT", 400);
    }
    return { atomic, formatted: params.amountHuman.trim() };
  }
  if (typeof params.amountUsd === "number" && Number.isFinite(params.amountUsd) && params.amountUsd > 0) {
    const priceUsd = await getLiveTokenPriceUsd(originToken.symbol);
    if (priceUsd <= 0) {
      throw makeError(
        `Live USD price unavailable for ${originToken.symbol}.`,
        "PRICE_UNAVAILABLE",
        503
      );
    }
    const human = formatCleanDecimal(
      params.amountUsd / priceUsd,
      Math.min(8, originToken.decimals)
    );
    const atomic = toAtomicUnitsString(human, originToken.decimals);
    if (!atomic) {
      throw makeError("USD amount too small for selected token.", "AMOUNT_BELOW_MINIMUM", 400);
    }
    return { atomic, formatted: human };
  }
  throw makeError("Please enter a payment amount.", "INVALID_AMOUNT", 400);
}

export async function computePaylinkQuote(params: {
  paylink: PaylinkRecord;
  fromAsset: string;
  originChain?: string | null;
  amountHuman?: string | null;
  amountAtomic?: string | null;
  amountUsd?: number | null;
  slippageBps?: number | null;
  refundTo?: string | null;
}): Promise<PaylinkQuoteResult> {
  const { paylink } = params;
  const originToken = resolveAllowedToken(params.fromAsset, params.originChain);
  if (!originToken) {
    throw makeError(
      `Unsupported pay currency '${params.fromAsset}'.`,
      "UNSUPPORTED_ASSET",
      400
    );
  }

  const receiveToken =
    resolveAllowedToken(paylink.receiveAssetId, paylink.receiveChain) || {
      symbol: paylink.receiveSymbol,
      name: paylink.receiveSymbol,
      assetId: paylink.receiveAssetId,
      blockchain: paylink.receiveChain,
      decimals: paylink.receiveDecimals,
    };

  const resolveOpenAmount = () =>
    resolveOpenPaylinkInputAtomic({
      originToken,
      amountHuman: params.amountHuman,
      amountAtomic: params.amountAtomic,
      amountUsd: params.amountUsd,
    });

  // Same-asset & same-chain direct transfer (0% fee, direct to creator's address)
  if (originToken.assetId.toLowerCase() === paylink.receiveAssetId.toLowerCase()) {
    if (paylink.amountMode === "FIXED") {
      const fixedNum = Number(paylink.fixedAmount || "0");
      if (paylink.fixedCurrency === "ASSET") {
        return {
          mode: "DIRECT_SAME_ASSET",
          originToken,
          receiveToken,
          depositAddress: paylink.recipientAddress,
          amountInFormatted: paylink.fixedAmount || "0",
          amountOutFormatted: paylink.fixedAmount || "0",
          targetReceiveTokens: paylink.fixedAmount || "0",
          targetReceiveUsd: null,
          feeBps: 0,
          timeEstimateSeconds: 15,
        };
      }
      const recPrice = await getLiveTokenPriceUsd(paylink.receiveSymbol);
      if (recPrice <= 0) {
        throw makeError(`Live USD price unavailable for ${paylink.receiveSymbol}.`, "PRICE_UNAVAILABLE", 503);
      }
      const exactTokens = formatCleanDecimal(fixedNum / recPrice, Math.min(6, paylink.receiveDecimals));
      return {
        mode: "DIRECT_SAME_ASSET",
        originToken,
        receiveToken,
        depositAddress: paylink.recipientAddress,
        amountInFormatted: exactTokens,
        amountOutFormatted: exactTokens,
        targetReceiveTokens: exactTokens,
        targetReceiveUsd: Math.round(fixedNum * 100) / 100,
        feeBps: 0,
        timeEstimateSeconds: 15,
      };
    }

    let directAmt: string | null = null;
    if (params.amountHuman && Number(params.amountHuman) > 0) {
      directAmt = params.amountHuman.trim();
    } else if (typeof params.amountUsd === "number" && params.amountUsd > 0) {
      const p = await getLiveTokenPriceUsd(originToken.symbol);
      if (p > 0) directAmt = formatCleanDecimal(params.amountUsd / p, Math.min(6, originToken.decimals));
    }

    return {
      mode: "DIRECT_SAME_ASSET",
      originToken,
      receiveToken,
      depositAddress: paylink.recipientAddress,
      amountInFormatted: directAmt,
      amountOutFormatted: directAmt,
      feeBps: 0,
      timeEstimateSeconds: 15,
    };
  }

  // Cross-asset swap path
  const clampedSlippage =
    typeof params.slippageBps === "number" ? Math.max(10, Math.min(500, params.slippageBps)) : 100;

  if (paylink.amountMode === "OPEN") {
    const { atomic, formatted } = await resolveOpenAmount();
    const quote = await getSwapQuote({
      fromAsset: originToken.assetId,
      toAsset: paylink.receiveAssetId,
      chain: originToken.blockchain,
      originChain: originToken.blockchain,
      destinationChain: paylink.receiveChain,
      amount: atomic,
      slippageBps: clampedSlippage,
      recipientAddress: paylink.recipientAddress,
      refundTo: params.refundTo || undefined,
    });
    return {
      mode: "SWAP",
      originToken,
      receiveToken,
      inputAmountAtomic: atomic,
      inputAmountFormatted: formatted,
      quote,
    };
  }

  // FIXED amount mode: reverse-compute required input amount in originToken so recipient gets >= requested amount
  const fixedNum = Number(paylink.fixedAmount || "0");
  if (!Number.isFinite(fixedNum) || fixedNum <= 0) {
    throw makeError("Invalid fixed amount on Paylink.", "INVALID_FIXED_AMOUNT", 400);
  }

  const [originPriceUsd, receivePriceUsd] = await Promise.all([
    getLiveTokenPriceUsd(originToken.symbol),
    getLiveTokenPriceUsd(paylink.receiveSymbol),
  ]);
  if (originPriceUsd <= 0 || receivePriceUsd <= 0) {
    throw makeError("Live pricing temporarily unavailable. Please retry.", "PRICE_UNAVAILABLE", 503);
  }

  const targetReceiveUsd =
    paylink.fixedCurrency === "ASSET" ? fixedNum * receivePriceUsd : fixedNum;
  const targetReceiveTokens =
    paylink.fixedCurrency === "ASSET" ? fixedNum : fixedNum / receivePriceUsd;

  const isDirectZeroFee =
    isZeroFeeChain(originToken.blockchain) ||
    !isProxySupportedChain(originToken.blockchain, originToken.symbol);
  const grossMultiplier = isDirectZeroFee ? 1.0075 : 1.0285;
  const extraStableCents =
    (originToken.symbol === "USDC" || originToken.symbol === "USDT") &&
    !isDirectZeroFee &&
    targetReceiveUsd * 0.02 < 0.02
      ? 0.02
      : 0;

  const initialHuman = formatCleanDecimal(
    (targetReceiveUsd * grossMultiplier + extraStableCents) / originPriceUsd,
    Math.min(8, originToken.decimals)
  );
  let finalAtomic = toAtomicUnitsString(initialHuman, originToken.decimals);
  if (!finalAtomic) {
    throw makeError("Payment amount too small for selected token.", "AMOUNT_BELOW_MINIMUM", 400);
  }

  let finalQuote = await getSwapQuote({
    fromAsset: originToken.assetId,
    toAsset: paylink.receiveAssetId,
    chain: originToken.blockchain,
    originChain: originToken.blockchain,
    destinationChain: paylink.receiveChain,
    amount: finalAtomic,
    slippageBps: clampedSlippage,
    recipientAddress: paylink.recipientAddress,
    refundTo: params.refundTo || undefined,
  });

  // One proportional refinement pass against actual pool/Solver quote output
  const quotedOut = Number(finalQuote?.amountOutFormatted || "0");
  if (
    quotedOut > 0 &&
    targetReceiveTokens > 0 &&
    (quotedOut < targetReceiveTokens * 0.995 || quotedOut > targetReceiveTokens * 1.03)
  ) {
    const scaleBps = Math.ceil((targetReceiveTokens / quotedOut) * 1.005 * 10000);
    const refinedBi = (BigInt(finalAtomic) * BigInt(Math.max(100, scaleBps))) / 10000n;
    if (refinedBi > 0n) {
      try {
        const refinedQuote = await getSwapQuote({
          fromAsset: originToken.assetId,
          toAsset: paylink.receiveAssetId,
          chain: originToken.blockchain,
          originChain: originToken.blockchain,
          destinationChain: paylink.receiveChain,
          amount: refinedBi.toString(),
          slippageBps: clampedSlippage,
          recipientAddress: paylink.recipientAddress,
          refundTo: params.refundTo || undefined,
        });
        finalAtomic = refinedBi.toString();
        finalQuote = refinedQuote;
      } catch {
        // Keep quote1 if refinement fails
      }
    }
  }

  return {
    mode: "SWAP",
    originToken,
    receiveToken,
    inputAmountAtomic: finalAtomic,
    inputAmountFormatted: atomicToHumanFormatted(finalAtomic, originToken.decimals),
    targetReceiveTokens: formatCleanDecimal(targetReceiveTokens, paylink.receiveDecimals),
    targetReceiveUsd: Math.round(targetReceiveUsd * 100) / 100,
    quote: finalQuote,
  };
}
