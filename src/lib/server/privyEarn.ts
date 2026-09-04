import { PrivyClient } from "@privy-io/node";

let _privy: InstanceType<typeof PrivyClient> | null = null;

export function getPrivyClient() {
  if (!_privy) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("Privy credentials not configured. Please set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.");
    }
    _privy = new PrivyClient({ appId, appSecret });
  }
  return _privy;
}

export function getPrivyAuthPrivateKey(): string | null {
  const rawKey =
    process.env.PRIVY_AUTH_PRIVATE_KEY ||
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ||
    process.env.PRIVY_SIGNING_KEY ||
    process.env.PRIVY_WALLET_AUTH_KEY ||
    process.env.PRIVY_AUTHORIZATION_KEY ||
    process.env.PRIVY_SERVER_SIGNING_KEY;

  if (!rawKey) return null;

  let cleanKey = rawKey.trim();
  // Strip surrounding quotes if present
  if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
    cleanKey = cleanKey.slice(1, -1);
  }
  // Replace escaped literal \n with actual newlines
  if (cleanKey.includes("\\n")) {
    cleanKey = cleanKey.replace(/\\n/g, "\n");
  }

  return cleanKey.trim() || null;
}

export function buildPrivyAuthorizationContext(userAccessToken?: string) {
  const authKey = getPrivyAuthPrivateKey();
  const context: Record<string, any> = {};

  if (userAccessToken) {
    context.user_jwts = [userAccessToken];
  }
  if (authKey) {
    context.authorization_private_keys = [authKey];
  }

  return Object.keys(context).length > 0 ? context : null;
}

/**
 * Generates an ECDSA P-256 RFC 8785 canonical authorization signature
 * for Privy REST endpoints requiring the `privy-authorization-signature` header.
 */
export function createPrivyAuthorizationSignature({
  method,
  url,
  body,
  appId,
  privateKeyRaw,
}: {
  method: string;
  url: string;
  body: any;
  appId: string;
  privateKeyRaw: string;
}): string | null {
  try {
    const crypto = require("crypto");

    const payload = {
      version: 1,
      method: method.toUpperCase(),
      url: url.replace(/\/$/, ""),
      body,
      headers: {
        "privy-app-id": appId,
      },
    };

    // RFC 8785 JSON canonicalization
    const canonicalize = (obj: any): string => {
      if (obj === null || typeof obj !== "object") {
        return JSON.stringify(obj);
      }
      if (Array.isArray(obj)) {
        return `[${obj.map(canonicalize).join(",")}]`;
      }
      const keys = Object.keys(obj).sort();
      const items = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`);
      return `{${items.join(",")}}`;
    };

    const serialized = canonicalize(payload);
    const serializedBuffer = Buffer.from(serialized, "utf-8");

    let cleanKey = privateKeyRaw.replace("wallet-auth:", "").trim();
    if (!cleanKey.includes("-----BEGIN PRIVATE KEY-----")) {
      cleanKey = `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----`;
    }

    const privateKey = crypto.createPrivateKey({
      key: cleanKey,
      format: "pem",
    });

    const signature = crypto.sign("sha256", serializedBuffer, privateKey);
    return signature.toString("base64");
  } catch (err: any) {
    console.error("[PrivyEarn] Failed to generate authorization signature:", err?.message || err);
    return null;
  }
}

export async function resolveEmbeddedWalletId(userId: string): Promise<string | null> {
  try {
    const privy = getPrivyClient() as any;
    let privyUser: any = null;

    if (typeof privy.users === "function" && typeof privy.users()?.get === "function") {
      privyUser = await privy.users().get(userId);
    } else if (typeof privy.users?.get === "function") {
      privyUser = await privy.users.get({ id: userId });
    } else if (typeof privy.getUser === "function") {
      privyUser = await privy.getUser(userId);
    }

    let embeddedWallet = privyUser?.linkedAccounts?.find(
      (acc: any) =>
        acc.type === "wallet" &&
        (acc.walletClientType === "privy" || acc.connectorType === "embedded")
    ) as any;

    if (embeddedWallet?.id) return embeddedWallet.id;

    // Fallback: Fetch user directly via Privy REST API
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (appId && appSecret) {
      const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
      const res = await fetch(`https://api.privy.io/api/v1/users/${encodeURIComponent(userId)}`, {
        headers: {
          "privy-app-id": appId,
          Authorization: `Basic ${basicAuth}`,
        },
      });
      if (res.ok) {
        const userData = await res.json();
        embeddedWallet = userData?.linked_accounts?.find(
          (acc: any) =>
            acc.type === "wallet" &&
            (acc.wallet_client_type === "privy" || acc.connector_type === "embedded")
        ) || userData?.linkedAccounts?.find(
          (acc: any) =>
            acc.type === "wallet" &&
            (acc.walletClientType === "privy" || acc.connectorType === "embedded")
        );
        if (embeddedWallet?.id) return embeddedWallet.id;
      }
    }

    return null;
  } catch (err: any) {
    console.error("[PrivyEarn] Error resolving embedded wallet ID:", err?.message || err);
    return null;
  }
}

export function parsePrivyEarnError(error: any): string {
  const rawMsg =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    String(error);

  return rawMsg;
}
