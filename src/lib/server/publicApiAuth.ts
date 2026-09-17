import crypto from "crypto";
import { findActiveApiKey, touchApiKeyUsage, ApiKeyRecord } from "./apiKeysStore";
import { verifyUserRequest } from "./userAuth";

function getConfiguredApiKeys(): string[] {
  return (process.env.ZKPAY_API_KEYS || process.env.ZKPAY_API_KEY || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export interface PublicApiAuthResult {
  ok: boolean;
  provided: boolean;
  status?: number;
  error?: string;
  apiKeyRecord?: ApiKeyRecord;
  isEnvKey?: boolean;
  isUserSession?: boolean;
  userId?: string;
  walletAddress?: string;
}

/**
 * Resolves authentication for public API endpoints.
 * Supports:
 *   1. Explicit API keys via x-api-key header
 *   2. API keys via Authorization: Bearer <apiKey>
 *   3. Static server admin keys (ZKPAY_API_KEYS)
 *   4. Privy user session tokens via Authorization: Bearer <privyAccessToken>
 */
export async function resolvePublicApiAuth(req: Request): Promise<PublicApiAuthResult> {
  const directKey = req.headers.get("x-api-key")?.trim();
  const authHeader = req.headers.get("authorization")?.trim();
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const candidateKey = directKey || bearerToken;

  if (!candidateKey) {
    return {
      ok: false,
      provided: false,
      status: 401,
      error: "Missing API key. Provide x-api-key header or Bearer token.",
    };
  }

  // 1. Check static environment admin keys
  const envKeys = getConfiguredApiKeys();
  const envMatched = envKeys.some((k) => safeEquals(candidateKey, k));
  if (envMatched) {
    return { ok: true, provided: true, isEnvKey: true };
  }

  // 2. Check dynamic database keys (issued from merchant profile dashboard)
  try {
    const dbRecord = await findActiveApiKey(candidateKey);
    if (dbRecord) {
      touchApiKeyUsage(dbRecord.id).catch((err) =>
        console.warn("[PublicApiAuth] Failed to touch API key usage:", err)
      );
      return {
        ok: true,
        provided: true,
        apiKeyRecord: dbRecord,
        isEnvKey: false,
        userId: dbRecord.userId,
        walletAddress: dbRecord.walletAddress,
      };
    }
  } catch (err) {
    console.warn("[PublicApiAuth] Database key lookup error:", err);
  }

  // 3. Check if bearer token is a valid Privy user access token (for in-app user requests)
  if (bearerToken) {
    try {
      const userAuth = await verifyUserRequest(req);
      if (userAuth.authorized && userAuth.userId) {
        return {
          ok: true,
          provided: true,
          isUserSession: true,
          userId: userAuth.userId,
          walletAddress: userAuth.walletAddress,
        };
      }
    } catch {}
  }

  return {
    ok: false,
    provided: true,
    status: 401,
    error: "Invalid or inactive API key.",
  };
}

/**
 * Strict authentication guard. Fails if no valid API key or user session is present.
 */
export async function requirePublicApiKey(req: Request): Promise<PublicApiAuthResult> {
  const auth = await resolvePublicApiAuth(req);
  if (!auth.ok) {
    return {
      ...auth,
      status: auth.status || 401,
      error: auth.error || "Missing API key. Provide x-api-key header or Bearer token.",
    };
  }
  return auth;
}
