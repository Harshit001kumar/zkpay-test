import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { prefundAccount, getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";
import { getPrivyClient } from "@/lib/server/privyEarn";

// ──────────────────────────────────────────────
// POST /api/relayer/prefund
//
// Pre-funds a user's smart account with micro ETH
// for gas. Requires authenticated Privy user.
//
// Body: { address: "0x..." }
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Verify auth ──
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized — no access token provided" },
        { status: 401 }
      );
    }

    try {
      await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    // ── 2. Parse target address ──
    const body = await request.json();
    const { address } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    // ── 3. Pre-fund ──
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
// Returns relayer status (for monitoring).
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
