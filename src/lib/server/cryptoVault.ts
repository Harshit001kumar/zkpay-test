import crypto from "crypto";

/**
 * Cryptographic Vault for Single-Use Ephemeral Deposit Wallets.
 *
 * Provides AES-256-GCM authenticated encryption and decryption for proxy deposit
 * private keys used by the ZkPay Cross-Chain Swap Engine.
 */

function getMasterEncryptionKey(): Buffer {
  const secret =
    process.env.PAYIN_MASTER_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "zkpay_default_secure_proxy_secret_v1" : "");

  if (!secret) {
    throw new Error(
      "Missing PAYIN_MASTER_SECRET (or AUTH_SECRET) in production environment."
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a private key using AES-256-GCM with a unique 96-bit initialization vector.
 */
export function encryptKey(plainKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMasterEncryptionKey(), iv);
  let encrypted = cipher.update(plainKey, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM cipher payload on-the-fly for off-chain transaction signing.
 */
export function decryptKey(cipherPayload: string): string {
  if (cipherPayload.startsWith("0x") && !cipherPayload.includes(":")) {
    return cipherPayload;
  }
  const parts = cipherPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format");
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getMasterEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
