import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    minimumCacheTTL: 86400,
  },
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://*.privy.io https://challenges.cloudflare.com; frame-src 'self' https://auth.privy.io https://*.privy.io https://challenges.cloudflare.com https://verify.walletconnect.com https://verify.walletconnect.org; connect-src 'self' https: wss:;",
          },
        ],
      },
      {
        source: "/docs",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/privacy",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/terms",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  webpack: (config, { webpack, isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "accounts": false,
      "ox": false,
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
      // Map extensionless noble subpath imports in @noble/curves to explicit .js export targets
      "@noble/hashes/utils$": "@noble/hashes/utils.js",
      "@noble/hashes/hmac$": "@noble/hashes/hmac.js",
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
