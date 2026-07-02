"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia, base } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { http } from "wagmi";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [baseSepolia, base], // LI.FI needs mainnet chains for real routing, Base Sepolia for testnet
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || "mock-app-id"}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: undefined,
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, base],
        loginMethods: ["wallet", "email"],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
