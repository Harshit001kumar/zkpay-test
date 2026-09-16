import crypto from "crypto";
import { findActiveApiKey, touchApiKeyUsage, ApiKeyRecord } from "./apiKeysStore";

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

export interface PublicApiAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
  apiKeyRecord?: ApiKeyRecord;
  isEnvKey?: boolean;
}

export async function requirePublicApiKey(req: Request): Promise<PublicApiAuthResult> {
  const provided = extractApiKey(req);
  if (!provided) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Provide x-api-key header or Bearer token.",
    };
  }

  // 1. Check static environment keys (if configured)
  const envKeys = getConfiguredApiKeys();
  const envMatched = envKeys.some((k) => safeEquals(provided, k));
  if (envMatched) {
    return { ok: true, isEnvKey: true };
  }

  // 2. Check dynamic database keys (issued from merchant dashboard)
  try {
    const dbRecord = await findActiveApiKey(provided);
    if (dbRecord) {
      touchApiKeyUsage(dbRecord.id).catch((err) =>
        console.warn("[PublicApiAuth] Failed to touch API key usage:", err)
      );
      return { ok: true, apiKeyRecord: dbRecord, isEnvKey: false };
    }
  } catch (err) {
    console.warn("[PublicApiAuth] Database key lookup error:", err);
  }

  return {
    ok: false,
    status: 401,
    error: "Invalid or inactive API key.",
  };
}

