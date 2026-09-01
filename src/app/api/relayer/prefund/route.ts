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

    // ── 3. Security Check: Restrict Exclusively to Privy Embedded & Smart Accounts ──
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
        // Find valid Privy-managed smart wallets or embedded wallets
        const privyManagedWallets = privyUser.linkedAccounts
          .filter(
            (acc: any) =>
              acc.type === "smart_wallet" ||
              (acc.type === "wallet" &&
                (acc.walletClientType === "privy" || acc.connectorType === "embedded"))
          )
          .map((acc: any) => (acc.address || "").toLowerCase());

        const isPrivyManaged = privyManagedWallets.some(
          (w: string) => w === normalizedTarget
        );

        if (!isPrivyManaged) {
          console.warn(
            `[Relayer Security] Rejected prefund: ${address} is an external wallet or unlinked account.`
          );
          return NextResponse.json(
            {
              error:
                "Gas subsidy is exclusively for Privy Smart Accounts and Embedded Wallets. External connected wallets (e.g. MetaMask, Phantom) must pay their own gas.",
            },
            { status: 403 }
          );
        }
      }
    } catch (lookupErr: any) {
      console.warn("[Relayer Security] User wallet lookup error:", lookupErr?.message);
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
