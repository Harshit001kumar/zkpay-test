import { MongoClient, Db } from "mongodb";

/**
 * MongoDB Connection Client for ZkPay.
 * 
 * Uses a global singleton to prevent connection exhaustion in Next.js serverless/dev environments.
 * If MONGODB_URI is not set, returns null to allow graceful fallback to local storage.
 */

const rawUri = process.env.MONGODB_URI;
// Trim accidental spaces (e.g. from copy-pasting)
const uri = rawUri ? rawUri.trim().replace(/\s+/g, "") : undefined;
const dbName = process.env.MONGODB_DB || "zkpay";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function isMongoConfigured(): boolean {
  if (!uri) return false;
  
  // Ignore dummy/placeholder templates
  if (
    uri.includes("username:password") ||
    uri.includes("<password>") ||
    uri.includes("<username>") ||
    uri.includes("your-")
  ) {
    return false;
  }

  // Detect incomplete Atlas placeholder without a cluster shard subdomain.
  // Real MongoDB Atlas URLs are structured as: cluster0.<unique-id>.mongodb.net
  // A URL pointing directly to cluster0.mongodb.net cannot resolve via DNS SRV.
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

  if (!isMongoConfigured() || !uri) {
    return null;
  }

  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    if (!clientPromise) {
      client = new MongoClient(uri);
      clientPromise = client.connect();
    }
  }

  try {
    return await clientPromise;
  } catch (err) {
    console.error("[MongoDB] Failed to connect to cluster:", err);
    clientPromise = null;
    if (process.env.NODE_ENV === "development") {
      global._mongoClientPromise = undefined;
    }
    return null;
  }
}

export async function getMongoDb(): Promise<Db | null> {
  const c = await getMongoClient();
  if (!c) return null;
  return c.db(dbName);
}
