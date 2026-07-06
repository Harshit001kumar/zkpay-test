/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@solana/wallet-adapter-react": false,
      "@solana/wallet-adapter-base": false,
      "@mysten/dapp-kit": false,
      "@mysten/sui": false,
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
    
    // Force Webpack to return an empty module for these instead of trying to compile them
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mysten/sui": false,
      "@mysten/dapp-kit": false,
      "@solana/wallet-adapter-base": false,
      "@solana/wallet-adapter-react": false
    };
    
    return config;
  }
};
export default nextConfig;
