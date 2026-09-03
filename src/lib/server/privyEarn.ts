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
