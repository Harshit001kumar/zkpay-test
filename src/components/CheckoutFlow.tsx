"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { MerchantData } from "@/lib/types";
import { saveTransaction } from "@/lib/history";
import { PAYMENT_ID_FIELDS } from "@p2pdotme/sdk/country";
import {
  getOfframpLimits,
  getOfframpPrice,
  prepareOfframpOrder,
  getOrderStatus,
  sendPayoutAddress,
  parseP2PError,
  getPublicClient,
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
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);

  const fee = amount * 0.01;
  const totalAmount = amount + fee;
  const targetUpi = merchantData.upiId || merchantData.raw || "Merchant";

  // Validate UPI using official SDK validator
  const isTargetUpiValid = () => {
    try {
      const fields = PAYMENT_ID_FIELDS["INR"];
      if (!fields || fields.length === 0) return targetUpi.includes("@");
      return fields[0].validate(targetUpi);
    } catch {
      return targetUpi.includes("@");
    }
  };

  const fetchRatesAndLimits = useCallback(async () => {
    if (!wallets.length) return;
    try {
      const userAddr = wallets[0].address as `0x${string}`;
      const publicClient = getPublicClient();

      const [priceCfg, limits, balance] = await Promise.all([
        getOfframpPrice("INR"),
        getOfframpLimits(userAddr, "INR").catch(() => ({ sellLimit: 100n })),
        publicClient.readContract({
          address: CONTRACTS.USDC,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [userAddr],
        }).catch(() => null),
      ]);

      if (priceCfg?.sellPrice) {
        setSellPrice(priceCfg.sellPrice);
      }
      if (limits?.sellLimit) {
        setMaxSellable(Number(limits.sellLimit));
      }
      if (balance !== null) {
        setUsdcBalance(balance as bigint);
      }
    } catch (err: any) {
      console.error("[CheckoutFlow] Failed to fetch live P2P price / limits", err);
    }
  }, [wallets]);

  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    
    fetchRatesAndLimits();
    // Refresh price every 60s to prevent slippage reverts (per quickstart guide)
    const interval = setInterval(fetchRatesAndLimits, 60000);
    return () => clearInterval(interval);
  }, [ready, authenticated, wallets, fetchRatesAndLimits]);

  // Resume pending order if user refreshed during matching
  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    const pendingStr = localStorage.getItem("pending_payment_order");
    if (pendingStr) {
      try {
        const pending = JSON.parse(pendingStr);
        if (pending.orderId && pending.targetUpi) {
          setOrderId(BigInt(pending.orderId));
          setStatus("matching");
          resumeOrder(BigInt(pending.orderId), pending.targetUpi, pending.hash, pending);
        }
      } catch {
        localStorage.removeItem("pending_payment_order");
      }
    }
  }, [ready, authenticated, wallets]);

  const resumeOrder = async (pOrderId: bigint, upi: string, txHash: string, pending: any) => {
    try {
      let acceptedOrder: any = null;
      const MAX_ACCEPT_POLLS = 100;
      for (let i = 0; i < MAX_ACCEPT_POLLS; i++) {
        const currentOrder = await getOrderStatus(pOrderId);
        if (currentOrder.status === "accepted") {
          acceptedOrder = currentOrder;
          break;
        }
        if (currentOrder.status === "completed") {
          localStorage.removeItem("pending_payment_order");
          setStatus("completed");
          router.push(`/tx/${txHash}`);
          return;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled by the network.");
        }
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (acceptedOrder && acceptedOrder.pubkey) {
        setStatus("paying");
        const wallet = wallets[0];
        const provider = await wallet.getEthereumProvider();
        const { createWalletClient, custom } = await import("viem");
        const { base } = await import("viem/chains");
        const walletClient = createWalletClient({
          account: wallet.address as `0x${string}`,
          chain: base,
          transport: custom(provider),
        });

        await sendPayoutAddress(walletClient, {
          orderId: pOrderId,
          paymentAddress: upi,
          merchantPublicKey: acceptedOrder.pubkey,
        });

        // Wait for final completion
        const MAX_PAY_POLLS = 100;
        for (let j = 0; j < MAX_PAY_POLLS; j++) {
          const currentOrder = await getOrderStatus(pOrderId);
          if (currentOrder.status === "completed") {
            break;
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      localStorage.removeItem("pending_payment_order");
      setStatus("completed");
      router.push(`/tx/${txHash}`);
    } catch (e: any) {
      console.error("[CheckoutFlow] Resume error:", e);
      const parsed = await parseP2PError(e);
      setError(parsed.message);
      setStatus("error");
    }
  };

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

    if (!isTargetUpiValid()) {
      setError(`Invalid UPI ID format: "${targetUpi}". Please check the recipient UPI ID.`);
      return;
    }
    
    try {
      setStatus("approving");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      const publicClient = getPublicClient();

      // Convert INR amount to USDC using real price
      // price is 6 decimals: fiatAmount = (usdcAmount * sellPrice) / 1e6
      const fiatPrincipal1e6 = BigInt(Math.floor(amount * 1_000_000));
      const usdcPrincipalBigInt = (fiatPrincipal1e6 * 1_000_000n) / sellPrice;
      
      const fiatFee1e6 = BigInt(Math.floor(fee * 1_000_000));
      const usdcFeeBigInt = (fiatFee1e6 * 1_000_000n) / sellPrice;
      const totalRequiredUsdc = usdcPrincipalBigInt + usdcFeeBigInt;

      // Check on-chain balance before initiating any transactions
      const onChainBalance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet.address as `0x${string}`],
      })) as bigint;

      if (onChainBalance < totalRequiredUsdc) {
        const balFloat = Number(onChainBalance) / 1_000_000;
        const reqFloat = Number(totalRequiredUsdc) / 1_000_000;
        throw new Error(
          `Insufficient USDC balance on Base. You have $${balFloat.toFixed(2)} USDC, but this payment requires $${reqFloat.toFixed(2)} USDC ($${(Number(usdcPrincipalBigInt) / 1e6).toFixed(2)} payment + $${(Number(usdcFeeBigInt) / 1e6).toFixed(2)} fee).`
        );
      }

      // Validate against dynamic runtime limit (or 100 USDC baseline)
      const usdcFloat = Number(usdcPrincipalBigInt) / 1_000_000;
      const effectiveLimit = maxSellable || 100;
      if (usdcFloat > effectiveLimit) {
        throw new Error(
          `Amount (${usdcFloat.toFixed(2)} USDC) exceeds maximum single transaction limit of ${effectiveLimit} USDC.`
        );
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

      // 2. Check allowance; only add approve if current allowance < required
      const currentAllowance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [wallet.address as `0x${string}`, CONTRACTS.DIAMOND],
      })) as bigint;

      if (currentAllowance < usdcPrincipalBigInt) {
        calls.push({
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CONTRACTS.DIAMOND, usdcPrincipalBigInt],
          }),
        });
      }

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
          const pClient = getPublicClient();

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
            await pClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
            txHash = hash as string;
          }
        } else {
          throw batchErr;
        }
      }

      // Parse orderId from receipt
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

      // Save transaction to local history immediately
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

      if (!parsedOrderId) {
        router.push(`/tx/${txHash}`);
        return;
      }

      setOrderId(parsedOrderId);
      setStatus("matching");

      // Persist pending order to localStorage for durability across reloads
      localStorage.setItem("pending_payment_order", JSON.stringify({
        orderId: parsedOrderId.toString(),
        targetUpi,
        hash: txHash,
        amountINR: amount,
        amountUSDC: usdcFloat,
      }));

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
        setStatus("paying");
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

        // Wait for final merchant fiat payment settlement
        const MAX_PAY_POLLS = 100;
        for (let j = 0; j < MAX_PAY_POLLS; j++) {
          const currentOrder = await getOrderStatus(parsedOrderId);
          if (currentOrder.status === "completed") {
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      localStorage.removeItem("pending_payment_order");
      setStatus("completed");
      router.push(`/tx/${txHash}`);
      
    } catch (e: any) {
      console.error("[CheckoutFlow] Payment error:", e);
      const parsed = await parseP2PError(e);
      setError(parsed.message);
      setStatus("error");
      // If price moved (slippage exceeded), immediately refresh price
      if (parsed.code === "SLIPPAGE_EXCEEDED") {
        fetchRatesAndLimits();
      }
    }
  };

  return (
    <div className="w-full bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-[#e5e2e3]">
      {status === "idle" && (
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-5 flex flex-col gap-3 text-sm">
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>RECIPIENT UPI</span>
              <span className="text-[#e5e2e3] font-mono font-semibold truncate max-w-[200px]">{targetUpi}</span>
            </div>
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>PAYMENT AMOUNT</span>
              <span className="text-[#e5e2e3] font-semibold">₹ {amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
              <span>ZKPAY CONVENIENCE FEE (1%)</span>
              <span className="text-[#e5e2e3]">₹ {fee.toFixed(2)}</span>
            </div>
            {sellPrice && (
              <div className="flex justify-between text-[#909097] text-xs font-label-caps tracking-[0.1em]">
                <span>ON-CHAIN RATE</span>
                <span className="text-[#c0c6de]">1 USDC ≈ ₹{(Number(sellPrice) / 1e6).toFixed(2)}</span>
              </div>
            )}
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
            <p className="text-xs text-[#909097]">Matching order with verified merchant on Base...</p>
          </div>
        </div>
      )}

      {status === "paying" && (
        <div className="flex flex-col gap-4 items-center text-center py-8">
          <div className="w-10 h-10 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="font-label-caps text-xs text-[#c0c6de] tracking-[0.25em] font-bold mb-1">
              DELIVERING ENCRYPTED UPI
            </p>
            <p className="text-xs text-[#909097]">Merchant accepted. Delivering payout info via ECIES encryption...</p>
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
