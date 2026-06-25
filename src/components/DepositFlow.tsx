"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { LiFiWidget, WidgetConfig } from "@lifi/widget";
import { useMemo } from "react";

export default function DepositFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  const widgetConfig: WidgetConfig = useMemo(() => {
    return {
      integrator: "zkpay-integrator",
      fee: 0.01, // 1% fee on swaps
      toChain: 84532, // Base Sepolia
      toToken: "0x...", // USDC on Base Sepolia
      appearance: "light",
      theme: {
        container: {
          border: "1px solid #e0e0e0",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
        },
        palette: {
          primary: { main: "#000000" },
          secondary: { main: "#ffffff" },
        },
        typography: {
          fontFamily: "'Hanken Grotesk', sans-serif",
        },
      },
    };
  }, []);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  return (
    <div className="w-full">
      <LiFiWidget integrator="zkpay-integrator" config={widgetConfig} />
    </div>
  );
}
