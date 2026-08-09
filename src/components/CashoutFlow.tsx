"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { saveTransaction } from "@/lib/history";
import { PAYMENT_ID_FIELDS } from "@p2pdotme/sdk/country";
import { 
  getOfframpLimits, 
  getOfframpPrice, 
  prepareOfframpOrder, 
  sendPayoutAddress, 
  getOrderStatus,
  parseP2PError
} from "@/lib/p2pkit";

type CashoutStatus = "input" | "processing" | "matching" | "paying" | "completed" | "error";

export default function CashoutFlow() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  
  const [amountStr, setAmountStr] = useState("");
  const [upiId, setUpiId] = useState("");
  const [status, setStatus] = useState<CashoutStatus>("input");
  const [error, setError] = useState<string | null>(null);
  
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Fetch limits and price on mount
  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    
    let isMounted = true;
    
    const fetchConfig = async () => {
      try {
        const address = wallets[0].address as `0x${string}`;
        const [limits, priceCfg] = await Promise.all([
          getOfframpLimits(address, "INR"),
          getOfframpPrice("INR")
        ]);
        
        if (isMounted) {
          // limits.sellLimit is already in normalized USDC (e.g. 100)
          setMaxSellable(Number(limits.sellLimit));
          setSellPrice(priceCfg.sellPrice);
          setInitError(null);
        }
      } catch (err: any) {
        console.error("Failed to fetch P2P limits/price", err);
        if (isMounted) {
          setInitError(err?.message || String(err) || "Failed to load protocol limits");
        }
      }
    };
    
    fetchConfig();
    
    // Refresh price every 60 seconds
    const interval = setInterval(async () => {
      try {
        const priceCfg = await getOfframpPrice("INR");
        if (isMounted) setSellPrice(priceCfg.sellPrice);
      } catch (err) {}
    }, 60000);
    
    return () => { 
      isMounted = false;
      clearInterval(interval);
    };
  }, [ready, authenticated, wallets]);

  // Check for pending order on mount
  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) return;
    const pendingOrderStr = localStorage.getItem("pending_cashout_order");
    if (pendingOrderStr) {
      try {
        const pending = JSON.parse(pendingOrderStr);
        if (pending.orderId && pending.upiId) {
          setUpiId(pending.upiId);
          setStatus("matching");
          resumePendingOrder(BigInt(pending.orderId), pending.upiId, pending.hash, pending);
        }
      } catch (e) {
        localStorage.removeItem("pending_cashout_order");
      }
    }
  }, [ready, authenticated, wallets]);

  const resumePendingOrder = async (orderId: bigint, savedUpiId: string, hash: string, pending: any) => {
    try {
      // 1. Wait for merchant to accept (max 10 minutes = 200 polls × 3s)
      let acceptedOrder: any = null;
      const MAX_ACCEPT_POLLS = 200;
      for (let i = 0; i < MAX_ACCEPT_POLLS; i++) {
        const currentOrder = await getOrderStatus(orderId);
        if (currentOrder.status === "accepted") {
          acceptedOrder = currentOrder;
          break;
        }
        if (currentOrder.status === "completed") {
          localStorage.removeItem("pending_cashout_order");
          setStatus("completed");
          router.push(`/tx/${hash}`);
          return;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled by the protocol.");
        }
        if (i === MAX_ACCEPT_POLLS - 1) {
          throw new Error("Merchant matching timed out after 10 minutes. Please try again.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      // 2. Deliver encrypted UPI
      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      
      const { createWalletClient, custom } = await import("viem");
      const { base } = await import("viem/chains");
      const walletClient = createWalletClient({
        account: wallet.address as `0x${string}`,
        chain: base,
        transport: custom(provider)
      });
      
      await sendPayoutAddress(walletClient, {
        orderId,
        paymentAddress: savedUpiId,
        merchantPublicKey: acceptedOrder.pubkey,
      });

      // 3. Wait for merchant to pay (max 15 minutes = 300 polls × 3s)
      setStatus("paying");
      const MAX_PAY_POLLS = 300;
      for (let j = 0; j < MAX_PAY_POLLS; j++) {
        const currentOrder = await getOrderStatus(orderId);
        if (currentOrder.status === "completed") {
          localStorage.removeItem("pending_cashout_order");
          
          saveTransaction({
            hash: hash,
            type: "cashout",
            title: `Cash Out to ${savedUpiId}`,
            amountINR: pending.estimatedFiat || 0,
            amountUSDC: pending.totalUsdc || 0,
            fee: pending.feeUsdc || 0,
            recipient: savedUpiId,
            network: "Base",
            timestamp: pending.timestamp || Date.now(),
          });
          
          setStatus("completed");
          router.push(`/tx/${hash}`);
          return;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled.");
        }
        if (j === MAX_PAY_POLLS - 1) {
          throw new Error("Merchant payment timed out after 15 minutes. Please contact support.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e: any) {
      console.error("Resume failed", e);
      localStorage.removeItem("pending_cashout_order");
      setError(e.message || "Failed to resume order.");
      setStatus("error");
    }
  };

  const amountUsdc = parseFloat(amountStr) || 0;
  const feeUsdc = amountUsdc * 0.01;
  const totalUsdc = amountUsdc + feeUsdc;
  
  // Calculate estimated fiat based on current price
  let estimatedFiat = 0;
  if (amountUsdc > 0 && sellPrice) {
    const usdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
    const fiatBigInt = (usdcBigInt * sellPrice) / 1000000n;
    estimatedFiat = Number(formatUnits(fiatBigInt, 6));
  }

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-gray-500">Connect wallet to cash out.</div>;
  }
  
  // Validate UPI
  const isValidUpi = () => {
    try {
      const fields = PAYMENT_ID_FIELDS["INR"];
      if (!fields || fields.length === 0) return true; // fallback
      return fields[0].validate(upiId);
    } catch (e) {
      return false;
    }
  };

  const isFormValid = amountUsdc > 0 && isValidUpi() && maxSellable !== null && amountUsdc <= maxSellable;

  const handleCashout = async () => {
    if (!isFormValid || !sellPrice) return;

    try {
      setStatus("processing");
      setError(null);

      const wallet = wallets[0];
      const provider = await wallet.getEthereumProvider();
      
      const principalUsdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
      const feeUsdcBigInt = parseUnits(feeUsdc.toFixed(6), 6);
      
      // Prepare P2P Order Calldata (no I/O sent yet)
      const orderCall = await prepareOfframpOrder({
        userAddress: wallet.address as `0x${string}`,
        currency: "INR",
        usdcAmount: principalUsdcBigInt,
        sellPrice: sellPrice,
      });

      const calls = [];

      // 1. Fee transfer to ZkPay Treasury
      if (feeUsdcBigInt > 0n) {
        calls.push({
          to: CONTRACTS.USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [(CONTRACTS as any).TREASURY as `0x${string}`, feeUsdcBigInt],
          })
        });
      }

      // 2. Approve P2P Diamond for the principal amount
      calls.push({
        to: CONTRACTS.USDC,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.DIAMOND as `0x${string}`, principalUsdcBigInt],
        })
      });

      // 3. Place the SELL order
      calls.push({
        to: orderCall.to,
        data: orderCall.data
      });

      // Send the batched transaction using EIP-5792
      const id = await provider.request({
        method: "wallet_sendCalls",
        params: [{
          version: "1.0",
          from: wallet.address,
          calls: calls
        }]
      });

      // Poll for batch status (max 2 minutes = 60 polls × 2s)
      let hash = "";
      const MAX_TX_POLLS = 60;
      for (let k = 0; k < MAX_TX_POLLS; k++) {
        const statusRes: any = await provider.request({
          method: "wallet_getCallsStatus",
          params: [id]
        });
        if (statusRes.status === "CONFIRMED" && statusRes.receipts && statusRes.receipts.length > 0) {
          hash = statusRes.receipts[0].transactionHash || statusRes.receipts[0].blockHash; 
          break;
        }
        if (statusRes.status === "FAILED" || statusRes.status === "REJECTED") {
          throw new Error(`Transaction ${statusRes.status.toLowerCase()} by wallet`);
        }
        if (k === MAX_TX_POLLS - 1) {
          throw new Error("Transaction confirmation timed out after 2 minutes");
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      // We need a proper Viem receipt to parse the orderId from logs
      const { getPublicClient } = await import("@/lib/p2pkit");
      const p2pPublicClient = getPublicClient();
      const receipt = await p2pPublicClient.waitForTransactionReceipt({ 
        hash: hash as `0x${string}` 
      });

      // Parse orderId from the OrderPlaced event in the receipt logs.
      // The OrderPlaced event signature: OrderPlaced(uint256 orderId, ...)
      const { toEventSelector } = await import("viem");
      const orderPlacedTopic0 = toEventSelector("OrderPlaced(uint256,address,uint256,bytes32,uint256,uint256,uint256)");
      
      let orderId: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.topics.length >= 2 && log.topics[0] === orderPlacedTopic0) {
          // Try to extract — orderId is the first indexed param
          try {
            const topic = log.topics[1];
            if (!topic) continue;
            const possibleOrderId = BigInt(topic);
            if (possibleOrderId > 0n) {
              orderId = possibleOrderId;
              break;
            }
          } catch {}
        }
      }
      
      if (!orderId) {
        throw new Error("Failed to get orderId from receipt logs");
      }

      // Save pending order to local storage for durability
      const pendingOrderData = {
        orderId: orderId.toString(),
        upiId: upiId,
        hash: hash,
        estimatedFiat: estimatedFiat,
        totalUsdc: totalUsdc,
        feeUsdc: feeUsdc,
        timestamp: Date.now()
      };
      localStorage.setItem("pending_cashout_order", JSON.stringify(pendingOrderData));
      
      // Call resumePendingOrder to continue the flow
      setStatus("matching");
      resumePendingOrder(orderId, upiId, hash, pendingOrderData);

    } catch (e: any) {
      console.error("Cashout failed", e);
      let errMsg = e?.message || "Transaction failed";
      
      if (e?.code === "CIRCLE_SELECTION_FAILED") {
        errMsg = "No merchants available right now — try again shortly";
      } else if (e?.cause || e?.code === "TX_REVERTED") {
        try {
          const parsed = await parseP2PError(e);
          if (parsed.message) {
            errMsg = parsed.message;
          }
        } catch (parseErr) {}
      }
      
      setError(errMsg);
      setStatus("error");
    }
  };

  return (
    <div className="w-full glass-card overflow-hidden p-6">
      {status === "input" && (
        <div className="flex flex-col gap-5">
          <h3 className="text-lg font-bold text-center text-[#e5e2e3]">Cash Out to UPI</h3>

          {initError && (
            <div className="bg-[#93000a]/20 text-[#ffb4ab] p-3 rounded text-sm mb-4 border border-[#93000a]">
              <span className="font-bold">Initialization Error:</span> {initError}
            </div>
          )}

          <div>
            <div className="flex justify-between mb-1">
              <label className="label-caps">Amount (USDC)</label>
              {maxSellable !== null && (
                <span className="text-xs font-semibold text-[#909097]">Max: {maxSellable} USDC</span>
              )}
            </div>
            <div className="flex items-end border-b border-[#46464c] pb-1 focus-within:border-[#c0c6de] transition-colors">
              <span className="text-3xl font-bold mr-1 text-[#c0c6de]">$</span>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="text-4xl font-bold bg-transparent outline-none w-full text-[#e5e2e3] placeholder:text-[#46464c]"
              />
            </div>
            {maxSellable !== null && amountUsdc > maxSellable && (
              <p className="text-xs text-[#ffb4ab] mt-1 font-semibold">Amount exceeds your unverified limit of {maxSellable} USDC.</p>
            )}
          </div>

          <div>
            <label className="label-caps mb-1 block">UPI ID</label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="yourname@upi"
              className="w-full bg-transparent border-b border-[#46464c] px-2 py-3 text-sm outline-none focus:border-[#c0c6de] transition-colors text-[#e5e2e3] placeholder:text-[#46464c]"
            />
            {upiId && !isValidUpi() && (
              <p className="text-xs text-[#ffb4ab] mt-1 font-semibold">Invalid UPI ID format.</p>
            )}
          </div>

          <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-[#909097]">
              <span>You receive (est.)</span>
              <span>₹ {estimatedFiat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[#909097]">
              <span>Platform Fee (1%)</span>
              <span>{feeUsdc.toFixed(2)} USDC</span>
            </div>
            <div className="border-t border-[#46464c] my-1"></div>
            <div className="flex justify-between font-bold text-lg text-[#e5e2e3]">
              <span>Total Deducted</span>
              <span>{totalUsdc.toFixed(2)} USDC</span>
            </div>
          </div>

          <button
            onClick={handleCashout}
            disabled={!isFormValid || !sellPrice}
            className={`btn-primary w-full py-3 ${!isFormValid ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Cash Out
          </button>
        </div>
      )}

      {status === "processing" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold text-[#e5e2e3]">Confirming Fees & Approval...</p>
          <p className="text-xs text-[#909097]">Please confirm both transactions in your wallet</p>
        </div>
      )}

      {status === "matching" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold text-[#e5e2e3]">Matching with Merchant...</p>
          <p className="text-xs text-[#909097]">Usually takes 20-90 seconds.</p>
        </div>
      )}

      {status === "paying" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold text-[#e5e2e3]">Merchant is Paying You...</p>
          <p className="text-xs text-[#909097]">Your UPI ID was sent securely. Waiting for merchant to complete.</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <p className="font-semibold text-[#ffb4ab]">Cash Out Failed</p>
          <p className="text-xs text-[#909097]">{error}</p>
          <button onClick={() => setStatus("input")} className="btn-secondary mt-2">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
