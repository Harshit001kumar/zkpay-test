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
