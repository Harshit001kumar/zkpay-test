const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const REJECTED_EVM_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

/**
 * Pure-JS BigInt Base58 decoded byte-length helper (browser-safe, zero Node imports).
 * Returns -1 on invalid Base58 characters or all-zero payload.
 */
function decodedBase58Length(addr: string): number {
  let num = BigInt(0);
  const base = BigInt(58);
  let leadingOnes = 0;
  let countingLeading = true;

  for (let i = 0; i < addr.length; i++) {
    const ch = addr[i];
    if (countingLeading && ch === "1") {
      leadingOnes++;
    } else {
      countingLeading = false;
    }
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) return -1;
    num = num * base + BigInt(idx);
  }

  if (num === BigInt(0)) return -1;
  const hex = num.toString(16);
  const bodyBytes = Math.ceil(hex.length / 2);
  return leadingOnes + bodyBytes;
}

// Helper to validate and resolve a refund address for the origin blockchain
export function isValidAddressForOriginAsset(
  originAssetId: string,
  address?: string | null
): boolean {
  if (!address || typeof address !== "string" || typeof originAssetId !== "string") return false;
  const [assetId, trimmed] =
    !originAssetId.includes(":") && address.includes(":")
      ? [address.trim(), originAssetId.trim()]
      : [originAssetId.trim(), address.trim()];
  if (assetId.includes(":sol")) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) && decodedBase58Length(trimmed) === 32;
  } else if (assetId.includes(":tron")) {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed) && decodedBase58Length(trimmed) === 25;
  } else if (assetId.includes(":btc")) {
    if (!/^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test(trimmed)) {
      return false;
    }
    if (trimmed.toLowerCase().startsWith("bc1")) {
      return trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase();
    }
    return decodedBase58Length(trimmed) === 25;
  } else if (assetId.includes(":ltc")) {
    if (!/^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59})$/i.test(trimmed)) {
      return false;
    }
    if (trimmed.toLowerCase().startsWith("ltc1")) {
      return trimmed === trimmed.toLowerCase() || trimmed === trimmed.toUpperCase();
    }
    return decodedBase58Length(trimmed) === 25;
  } else {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return false;
    return !REJECTED_EVM_ADDRESSES.has(trimmed.toLowerCase());
  }
}

export function resolveRefundAddress(
  originAssetId: string,
  userRefundTo?: string | null,
  fallbackEvmAddress?: string | null,
  options?: { isDryRun?: boolean }
): string {
  // 1. If user-provided refund address is given, validate it; if invalid, throw 400
  if (userRefundTo && userRefundTo.trim() !== "") {
    const trimmed = userRefundTo.trim();
    if (isValidAddressForOriginAsset(originAssetId, trimmed)) {
      return trimmed;
    }
    const err = new Error(`Origin refund address '${trimmed}' is invalid for the source blockchain.`) as any;
    err.code = "INVALID_REFUND_ADDRESS";
    err.statusCode = 400;
    throw err;
  }

  // 2. Safe per-chain Treasury fallback: never block user or throw MISSING_REFUND_ADDRESS.
  // If a swap fails on-chain, funds safely route to ZkPay Treasury and support refunds the user.
  if (originAssetId.includes(":sol")) {
    return process.env.TREASURY_SOL || process.env.SOLANA_REFUND_ADDRESS || "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf";
  }
  if (originAssetId.includes(":btc")) {
    return process.env.TREASURY_BTC || process.env.BTC_REFUND_ADDRESS || "bc1qg52t5l20hfhmk7nkwe62s4xt3qr2fedwqmu6up";
  }
  if (originAssetId.includes(":tron")) {
    return process.env.TREASURY_TRON || process.env.TRON_REFUND_ADDRESS || "TSsMeYZRBVp2oSocHbbZJJPSWLFKaAy28j";
  }
  if (originAssetId.includes(":ltc")) {
    return process.env.TREASURY_LTC || process.env.LTC_REFUND_ADDRESS || "LdmUa92dDxtp84nwJQgdjmayJqE1ESKza4";
  }

  // 3. EVM chains fallback to user EVM address or ZkPay Base Treasury
  return (
    (fallbackEvmAddress && /^0x[a-fA-F0-9]{40}$/.test(fallbackEvmAddress.trim()) && fallbackEvmAddress.trim().toLowerCase()) ||
    process.env.TREASURY_BASE ||
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
    "0xb856b24fb054135deba5e0309edd31ed6a8afbe2"
  );
}
