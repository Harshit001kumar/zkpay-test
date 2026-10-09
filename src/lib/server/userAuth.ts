import { getPrivyClient } from "./privyEarn";

export interface UserAuthResult {
  authorized: boolean;
  status: number;
  userId?: string;
  walletAddress?: string;
  walletAddresses?: string[];
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

    let walletAddress: string | undefined;
    let walletAddresses: string[] = [];
    try {
      let user: any = null;
      if (typeof privy.users === "function" && typeof privy.users()?.get === "function") {
        user = await privy.users().get(userId);
      } else if (typeof privy.getUser === "function") {
        user = await privy.getUser(userId);
      }

      const addresses: string[] = [];
      if (user?.wallet?.address) {
        addresses.push(user.wallet.address.toLowerCase());
      }
      if (Array.isArray(user?.linkedAccounts)) {
        for (const acc of user.linkedAccounts) {
          if ((acc.type === "wallet" || acc.type === "smart_wallet") && acc.address) {
            addresses.push(acc.address.toLowerCase());
          }
        }
      }
      walletAddresses = Array.from(new Set(addresses));
      walletAddress = walletAddresses[0];
    } catch {
      walletAddress = undefined;
      walletAddresses = [];
    }

    return { authorized: true, status: 200, userId, walletAddress, walletAddresses };
  } catch {
    return { authorized: false, status: 401, error: "Unauthorized — invalid or expired token" };
  }
}
