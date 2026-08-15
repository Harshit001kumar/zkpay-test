import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { webpack, isServer }) => {
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
      "@bigmi/react": false,
      "fs": false,
      "buffer": require.resolve("buffer/"),
      "stream": false,
    };

    // Only polyfill process on the client — server needs real process.env for runtime env vars
    if (!isServer) {
      config.resolve.fallback["process"] = false;
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      // Fix the strict ESM export errors without breaking runtime cryptography
      // by aliasing the explicit `.js` imports to their extensionless equivalents
      "@noble/hashes/hmac.js": "@noble/hashes/hmac",
      "@noble/hashes/sha2.js": "@noble/hashes/sha2",
      "@noble/hashes/sha256.js": "@noble/hashes/sha256",
      "@noble/hashes/utils.js": "@noble/hashes/utils",
      "@noble/hashes/blake2b.js": "@noble/hashes/blake2b",
      "@noble/hashes/pbkdf2.js": "@noble/hashes/pbkdf2"
    };

    const plugins = [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        ...(isServer ? {} : { process: 'process/browser' }),
      }),
      new webpack.DefinePlugin({
        global: "globalThis",
      })
    ];
    config.plugins.push(...plugins);
    
    return config;
  }
};
export default nextConfig;
