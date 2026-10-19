import crypto from "crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { encryptKey } from "./payStore";
import { normalizeChain } from "@/lib/constants";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encodes arbitrary buffer to Base58 string (Solana / Bitcoin / Litecoin standard).
 * Uses BigInt for arbitrary-precision arithmetic to prevent 32-bit integer overflow.
 */
export function encodeBase58(source: Uint8Array | Buffer): string {
  if (source.length === 0) return "";
  let x = 0n;
  for (let i = 0; i < source.length; i++) {
    x = (x << 8n) | BigInt(source[i]);
  }
  let str = "";
  while (x > 0n) {
    const mod = Number(x % 58n);
    x = x / 58n;
    str = BASE58_ALPHABET[mod] + str;
  }
  for (let i = 0; i < source.length && source[i] === 0; i++) {
    str = "1" + str;
  }
  return str;
}

/**
 * Decodes a Base58 string to a Buffer (Solana / Bitcoin / Litecoin standard).
 * Uses BigInt for arbitrary-precision arithmetic.
 */
export function decodeBase58(str: string): Buffer {
  if (str.length === 0) return Buffer.alloc(0);
  let x = 0n;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const val = BASE58_ALPHABET.indexOf(c);
    if (val === -1) throw new Error(`Invalid Base58 character: ${c}`);
    x = x * 58n + BigInt(val);
  }
  const bytes: number[] = [];
  while (x > 0n) {
    bytes.push(Number(x & 0xffn));
    x >>= 8n;
  }
  bytes.reverse();
  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === "1"; i++) {
    leadingZeros++;
  }
  const result = Buffer.alloc(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[i];
  }
  return result;
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

  // 2. Litecoin (secp256k1 P2PKH mainnet address starting with 'L')
  if (normChain === "ltc") {
    // Generate 32-byte private key
    const privKey = crypto.randomBytes(32);
    const ecdh = crypto.createECDH("secp256k1");
    ecdh.setPrivateKey(privKey);
    const compressedPub = Buffer.from(ecdh.getPublicKey(null, "compressed"));

    // SHA256 then RIPEMD160
    const sha = crypto.createHash("sha256").update(compressedPub).digest();
    const ripemd = crypto.createHash("ripemd160").update(sha).digest();

    // Litecoin mainnet P2PKH version prefix = 0x30 (decimal 48 -> addresses start with 'L')
    const payload = Buffer.concat([Buffer.from([0x30]), ripemd]);
    const check1 = crypto.createHash("sha256").update(payload).digest();
    const check2 = crypto.createHash("sha256").update(check1).digest();
    const checksum = check2.subarray(0, 4);

    const fullLtcBytes = Buffer.concat([payload, checksum]);
    const depositAddress = encodeBase58(fullLtcBytes);
    const encryptedKey = encryptKey(privKey.toString("hex"));

    return {
      chain: "ltc",
      depositAddress,
      encryptedPrivateKey: encryptedKey,
    };
  }

  // 3. EVM Chains (Base, Arbitrum, Polygon, BSC, etc.)
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
 */
export function isProxySupportedChain(chain?: string | null, fromAsset?: string | null): boolean {
  if (!chain) return false;
  const c = normalizeChain(chain);
  if (!c) return false;

  const sym = extractCleanSymbol(fromAsset);

  // 1. Solana: Native SOL
  if (c === "sol") {
    if (!sym) return true;
    return sym === "SOL" || sym.includes("SOL");
  }

  // 2. Litecoin: Native LTC
  if (c === "ltc") {
    return true;
  }

  // 3. Base: Native ETH, USDC, USDT
  if (c === "base") {
    return true;
  }

  // 4. Polygon: Native POL / MATIC, USDC, USDT
  if (c === "polygon") {
    return true;
  }

  // 5. Arbitrum: Native ETH, USDC, USDT
  if (c === "arb") {
    return true;
  }

  // 6. BSC: Native BNB, USDT, USDC
  if (c === "bsc") {
    return true;
  }

  return false;
}

