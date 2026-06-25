"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { createPublicClient, http, encodeFunctionData, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI, INTEGRATOR_ABI } from "@/lib/abi";

interface CheckoutFlowProps {
  amount: number; // total INR amount including fee
  merchantId: string;
}

type TxStatus = "idle" | "approving" | "sending" | "confirmed" | "error";

export default function CheckoutFlow({ amount, merchantId }: CheckoutFlowProps) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-gray-500">Please connect wallet to continue.</div>;
  }

  const handlePay = async () => {
    try {
      setStatus("approving");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();

      // Convert INR amount to USDC (6 decimals)
      // For testnet demo, we treat 1 INR ≈ 1 USDC-unit for simplicity
      const usdcAmount = parseUnits(amount.toFixed(2), 6);

      // Step 1: Approve USDC spend
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.INTEGRATOR as `0x${string}`, usdcAmount],
      });

      const approveTx = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: approveData,
        }],
      });

      // Wait briefly for approval to confirm
      setStatus("sending");

      // Step 2: Call integrator contract to place order
      // For now, we do a simple USDC transfer to the merchant
      // In production, this calls userPlaceOrder on the integrator
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [merchantId as `0x${string}`, usdcAmount],
      });

      const payTx = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: transferData,
        }],
      });

      setTxHash(payTx as string);
      setStatus("confirmed");
    } catch (e: any) {
      console.error("Payment failed", e);
      setError(e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-6">
      {status === "idle" && (
        <div className="flex flex-col gap-4 items-center">
          <p className="text-sm text-gray-500">Ready to send <strong>₹{amount.toFixed(2)}</strong></p>
          <button onClick={handlePay} className="btn-primary w-full">
            Confirm & Pay
          </button>
        </div>
      )}

      {status === "approving" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Approving USDC...</p>
          <p className="text-xs text-gray-500">Please confirm in your wallet</p>
        </div>
      )}

      {status === "sending" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Sending Payment...</p>
          <p className="text-xs text-gray-500">Processing transaction on Base Sepolia</p>
        </div>
      )}

      {status === "confirmed" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <p className="font-bold text-lg">Payment Sent!</p>
          {txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline text-gray-500 break-all"
            >
              View on BaseScan →
            </a>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <p className="font-semibold text-red-600">Payment Failed</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button onClick={() => setStatus("idle")} className="btn-secondary mt-2">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
