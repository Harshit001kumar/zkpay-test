"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Cashout } from "@p2pdotme/widgets";
import { placeCashout, deliverUpi, reconcile } from "@/lib/p2pkit";

export default function CashoutFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  const wallet = wallets[0];
  const signer = {
    address: wallet.address,
    sendTransaction: async (tx: any) => {
      console.log("Mock sending transaction", tx);
      return { hash: "0x123..." };
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <Cashout
        config={{
          defaultCurrency: "INR",
          allowedCurrencies: ["INR"],
          allowedMethods: ["UPI"],
        }}
        onPlaceCashout={(amount) => placeCashout(amount, signer)}
        onDeliverUpi={deliverUpi}
        onReconcile={reconcile}
      />
    </div>
  );
}
