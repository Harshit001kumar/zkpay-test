import { NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  prefundAccount,
  getRelayerAddress,
  getRelayerBalance,
  checkUsdcActivity,
} from "@/lib/server/relayer";
import { verifyUserRequest } from "@/lib/server/userAuth";

// ──────────────────────────────────────────────
// POST /api/relayer/prefund
//
// Secured Gas Relayer endpoint. Pre-funds legitimate
// user smart accounts with micro ETH for 1-click execution.
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Security Check: Authenticate Caller via Privy JWT ──
    const userAuth = await verifyUserRequest(request);
    if (!userAuth.authorized || !userAuth.userId) {
      return NextResponse.json(
        { error: userAuth.error || "Unauthorized — valid session required to access gas relayer" },
        { status: userAuth.status || 401 }
      );
    }

    // ── 2. Security Check: Parse & Validate Target Address ──
    const body = await request.json();
    const { address } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const targetAddress = address.toLowerCase();

    // Verify caller owns the target wallet to prevent relayer drainage
    const authorizedWallets = new Set([
      ...(userAuth.walletAddresses || []).map((a) => a.toLowerCase()),
      ...(userAuth.walletAddress ? [userAuth.walletAddress.toLowerCase()] : []),
    ]);

    if (authorizedWallets.size > 0 && !authorizedWallets.has(targetAddress)) {
      return NextResponse.json(
        { error: "Forbidden — prefund target address does not belong to authenticated user" },
        { status: 403 }
      );
    }

    // ── 3. Security Check: Sybil & Bot-Farm Filter (USDC Activity) ──
    // Target address must hold at least $0.01 USDC to prevent empty burner account drain
    const hasActivity = await checkUsdcActivity(address as `0x${string}`);
    if (!hasActivity) {
      console.log(`[Relayer Security] Wallet ${address} has < $0.01 USDC (skipping prefund)`);
      return NextResponse.json({
        success: false,
        alreadyFunded: false,
        message: "Wallet requires initial USDC deposit before gas subsidy.",
      });
    }

    // ── 4. Execute Pre-fund with Circuit Breaker & Rate Limits ──
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
        hint: "Add RELAYER_PRIVATE_KEY to Render environment variables and fund with ~$3-$5 of ETH on Base",
      },
      { status: 500 }
    );
  }
}
