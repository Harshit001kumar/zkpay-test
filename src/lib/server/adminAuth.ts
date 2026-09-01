import { PrivyClient } from "@privy-io/node";

let _privyClient: any = null;

function getPrivyClient(): any {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    console.warn("[AdminAuth] Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET");
    return null;
  }

  if (!_privyClient) {
    _privyClient = new PrivyClient({
      appId,
      appSecret,
    });
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
 * 1. Checks Authorization: Bearer <privy-access-token> header.
 * 2. Uses PrivyClient cryptographic token verification.
 * 3. Inspects server-verified linked accounts against ADMIN_PRIVY_DIDS and ADMIN_WALLETS.
 */
export async function verifyAdminRequest(req: Request): Promise<AdminAuthResult> {
  try {
    const authHeader = req.headers.get("authorization");
    let token = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    } else {
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

    // 1. Strict cryptographic token verification
    let verifiedClaims: any = null;
    try {
      if (typeof privy.utils === "function" && typeof privy.utils()?.auth === "function") {
        verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
      } else if (typeof privy.verifyAccessToken === "function") {
        verifiedClaims = await privy.verifyAccessToken(token);
      } else if (typeof privy.verifyAuthToken === "function") {
        verifiedClaims = await privy.verifyAuthToken(token);
      }
    } catch (verifyErr: any) {
      console.warn("[AdminAuth] Token signature verification failed:", verifyErr?.message || verifyErr);
      return {
        authorized: false,
        error: "Invalid or expired session token. Signature verification failed.",
        status: 401,
      };
    }

    const userId = verifiedClaims?.user_id || verifiedClaims?.userId;

    if (!userId) {
      return {
        authorized: false,
        error: "Invalid session token claims. Unable to verify user ID.",
        status: 401,
      };
    }

    // 2. Fetch user to inspect server-verified linked accounts
    let linkedWallets: string[] = [];
    let primaryWallet: string | undefined;

    try {
      let user: any = null;
      if (typeof privy.users === "function" && typeof privy.users()?.get === "function") {
        user = await privy.users().get(userId);
      } else if (typeof privy.getUser === "function") {
        user = await privy.getUser(userId);
      }

      if (user) {
        const fetchedLinked =
          user.linkedAccounts
            ?.filter((acc: any) => acc.type === "wallet" || acc.type === "smart_wallet")
            .map((acc: any) => acc.address?.toLowerCase())
            .filter(Boolean) || [];

        linkedWallets = Array.from(new Set(fetchedLinked));

        const pW = user.wallet?.address?.toLowerCase();
        if (pW) {
          primaryWallet = pW;
          if (!linkedWallets.includes(pW)) linkedWallets.push(pW);
        }
      }
    } catch (fetchErr: any) {
      console.warn("[AdminAuth] User lookup warning:", fetchErr?.message);
    }

    // 3. Check against whitelist
    const rawAdminDids = process.env.ADMIN_PRIVY_DIDS || "";
    const rawAdminWallets = process.env.ADMIN_WALLETS || "";

    const adminDids = rawAdminDids
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase())
      .filter(Boolean);

    const adminWallets = rawAdminWallets
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase())
      .filter(Boolean);

    if (adminDids.length === 0 && adminWallets.length === 0) {
      console.warn("[AdminAuth] Security alert: Neither ADMIN_PRIVY_DIDS nor ADMIN_WALLETS configured in environment.");
      return {
        authorized: false,
        error: "Administrator whitelist is not configured on this server (ADMIN_WALLETS or ADMIN_PRIVY_DIDS is empty in Render environment variables).",
        status: 403,
      };
    }

    const isDidMatched = adminDids.includes(userId.toLowerCase());
    const isWalletMatched = linkedWallets.some((w: string) => adminWallets.includes(w.toLowerCase()));

    if (!isDidMatched && !isWalletMatched) {
      console.warn(`[AdminAuth] Unauthorized access attempt by DID: ${userId}, Wallets: ${linkedWallets.join(", ")}`);
      return {
        authorized: false,
        error: `Access Denied: Account (DID: ${userId}) is not on the administrator whitelist.`,
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
