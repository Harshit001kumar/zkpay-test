import crypto from "crypto";

function getConfiguredApiKeys(): string[] {
  return (process.env.ZKPAY_API_KEYS || process.env.ZKPAY_API_KEY || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractApiKey(req: Request): string | null {
  const direct = req.headers.get("x-api-key")?.trim();
  if (direct) return direct;

  const auth = req.headers.get("authorization")?.trim();
  if (!auth) return null;
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function requirePublicApiKey(req: Request): { ok: boolean; status?: number; error?: string } {
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      status: 500,
      error: "API authentication is not configured on server (set ZKPAY_API_KEYS).",
    };
  }

  const provided = extractApiKey(req);
  if (!provided) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Provide x-api-key header.",
    };
  }

  const matched = keys.some((k) => safeEquals(provided, k));
  if (!matched) {
    return {
      ok: false,
      status: 401,
      error: "Invalid API key.",
    };
  }

  return { ok: true };
}
