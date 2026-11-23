import crypto from "crypto";

/**
 * Cryptographic Vault for Single-Use Ephemeral Deposit Wallets.
 *
 * Provides AES-256-GCM authenticated encryption and decryption for proxy deposit
 * private keys used by the ZkPay Cross-Chain Swap Engine.
 */

export function getVaultCandidateSecrets(): string[] {
  const candidates = [
    process.env.PAYIN_MASTER_SECRET,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.NODE_ENV !== "production" ? "zkpay_default_secure_proxy_secret_v1" : undefined,
  ].filter((v): v is string => Boolean(v && v.trim()));

  if (candidates.length === 0) {
    throw new Error(
      "Missing PAYIN_MASTER_SECRET (or AUTH_SECRET) in production environment."
    );
  }
  return candidates;
}

function deriveV2Key(secret: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.from("zkpay-vault-salt-v1", "utf8"),
      Buffer.from("proxy-wallet-aes-256-gcm", "utf8"),
      32
    )
  );
}

function deriveLegacyKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a private key using AES-256-GCM with HKDF-derived key and a unique 96-bit IV.
 */
export function encryptKey(plainKey: string): string {
  const [primarySecret] = getVaultCandidateSecrets();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveV2Key(primarySecret), iv, {
    authTagLength: 16,
  });
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a v2 HKDF or legacy SHA-256 AES-256-GCM payload on-the-fly for signing.
 */
export function decryptKey(cipherPayload: string): string {
  if (cipherPayload.startsWith("0x") && !cipherPayload.includes(":")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Unencrypted proxy key format rejected in production");
    }
    return cipherPayload;
  }

  const parts = cipherPayload.split(":");
  const isV2 = parts[0] === "v2";
  if ((isV2 && parts.length !== 4) || (!isV2 && parts.length !== 3)) {
    throw new Error("Invalid encrypted key format");
  }

  const [ivHex, tagHex, encryptedHex] = isV2 ? parts.slice(1) : parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (iv.length !== 12 || tag.length !== 16 || !encryptedHex) {
    throw new Error("Invalid encrypted key metadata length");
  }

  const secrets = getVaultCandidateSecrets();
  let lastErr: any = null;
  for (const secret of secrets) {
    try {
      const key = isV2 ? deriveV2Key(secret) : deriveLegacyKey(secret);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
      });
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(
    `Failed to decrypt proxy private key: ${lastErr?.message || "Invalid authentication tag"}.`
  );
}
