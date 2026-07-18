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
  placeOfframpOrder, 
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
          // limits.sellLimit is in 6 decimals (USDC)
          setMaxSellable(Number(formatUnits(limits.sellLimit, 6)));
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

  const amountUsdc = parseFloat(amountStr) || 0;
  const feeUsdc = amountUsdc * 0.01;
  const totalUsdc = amountUsdc + feeUsdc;
  
  // Calculate estimated fiat based on current price
  let estimatedFiat = 0;
  if (amountUsdc > 0 && sellPrice) {
    const usdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
    const fiatBigInt = (usdcBigInt * sellPrice) / 1_000_000n;
    estimatedFiat = Number(formatUnits(fiatBigInt, 6)); // Assuming INR price is also scaled
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
      
      // We are using Privy Free Plan (no Smart Wallets), so we do 2 signatures.
      // Signature 1: Transfer 1% fee to Treasury
      if (feeUsdcBigInt > 0n) {
        const transferFee = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [(CONTRACTS as any).TREASURY as `0x${string}`, feeUsdcBigInt],
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

      // Signature 2: Approve P2PKit Diamond for the principal amount
      const approveDiamond = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACTS.DIAMOND as `0x${string}`, principalUsdcBigInt],
      });
      
      await provider.request({
        method: "eth_sendTransaction",
        params: [{
          from: wallet.address,
          to: CONTRACTS.USDC,
          data: approveDiamond,
        }],
      });

      // Place the SELL order via SDK
      const orderRes = await placeOfframpOrder(provider, {
        userAddress: wallet.address as `0x${string}`,
        currency: "INR",
        usdcAmount: principalUsdcBigInt,
        sellPrice: sellPrice,
      });
      
      const orderId = orderRes.meta?.orderId;
      if (!orderId) {
        throw new Error("Failed to get orderId from receipt");
      }
      
      // Wait for merchant to accept
      setStatus("matching");
      let acceptedOrder: any = null;
      
      while (true) {
        const currentOrder = await getOrderStatus(orderId);
        if (currentOrder.status === "accepted") {
          acceptedOrder = currentOrder;
          break;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled by the protocol.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      
      // Deliver the encrypted UPI ID to the merchant
      await sendPayoutAddress(provider, {
        orderId,
        paymentAddress: upiId,
        merchantPublicKey: acceptedOrder.pubkey,
      });
      
      // Wait for merchant to pay
      setStatus("paying");
      
      while (true) {
        const currentOrder = await getOrderStatus(orderId);
        if (currentOrder.status === "completed") {
          
          // Save to local history
          saveTransaction({
            hash: orderRes.hash,
            type: "cashout",
            title: `Cash Out to ${upiId}`,
            amountINR: estimatedFiat,
            amountUSDC: totalUsdc,
            fee: feeUsdc,
            recipient: upiId,
            network: "Base Sepolia",
            timestamp: Date.now(),
          });
          
          setStatus("completed");
          router.push(`/tx/${orderRes.hash}`);
          return;
        }
        if (currentOrder.status === "cancelled") {
          throw new Error("Order was cancelled.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }

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
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-6">
      {status === "input" && (
        <div className="flex flex-col gap-5">
          <h3 className="text-lg font-bold text-center">Cash Out to UPI</h3>

          {initError && (
            <div className="bg-red-50 text-red-500 p-3 rounded text-sm mb-4 border border-red-100">
              <span className="font-bold">Initialization Error:</span> {initError}
            </div>
          )}

          <div>
            <div className="flex justify-between mb-1">
              <label className="label-caps">Amount (USDC)</label>
              {maxSellable !== null && (
                <span className="text-xs font-semibold text-gray-500">Max: {maxSellable} USDC</span>
              )}
            </div>
            <div className="flex items-center border-b-2 border-black pb-1">
              <span className="text-2xl font-bold mr-1">$</span>
              <input
                type="number"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="text-3xl font-bold bg-transparent outline-none w-full"
              />
            </div>
            {maxSellable !== null && amountUsdc > maxSellable && (
              <p className="text-xs text-red-500 mt-1 font-semibold">Amount exceeds your unverified limit of {maxSellable} USDC.</p>
            )}
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
            {upiId && !isValidUpi() && (
              <p className="text-xs text-red-500 mt-1 font-semibold">Invalid UPI ID format.</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>You receive (est.)</span>
              <span>₹ {estimatedFiat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Platform Fee (1%)</span>
              <span>{feeUsdc.toFixed(2)} USDC</span>
            </div>
            <div className="border-t border-gray-200 my-1"></div>
            <div className="flex justify-between font-bold text-lg">
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
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Confirming Fees & Approval...</p>
          <p className="text-xs text-gray-500">Please confirm both transactions in your wallet</p>
        </div>
      )}

      {status === "matching" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Matching with Merchant...</p>
          <p className="text-xs text-gray-500">Usually takes 20-90 seconds.</p>
        </div>
      )}

      {status === "paying" && (
        <div className="flex flex-col gap-3 items-center text-center py-8">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold">Merchant is Paying You...</p>
          <p className="text-xs text-gray-500">Your UPI ID was sent securely. Waiting for merchant to complete.</p>
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
