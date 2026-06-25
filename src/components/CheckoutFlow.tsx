"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Checkout } from "@p2pdotme/widgets/checkout";
import "@p2pdotme/widgets/checkout/styles.css";
import { placeOrder } from "@/lib/p2pkit";

export default function CheckoutFlow({ 
  amount, 
  merchantId 
}: { 
  amount: number, 
  merchantId: string 
}) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4">Please connect wallet to continue.</div>;
  }

  const wallet = wallets[0];
  const signer = {
    address: wallet.address,
    sendTransaction: async (tx: any) => {
      // Mock implementation since viem signer requires deeper setup in this demo
      console.log("Mock sending transaction", tx);
      return { hash: "0x123..." };
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <Checkout
        config={{
          defaultCurrency: "INR",
          allowedCurrencies: ["INR"],
          defaultAmount: amount,
          recipient: merchantId,
        }}
        onPlaceOrder={(ctx) => placeOrder(ctx, signer)}
      />
    </div>
  );
}
