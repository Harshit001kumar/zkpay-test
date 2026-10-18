import crypto from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { encryptKey } from "./payStore";
import { normalizeChain } from "@/lib/constants";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encodes arbitrary buffer to Base58 string (Solana / Bitcoin standard).
 */
export function encodeBase58(source: Uint8Array | Buffer): string {
  if (source.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < source.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += source[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (let i = 0; i < source.length && source[i] === 0; i++) {
    str += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    str += BASE58_ALPHABET[digits[i]];
  }
  return str;
}

export interface GeneratedProxyWallet {
  chain: string;
  depositAddress: string;
  encryptedPrivateKey: string;
}

/**
 * Generates an ephemeral single-use proxy deposit address for the specified blockchain.
 * Automatically encrypts the signing key with AES-256-GCM.
 */
export function generateProxyDepositWallet(chain: string): GeneratedProxyWallet {
  const normChain = normalizeChain(chain) || chain.toLowerCase();

  // 1. Solana (Ed25519)
  if (normChain === "sol") {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const derPub = publicKey.export({ type: "spki", format: "der" });
    const rawPub = derPub.subarray(derPub.length - 32);
    const depositAddress = encodeBase58(rawPub);

    const derPriv = privateKey.export({ type: "pkcs8", format: "der" });
    const rawPriv = derPriv.subarray(derPriv.length - 32);
    const encryptedKey = encryptKey(rawPriv.toString("hex"));

    return {
      chain: "sol",
      depositAddress,
      encryptedPrivateKey: encryptedKey,
    };
  }

  // 2. EVM Chains (Base, Arbitrum, Polygon, BSC, etc.)
  const rawKey = generatePrivateKey();
  const account = privateKeyToAccount(rawKey);
  const depositAddress = getAddress(account.address);
  const encryptedKey = encryptKey(rawKey);

  return {
    chain: normChain,
    depositAddress,
    encryptedPrivateKey: encryptedKey,
  };
}
