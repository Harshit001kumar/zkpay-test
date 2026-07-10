/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "accounts": false,
      "porto": false,
      "porto/internal": false,
      "@metamask/connect-evm": false,
      "@farcaster/miniapp-sdk": false,
      "@farcaster/mini-app-solana": false,
      "@stripe/crypto": false,
      "@stripe/stripe-js": false,
      "@bigmi/react": false
    };

    config.resolve.alias = {
      ...config.resolve.alias,
      // Alias ONLY the problematic deep hash imports to bypass the ESM build errors.
      // This ensures the real Sui/Solana base classes exist at runtime so the LI.FI SDK
      // can extend them without throwing "Class extends value undefined".
      "@noble/hashes/hmac": false,
      "@noble/hashes/sha2": false,
      "@noble/hashes/sha256": false,
      "@noble/hashes/utils": false,
      "@noble/hashes/blake2b": false,
      "@noble/hashes/pbkdf2": false
    };
    
    return config;
  }
};
export default nextConfig;
