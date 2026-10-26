/**
 * Version-tolerant Privy user lookup helper.
 *
 * @privy-io/node changed its API across versions:
 * - Newer SDKs (>= 0.3x) expose `privy.users()._get(userId)` and return snake_case fields (`linked_accounts`).
 * - Older SDKs exposed `privy.users().get(userId)` / `privy.getUser(userId)` with camelCase fields (`linkedAccounts`).
 *
 * This helper tries every known SDK shape, then falls back to the Privy REST API, and normalizes the
 * response so callers always get a consistent list of linked accounts and wallet addresses.
 */

export interface NormalizedPrivyAccount {
  id?: string;
  type?: string;
  address?: string;
  walletClientType?: string;
  connectorType?: string;
}

export interface NormalizedPrivyUser {
  id: string;
  linkedAccounts: NormalizedPrivyAccount[];
  primaryWalletAddress?: string;
  walletAddresses: string[]; // lowercased, deduplicated wallet + smart_wallet addresses
  raw: any;
}

function normalizeAccount(acc: any): NormalizedPrivyAccount {
  return {
    id: acc?.id,
    type: acc?.type,
    address: acc?.address || acc?.wallet?.address,
    walletClientType: acc?.walletClientType || acc?.wallet_client_type,
    connectorType: acc?.connectorType || acc?.connector_type,
  };
}

function normalizeUser(userId: string, raw: any): NormalizedPrivyUser {
  const rawAccounts: any[] = Array.isArray(raw?.linked_accounts)
    ? raw.linked_accounts
    : Array.isArray(raw?.linkedAccounts)
    ? raw.linkedAccounts
    : [];

  const linkedAccounts = rawAccounts.map(normalizeAccount);

  const addresses: string[] = [];
  const primary: string | undefined = raw?.wallet?.address;
  if (primary) addresses.push(primary.toLowerCase());

  for (const acc of linkedAccounts) {
    if ((acc.type === "wallet" || acc.type === "smart_wallet") && acc.address) {
      addresses.push(acc.address.toLowerCase());
    }
  }

  const walletAddresses = Array.from(new Set(addresses));

  return {
    id: raw?.id || userId,
    linkedAccounts,
    primaryWalletAddress: primary?.toLowerCase() || walletAddresses[0],
    walletAddresses,
    raw,
  };
}

async function fetchUserViaRest(userId: string): Promise<any | null> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      "privy-app-id": appId,
      Authorization: `Basic ${basicAuth}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Privy REST user lookup failed with HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetches a Privy user by DID using whichever SDK method exists, falling back to the REST API.
 * Throws only if every strategy fails.
 */
export async function fetchPrivyUser(privy: any, userId: string): Promise<NormalizedPrivyUser> {
  const errors: string[] = [];

  if (privy) {
    // 1. Newer SDK: privy.users()._get(userId)
    try {
      const usersSvc = typeof privy.users === "function" ? privy.users() : privy.users;
      if (usersSvc && typeof usersSvc._get === "function") {
        const raw = await usersSvc._get(userId);
        if (raw) return normalizeUser(userId, raw);
      }
    } catch (e: any) {
      errors.push(`users()._get: ${e?.message || e}`);
    }

    // 2. Intermediate SDK: privy.users().get(userId)
    try {
      const usersSvc = typeof privy.users === "function" ? privy.users() : privy.users;
      if (usersSvc && typeof usersSvc.get === "function") {
        const raw = await usersSvc.get(userId);
        if (raw) return normalizeUser(userId, raw);
      }
    } catch (e: any) {
      errors.push(`users().get: ${e?.message || e}`);
    }

    // 3. Legacy SDK: privy.getUser(userId)
    try {
      if (typeof privy.getUser === "function") {
        const raw = await privy.getUser(userId);
        if (raw) return normalizeUser(userId, raw);
      }
    } catch (e: any) {
      errors.push(`getUser: ${e?.message || e}`);
    }
  }

  // 4. REST API fallback
  try {
    const raw = await fetchUserViaRest(userId);
    if (raw) return normalizeUser(userId, raw);
  } catch (e: any) {
    errors.push(`REST: ${e?.message || e}`);
  }

  throw new Error(`Unable to fetch Privy user ${userId}. ${errors.join(" | ")}`);
}
