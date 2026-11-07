import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { getRelayerAddress, getRelayerBalance } from "@/lib/server/relayer";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sweeper
 *
 * Returns relayer/sweeper wallet status and balance for proxy swap forwarding.
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

    return NextResponse.json({
      success: true,
      sweeper: {
        configured: isConfigured,
        address: sweeperAddress,
        balanceEth,
      },
      sessions: [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load sweeper status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  return NextResponse.json({
    success: true,
    sweptCount: 0,
    results: [],
  });
}
