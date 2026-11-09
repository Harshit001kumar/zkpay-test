import { NextResponse } from "next/server";
import { ensureProxySweeperDaemonRunning, runProxySweeperTick } from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * 
 * Health-check endpoint. Ensures the sweeper daemon is running and executes
 * a sweeper tick across any pending proxy swap deposits.
 * 
 * Perfect for Vercel Cron, Render pings, or external uptime monitors (UptimeRobot).
 */
export async function GET() {
  let tickResult = { checked: 0, processed: 0 };
  try {
    ensureProxySweeperDaemonRunning();
    tickResult = await runProxySweeperTick();
  } catch (e) {
    // Non-fatal
  }

  return NextResponse.json({
    status: "ok",
    timestamp: Date.now(),
    uptime: process.uptime(),
    sweeper: "active",
    tick: tickResult,
  });
}
