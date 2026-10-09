import fs from "fs";
import path from "path";
import { getMongoDb } from "./mongodb";

/**
 * ZkPay Referral & Monthly Cashback Engine — Server Store
 * 
 * Powered by MongoDB with in-memory caching and local filesystem fallback.
 * 
 * Guarantees 100% profitability by funding rewards exclusively from
 * the 1.00% platform fee collected on completed Scan & Pay transactions.
 * 
 * Fee Split:
 * - Gross Fee: 1.00% (100 bps)
 * - Payer Cashback: 0.20% (20 bps)
 * - Referrer Commission: 0.20% (20 bps)
 * - Treasury Retained Net: 0.60% (60 bps) minimum
 */

export interface ReferralBinding {
  referee: string;        // canonical lowercase address
  referrer: string;       // canonical lowercase address
  boundAt: number;        // unix timestamp ms
}

export interface ScanRewardEntry {
  txHash: string;
  orderId: string;
  userAddress: string;
  principalUsdc: number;
  feeUsdc: number;
  cashbackUsdc: number;
  referrerAddress?: string;
  referralUsdc?: number;
  cycle: string;          // e.g. "2026-09"
  timestamp: number;
}

export interface UserMonthlyReward {
  cycle: string;          // e.g. "2026-09"
  userAddress: string;
  cashbackUsdc: number;
  referralUsdc: number;
  totalDueUsdc: number;
  scanCount: number;
  scanTxHashes: string[];
  excluded: boolean;
  status: "PENDING" | "EXCLUDED" | "PAID";
  payoutTxHash?: string;
  paidAt?: number;
}

interface RewardsDbData {
  referralBindings: Record<string, ReferralBinding>; // referee -> binding
  referralCodes: Record<string, string>;             // code -> address
  processedTxHashes: Record<string, boolean>;        // txHash -> true
  scanRewardLogs: ScanRewardEntry[];
  monthlyRewards: Record<string, Record<string, UserMonthlyReward>>; // cycle -> userAddress -> reward
}

// In-memory state cache
let dbData: RewardsDbData = {
  referralBindings: {},
  referralCodes: {},
  processedTxHashes: {},
  scanRewardLogs: [],
  monthlyRewards: {},
};

let isMongoInitialized = false;

// File persistence fallback path
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "rewards.json");

// Load from disk fallback on startup
function initFileStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      dbData = {
        referralBindings: parsed.referralBindings || {},
        referralCodes: parsed.referralCodes || {},
        processedTxHashes: parsed.processedTxHashes || {},
        scanRewardLogs: parsed.scanRewardLogs || [],
        monthlyRewards: parsed.monthlyRewards || {},
      };
    }
  } catch (err) {
    console.warn("[RewardsStore] Failed to load data file fallback:", err);
  }
}

// Save to disk fallback
function persistFileStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbData, null, 2), "utf-8");
  } catch (err) {
    console.warn("[RewardsStore] Failed to write data file fallback:", err);
  }
}

// Initialize MongoDB and hydrate in-memory cache
async function initMongoStorage() {
  if (isMongoInitialized) return;
  try {
    const db = await getMongoDb();
    if (!db) {
      initFileStorage();
      return;
    }

    // 1. Fetch Referral Codes
    const codesCursor = db.collection("referral_codes").find({});
    const codes = await codesCursor.toArray();
    for (const c of codes) {
      if (c.code && c.address) {
        dbData.referralCodes[c.code] = c.address;
      }
    }

    // 2. Fetch Referral Bindings
    const bindingsCursor = db.collection("referral_bindings").find({});
    const bindings = await bindingsCursor.toArray();
    for (const b of bindings) {
      if (b.referee && b.referrer) {
        dbData.referralBindings[b.referee] = {
          referee: b.referee,
          referrer: b.referrer,
          boundAt: b.boundAt || Date.now(),
        };
      }
    }

    // 3. Fetch Scan Reward Logs
    const logsCursor = db.collection("scan_reward_logs").find({});
    const logs = await logsCursor.toArray();
    for (const l of logs) {
      if (l.txHash) {
        dbData.processedTxHashes[l.txHash.toLowerCase()] = true;
        dbData.scanRewardLogs.push({
          txHash: l.txHash,
          orderId: l.orderId,
          userAddress: l.userAddress,
          principalUsdc: l.principalUsdc,
          feeUsdc: l.feeUsdc,
          cashbackUsdc: l.cashbackUsdc,
          referrerAddress: l.referrerAddress,
          referralUsdc: l.referralUsdc,
          cycle: l.cycle,
          timestamp: l.timestamp,
        });
      }
    }

    // 4. Fetch Monthly Rewards
    const monthlyCursor = db.collection("monthly_rewards").find({});
    const monthly = await monthlyCursor.toArray();
    for (const m of monthly) {
      if (m.cycle && m.userAddress) {
        if (!dbData.monthlyRewards[m.cycle]) {
          dbData.monthlyRewards[m.cycle] = {};
        }
        dbData.monthlyRewards[m.cycle][m.userAddress] = {
          cycle: m.cycle,
          userAddress: m.userAddress,
          cashbackUsdc: m.cashbackUsdc || 0,
          referralUsdc: m.referralUsdc || 0,
          totalDueUsdc: m.totalDueUsdc || 0,
          scanCount: m.scanCount || 0,
          scanTxHashes: m.scanTxHashes || [],
          excluded: !!m.excluded,
          status: m.status || "PENDING",
          payoutTxHash: m.payoutTxHash,
          paidAt: m.paidAt,
        };
      }
    }

    isMongoInitialized = true;
    console.log("[RewardsStore] Hydrated from MongoDB successfully.");
  } catch (err) {
    console.warn("[RewardsStore] MongoDB init warning, using local cache:", err);
    initFileStorage();
  }
}

// Initial hydration
initFileStorage();
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";
if (!isBuildPhase) {
  initMongoStorage().catch(() => {});
}

/**
 * Get current calendar cycle string: YYYY-MM
 */
export function getCurrentCycle(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Generate a clean 6-character referral code from a wallet address (e.g. ZK + 4 chars)
 */
export function getReferralCodeForAddress(rawAddress: string): string {
  if (!rawAddress) return "";
  const address = rawAddress.toLowerCase().trim();
  
  // Look for existing registered code
  for (const [code, addr] of Object.entries(dbData.referralCodes)) {
    if (addr === address) return code;
  }

  // Derive standard code: "ZK" + first 2 chars after 0x + last 2 chars
  const cleanHex = address.startsWith("0x") ? address.slice(2) : address;
  const derived = `ZK${cleanHex.slice(0, 2).toUpperCase()}${cleanHex.slice(-2).toUpperCase()}`;

  // Ensure uniqueness
  let finalCode = derived;
  let counter = 1;
  while (dbData.referralCodes[finalCode] && dbData.referralCodes[finalCode] !== address) {
    finalCode = `ZK${cleanHex.slice(counter, counter + 2).toUpperCase()}${cleanHex.slice(-(counter + 2), -counter).toUpperCase()}`;
    counter++;
  }

  dbData.referralCodes[finalCode] = address;
  persistFileStorage();

  // Async persist to MongoDB
  getMongoDb().then((db) => {
    if (db) {
      db.collection("referral_codes").updateOne(
        { _id: finalCode as any },
        { $set: { code: finalCode, address, createdAt: Date.now() } },
        { upsert: true }
      ).catch((err) => console.warn("[MongoDB] Failed to write referral code:", err));
    }
  }).catch(() => {});

  return finalCode;
}

/**
 * Resolve a referral code or address string to canonical lowercase wallet address
 */
export async function resolveReferrerAddress(codeOrAddress: string): Promise<string | null> {
  if (!codeOrAddress) return null;
  const query = codeOrAddress.trim();

  // If it's an Ethereum address
  if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
    return query.toLowerCase();
  }

  // If it's a referral code
  const upperCode = query.toUpperCase();
  if (dbData.referralCodes[upperCode]) {
    return dbData.referralCodes[upperCode];
  }

  // Check MongoDB directly
  try {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection("referral_codes").findOne({
        $or: [{ _id: upperCode as any }, { code: upperCode }],
      });
      if (doc && doc.address) {
        dbData.referralCodes[upperCode] = doc.address.toLowerCase();
        return doc.address.toLowerCase();
      }
    }
  } catch (err) {
    console.warn("[RewardsStore] Error checking referral code in Mongo:", err);
  }

  return null;
}

/**
 * Bind a referee to a referrer.
 * Enforces:
 * - No self-referral
 * - Immutable once bound (cannot overwrite existing referrer)
 */
export async function bindReferral(
  refereeAddress: string,
  referrerCodeOrAddress: string
): Promise<{ success: boolean; referrer?: string; alreadyBound?: boolean; error?: string }> {
  const referee = refereeAddress?.toLowerCase().trim();
  if (!referee || !/^0x[a-fA-F0-9]{40}$/.test(referee)) {
    return { success: false, error: "Invalid referee wallet address" };
  }

  // Check in-memory cache first
  if (dbData.referralBindings[referee]) {
    return {
      success: true,
      referrer: dbData.referralBindings[referee].referrer,
      alreadyBound: true,
    };
  }

  // Check MongoDB for existing binding
  try {
    const db = await getMongoDb();
    if (db) {
      const existing = await db.collection("referral_bindings").findOne({
        $or: [{ _id: referee as any }, { referee }],
      });
      if (existing && existing.referrer) {
        const existingReferrer = existing.referrer.toLowerCase();
        dbData.referralBindings[referee] = {
          referee,
          referrer: existingReferrer,
          boundAt: existing.boundAt || Date.now(),
        };
        return {
          success: true,
          referrer: existingReferrer,
          alreadyBound: true,
        };
      }
    }
  } catch (err) {
    console.warn("[RewardsStore] MongoDB lookup error in bindReferral:", err);
  }

  const referrer = await resolveReferrerAddress(referrerCodeOrAddress);
  if (!referrer) {
    return { success: false, error: "Referral code or address not found" };
  }

  if (referee === referrer) {
    return { success: false, error: "Cannot refer yourself" };
  }

  const binding: ReferralBinding = {
    referee,
    referrer,
    boundAt: Date.now(),
  };

  dbData.referralBindings[referee] = binding;
  persistFileStorage();

  // Async persist to MongoDB
  try {
    const db = await getMongoDb();
    if (db) {
      await db.collection("referral_bindings").updateOne(
        { _id: referee as any },
        { $set: binding },
        { upsert: true }
      );
    }
  } catch (err) {
    console.warn("[MongoDB] Failed to write referral binding:", err);
  }

  return { success: true, referrer, alreadyBound: false };
}

/**
 * Record a verified Scan & Pay transaction and calculate monthly rewards.
 * STRICTLY FOR SCAN & PAY.
 */
export function recordScanAndPayReward(params: {
  txHash: string;
  feeTxHash?: string;
  orderId: string;
  userAddress: string;
  principalUsdc: number;
  feeUsdc: number;
  cycle?: string;
}): { success: boolean; entry?: ScanRewardEntry; error?: string } {
  const { txHash, feeTxHash, orderId, principalUsdc, feeUsdc } = params;
  const userAddress = params.userAddress.toLowerCase().trim();
  const cycle = params.cycle || getCurrentCycle();

  if (dbData.processedTxHashes[txHash.toLowerCase()]) {
    return { success: false, error: "Transaction already processed for rewards" };
  }

  if (feeTxHash && dbData.processedTxHashes[feeTxHash.toLowerCase()]) {
    return { success: false, error: "Fee transaction already processed for rewards" };
  }

  // Economic formula:
  // Fee = 1.00% of principal
  // Cashback = 0.20% of principal (20% of fee)
  // Referral = 0.20% of principal (20% of fee)
  const cashbackUsdc = Number((principalUsdc * 0.002).toFixed(4));
  const referrer = dbData.referralBindings[userAddress]?.referrer;
  const referralUsdc = referrer ? Number((principalUsdc * 0.002).toFixed(4)) : 0;

  const entry: ScanRewardEntry = {
    txHash: txHash.toLowerCase(),
    orderId,
    userAddress,
    principalUsdc,
    feeUsdc,
    cashbackUsdc,
    referrerAddress: referrer,
    referralUsdc,
    cycle,
    timestamp: Date.now(),
  };

  // Mark tx and feeTx processed
  dbData.processedTxHashes[txHash.toLowerCase()] = true;
  if (feeTxHash) {
    dbData.processedTxHashes[feeTxHash.toLowerCase()] = true;
  }
  dbData.scanRewardLogs.push(entry);

  // Initialize cycle container if not exists
  if (!dbData.monthlyRewards[cycle]) {
    dbData.monthlyRewards[cycle] = {};
  }

  // 1. Update User's Monthly Cashback
  if (!dbData.monthlyRewards[cycle][userAddress]) {
    dbData.monthlyRewards[cycle][userAddress] = {
      cycle,
      userAddress,
      cashbackUsdc: 0,
      referralUsdc: 0,
      totalDueUsdc: 0,
      scanCount: 0,
      scanTxHashes: [],
      excluded: false,
      status: "PENDING",
    };
  }
  const userRec = dbData.monthlyRewards[cycle][userAddress];
  userRec.cashbackUsdc = Number((userRec.cashbackUsdc + cashbackUsdc).toFixed(4));
  userRec.totalDueUsdc = Number((userRec.cashbackUsdc + userRec.referralUsdc).toFixed(4));
  userRec.scanCount += 1;
  userRec.scanTxHashes.push(txHash.toLowerCase());

  // 2. Update Referrer's Monthly Commission
  let refRec: UserMonthlyReward | null = null;
  if (referrer && referralUsdc > 0) {
    if (!dbData.monthlyRewards[cycle][referrer]) {
      dbData.monthlyRewards[cycle][referrer] = {
        cycle,
        userAddress: referrer,
        cashbackUsdc: 0,
        referralUsdc: 0,
        totalDueUsdc: 0,
        scanCount: 0,
        scanTxHashes: [],
        excluded: false,
        status: "PENDING",
      };
    }
    refRec = dbData.monthlyRewards[cycle][referrer];
    refRec.referralUsdc = Number((refRec.referralUsdc + referralUsdc).toFixed(4));
    refRec.totalDueUsdc = Number((refRec.cashbackUsdc + refRec.referralUsdc).toFixed(4));
  }

  persistFileStorage();

  // Async persist to MongoDB
  getMongoDb().then((db) => {
    if (db) {
      db.collection("scan_reward_logs").updateOne(
        { _id: entry.txHash as any },
        { $set: entry },
        { upsert: true }
      ).catch((err) => console.warn("[MongoDB] Log save error:", err));

      db.collection("monthly_rewards").updateOne(
        { _id: `${cycle}_${userAddress}` as any },
        { $set: userRec },
        { upsert: true }
      ).catch((err) => console.warn("[MongoDB] User reward save error:", err));

      if (refRec && referrer) {
        db.collection("monthly_rewards").updateOne(
          { _id: `${cycle}_${referrer}` as any },
          { $set: refRec },
          { upsert: true }
        ).catch((err) => console.warn("[MongoDB] Referrer reward save error:", err));
      }
    }
  }).catch(() => {});

  return { success: true, entry };
}

/**
 * Get rewards summary for a specific user (for Profile tab)
 */
export async function getUserRewardsSummary(rawAddress: string, queryCycle?: string) {
  const address = rawAddress.toLowerCase().trim();
  const currentCycle = queryCycle || getCurrentCycle();

  // If MongoDB is available and not yet initialized, initialize
  if (!isMongoInitialized) {
    try {
      await initMongoStorage();
    } catch {}
  }

  // User's referral code
  const referralCode = getReferralCodeForAddress(address);

  // If referredBy is not in cache, check MongoDB
  let referredBy = dbData.referralBindings[address]?.referrer || null;
  if (!referredBy) {
    try {
      const db = await getMongoDb();
      if (db) {
        const binding = await db.collection("referral_bindings").findOne({
          $or: [{ _id: address as any }, { referee: address }],
        });
        if (binding && binding.referrer) {
          referredBy = binding.referrer.toLowerCase();
          dbData.referralBindings[address] = {
            referee: address,
            referrer: referredBy,
            boundAt: binding.boundAt || Date.now(),
          };
        }
      }
    } catch {}
  }

  // Friends invited count
  const friendsInvited = Object.values(dbData.referralBindings).filter(
    (b) => b.referrer === address
  ).length;

  // Active cycle record
  const cycleRecord = dbData.monthlyRewards[currentCycle]?.[address] || {
    cycle: currentCycle,
    userAddress: address,
    cashbackUsdc: 0,
    referralUsdc: 0,
    totalDueUsdc: 0,
    scanCount: 0,
    scanTxHashes: [],
    excluded: false,
    status: "PENDING",
  };

  // Lifetime totals across all cycles
  let lifetimeCashback = 0;
  let lifetimeReferral = 0;
  let lifetimePaid = 0;
  const pastPayouts: { cycle: string; amountUsdc: number; payoutTxHash: string; paidAt: number }[] = [];

  for (const [cycleKey, cycleUsers] of Object.entries(dbData.monthlyRewards)) {
    const rec = cycleUsers[address];
    if (rec) {
      lifetimeCashback += rec.cashbackUsdc;
      lifetimeReferral += rec.referralUsdc;
      if (rec.status === "PAID" && rec.payoutTxHash) {
        lifetimePaid += rec.totalDueUsdc;
        pastPayouts.push({
          cycle: cycleKey,
          amountUsdc: rec.totalDueUsdc,
          payoutTxHash: rec.payoutTxHash,
          paidAt: rec.paidAt || Date.now(),
        });
      }
    }
  }

  pastPayouts.sort((a, b) => b.paidAt - a.paidAt);

  return {
    address,
    referralCode,
    referralLink: `https://zkpay.in/?ref=${referralCode}`,
    referredBy,
    friendsInvited,
    currentCycle,
    thisMonth: {
      cashbackUsdc: cycleRecord.cashbackUsdc,
      referralUsdc: cycleRecord.referralUsdc,
      totalDueUsdc: cycleRecord.totalDueUsdc,
      scanCount: cycleRecord.scanCount,
      status: cycleRecord.status,
    },
    lifetime: {
      cashbackUsdc: Number(lifetimeCashback.toFixed(4)),
      referralUsdc: Number(lifetimeReferral.toFixed(4)),
      totalEarnedUsdc: Number((lifetimeCashback + lifetimeReferral).toFixed(4)),
      totalPaidUsdc: Number(lifetimePaid.toFixed(4)),
    },
    pastPayouts,
  };
}

/**
 * Get monthly rewards list and overview for Admin Panel
 */
export function getAdminMonthlyOverview(queryCycle?: string) {
  const cycle = queryCycle || getCurrentCycle();
  const cycleUsers = dbData.monthlyRewards[cycle] || {};

  const users = Object.values(cycleUsers).sort((a, b) => b.totalDueUsdc - a.totalDueUsdc);

  let totalCycleVolume = 0;
  let totalPlatformFees = 0;
  let totalPendingPayout = 0;
  let totalPaidOut = 0;
  let eligibleCount = 0;

  // Scan logs for this cycle to calculate exact volume and fee totals
  for (const log of dbData.scanRewardLogs) {
    if (log.cycle === cycle) {
      totalCycleVolume += log.principalUsdc;
      totalPlatformFees += log.feeUsdc;
    }
  }

  for (const u of users) {
    if (!u.excluded && u.status === "PENDING") {
      totalPendingPayout += u.totalDueUsdc;
      eligibleCount++;
    } else if (u.status === "PAID") {
      totalPaidOut += u.totalDueUsdc;
    }
  }

  return {
    cycle,
    totalCycleVolume: Number(totalCycleVolume.toFixed(2)),
    totalPlatformFees: Number(totalPlatformFees.toFixed(2)),
    totalPendingPayout: Number(totalPendingPayout.toFixed(4)),
    totalPaidOut: Number(totalPaidOut.toFixed(4)),
    netTreasuryProfitRetained: Number((totalPlatformFees - totalPendingPayout - totalPaidOut).toFixed(2)),
    eligibleUserCount: eligibleCount,
    users,
  };
}

/**
 * Toggle user exclusion from monthly batch (Admin feature)
 */
export function toggleUserExclusion(cycle: string, rawAddress: string, excluded: boolean) {
  const address = rawAddress.toLowerCase().trim();
  if (!dbData.monthlyRewards[cycle] || !dbData.monthlyRewards[cycle][address]) {
    return { success: false, error: "User record not found for this cycle" };
  }

  const rec = dbData.monthlyRewards[cycle][address];
  rec.excluded = excluded;
  rec.status = excluded ? "EXCLUDED" : "PENDING";

  persistFileStorage();

  // Async persist to MongoDB
  getMongoDb().then((db) => {
    if (db) {
      db.collection("monthly_rewards").updateOne(
        { _id: `${cycle}_${address}` as any },
        { $set: { excluded, status: rec.status } }
      ).catch((err) => console.warn("[MongoDB] Toggle exclusion save error:", err));
    }
  }).catch(() => {});

  return { success: true, record: rec };
}

/**
 * Mark a batch of users as PAID with payoutTxHash (Admin feature)
 */
export function markCyclePaid(cycle: string, userAddresses: string[], payoutTxHash: string) {
  if (!dbData.monthlyRewards[cycle]) {
    return { success: false, error: "Cycle not found" };
  }

  const updated: string[] = [];
  const now = Date.now();

  for (const rawAddr of userAddresses) {
    const addr = rawAddr.toLowerCase().trim();
    const rec = dbData.monthlyRewards[cycle][addr];
    if (rec && !rec.excluded) {
      rec.status = "PAID";
      rec.payoutTxHash = payoutTxHash;
      rec.paidAt = now;
      updated.push(addr);
    }
  }

  persistFileStorage();

  // Async persist to MongoDB
  getMongoDb().then((db) => {
    if (db) {
      const ids = updated.map((addr) => `${cycle}_${addr}`);
      db.collection("monthly_rewards").updateMany(
        { _id: { $in: ids as any } },
        { $set: { status: "PAID", payoutTxHash, paidAt: now } }
      ).catch((err) => console.warn("[MongoDB] Mark paid save error:", err));
    }
  }).catch(() => {});

  return { success: true, updatedCount: updated.length, updated };
}

/**
 * Reset/wipe rewards and logs for a cycle (Admin feature)
 */
export function resetCycleRewards(cycle: string) {
  if (dbData.monthlyRewards[cycle]) {
    delete dbData.monthlyRewards[cycle];
  }
  dbData.scanRewardLogs = dbData.scanRewardLogs.filter((l) => l.cycle !== cycle);
  persistFileStorage();

  getMongoDb().then((db) => {
    if (db) {
      db.collection("monthly_rewards").deleteMany({ cycle }).catch(console.warn);
      db.collection("scan_reward_logs").deleteMany({ cycle }).catch(console.warn);
    }
  }).catch(() => {});

  return { success: true };
}
