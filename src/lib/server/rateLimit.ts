/**
 * Rate Limiter for ZkPay Public API Endpoints
 * 
 * Implements an in-memory sliding window rate limiter:
 * - Differentiates between unauthenticated public callers (by IP) and authenticated developers (by API key)
 * - Sets standard headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 * - Returns 429 Too Many Requests with Retry-After when limits are breached
 * - Periodically cleans up expired timestamp windows to prevent memory leaks
 */

import { corsJson } from "./cors";

export type RateLimitAction = "tokens" | "quote" | "create" | "status" | "default";

interface RateLimitTier {
  limit: number;      // max requests per window
  windowMs: number;   // window duration in ms
}

// Configured limits: IP (unauthenticated) vs Key (authenticated developers)
const LIMITS: Record<RateLimitAction, { ip: RateLimitTier; key: RateLimitTier }> = {
  tokens: {
    ip: { limit: 60, windowMs: 60 * 1000 },       // 60 req/min for IP
    key: { limit: 300, windowMs: 60 * 1000 },     // 300 req/min for API Key
  },
  quote: {
    ip: { limit: 30, windowMs: 60 * 1000 },       // 30 req/min for IP
    key: { limit: 120, windowMs: 60 * 1000 },     // 120 req/min for API Key
  },
  create: {
    ip: { limit: 10, windowMs: 60 * 1000 },       // 10 orders/min for IP
    key: { limit: 60, windowMs: 60 * 1000 },      // 60 orders/min for API Key
  },
  status: {
    ip: { limit: 60, windowMs: 60 * 1000 },       // 60 req/min for IP (1/sec polling)
    key: { limit: 240, windowMs: 60 * 1000 },     // 240 req/min for API Key
  },
  default: {
    ip: { limit: 60, windowMs: 60 * 1000 },
    key: { limit: 180, windowMs: 60 * 1000 },
  },
};

interface WindowEntry {
  timestamps: number[];
}

const windowStore = new Map<string, WindowEntry>();

// Garbage collection every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredWindows(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of windowStore.entries()) {
    const cutoff = now - 2 * 60 * 1000;
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) {
      windowStore.delete(key);
    }
  }
}

/**
 * Extracts a client identifier from IP headers or fallback.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "anonymous";
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfterSeconds?: number;
  headers: Record<string, string>;
}

/**
 * Checks rate limits for a given request and action type.
 */
export function checkRateLimit(
  req: Request,
  action: RateLimitAction = "default",
  apiKey?: string | null
): RateLimitResult {
  const now = Date.now();
  purgeExpiredWindows(now);

  const isKey = Boolean(apiKey && apiKey.trim().length > 0);
  const tierConfig = LIMITS[action] || LIMITS.default;
  const config = isKey ? tierConfig.key : tierConfig.ip;

  const id = isKey
    ? `key:${apiKey!.trim().slice(-16)}`
    : `ip:${getClientIp(req)}`;

  const storeKey = `${action}:${id}`;
  let entry = windowStore.get(storeKey);
  if (!entry) {
    entry = { timestamps: [] };
    windowStore.set(storeKey, entry);
  }

  // Filter timestamps within current sliding window
  const windowStart = now - config.windowMs;
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const resetSeconds = Math.ceil((now + config.windowMs) / 1000);

  if (entry.timestamps.length >= config.limit) {
    const oldestTimestamp = entry.timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestTimestamp + config.windowMs - now) / 1000));

    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(config.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(resetSeconds),
      "Retry-After": String(retryAfterSeconds),
    };

    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      reset: resetSeconds,
      retryAfterSeconds,
      headers,
    };
  }

  // Record this request
  entry.timestamps.push(now);
  const remaining = Math.max(0, config.limit - entry.timestamps.length);

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(config.limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetSeconds),
  };

  return {
    allowed: true,
    limit: config.limit,
    remaining,
    reset: resetSeconds,
    headers,
  };
}

/**
 * Middleware-style helper: enforces rate limit or returns a pre-formatted 429 response.
 */
export function enforceRateLimit(
  req: Request,
  action: RateLimitAction,
  apiKey?: string | null
): { response: Response | null; rateLimit: RateLimitResult } {
  const result = checkRateLimit(req, action, apiKey);

  if (!result.allowed) {
    const errorBody = {
      success: false,
      error: `Rate limit exceeded for action '${action}'. Please wait before retrying.`,
      limit: result.limit,
      retryAfterSeconds: result.retryAfterSeconds,
    };

    const response = corsJson(errorBody, {
      status: 429,
      headers: result.headers,
    });

    return { response, rateLimit: result };
  }

  return { response: null, rateLimit: result };
}
