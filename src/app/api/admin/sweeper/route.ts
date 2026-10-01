import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { getActivePayInSessions, getPayInSession } from "@/lib/server/payStore";
import { sweepPayInSession } from "@/lib/server/sweeper";
import { getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";
import { formatEther } from "viem";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sweeper
 * 
 * Returns sweeper wallet status, balance, and all active/settled payin sessions.
 */
export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    let sweeperAddress: string | null = null;
    let balanceEth = "0.0000";
    let isConfigured = false;

    try {
      sweeperAddress = getRelayerAddress();
      const bal = await getRelayerBalance();
      balanceEth = (Number(bal) / 1e18).toFixed(4);
      isConfigured = true;
    } catch {
      isConfigured = false;
    }

    const sessions = getActivePayInSessions();

    return NextResponse.json({
      success: true,
      sweeper: {
        configured: isConfigured,
        address: sweeperAddress,
        balanceEth,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        payinAddress: s.payinAddress,
        amountINR: s.amountINR,
        expectedUsdc: s.expectedUsdc,
        receivedUsdc: s.receivedUsdc,
        status: s.status,
        txHash: s.txHash,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load sweeper status" }, { status: 500 });
  }
}

/**
 * POST /api/admin/sweeper
 * 
 * Manually sweeps a specific payin session or all settled sessions to Treasury.
 * Body: { sessionId?: string }
 */
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;

    if (sessionId) {
      const session = getPayInSession(sessionId);
      if (!session) {
        return NextResponse.json({ error: `Session '${sessionId}' not found.` }, { status: 404 });
      }

      const result = await sweepPayInSession(session);
      return NextResponse.json({
        success: result.success,
        result,
      });
    }

    // Sweep all active sessions that have received USDC
    const sessions = getActivePayInSessions();
    const results = [];

    for (const session of sessions) {
      if (session.status === "SETTLED" || session.receivedUsdc) {
        const res = await sweepPayInSession(session);
        results.push(res);
      }
    }

    return NextResponse.json({
      success: true,
      sweptCount: results.filter((r) => r.success).length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to execute sweep" }, { status: 500 });
  }
}
