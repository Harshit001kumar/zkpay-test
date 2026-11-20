import { NextResponse } from "next/server";
import { ensureProxySweeperDaemonRunning, runProxySweeperTick } from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastHealthSweepAt = 0;
const HEALTH_SWEEP_MIN_INTERVAL_MS = 25_000;

/**
 * GET /api/health
 * 
 * Lightweight health-check endpoint for Render & external monitors.
 * Ensures the background sweeper daemon is scheduled on persistent hosts (Render)
 * without running heavy DB/RPC sweeps on every probe.
 * Pass ?sweep=1 (used by external cron on Vercel serverless) to trigger a debounced sweep.
 */
export async function GET(req: Request) {
  let tickResult: { checked: number; processed: number } | undefined;
  let sweepSkipped = false;
  try {
    ensureProxySweeperDaemonRunning();
    const { searchParams } = new URL(req.url);
    if (searchParams.get("sweep") === "1") {
      const now = Date.now();
      if (now - lastHealthSweepAt >= HEALTH_SWEEP_MIN_INTERVAL_MS) {
        lastHealthSweepAt = now;
        tickResult = await runProxySweeperTick();
      } else {
        sweepSkipped = true;
      }
    }
  } catch {
    // Non-fatal
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(),
      sweeper: process.env.VERCEL === "1" ? "cron" : "active",
      ...(tickResult ? { tick: tickResult } : {}),
      ...(sweepSkipped ? { sweepSkipped: true } : {}),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
