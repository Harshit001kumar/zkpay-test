import { NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  prefundAccount,
  getRelayerAddress,
  getRelayerBalance,
  checkUsdcActivity,
} from "@/lib/server/relayer";
import { getPrivyClient } from "@/lib/server/privyEarn";

// ──────────────────────────────────────────────
// POST /api/relayer/prefund
//
// Secured Gas Relayer endpoint. Pre-funds legitimate
// user smart accounts with micro ETH for 1-click execution.
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Security Check: Authenticate Caller ──
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized — no access token provided" },
        { status: 401 }
      );
    }

    let verifiedClaims;
    try {
      verifiedClaims = await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    // ── 2. Security Check: Parse & Validate Target Address ──
    const body = await request.json();
    const { address } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const normalizedTarget = address.toLowerCase();

    // ── 3. Security Check: Verify Wallet Ownership (Anti-Hijack) ──
    // Ensure the requested address belongs to the authenticated user
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

      if (privyUser?.linkedAccounts) {
        const userWallets = privyUser.linkedAccounts
          .filter((acc: any) => acc.type === "wallet" || acc.type === "smart_wallet")
          .map((acc: any) => (acc.address || "").toLowerCase());

        const hasMatchingWallet = userWallets.some(
          (w: string) => w === normalizedTarget
        );

        if (userWallets.length > 0 && !hasMatchingWallet) {
          console.warn(
            `[Relayer Security] Rejected prefund for unlinked address ${address} by user ${userId}`
          );
          return NextResponse.json(
            { error: "Security violation: Target address is not linked to your account." },
            { status: 403 }
          );
        }
      }
    } catch (lookupErr: any) {
      console.warn("[Relayer Security] User wallet lookup error (proceeding with checks):", lookupErr?.message);
    }

    // ── 4. Security Check: Sybil & Bot-Farm Filter (USDC Activity) ──
    const hasActivity = await checkUsdcActivity(address as `0x${string}`);
    if (!hasActivity) {
      console.log(`[Relayer Security] Wallet ${address} has < $0.01 USDC (skipping prefund until deposit)`);
      return NextResponse.json({
        success: false,
        alreadyFunded: false,
        message: "Wallet requires initial USDC deposit before gas subsidy.",
      });
    }

    // ── 5. Execute Pre-fund with Circuit Breaker & Rate Limits ──
    const result = await prefundAccount(address as `0x${string}`);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 429 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyFunded: result.alreadyFunded,
      txHash: result.hash,
    });
  } catch (error: any) {
    console.error("[Relayer Prefund Error]:", error?.message || error);
    return NextResponse.json(
      { error: "Gas relay service temporarily unavailable." },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// GET /api/relayer/prefund
//
// Relayer Health & Monitoring endpoint.
// ──────────────────────────────────────────────
export async function GET() {
  try {
    const address = getRelayerAddress();
    const balance = await getRelayerBalance();
    const { formatEther } = await import("viem");

    return NextResponse.json({
      relayerAddress: address,
      balanceEth: formatEther(balance),
      healthy: balance > 0n,
      network: "Base Mainnet (8453)",
      security: {
        circuitBreaker: "Active (0.005 ETH/hour max)",
        cooldown: "5 minutes per address",
        dailyCap: "3 prefunds per wallet / 24h",
        sybilFilter: "Active (requires >= $0.01 USDC)",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Relayer not configured",
        hint: "Add RELAYER_PRIVATE_KEY to Render environment variables",
      },
      { status: 500 }
    );
  }
}
