"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits, stringToHex } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI, INTEGRATOR_ABI } from "@/lib/abi";
import { MerchantData } from "@/lib/types";
import { saveTransaction } from "@/lib/history";

interface CheckoutFlowProps {
  amount: number; // total INR amount including fee
  merchantData: MerchantData;
}

type TxStatus = "idle" | "approving" | "sending" | "error";

export default function CheckoutFlow({ amount, merchantData }: CheckoutFlowProps) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const [status, setStatus] = useState<TxStatus>("idle");
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

      const fee = amount * 0.01;
      const totalAmount = amount + fee;

      // Convert INR amount to USDC (6 decimals)
      // Hardcoded exchange rate for testnet: 1 INR = 0.012 USDC
      const usdcFloat = totalAmount * 0.012;
      const usdcAmount = parseUnits(usdcFloat.toFixed(6), 6);

      // Step 1: Approve USDC spend for the Integrator
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.INTEGRATOR as `0x${string}`, usdcAmount],
      });

      await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: approveData,
        }],
      });

      // Wait briefly for approval to confirm
      setStatus("sending");

      let payTx;
      if (merchantData.type === "upi") {
        // Step 2: Call Integrator contract to place order (P2PKit flow)
        const orderData = encodeFunctionData({
          abi: INTEGRATOR_ABI,
          functionName: 'userPlaceOrder',
          args: [
            usdcAmount,                      // amount
            stringToHex("INR", { size: 32 }),// currency
            BigInt(0),                       // circleId
            "",                              // pubKey
            wallet.address as `0x${string}`  // merchantClient (testnet dummy)
          ],
        });

        payTx = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: wallet.address,
            to: CONTRACTS.INTEGRATOR,
            data: orderData,
          }],
        });
      } else {
        // Fallback for raw ETH addresses (dummy transfer)
        const transferData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [merchantData.address as `0x${string}`, usdcAmount],
        });

        payTx = await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: wallet.address,
            to: CONTRACTS.USDC,
            data: transferData,
          }],
        });
      }

      const txHash = payTx as string;
      const fee2 = amount * 0.01;
      const totalAmount2 = amount + fee2;

      // Save transaction to local history
      saveTransaction({
        hash: txHash,
        type: "payment",
        title: merchantData.type === "upi"
          ? `Paid to ${merchantData.name || merchantData.upiId || "Merchant"}`
          : `Sent to ${merchantData.address?.slice(0, 10)}...`,
        amountINR: amount,
        amountUSDC: usdcFloat,
        fee: fee2,
        recipient: merchantData.type === "upi"
          ? (merchantData.upiId || merchantData.name || "Merchant")
          : (merchantData.address || "Unknown"),
        network: "Base Sepolia",
        timestamp: Date.now(),
      });

      // Redirect to the UPI-style receipt page
      router.push(`/tx/${txHash}`);
    } catch (e: any) {
      console.error("Payment failed", e);
      setError(e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  const fee = amount * 0.01;
  const totalAmount = amount + fee;

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-6">
      {status === "idle" && (
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="w-full bg-gray-50 rounded-lg p-4 flex flex-col gap-2 text-sm w-full">
            <div className="flex justify-between text-gray-600">
              <span>Payment to Merchant</span>
              <span>₹ {amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>ZkPay Convenience Fee (1%)</span>
              <span>₹ {fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 my-1"></div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total to Pay</span>
              <span>₹ {totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={handlePay} className="btn-primary w-full">
            Confirm &amp; Pay
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
