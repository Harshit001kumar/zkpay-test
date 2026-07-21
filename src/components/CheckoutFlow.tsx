"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { MerchantData } from "@/lib/types";
import { saveTransaction } from "@/lib/history";
import { getOfframpPrice, preparePayOrder } from "@/lib/p2pkit";

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
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    
    let isMounted = true;
    
    const fetchConfig = async () => {
      try {
        const priceCfg = await getOfframpPrice("INR");
        if (isMounted) {
          setSellPrice(priceCfg.sellPrice);
        }
      } catch (err: any) {
        console.error("Failed to fetch P2P price", err);
      }
    };
    
    fetchConfig();
    return () => { isMounted = false; };
  }, [ready, authenticated, wallets]);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-gray-500">Please connect wallet to continue.</div>;
  }

  const fee = amount * 0.01;
  const totalAmount = amount + fee;

  const handlePay = async () => {
    if (!sellPrice) {
      setError("Waiting for price feed...");
      return;
    }
    
    try {
      setStatus("approving");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();

      // Convert INR amount to USDC using real price
      // price is 6 decimals. fiatAmount = (usdcAmount * sellPrice) / 1e6
      // usdcAmount = (fiatAmount * 1e6) / sellPrice
      
      const principalFloat = amount;
      const feeFloat = fee;
      
      // We need to pass usdcAmount. Since it's rough, we'll do:
      const fiatPrincipal1e6 = BigInt(Math.floor(principalFloat * 1_000_000));
      const usdcPrincipalBigInt = (fiatPrincipal1e6 * 1_000_000n) / sellPrice;
      
      const fiatFee1e6 = BigInt(Math.floor(feeFloat * 1_000_000));
      const usdcFeeBigInt = (fiatFee1e6 * 1_000_000n) / sellPrice;

      const calls = [];

      // 1. Send fee to ZkPay Treasury
      if (usdcFeeBigInt > 0n) {
        calls.push({
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [(CONTRACTS as any).TREASURY as `0x${string}`, usdcFeeBigInt],
          })
        });
      }

      // 2. Approve P2P Diamond for principal
      calls.push({
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.DIAMOND as `0x${string}`, usdcPrincipalBigInt],
        })
      });

      // 3. Prepare PAY order via P2PKit
      // For now, if no merchant address is provided, fallback to zeroAddress
      const recipient = (merchantData.address || "0x0000000000000000000000000000000000000000") as `0x${string}`;
      
      const orderCall = await preparePayOrder({
        userAddress: wallet.address as `0x${string}`,
        currency: "INR",
        usdcAmount: usdcPrincipalBigInt,
        sellPrice: sellPrice,
        recipientAddr: recipient,
      });

      calls.push({
        to: orderCall.to,
        data: orderCall.data
      });

      setStatus("sending");

      // Send the batched transaction using EIP-5792
      const id = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "1.0",
          from: wallet.address,
          calls: calls
        }]
      });

      // Poll for batch status
      let txHash = "";
      while (true) {
        const statusRes: any = await provider.request({
          method: "wallet_getCallsStatus",
          params: [id]
        });
        if (statusRes.status === "CONFIRMED" && statusRes.receipts && statusRes.receipts.length > 0) {
          txHash = statusRes.receipts[0].transactionHash || statusRes.receipts[0].blockHash; 
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      const usdcFloat = Number(usdcPrincipalBigInt) / 1_000_000;
      
      // Save transaction to local history
      saveTransaction({
        hash: txHash,
        type: "payment",
        title: `Paid to ${merchantData.name || merchantData.upiId || "Merchant"}`,
        amountINR: amount,
        amountUSDC: usdcFloat,
        fee: fee,
        recipient: merchantData.upiId || merchantData.name || "Merchant",
        network: "Base Mainnet",
        timestamp: Date.now(),
      });

      // Redirect to receipt
      router.push(`/tx/${txHash}`);
      
    } catch (e: any) {
      console.error("Payment failed", e);
      setError(e?.message || "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-6">
      {status === "idle" && (
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="w-full bg-gray-50 rounded-lg p-4 flex flex-col gap-2 text-sm">
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
          <button 
            onClick={handlePay} 
            disabled={!sellPrice}
            className={`btn-primary w-full ${!sellPrice ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {sellPrice ? "Confirm & Pay" : "Loading Price..."}
          </button>
        </div>
      )}

      {status === "approving" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Preparing Transaction...</p>
          <p className="text-xs text-gray-500">Please confirm in your wallet</p>
        </div>
      )}

      {status === "sending" && (
        <div className="flex flex-col gap-3 items-center text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Sending Payment...</p>
          <p className="text-xs text-gray-500">Processing transaction on Base Mainnet</p>
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
