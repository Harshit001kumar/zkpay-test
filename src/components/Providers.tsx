"use client";
import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { base } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { http } from "wagmi";
import { CONTRACTS } from "@/lib/constants";

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={({
        appearance: {
          theme: "dark",
          accentColor: "#c0c6de",
          logo: undefined,
          termsAndConditionsUrl: "/terms",
          privacyPolicyUrl: "/privacy",
        },
        legal: {
          termsAndConditionsUrl: "/terms",
          privacyPolicyUrl: "/privacy",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets"
        },
        smartWallets: {
          createOnLogin: "all-users",
        },
        defaultChain: base,
        supportedChains: [base],
        loginMethods: ["wallet", "email"],
      }) as any}
    >
      <SmartWalletsProvider
        config={{
          paymasterContext: {
            token: CONTRACTS.USDC,
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
