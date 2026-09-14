import { getPrivyClient } from "./privyEarn";

export interface UserAuthResult {
  authorized: boolean;
  status: number;
  userId?: string;
  walletAddress?: string;
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
    try {
      let user: any = null;
      if (typeof privy.users === "function" && typeof privy.users()?.get === "function") {
        user = await privy.users().get(userId);
      } else if (typeof privy.getUser === "function") {
        user = await privy.getUser(userId);
      }

      const linkedWallet =
        user?.wallet?.address ||
        user?.linkedAccounts?.find((a: any) => a.type === "wallet" || a.type === "smart_wallet")?.address;
      walletAddress = linkedWallet?.toLowerCase();
    } catch {
      walletAddress = undefined;
    }

    return { authorized: true, status: 200, userId, walletAddress };
  } catch {
    return { authorized: false, status: 401, error: "Unauthorized — invalid or expired token" };
  }
}
