"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { saveTransaction } from "@/lib/history";

type CashoutStatus = "input" | "processing" | "error";

export default function CashoutFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const [amountStr, setAmountStr] = useState("");
  const [upiId, setUpiId] = useState("");
  const [status, setStatus] = useState<CashoutStatus>("input");
  const [error, setError] = useState<string | null>(null);

  const amount = parseFloat(amountStr) || 0;
  const fee = amount * 0.01;
  const total = amount + fee;

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-gray-500">Connect wallet to cash out.</div>;
  }

  const handleCashout = async () => {
    if (amount <= 0 || !upiId.trim()) return;

    try {
      setStatus("processing");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const principalFloat = amount * 0.012;
      const feeFloat = fee * 0.012;
      const principalUsdc = parseUnits(principalFloat.toFixed(6), 6);
      const feeUsdc = parseUnits(feeFloat.toFixed(6), 6);

      // 1. Transfer principal USDC to integrator contract for offramp
      const transferPrincipal = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [CONTRACTS.INTEGRATOR as `0x${string}`, principalUsdc],
      });

      const tx = await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: transferPrincipal,
        }],
      });

      // 2. Transfer fee to Treasury
      if (feeUsdc > 0n) {
        const transferFee = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [(CONTRACTS as any).TREASURY as `0x${string}`, feeUsdc],
        });
        await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: wallet.address,
            to: CONTRACTS.USDC,
            data: transferFee,
          }],
        });
      }

      const txHash = tx as string;

      // Save transaction to local history
      saveTransaction({
        hash: txHash,
        type: "cashout",
        title: `Cash Out to ${upiId}`,
        amountINR: amount,
        amountUSDC: total * 0.012, // approximate USDC equivalent
        fee: fee,
        recipient: upiId,
        network: "Base Sepolia",
        timestamp: Date.now(),
      });

      // Redirect to the UPI-style receipt page
      router.push(`/tx/${txHash}`);
    } catch (e: any) {
      console.error("Cashout failed", e);
      setError(e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-6">
      {status === "input" && (
        <div className="flex flex-col gap-5">
          <h3 className="text-lg font-bold text-center">Cash Out to UPI</h3>

          <div>
            <label className="label-caps mb-1 block">Amount (INR)</label>
            <div className="flex items-center border-b-2 border-black pb-1">
              <span className="text-2xl font-bold mr-1">₹</span>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="text-3xl font-bold bg-transparent outline-none w-full"
              />
            </div>
          </div>

          <div>
            <label className="label-caps mb-1 block">UPI ID</label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="yourname@upi"
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-black transition-colors"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>You receive</span>
              <span>₹ {amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Platform Fee (1%)</span>
              <span>₹ {fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 my-1"></div>
            <div className="flex justify-between font-bold text-lg">
              <span>Total Deducted</span>
              <span>₹ {total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleCashout}
            disabled={amount <= 0 || !upiId.trim()}
            className={`btn-primary w-full py-3 ${amount <= 0 || !upiId.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Cash Out
          </button>
        </div>
      )}

      {status === "processing" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Processing Cash Out...</p>
          <p className="text-xs text-gray-500">Please confirm in your wallet</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <p className="font-semibold text-red-600">Cash Out Failed</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button onClick={() => setStatus("input")} className="btn-secondary mt-2">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
