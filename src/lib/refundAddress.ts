// Helper to validate and resolve a refund address for the origin blockchain
export function isValidAddressForOriginAsset(
  originAssetId: string,
  address?: string | null
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (originAssetId.includes(":sol")) {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
  } else if (originAssetId.includes(":tron")) {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  } else if (originAssetId.includes(":btc")) {
    return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test(trimmed);
  } else if (originAssetId.includes(":ltc")) {
    return /^(L[a-km-zA-HJ-NP-Z1-9]{26,33}|M[a-km-zA-HJ-NP-Z1-9]{26,33}|ltc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,59})$/i.test(trimmed);
  } else {
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  }
}

export function resolveRefundAddress(
  originAssetId: string,
  userRefundTo?: string | null,
  fallbackEvmAddress?: string | null,
  options?: { isDryRun?: boolean }
): string {
  const isDryRun = options?.isDryRun ?? false;

  // 1. If valid user-provided refund address exists, use it
  if (userRefundTo && isValidAddressForOriginAsset(originAssetId, userRefundTo)) {
    return userRefundTo.trim();
  }

  // 2. If it's an EVM chain and fallbackEvmAddress is a valid EVM address, use it
  const isNonEvm =
    originAssetId.includes(":sol") ||
    originAssetId.includes(":tron") ||
    originAssetId.includes(":btc") ||
    originAssetId.includes(":ltc");

  if (!isNonEvm && fallbackEvmAddress && /^0x[a-fA-F0-9]{40}$/.test(fallbackEvmAddress.trim())) {
    return fallbackEvmAddress.trim().toLowerCase();
  }

  // 3. For wet swaps (real money execution), NEVER redirect user funds to developer/treasury addresses
  if (!isDryRun) {
    if (isNonEvm) {
      let chain = "non-EVM";
      if (originAssetId.includes(":sol")) chain = "Solana";
      else if (originAssetId.includes(":btc")) chain = "Bitcoin";
      else if (originAssetId.includes(":tron")) chain = "Tron";
      else if (originAssetId.includes(":ltc")) chain = "Litecoin";

      const err: any = new Error(
        `A valid ${chain} refund address is required for this deposit to safeguard your funds in case of execution failure.`
      );
      err.code = "MISSING_REFUND_ADDRESS";
      err.statusCode = 400;
      throw err;
    } else {
      const err: any = new Error("A valid refund address is required for EVM deposits.");
      err.code = "MISSING_REFUND_ADDRESS";
      err.statusCode = 400;
      throw err;
    }
  }

  // 4. For dry-run simulation / estimate ONLY, fallback addresses are permitted
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

  return (
    (fallbackEvmAddress && /^0x[a-fA-F0-9]{40}$/.test(fallbackEvmAddress) && fallbackEvmAddress) ||
    process.env.EVM_REFUND_ADDRESS ||
    "0xb856b24fb054135deba5e0309edd31ed6a8afbe2"
  );
}
