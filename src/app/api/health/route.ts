import { NextResponse } from "next/server";
import { ensureProxySweeperDaemonRunning } from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * 
 * Health-check endpoint. Also ensures the sweeper daemon is running
 * (idempotent — the function is a no-op if already started).
 * 
 * Configure Render to ping this URL every 5 minutes to keep the
 * server warm and the sweeper daemon alive.
 */
export async function GET() {
  // Re-ensure daemon is running (no-op if already active)
  try {
    ensureProxySweeperDaemonRunning();
  } catch (e) {
    // Non-fatal
  }

  return NextResponse.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
    sweeper: "active",
  });
}
