"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

export default function DepositFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  // Use the official Jumper (Li.Fi) embed to bypass heavy React dependency conflicts
  return (
    <div className="w-full h-[600px] border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
      <iframe 
        src="https://jumper.exchange/?integrator=zkpay-integrator&fromChain=1&toChain=84532"
        width="100%"
        height="100%"
        style={{ border: 'none' }}
        title="Deposit & Swap with Li.Fi"
      />
    </div>
  );
}
