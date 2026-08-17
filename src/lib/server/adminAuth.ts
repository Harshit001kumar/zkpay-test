import { PrivyClient } from "@privy-io/node";

let _privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    console.warn("[AdminAuth] Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET");
    return null;
  }

  if (!_privyClient) {
    _privyClient = new PrivyClient(appId, appSecret);
  }

  return _privyClient;
}

export interface AdminAuthResult {
  authorized: boolean;
  userId?: string;
  walletAddress?: string;
  error?: string;
  status: number;
}

/**
 * Cryptographically verifies that an incoming request is from an authorized Admin.
 * 1. Checks Authorization: Bearer <privy-access-token> header or privy-token cookie.
 * 2. Uses PrivyClient.verifyAuthToken() to decode and verify claims.
 * 3. Compares Privy DID and linked Ethereum wallets against ADMIN_PRIVY_DIDS and ADMIN_WALLETS env vars.
 */
export async function verifyAdminRequest(req: Request): Promise<AdminAuthResult> {
  try {
    const authHeader = req.headers.get("authorization");
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    } else {
      // Check cookies for fallback
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(/privy-token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (!token) {
      return {
        authorized: false,
        error: "Missing authorization token. Please sign in with an authorized administrator account.",
        status: 401,
      };
    }

    const privy = getPrivyClient();
    if (!privy) {
      return {
        authorized: false,
        error: "Privy server authentication is not configured on the backend (missing PRIVY_APP_SECRET).",
        status: 500,
      };
    }

    // 1. Verify token signature and claims
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId; // did:privy:...

    if (!userId) {
      return {
        authorized: false,
        error: "Invalid session token claims.",
        status: 401,
      };
    }

    // 2. Fetch full user to inspect all linked wallets and accounts
    const user = await privy.getUser(userId);
    const linkedWallets = user.linkedAccounts
      ?.filter((acc: any) => acc.type === "wallet")
      .map((acc: any) => acc.address?.toLowerCase())
      .filter(Boolean) || [];

    const primaryWallet = user.wallet?.address?.toLowerCase();
    if (primaryWallet && !linkedWallets.includes(primaryWallet)) {
      linkedWallets.push(primaryWallet);
    }

    // 3. Check against whitelist
    const rawAdminDids = process.env.ADMIN_PRIVY_DIDS || "";
    const rawAdminWallets = process.env.ADMIN_WALLETS || "";

    const adminDids = rawAdminDids
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const adminWallets = rawAdminWallets
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    // If no admins are defined in env, log warning and block access
    if (adminDids.length === 0 && adminWallets.length === 0) {
      console.warn("[AdminAuth] Security alert: Neither ADMIN_PRIVY_DIDS nor ADMIN_WALLETS configured in environment.");
      return {
        authorized: false,
        error: "Administrator whitelist is not configured on this server.",
        status: 403,
      };
    }

    const isDidMatched = adminDids.includes(userId.toLowerCase());
    const isWalletMatched = linkedWallets.some((w: string) => adminWallets.includes(w));

    if (!isDidMatched && !isWalletMatched) {
      console.warn(`[AdminAuth] Unauthorized access attempt by DID: ${userId}, Wallets: ${linkedWallets.join(", ")}`);
      return {
        authorized: false,
        error: "Access Denied: Your account is not authorized as a ZkPay Administrator.",
        status: 403,
      };
    }

    return {
      authorized: true,
      userId,
      walletAddress: primaryWallet || linkedWallets[0],
      status: 200,
    };
  } catch (err: any) {
    console.error("[AdminAuth] Token verification error:", err);
    return {
      authorized: false,
      error: `Authentication failed: ${err.message || "Invalid or expired token"}`,
      status: 401,
    };
  }
}
