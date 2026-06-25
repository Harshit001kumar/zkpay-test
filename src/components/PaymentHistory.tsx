"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { PaymentHistory as HistoryWidget } from "@p2pdotme/widgets";
import { checkPaymentStatus } from "@/lib/p2pkit";

export default function PaymentHistory() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-gray-500">Connect wallet to view history.</div>;
  }

  const wallet = wallets[0];

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <HistoryWidget
        userAddress={wallet.address}
        onCheckStatus={checkPaymentStatus}
      />
    </div>
  );
}
