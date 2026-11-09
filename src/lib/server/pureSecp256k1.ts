import { secp256k1 } from "@noble/curves/secp256k1";
import { Buffer } from "buffer";

/**
 * Pure JavaScript / TypeScript secp256k1 adapter for ecpair and bitcoinjs-lib.
 * 
 * Replaces 'tiny-secp256k1' which relies on a compiled 'secp256k1.wasm' binary file.
 * In serverless environments (like Vercel and AWS Lambda), Webpack bundling frequently
 * drops 'secp256k1.wasm', resulting in:
 * "ENOENT: no such file or directory, open '.../secp256k1.wasm'"
 * 
 * This adapter uses '@noble/curves/secp256k1' (the same audited pure JS crypto library
 * used by viem and ethereum), has ZERO wasm files, zero native bindings, and works
 * 100% reliably in Vercel, Next.js standalone, Render, and Docker.
 */

export interface TinySecp256k1Interface {
  isPoint(p: Uint8Array): boolean;
  pointCompress(p: Uint8Array, compressed?: boolean): Uint8Array;
  isPrivate(d: Uint8Array): boolean;
  pointFromScalar(d: Uint8Array, compressed?: boolean): Uint8Array | null;
  sign(h: Uint8Array, d: Uint8Array, e?: Uint8Array): Uint8Array;
  verify(h: Uint8Array, Q: Uint8Array, signature: Uint8Array, strict?: boolean): boolean;
  pointAddScalar?(p: Uint8Array, tweak: Uint8Array, compressed?: boolean): Uint8Array | null;
}

function parsePoint(p: Uint8Array | string) {
  const PointClass = (secp256k1 as any).Point || (secp256k1 as any).ProjectivePoint;
  if (!PointClass) throw new Error("secp256k1 point class not found");

  const bytes = typeof p === "string" ? Buffer.from(p.replace(/^0x/, ""), "hex") : p;
  const hex = typeof p === "string" ? p.replace(/^0x/, "") : Buffer.from(p).toString("hex");

  if (typeof PointClass.fromHex === "function") {
    try {
      return PointClass.fromHex(hex);
    } catch {
      // try fromBytes below if available
    }
  }

  if (typeof PointClass.fromBytes === "function") {
    return PointClass.fromBytes(bytes);
  }

  throw new Error("Unable to parse point with available secp256k1 methods");
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

  pointCompress(p: Uint8Array, compressed = true): Uint8Array {
    const point = parsePoint(p);
    const raw = typeof (point as any).toRawBytes === "function"
      ? (point as any).toRawBytes(compressed)
      : typeof (point as any).toBytes === "function"
      ? (point as any).toBytes(compressed)
      : Buffer.from((point as any).toHex(compressed), "hex");
    return Buffer.from(raw);
  },

  isPrivate(d: Uint8Array): boolean {
    if (!d || d.length !== 32) return false;
    try {
      return secp256k1.utils.isValidPrivateKey(d);
    } catch {
      return false;
    }
  },

  pointFromScalar(d: Uint8Array, compressed = true): Uint8Array | null {
    if (!d || d.length !== 32) return null;
    try {
      if (!secp256k1.utils.isValidPrivateKey(d)) return null;
      const pub = secp256k1.getPublicKey(d, compressed);
      return Buffer.from(pub);
    } catch {
      return null;
    }
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

  pointAddScalar(p: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array | null {
    try {
      const point = parsePoint(p);
      const tweakPoint = parsePoint(secp256k1.getPublicKey(tweak, true));
      const result = point.add(tweakPoint);
      const raw = typeof (result as any).toRawBytes === "function"
        ? (result as any).toRawBytes(compressed)
        : typeof (result as any).toBytes === "function"
        ? (result as any).toBytes(compressed)
        : Buffer.from((result as any).toHex(compressed), "hex");
      return Buffer.from(raw);
    } catch {
      return null;
    }
  },
};

export default pureSecp256k1;
