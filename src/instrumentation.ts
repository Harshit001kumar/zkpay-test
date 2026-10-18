/**
 * Next.js Instrumentation Hook — runs once when the server starts.
 *
 * This guarantees the proxy sweeper daemon is running immediately on boot,
 * not just when a user happens to hit an API route that imports proxyForwarder.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server runtime (not during build or on the edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Server starting — bootstrapping background services...");

    try {
      const { ensureProxySweeperDaemonRunning } = await import("@/lib/server/proxyForwarder");
      ensureProxySweeperDaemonRunning();
      console.log("[Instrumentation] ✓ Proxy sweeper daemon started.");
    } catch (err) {
      console.error("[Instrumentation] ✗ Failed to start proxy sweeper daemon:", err);
    }
  }
}
