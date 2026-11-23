import { MongoClient, Db } from "mongodb";

/**
 * MongoDB Connection Client for ZkPay.
 * 
 * Uses a global singleton to prevent connection exhaustion in Next.js serverless/dev environments.
 * If MONGODB_URI is not set or invalid, returns null to allow graceful fallback to local storage.
 */

export function getCleanMongoUri(): string | undefined {
  const raw = process.env.MONGODB_URI;
  if (!raw) return undefined;
  let s = raw.trim();

  // Strip accidental surrounding quotes or backticks (common in copy-pasting into Render)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith("`") && s.endsWith("`"))
  ) {
    s = s.slice(1, -1).trim();
  }

  // Strip accidental "MONGODB_URI=" prefix if user pasted the entire assignment
  if (s.startsWith("MONGODB_URI=")) {
    s = s.replace("MONGODB_URI=", "").trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
  }

  return s.replace(/\s+/g, "");
}

const dbName = process.env.MONGODB_DB || "zkpay";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  const uri = getCleanMongoUri();
  if (!uri) return false;

  // Connection string must start with mongodb:// or mongodb+srv://
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    console.warn(
      `[MongoDB] Warning: MONGODB_URI does not start with 'mongodb://' or 'mongodb+srv://'. Found '${uri.slice(0, 15)}...'. Please check your Render environment variables.`
    );
    return false;
  }

  // Ignore dummy/placeholder templates
  if (
    uri.includes("username:password") ||
    uri.includes("<db_password>") ||
    uri.includes("<password>") ||
    uri.includes("<username>") ||
    uri.includes("your-")
  ) {
    console.warn(
      "[MongoDB] Warning: MONGODB_URI contains placeholder credentials (e.g. '<db_password>'). Please replace it with your real MongoDB Atlas database user password in Render."
    );
    return false;
  }

  // Detect incomplete Atlas placeholder without a cluster shard subdomain.
  const isBareCluster0 = /(@|\/\/)cluster0\.mongodb\.net(?::\d+)?(?:\/|\?|$)/i.test(uri);
  if (isBareCluster0) {
    console.warn(
      "[MongoDB] Warning: MONGODB_URI uses bare 'cluster0.mongodb.net' missing the Atlas cluster ID (e.g. cluster0.abcde.mongodb.net). Falling back to local storage."
    );
    return false;
  }

  return true;
}

export async function getMongoClient(): Promise<MongoClient | null> {
  // Do not attempt database connection during Next.js build/static page generation
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";
  if (isBuildPhase) {
    return null;
  }

  const uri = getCleanMongoUri();
  if (!isMongoConfigured() || !uri) {
    return null;
  }

  try {
    if (process.env.NODE_ENV === "development") {
      // In development mode, use a global variable to preserve across HMR
      if (!global._mongoClientPromise) {
        client = new MongoClient(uri);
        global._mongoClientPromise = client.connect();
      }
      clientPromise = global._mongoClientPromise;
    } else {
      // In production mode
      if (!clientPromise) {
        client = new MongoClient(uri);
        clientPromise = client.connect();
      }
    }

    return await clientPromise;
  } catch (err: any) {
    console.error("[MongoDB] Failed to initialize or connect to cluster:", err?.message || err);
    clientPromise = null;
    if (process.env.NODE_ENV === "development") {
      global._mongoClientPromise = undefined;
    }
    return null;
  }
}

let indexesInitialized = false;

/**
 * Idempotently initializes performance and constraint indexes across core collections.
 */
export async function initMongoIndexes(db: Db): Promise<void> {
  if (indexesInitialized) return;
  try {
    // proxy_swaps & proxy_swap_orders (swapId unique, proxyDepositAddress, createdAt)
    const proxyCollections = ["proxy_swap_orders", "proxy_swaps"];
    for (const name of proxyCollections) {
      const coll = db.collection(name);
      await coll.createIndex({ swapId: 1 }, { unique: true, sparse: true }).catch(() => {});
      await coll.createIndex({ proxyDepositAddress: 1 }).catch(() => {});
      await coll.createIndex({ createdAt: -1 }).catch(() => {});
      await coll.createIndex({ apiKeyId: 1, createdAt: -1 }).catch(() => {});
      await coll.createIndex({ fulfillmentMode: 1, status: 1, expiresAt: 1 }).catch(() => {});
      await coll.createIndex({ sweepStatus: 1 }).catch(() => {});
      await coll.createIndex({ paylinkId: 1, createdAt: -1 }, { sparse: true }).catch(() => {});
    }

    // liquidity_transfers audit ledger
    const liqTransfers = db.collection("liquidity_transfers");
    await liqTransfers.createIndex({ createdAt: -1 }).catch(() => {});
    await liqTransfers.createIndex({ assetKey: 1, createdAt: -1 }).catch(() => {});

    // direct_swaps & direct_swap_orders (swapId unique, depositAddress)
    const directCollections = ["direct_swap_orders", "direct_swaps"];
    for (const name of directCollections) {
      const coll = db.collection(name);
      await coll.createIndex({ swapId: 1 }, { unique: true, sparse: true }).catch(() => {});
      await coll.createIndex({ depositAddress: 1 }).catch(() => {});
      await coll.createIndex({ paylinkId: 1, createdAt: -1 }, { sparse: true }).catch(() => {});
    }

    // paylinks & paylink_addresses
    const paylinks = db.collection("paylinks");
    await paylinks.createIndex({ slug: 1 }, { unique: true, sparse: true }).catch(() => {});
    await paylinks.createIndex({ creatorUserId: 1, createdAt: -1 }).catch(() => {});
    const paylinkAddresses = db.collection("paylink_addresses");
    await paylinkAddresses.createIndex({ userId: 1, chain: 1 }).catch(() => {});
    await paylinkAddresses
      .createIndex({ userId: 1, chain: 1, address: 1 }, { unique: true, sparse: true })
      .catch(() => {});

    // api_keys (keyHash unique, userId)
    const apiKeys = db.collection("api_keys");
    await apiKeys.createIndex({ keyHash: 1 }, { unique: true, sparse: true }).catch(() => {});
    await apiKeys.createIndex({ userId: 1 }).catch(() => {});

    // partner_balances (userId unique)
    const partnerBalances = db.collection("partner_balances");
    await partnerBalances.createIndex({ userId: 1 }, { unique: true, sparse: true }).catch(() => {});

    // partner_fee_credits (id and swapId unique to prevent double-credit)
    const partnerFeeCredits = db.collection("partner_fee_credits");
    await partnerFeeCredits.createIndex({ id: 1 }, { unique: true, sparse: true }).catch(() => {});
    await partnerFeeCredits.createIndex({ swapId: 1 }, { unique: true, sparse: true }).catch(() => {});

    // partner_payout_requests
    const partnerPayouts = db.collection("partner_payout_requests");
    await partnerPayouts.createIndex({ id: 1 }, { unique: true, sparse: true }).catch(() => {});
    await partnerPayouts.createIndex({ partnerUserId: 1, status: 1 }).catch(() => {});

    // admin_audit_logs
    const adminAudits = db.collection("admin_audit_logs");
    await adminAudits.createIndex({ createdAt: -1 }).catch(() => {});

    // liquidity_spent_utxos (prevents concurrent LTC hot-wallet UTXO double-spends; TTL cleanup)
    const spentUtxos = db.collection("liquidity_spent_utxos");
    await spentUtxos.createIndex({ outpoint: 1 }, { unique: true }).catch(() => {});
    await spentUtxos.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});

    indexesInitialized = true;
  } catch (err: any) {
    console.warn("[MongoDB] Index initialization warning:", err?.message || err);
  }
}

export async function getMongoDb(): Promise<Db | null> {
  const c = await getMongoClient();
  if (!c) return null;
  const db = c.db(dbName);
  if (!indexesInitialized) {
    initMongoIndexes(db).catch(() => {});
  }
  return db;
}
