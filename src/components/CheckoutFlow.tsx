"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { MerchantData } from "@/lib/types";
import { saveTransaction } from "@/lib/history";
import {
  getOfframpPrice,
  prepareOfframpOrder,
  getOrderStatus,
  sendPayoutAddress,
} from "@/lib/p2pkit";

interface CheckoutFlowProps {
  amount: number; // total INR amount
  merchantData: MerchantData;
}

type TxStatus = "idle" | "approving" | "matching" | "paying" | "completed" | "error";

export default function CheckoutFlow({ amount, merchantData }: CheckoutFlowProps) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  
  const [status, setStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [orderId, setOrderId] = useState<bigint | null>(null);

  const fee = amount * 0.01;
  const totalAmount = amount + fee;
  const targetUpi = merchantData.upiId || merchantData.raw || "Merchant";

  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const priceCfg = await getOfframpPrice("INR");
        if (isMounted && priceCfg?.sellPrice) {
          setSellPrice(priceCfg.sellPrice);
        }
      } catch (err: any) {
        console.error("[CheckoutFlow] Failed to fetch P2P price", err);
      }
    };
    
    fetchConfig();
    const interval = setInterval(fetchConfig, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [ready, authenticated, wallets]);

  if (!ready || !authenticated || !wallets.length) {
    return (
      <div className="text-center p-6 bg-white/5 rounded-xl border border-white/10">
        <p className="text-sm text-[#909097] mb-4">Please connect your wallet to confirm payment.</p>
        <button onClick={() => login()} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  const handlePay = async () => {
    if (!sellPrice) {
      setError("Waiting for live on-chain exchange rate...");
      return;
    }
    
    try {
      setStatus("approving");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();

      // Convert INR amount to USDC using real price
      // price is 6 decimals: fiatAmount = (usdcAmount * sellPrice) / 1e6
      const fiatPrincipal1e6 = BigInt(Math.floor(amount * 1_000_000));
      const usdcPrincipalBigInt = (fiatPrincipal1e6 * 1_000_000n) / sellPrice;
      
      const fiatFee1e6 = BigInt(Math.floor(fee * 1_000_000));
      const usdcFeeBigInt = (fiatFee1e6 * 1_000_000n) / sellPrice;

      // Validate against 100 USDC no-KYC tier
      const usdcFloat = Number(usdcPrincipalBigInt) / 1_000_000;
      if (usdcFloat > 100) {
        throw new Error("Amount exceeds maximum single transaction limit of 100 USDC (~₹8,500).");
      }

      const orderCall = await prepareOfframpOrder({
        userAddress: wallet.address as `0x${string}`,
        currency: "INR",
        usdcAmount: usdcPrincipalBigInt,
        sellPrice: sellPrice,
      });

      const calls = [];

      // 1. Send 1% platform fee to ZkPay Treasury
      if (usdcFeeBigInt > 0n) {
        calls.push({
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [CONTRACTS.TREASURY, usdcFeeBigInt],
          }),
        });
      }

      // 2. Approve P2P Diamond for principal USDC
      calls.push({
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.DIAMOND, usdcPrincipalBigInt],
        }),
      });

      // 3. Place offramp order
      calls.push({
        to: orderCall.to,
        data: orderCall.data,
      });

      let txHash = "";

      try {
        // Try batched call first (Smart Wallets / EIP-5792)
        const id = await provider.request({
          method: "wallet_sendCalls",
          params: [{
            version: "1.0",
            from: wallet.address,
            calls: calls,
          }],
        });

        const MAX_POLLS = 60;
        for (let i = 0; i < MAX_POLLS; i++) {
          const statusRes: any = await provider.request({
            method: "wallet_getCallsStatus",
            params: [id],
          });
          if (statusRes.status === "CONFIRMED" && statusRes.receipts && statusRes.receipts.length > 0) {
            txHash = statusRes.receipts[0].transactionHash || statusRes.receipts[0].blockHash; 
            break;
          }
          if (statusRes.status === "FAILED" || statusRes.status === "REJECTED") {
            throw new Error(`Transaction ${statusRes.status.toLowerCase()} by wallet`);
          }
          if (i === MAX_POLLS - 1) {
            throw new Error("Transaction confirmation timed out after 2 minutes");
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (batchErr: any) {
        const isUnsupported = 
          batchErr?.message?.toLowerCase().includes("method") ||
          batchErr?.message?.toLowerCase().includes("unsupported") ||
          batchErr?.message?.toLowerCase().includes("does not support") ||
          batchErr?.code === -32601;

        if (isUnsupported) {
          console.log("[CheckoutFlow] wallet_sendCalls not supported. Executing sequential transactions via EOA...");
          const { getPublicClient } = await import("@/lib/p2pkit");
          const publicClient = getPublicClient();

          for (let i = 0; i < calls.length; i++) {
            const call = calls[i];
            const hash = await provider.request({
              method: "eth_sendTransaction",
              params: [{
                from: wallet.address,
                to: call.to,
                data: call.data,
              }],
            });
            await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
            txHash = hash as string;
          }
        } else {
          throw batchErr;
        }
      }

      // Parse orderId from receipt
      const { getPublicClient } = await import("@/lib/p2pkit");
      const p2pPublicClient = getPublicClient();
      const receipt = await p2pPublicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

      const { toEventSelector } = await import("viem");
      const orderPlacedTopic0 = toEventSelector("OrderPlaced(uint256,address,uint256,bytes32,uint256,uint256,uint256)");
      
      let parsedOrderId: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.topics.length >= 2 && log.topics[0] === orderPlacedTopic0) {
          try {
            const topic = log.topics[1];
            if (!topic) continue;
            const possibleOrderId = BigInt(topic);
            if (possibleOrderId > 0n) {
              parsedOrderId = possibleOrderId;
              break;
            }
          } catch {}
        }
      }

      if (!parsedOrderId) {
        // Even if event extraction failed, save transaction
        saveTransaction({
          hash: txHash,
          type: "payment",
          title: `Paid to ${merchantData.name || targetUpi}`,
          amountINR: amount,
          amountUSDC: usdcFloat,
          fee: fee,
          recipient: targetUpi,
          network: "Base Mainnet",
          timestamp: Date.now(),
        });
        router.push(`/tx/${txHash}`);
        return;
      }

      setOrderId(parsedOrderId);
      setStatus("matching");

      // Poll until merchant accepts order (max 5 minutes)
      let acceptedOrder: any = null;
      const MAX_ACCEPT_POLLS = 100;
      for (let i = 0; i < MAX_ACCEPT_POLLS; i++) {
        const currentOrder = await getOrderStatus(parsedOrderId);
        if (currentOrder.status === "accepted") {
          acceptedOrder = currentOrder;
          break;
        }
        if (currentOrder.status === "completed") {
          break;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled by the network.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      // Deliver encrypted UPI to the matched merchant
      if (acceptedOrder && acceptedOrder.pubkey) {
        const { createWalletClient, custom } = await import("viem");
        const { base } = await import("viem/chains");
        const walletClient = createWalletClient({
          account: wallet.address as `0x${string}`,
          chain: base,
          transport: custom(provider),
        });

        await sendPayoutAddress(walletClient, {
          orderId: parsedOrderId,
          paymentAddress: targetUpi,
          merchantPublicKey: acceptedOrder.pubkey,
        });
      }

      // Save transaction to local history
      saveTransaction({
        hash: txHash,
        type: "payment",
        title: `Paid to ${merchantData.name || targetUpi}`,
        amountINR: amount,
        amountUSDC: usdcFloat,
        fee: fee,
        recipient: targetUpi,
        network: "Base Mainnet",
        timestamp: Date.now(),
      });

      setStatus("completed");
      router.push(`/tx/${txHash}`);
      
    } catch (e: any) {
      console.error("[CheckoutFlow] Payment error:", e);
      let errMsg = e?.message || "Transaction failed";
      try {
        const { parseP2PError } = await import("@/lib/p2pkit");
        const parsed = await parseP2PError(e);
        if (parsed.message) {
          errMsg = parsed.message;
        }
      } catch {}
      setError(errMsg);
      setStatus("error");
    }
  };

  return (
    <div className="w-full bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-[#e5e2e3]">
      {status === "idle" && (
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-5 flex flex-col gap-3 text-sm">
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>RECIPIENT UPI</span>
              <span className="text-[#e5e2e3] font-mono font-semibold">{targetUpi}</span>
            </div>
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>PAYMENT AMOUNT</span>
              <span className="text-[#e5e2e3] font-semibold">₹ {amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>ZKPAY CONVENIENCE FEE (1%)</span>
              <span className="text-[#e5e2e3]">₹ {fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/10 my-1"></div>
            <div className="flex justify-between font-bold text-lg text-[#e5e2e3]">
              <span className="font-label-caps text-xs tracking-[0.15em] text-[#c0c6de]">TOTAL PAYABLE</span>
              <span className="tracking-tight">₹ {totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <button 
            onClick={handlePay} 
            disabled={!sellPrice}
            className="w-full py-4 rounded-xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.25em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 disabled:opacity-40"
          >
            {sellPrice ? "CONFIRM & PAY NOW" : "FETCHING LIVE PRICE..."}
          </button>
        </div>
      )}

      {status === "approving" && (
        <div className="flex flex-col gap-4 items-center text-center py-8">
          <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="font-label-caps text-xs text-[#e5e2e3] tracking-[0.25em] font-bold mb-1">
              AUTHORIZING ON BASE
            </p>
            <p className="text-xs text-[#909097]">Please confirm the transaction in your wallet</p>
          </div>
        </div>
      )}

      {status === "matching" && (
        <div className="flex flex-col gap-4 items-center text-center py-8">
          <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="font-label-caps text-xs text-[#c0c6de] tracking-[0.25em] font-bold mb-1">
              MATCHING P2P LIQUIDITY
            </p>
            <p className="text-xs text-[#909097]">Connecting with verified liquidity provider...</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-4 items-center text-center py-6">
          <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl text-[#ffb4ab]">error</span>
          </div>
          <div>
            <p className="font-label-caps text-xs text-[#ffb4ab] tracking-[0.2em] font-bold mb-1">
              PAYMENT COULD NOT BE COMPLETED
            </p>
            <p className="text-xs text-[#909097] max-w-xs">{error}</p>
          </div>
          <button 
            onClick={() => setStatus("idle")} 
            className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-label-caps tracking-[0.2em] text-[#e5e2e3] uppercase transition-colors mt-2"
          >
            TRY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
