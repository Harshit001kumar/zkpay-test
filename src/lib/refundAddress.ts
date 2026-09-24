// Helper to resolve a valid refund address for the origin blockchain
export function resolveRefundAddress(
  originAssetId: string,
  userRefundTo?: string | null,
  fallbackEvmAddress?: string | null
): string {
  if (userRefundTo && userRefundTo.trim().length > 0) {
    const trimmed = userRefundTo.trim();
    if (originAssetId.includes(":sol")) {
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":tron")) {
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":btc")) {
      if (/^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test(trimmed)) return trimmed;
    } else if (originAssetId.includes(":ltc")) {
      if (/^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59})$/i.test(trimmed)) return trimmed;
    } else {
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed;
    }
  }

  // Network-specific fallbacks for non-EVM chains (configured project addresses)
  if (originAssetId.includes(":sol")) {
    return process.env.SOLANA_REFUND_ADDRESS || "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf";
  }
  if (originAssetId.includes(":btc")) {
    return process.env.BTC_REFUND_ADDRESS || "bc1qg52t5l20hfhmk7nkwe62s4xt3qr2fedwqmu6up";
  }
  if (originAssetId.includes(":tron")) {
    return process.env.TRON_REFUND_ADDRESS || "TSsMeYZRBVp2oSocHbbZJJPSWLFKaAy28j";
  }
  if (originAssetId.includes(":ltc")) {
    return process.env.LTC_REFUND_ADDRESS || "LdmUa92dDxtp84nwJQgdjmayJqE1ESKza4";
  }

  return fallbackEvmAddress && /^0x[a-fA-F0-9]{40}$/.test(fallbackEvmAddress)
    ? fallbackEvmAddress
    : (process.env.EVM_REFUND_ADDRESS || "0xb856b24fb054135deba5e0309edd31ed6a8afbe2");
}
