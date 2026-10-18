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

const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

/**
 * Decodes a Base58 string to a Buffer (Solana / Bitcoin standard).
 */
export function decodeBase58(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_MAP.get(str[i]);
    if (val === undefined) throw new Error(`Invalid Base58 character: ${str[i]}`);
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += val;
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === BASE58_ALPHABET[0]; i++) {
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
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

function extractCleanSymbol(fromAsset?: string | null): string {
  if (!fromAsset) return "";
  const s = fromAsset.trim().toUpperCase();
  if (s.includes(":")) {
    const part = s.split(":")[1]?.split(".")[0] || "";
    if (part.includes("-")) return part.split("-")[0];
    return part;
  }
  return s;
}

/**
 * Checks whether a chain and asset are supported by the Single-Transfer Auto-Split & Forward System.
 * - Base: Native ETH, USDC, USDT (backend has Base relayer to pre-fund micro-gas).
 * - Solana: Native SOL only (self-paying binary Ed25519 wire transactions).
 * - Arbitrum: Native ETH only (self-paying gas token).
 * - Polygon: Native POL / MATIC only (self-paying gas token).
 * - BSC: Native BNB only (self-paying gas token).
 * 
 * ALL OTHER CHAINS & NON-GAS TOKENS:
 * (Bitcoin, Ethereum L1, Litecoin, Tron, Solana SPL tokens, Arbitrum/Polygon/BSC non-native ERC20s)
 * route directly to Near Intents solvers with 0% platform fee deduction (100% of user funds straight to solver).
 * This eliminates any risk of stuck deposits across unsupported chains or non-gas tokens.
 */
export function isProxySupportedChain(chain?: string | null, fromAsset?: string | null): boolean {
  if (!chain) return false;
  const c = normalizeChain(chain);
  if (!c) return false;

  const sym = extractCleanSymbol(fromAsset);

  // 1. Solana: Only native SOL uses proxy wallet (avoids SPL Associated Token Account rent & gas)
  if (c === "sol") {
    if (!sym) return true;
    return sym === "SOL" || sym.includes("SOL");
  }

  // 2. Base: Full support (Native ETH, USDC, USDT)
  if (c === "base") {
    return true;
  }

  // 3. Arbitrum: Only native ETH (self-paying gas token)
  if (c === "arb") {
    if (!sym) return true;
    return sym === "ETH";
  }

  // 4. Polygon: Only native POL / MATIC (self-paying gas token)
  if (c === "polygon") {
    if (!sym) return true;
    return sym === "POL" || sym === "MATIC";
  }

  // 5. BSC: Only native BNB (self-paying gas token)
  if (c === "bsc") {
    if (!sym) return true;
    return sym === "BNB";
  }

  // All other chains (btc, eth, tron, ltc, etc.) are NOT proxy supported -> 100% direct solver route
  return false;
}

