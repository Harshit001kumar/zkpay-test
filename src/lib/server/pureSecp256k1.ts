import { secp256k1, schnorr } from "@noble/curves/secp256k1";
import { Buffer } from "buffer";

/**
 * Pure JavaScript / TypeScript secp256k1 adapter for ecpair, bip32, and bitcoinjs-lib.
 * 
 * Replaces 'tiny-secp256k1' which relies on a compiled 'secp256k1.wasm' binary file.
 * In serverless environments (like Vercel and AWS Lambda), Webpack bundling frequently
 * drops 'secp256k1.wasm', resulting in:
 * "ENOENT: no such file or directory, open '.../secp256k1.wasm'"
 * 
 * This adapter uses '@noble/curves/secp256k1' (the same audited pure JS crypto library
 * used by viem and ethereum), has ZERO wasm files, zero native bindings, and works
 * 100% reliably in Vercel, Next.js standalone, Render, and Docker.
 * 
 * Implements the full TinySecp256k1Interface required by:
 * - bitcoinjs-lib (initEccLib, Psbt, payments)
 * - ecpair (ECPairFactory, fromPrivateKey, fromPublicKey, sign, verify)
 * - bip32 (BIP32Factory, child derivation, tweaks)
 */

export interface TinySecp256k1Interface {
  isPoint(p: Uint8Array): boolean;
  isPointCompressed(p: Uint8Array): boolean;
  isXOnlyPoint(p: Uint8Array): boolean;
  isPrivate(d: Uint8Array): boolean;
  pointFromScalar(d: Uint8Array, compressed?: boolean): Uint8Array | null;
  pointCompress(p: Uint8Array, compressed?: boolean): Uint8Array;
  pointAdd(pA: Uint8Array, pB: Uint8Array, compressed?: boolean): Uint8Array | null;
  pointAddScalar(p: Uint8Array, tweak: Uint8Array, compressed?: boolean): Uint8Array | null;
  pointMultiply(p: Uint8Array, tweak: Uint8Array, compressed?: boolean): Uint8Array | null;
  privateAdd(d: Uint8Array, tweak: Uint8Array): Uint8Array | null;
  privateSub(d: Uint8Array, tweak: Uint8Array): Uint8Array | null;
  privateNegate(d: Uint8Array): Uint8Array;
  sign(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array;
  signSchnorr(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array;
  verify(h: Uint8Array, Q: Uint8Array, signature: Uint8Array, strict?: boolean): boolean;
  verifySchnorr(h: Uint8Array, Q: Uint8Array, signature: Uint8Array): boolean;
  xOnlyPointAddTweak(p: Uint8Array, tweak: Uint8Array): { parity: number; xOnlyPubkey: Uint8Array } | null;
  xOnlyPointFromScalar(d: Uint8Array): Uint8Array;
  xOnlyPointFromPoint(p: Uint8Array): Uint8Array;
}

// secp256k1 curve order n and field modulus p
const CURVE_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const CURVE_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let res = 0n;
  for (let i = 0; i < bytes.length; i++) {
    res = (res << 8n) | BigInt(bytes[i]);
  }
  return res;
}

function bigIntTo32Bytes(num: bigint): Uint8Array {
  const hex = num.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function getPointClass() {
  const PointClass = (secp256k1 as any).Point || (secp256k1 as any).ProjectivePoint;
  if (!PointClass) throw new Error("secp256k1 Point class not found");
  return PointClass;
}

function parsePoint(p: Uint8Array | string) {
  const PointClass = getPointClass();
  const bytes = typeof p === "string" ? Buffer.from(p.replace(/^0x/, ""), "hex") : p;
  const hex = typeof p === "string" ? p.replace(/^0x/, "") : Buffer.from(p).toString("hex");

  if (typeof PointClass.fromHex === "function") {
    try {
      return PointClass.fromHex(hex);
    } catch {}
  }

  if (typeof PointClass.fromBytes === "function") {
    return PointClass.fromBytes(bytes);
  }

  throw new Error("Unable to parse point with available secp256k1 methods");
}

function toPointBytes(point: any, compressed = true): Uint8Array {
  const raw = typeof point.toRawBytes === "function"
    ? point.toRawBytes(compressed)
    : typeof point.toBytes === "function"
    ? point.toBytes(compressed)
    : Buffer.from(point.toHex(compressed), "hex");
  return Buffer.from(raw);
}

function isPointZero(point: any): boolean {
  if (typeof point.is0 === "function") return point.is0();
  const PointClass = getPointClass();
  if (PointClass.ZERO) return point.equals(PointClass.ZERO);
  return false;
}

export const pureSecp256k1: TinySecp256k1Interface = {
  isPoint(p: Uint8Array): boolean {
    if (!p || (p.length !== 33 && p.length !== 65)) return false;
    if (p.length === 33 && p[0] !== 2 && p[0] !== 3) return false;
    if (p.length === 65 && p[0] !== 4) return false;
    try {
      parsePoint(p);
      return true;
    } catch {
      return false;
    }
  },

  isPointCompressed(p: Uint8Array): boolean {
    return this.isPoint(p) && p.length === 33;
  },

  isXOnlyPoint(p: Uint8Array): boolean {
    if (!p || p.length !== 32) return false;
    try {
      const x = bytesToBigInt(p);
      if (x >= CURVE_P || x === 0n) return false;
      parsePoint(Buffer.concat([Buffer.from([0x02]), Buffer.from(p)]));
      return true;
    } catch {
      return false;
    }
  },

  isPrivate(d: Uint8Array): boolean {
    if (!d || d.length !== 32) return false;
    const num = bytesToBigInt(d);
    return num > 0n && num < CURVE_N;
  },

  pointFromScalar(d: Uint8Array, compressed = true): Uint8Array | null {
    if (!this.isPrivate(d)) return null;
    try {
      const pub = secp256k1.getPublicKey(d, compressed);
      return Buffer.from(pub);
    } catch {
      return null;
    }
  },

  pointCompress(p: Uint8Array, compressed = true): Uint8Array {
    const point = parsePoint(p);
    return toPointBytes(point, compressed);
  },

  pointAdd(pA: Uint8Array, pB: Uint8Array, compressed = true): Uint8Array | null {
    try {
      const p1 = parsePoint(pA);
      const p2 = parsePoint(pB);
      const sum = p1.add(p2);
      if (isPointZero(sum)) return null;
      return toPointBytes(sum, compressed);
    } catch {
      return null;
    }
  },

  pointAddScalar(p: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array | null {
    if (!tweak || tweak.length !== 32) throw new Error("Expected Tweak");
    const t = bytesToBigInt(tweak);
    if (t >= CURVE_N) throw new Error("Expected Tweak");
    if (t === 0n) return this.pointCompress(p, compressed);
    try {
      const point = parsePoint(p);
      const PointClass = getPointClass();
      const tweakPoint = PointClass.BASE.multiply(t);
      const sum = point.add(tweakPoint);
      if (isPointZero(sum)) return null;
      return toPointBytes(sum, compressed);
    } catch {
      return null;
    }
  },

  pointMultiply(p: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array | null {
    if (!tweak || tweak.length !== 32) throw new Error("Expected Tweak");
    const t = bytesToBigInt(tweak);
    if (t >= CURVE_N || t === 0n) return null;
    try {
      const point = parsePoint(p);
      const product = point.multiply(t);
      if (isPointZero(product)) return null;
      return toPointBytes(product, compressed);
    } catch {
      return null;
    }
  },

  privateAdd(d: Uint8Array, tweak: Uint8Array): Uint8Array | null {
    if (!this.isPrivate(d)) throw new Error("Expected Private");
    if (!tweak || tweak.length !== 32) throw new Error("Expected Tweak");
    const t = bytesToBigInt(tweak);
    if (t >= CURVE_N) throw new Error("Expected Tweak");
    const p = bytesToBigInt(d);
    const sum = (p + t) % CURVE_N;
    if (sum === 0n) return null;
    return bigIntTo32Bytes(sum);
  },

  privateSub(d: Uint8Array, tweak: Uint8Array): Uint8Array | null {
    if (!this.isPrivate(d)) throw new Error("Expected Private");
    if (!tweak || tweak.length !== 32) throw new Error("Expected Tweak");
    const t = bytesToBigInt(tweak);
    if (t >= CURVE_N) throw new Error("Expected Tweak");
    const p = bytesToBigInt(d);
    let diff = (p - t) % CURVE_N;
    if (diff < 0n) diff += CURVE_N;
    if (diff === 0n) return null;
    return bigIntTo32Bytes(diff);
  },

  privateNegate(d: Uint8Array): Uint8Array {
    if (!this.isPrivate(d)) throw new Error("Expected Private");
    const p = bytesToBigInt(d);
    const neg = (CURVE_N - p) % CURVE_N;
    return bigIntTo32Bytes(neg);
  },

  sign(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array {
    const sig = (secp256k1 as any).sign(h, d, e ? { extraEntropy: e } : undefined);
    if (typeof sig.toCompactRawBytes === "function") {
      return Buffer.from(sig.toCompactRawBytes());
    }
    if (typeof sig.toBytes === "function") {
      return Buffer.from(sig.toBytes("compact"));
    }
    if (typeof sig.toCompactHex === "function") {
      return Buffer.from(sig.toCompactHex(), "hex");
    }
    return Buffer.from(sig);
  },

  signSchnorr(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array {
    try {
      const sig = schnorr.sign(h, d, e);
      return Buffer.from(sig);
    } catch {
      // In case h is 32 bytes and schnorr expects message
      const sig = (schnorr as any).sign(h, d, e ? { auxRand: e } : undefined);
      return Buffer.from(sig);
    }
  },

  verify(h: Uint8Array, Q: Uint8Array, signature: Uint8Array, strict?: boolean): boolean {
    try {
      // If signature starts with ASN.1 sequence header (0x30), it is DER encoded
      if (signature[0] === 0x30) {
        const sigObj = (secp256k1 as any).Signature?.fromDER
          ? (secp256k1 as any).Signature.fromDER(signature)
          : signature;
        return (secp256k1 as any).verify(sigObj, h, Q, { lowS: strict !== false });
      }

      // Compact 64-byte signature
      return (secp256k1 as any).verify(signature, h, Q, { lowS: strict !== false });
    } catch {
      return false;
    }
  },

  verifySchnorr(h: Uint8Array, Q: Uint8Array, signature: Uint8Array): boolean {
    try {
      const q = Q.length === 33 ? Q.slice(1, 33) : Q;
      return schnorr.verify(signature, h, q);
    } catch {
      return false;
    }
  },

  xOnlyPointAddTweak(p: Uint8Array, tweak: Uint8Array): { parity: number; xOnlyPubkey: Uint8Array } | null {
    try {
      const point = parsePoint(Buffer.concat([Buffer.from([0x02]), Buffer.from(p)]));
      const t = bytesToBigInt(tweak);
      const PointClass = getPointClass();
      const tweakPoint = PointClass.BASE.multiply(t);
      const sum = point.add(tweakPoint);
      if (isPointZero(sum)) return null;
      const raw = toPointBytes(sum, true);
      return {
        parity: raw[0] % 2 === 1 ? 1 : 0,
        xOnlyPubkey: raw.slice(1, 33),
      };
    } catch {
      return null;
    }
  },

  xOnlyPointFromScalar(d: Uint8Array): Uint8Array {
    const pub = this.pointFromScalar(d, true);
    if (!pub) throw new Error("Expected Private");
    return pub.slice(1, 33);
  },

  xOnlyPointFromPoint(p: Uint8Array): Uint8Array {
    const comp = this.pointCompress(p, true);
    return comp.slice(1, 33);
  },
};

export default pureSecp256k1;
