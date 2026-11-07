import { PrivyClient } from "@privy-io/node";
import { fetchPrivyUser } from "./privyUsers";

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

export interface UserAuthResult {
  authorized: boolean;
  status: number;
  userId?: string;
  walletAddress?: string;
  walletAddresses?: string[];
  /** True when the token was valid but linked wallets could not be fetched from Privy. */
  walletLookupFailed?: boolean;
  error?: string;
}

export async function verifyUserRequest(req: Request): Promise<UserAuthResult> {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!accessToken) {
      return { authorized: false, status: 401, error: "Unauthorized — no access token provided" };
    }

    const privy = getPrivyClient() as any;
    const claims = await privy.utils().auth().verifyAccessToken(accessToken);
    const userId = claims?.user_id || claims?.userId;
    if (!userId) {
      return { authorized: false, status: 401, error: "Unauthorized — invalid token claims" };
    }

    // Linked wallet lookup is best-effort. The access token is already cryptographically verified,
    // so routes that only need userId keep working. Routes that check wallet ownership will still
    // fail closed because walletAddresses will be empty.
    let walletAddress: string | undefined;
    let walletAddresses: string[] = [];
    let walletLookupFailed = false;
    try {
      const user = await fetchPrivyUser(privy, userId);
      walletAddresses = user.walletAddresses;
      walletAddress = user.primaryWalletAddress || walletAddresses[0];
    } catch (lookupErr: any) {
      walletLookupFailed = true;
      console.warn("[UserAuth] Linked wallet lookup failed:", lookupErr?.message || lookupErr);
    }

    return { authorized: true, status: 200, userId, walletAddress, walletAddresses, walletLookupFailed };
  } catch {
    return { authorized: false, status: 401, error: "Unauthorized — invalid or expired token" };
  }
}
