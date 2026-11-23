import crypto from "crypto";
import { NextResponse } from "next/server";
import { ensureProxySweeperDaemonRunning, runProxySweeperTick } from "@/lib/server/proxyForwarder";
import { enforceRateLimit } from "@/lib/server/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let lastHealthSweepAt = 0;
const HEALTH_SWEEP_MIN_INTERVAL_MS = 25_000;

function timingSafeSecretMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
  let sweepAuthorized = false;
  try {
    ensureProxySweeperDaemonRunning();
    const { searchParams } = new URL(req.url);
    if (searchParams.get("sweep") === "1") {
      const cronSecret = process.env.CRON_SECRET?.trim();
      if (!cronSecret) {
        if (process.env.NODE_ENV === "production") {
          return NextResponse.json(
            { error: "Unauthorized sweep trigger" },
            { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
          );
        }
        const { response: rateLimitResp } = enforceRateLimit(req, "create", undefined, { cors: false });
        if (rateLimitResp) return rateLimitResp;
      } else {
        const authHeader = req.headers.get("authorization") || "";
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
        const provided = bearer || req.headers.get("x-cron-secret")?.trim() || "";
        if (!provided || !timingSafeSecretMatch(provided, cronSecret)) {
          return NextResponse.json(
            { error: "Unauthorized sweep trigger" },
            { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
          );
        }
      }
      sweepAuthorized = true;

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
      ...(sweepAuthorized && tickResult ? { tick: tickResult } : {}),
      ...(sweepAuthorized && sweepSkipped ? { sweepSkipped: true } : {}),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
