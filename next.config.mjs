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
      "viem/tempo/zones": false,
      "viem/tempo": false,
      "@wagmi/core/tempo": false,
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
      "viem/tempo/zones": false,
      "viem/tempo": false,
      // Route extensionless noble subpath imports to their explicit `.js` export targets
      // Modern @noble/hashes and @noble/curves packages only export `.js` paths in package.json
      "@noble/hashes/hmac$": "@noble/hashes/hmac.js",
      "@noble/hashes/sha2$": "@noble/hashes/sha2.js",
      "@noble/hashes/sha256$": "@noble/hashes/sha256.js",
      "@noble/hashes/sha512$": "@noble/hashes/sha512.js",
      "@noble/hashes/sha3$": "@noble/hashes/sha3.js",
      "@noble/hashes/utils$": "@noble/hashes/utils.js",
      "@noble/hashes/blake2b$": "@noble/hashes/blake2b.js",
      "@noble/hashes/pbkdf2$": "@noble/hashes/pbkdf2.js",
      "@noble/hashes/ripemd160$": "@noble/hashes/ripemd160.js",
      "@noble/hashes/crypto$": "@noble/hashes/crypto.js",
      "@noble/curves/abstract/weierstrass$": "@noble/curves/abstract/weierstrass.js",
      "@noble/curves/abstract/montgomery$": "@noble/curves/abstract/montgomery.js",
      "@noble/curves/abstract/edwards$": "@noble/curves/abstract/edwards.js",
      "@noble/curves/abstract/modular$": "@noble/curves/abstract/modular.js",
      "@noble/curves/abstract/curve$": "@noble/curves/abstract/curve.js",
      "@noble/curves/abstract/hash-to-curve$": "@noble/curves/abstract/hash-to-curve.js",
      "@noble/curves/secp256k1$": "@noble/curves/secp256k1.js",
      "@noble/curves/ed25519$": "@noble/curves/ed25519.js",
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
    
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /ox/ },
      { message: /Critical dependency: the request of a dependency is an expression/ },
    ];

    return config;
  }
};
export default nextConfig;
