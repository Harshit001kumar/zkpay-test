"use client";

import React, { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits, formatUnits, maxUint256 } from "viem";
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
  parseP2PError,
  getPublicClient,
} from "@/lib/p2pkit";


type CashoutStatus = "input" | "processing" | "matching" | "paying" | "completed" | "error";

export default function CashoutFlow({ onBack }: { onBack?: () => void }) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { client: smartClient } = useSmartWallets();

  const router = useRouter();
  
  const [amountStr, setAmountStr] = useState("");
  const [upiId, setUpiId] = useState("");
  const [status, setStatus] = useState<CashoutStatus>("input");
  const [error, setError] = useState<string | null>(null);
  
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmountStr(val);
    }
  };

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

      const wallet = wallets[0];
      
      // Use Privy Smart Wallet client for sendPayoutAddress if available
      if (smartClient) {
        // sendPayoutAddress expects a walletClient - create one from smartClient
        const provider = await wallet.getEthereumProvider();
        const { createWalletClient, custom } = await import("viem");
        const { base } = await import("viem/chains");
        const walletClient = createWalletClient({
          account: (smartClient.account?.address || wallet.address) as `0x${string}`,
          chain: base,
          transport: custom(provider)
        });
        
        await sendPayoutAddress(walletClient, {
          orderId,
          paymentAddress: savedUpiId,
          merchantPublicKey: acceptedOrder.pubkey,
        });
      } else {
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
      }

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
  
  let estimatedFiat = 0;
  let rateDisplay = "1 USDC ≈ ₹0.00";
  if (sellPrice) {
    const unitPrice = (1000000n * sellPrice) / 1000000n;
    rateDisplay = `1 USDC ≈ ₹${formatUnits(unitPrice, 6)}`;
  }

  if (amountUsdc > 0 && sellPrice) {
    const usdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
    const fiatBigInt = (usdcBigInt * BigInt(sellPrice)) / 1000000n;
    estimatedFiat = Number(formatUnits(fiatBigInt, 6));
  }

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-[#909097]">Connect wallet to cash out.</div>;
  }
  
  const isValidUpi = () => {
    try {
      const fields = PAYMENT_ID_FIELDS["INR"];
      if (!fields || fields.length === 0) return true;
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
      const activeAddr = (smartClient?.account?.address || wallet.address) as `0x${string}`;
      const publicClient = getPublicClient();
      
      const principalUsdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
      const feeUsdcBigInt = parseUnits(feeUsdc.toFixed(6), 6);
      const totalRequiredUsdc = principalUsdcBigInt + feeUsdcBigInt;

      // Verify on-chain USDC balance before submitting
      const onChainBalance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [activeAddr],
      })) as bigint;

      if (onChainBalance < totalRequiredUsdc) {
        const balFloat = Number(onChainBalance) / 1_000_000;
        const reqFloat = Number(totalRequiredUsdc) / 1_000_000;
        throw new Error(
          `Insufficient USDC balance on Base. You have $${balFloat.toFixed(2)} USDC, but this cashout requires $${reqFloat.toFixed(2)} USDC ($${amountUsdc.toFixed(2)} + $${feeUsdc.toFixed(2)} fee).`
        );
      }
      
      const orderCall = await prepareOfframpOrder({
        userAddress: activeAddr,
        currency: "INR",
        usdcAmount: principalUsdcBigInt,
        sellPrice: sellPrice,
      });

      const calls: { to: `0x${string}`; data: `0x${string}`; value: bigint }[] = [];
      if (feeUsdcBigInt > 0n) {
        calls.push({
          to: CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [(CONTRACTS as any).TREASURY as `0x${string}`, feeUsdcBigInt],
          }),
          value: 0n,
        });
      }

      // Check allowance; only add approve if current allowance < required
      const currentAllowance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [activeAddr, CONTRACTS.DIAMOND],
      })) as bigint;

      if (currentAllowance < principalUsdcBigInt) {
        calls.push({
          to: CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CONTRACTS.DIAMOND as `0x${string}`, maxUint256],
          }),
          value: 0n,
        });
      }

      calls.push({
        to: orderCall.to as `0x${string}`,
        data: orderCall.data as `0x${string}`,
        value: 0n,
      });

      let hash = "";

      // 1-Click Batched Smart Wallet Execution (gas sponsored by Pimlico paymaster)
      if (smartClient) {
        hash = await smartClient.sendTransaction({ calls });
      } else if (wallet) {
        // Fallback to sequential EOA calls
        const provider = await wallet.getEthereumProvider();
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i];
          const txH = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: activeAddr,
              to: call.to,
              data: call.data,
            }]
          });
          await publicClient.waitForTransactionReceipt({ hash: txH as `0x${string}` });
          hash = txH as string;
        }
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });

      const { toEventSelector } = await import("viem");
      const orderPlacedTopic0 = toEventSelector("OrderPlaced(uint256,address,uint256,bytes32,uint256,uint256,uint256)");
      
      let orderId: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.topics.length >= 2 && log.topics[0] === orderPlacedTopic0) {
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
    <div className="fixed inset-0 z-[60] bg-[#0e0e0f] text-[#e5e2e3] font-body-md overflow-y-auto">
      <style dangerouslySetInnerHTML={{__html: `
        .obsidian-glass {
            background: rgba(20, 20, 22, 0.7);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05);
        }
        .silver-typography {
            background: linear-gradient(180deg, #FFFFFF 0%, #94A3B8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .path-line {
            width: 2px;
            background: linear-gradient(180deg, rgba(192, 198, 222, 0.5) 0%, rgba(192, 198, 222, 0) 100%);
            height: 40px;
            margin: -8px auto;
            position: relative;
            z-index: 20;
        }
        .path-arrow {
            width: 0; 
            height: 0; 
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 8px solid rgba(192, 198, 222, 0.5);
            margin: 0 auto;
        }
        .monolith-shadow {
            box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.8);
        }
      `}} />
      
      {/* Decorative Ambient Glows */}
      <div className="fixed -top-1/4 -right-1/4 w-[600px] h-[600px] bg-[#c0c6de]/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed -bottom-1/4 -left-1/4 w-[400px] h-[400px] bg-[#bcc7de]/5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Top Navigation Bar */}
      <header className="w-full sticky top-0 bg-[#0e0e0f]/80 backdrop-blur-md z-50 flex items-center justify-between px-6 h-16">
        <button onClick={onBack} aria-label="Go back" className="flex items-center text-[#c0c6de] hover:opacity-80 transition-opacity active:scale-95">
          <span className="material-symbols-outlined text-2xl">arrow_back</span>
        </button>
        <span className="font-label-caps text-[10px] text-[#c6c6cd] tracking-[0.25em] font-bold">CASHOUT FLOW</span>
        <div className="w-6"></div>
      </header>

      <main className="w-full max-w-lg mx-auto px-6 pt-8 pb-44 flex flex-col gap-2 relative z-10">
        
        {initError && (
          <div className="bg-[#93000a]/20 text-[#ffb4ab] p-4 rounded-xl text-sm mb-4 border border-[#93000a] obsidian-glass">
            <span className="font-bold block mb-1 uppercase tracking-widest text-[10px]">Error</span> 
            {initError}
          </div>
        )}

        {status === "input" && (
          <>
            {/* Input Block */}
            <section className="obsidian-glass monolith-shadow p-8 rounded-xl flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between w-full mb-6">
                <p className="font-label-caps text-[10px] text-[#909097] uppercase font-bold tracking-widest">Source Amount</p>
                {maxSellable !== null && (
                  <p className="font-label-caps text-[10px] text-[#c0c6de] uppercase font-bold tracking-widest opacity-80">Max: {maxSellable}</p>
                )}
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-baseline group relative">
                  <span className="font-display-xl text-[64px] font-extrabold text-[#c0c6de] opacity-50 select-none mr-1 absolute -left-12">$</span>
                  <input 
                    type="number"
                    step="0.01"
                    value={amountStr}
                    onChange={handleAmountChange}
                    className="bg-transparent border-none focus:ring-0 font-display-xl text-[64px] font-extrabold p-0 text-center silver-typography tracking-tighter w-48 transition-all" 
                    placeholder="0.00" 
                  />
                </div>
                <span className="font-headline-md text-[#bcc7de] tracking-widest text-lg font-light uppercase">USDC</span>
                {maxSellable !== null && amountUsdc > maxSellable && (
                  <p className="text-[10px] text-[#ffb4ab] mt-2 font-bold tracking-widest uppercase">Exceeds limit ({maxSellable} USDC)</p>
                )}
              </div>
            </section>

            {/* Vertical Path Visualization */}
            <div className="flex flex-col items-center opacity-50">
              <div className="path-line"></div>
              <div className="path-arrow"></div>
            </div>

            {/* Conversion Block */}
            <section className="obsidian-glass monolith-shadow p-8 rounded-xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 delay-150">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <span className="material-symbols-outlined text-[80px]">currency_exchange</span>
              </div>
              <p className="font-label-caps text-[10px] text-[#909097] uppercase mb-8 text-center font-bold tracking-widest">Conversion Estimate</p>
              <div className="flex flex-col items-center mb-8">
                <span className="font-display-xl text-[48px] font-extrabold silver-typography tracking-tight">
                  ₹{estimatedFiat > 0 ? estimatedFiat.toFixed(2) : "0.00"}
                </span>
                <span className="font-headline-md text-[#bcc7de] tracking-widest text-lg font-light uppercase">INR</span>
              </div>
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <span className="font-body-md text-[#909097] text-sm">Exchange Rate</span>
                  <span className="font-body-md text-[#e5e2e3] text-sm">{rateDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-body-md text-[#909097] text-sm">Protocol Fee (1%)</span>
                  <span className="font-body-md text-[#e5e2e3] text-sm">${feeUsdc.toFixed(2)}</span>
                </div>
              </div>
            </section>

            {/* Vertical Path Visualization */}
            <div className="flex flex-col items-center opacity-50">
              <div className="path-line"></div>
              <div className="path-arrow"></div>
            </div>

            {/* Destination Block */}
            <section className="obsidian-glass monolith-shadow p-8 rounded-xl transition-all group animate-in fade-in slide-in-from-bottom-12 delay-300">
              <p className="font-label-caps text-[10px] text-[#909097] uppercase mb-6 text-center font-bold tracking-widest">Settlement Account</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/5 rounded-lg flex items-center justify-center border border-white/10 group-focus-within:border-[#c0c6de]/30 transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined text-[#bcc7de] text-3xl">account_balance</span>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="name@upi"
                    className="w-full bg-transparent border-b border-[#46464c]/50 px-0 py-2 text-lg font-body-lg text-[#e5e2e3] focus:border-[#c0c6de] focus:ring-0 outline-none transition-colors placeholder:text-[#909097]/40 truncate"
                  />
                  {upiId && !isValidUpi() && (
                    <p className="text-[10px] text-[#ffb4ab] mt-1 font-bold tracking-widest uppercase truncate">Invalid format</p>
                  )}
                </div>
              </div>
            </section>

            {/* Security Badge */}
            <div className="mt-6 px-4 py-3 rounded-lg border border-white/5 flex gap-4 items-start bg-white/[0.02]">
              <span className="material-symbols-outlined text-[#c0c6de] text-xl" style={{fontVariationSettings: "'FILL' 1"}}>verified_user</span>
              <p className="font-label-caps text-[10px] leading-relaxed text-[#909097] tracking-normal normal-case font-bold">Secured by Zk-SNARK technology. Your identity and banking data remain private and encrypted.</p>
            </div>
          </>
        )}

        {status !== "input" && (
          <section className="obsidian-glass monolith-shadow p-12 rounded-xl flex flex-col items-center text-center animate-in zoom-in duration-500">
            <div className="w-16 h-16 rounded-full border-4 border-[#c0c6de]/20 border-t-[#c0c6de] animate-spin mb-8"></div>
            
            {status === "processing" && (
              <>
                <h3 className="font-headline-md text-2xl mb-2 text-[#e5e2e3]">Processing...</h3>
                <p className="text-sm text-[#909097]">Please confirm the transactions in your wallet.</p>
              </>
            )}
            
            {status === "matching" && (
              <>
                <h3 className="font-headline-md text-2xl mb-2 text-[#e5e2e3]">Matching...</h3>
                <p className="text-sm text-[#909097]">Finding the best merchant for your order. (Usually 20-90s)</p>
              </>
            )}
            
            {status === "paying" && (
              <>
                <h3 className="font-headline-md text-2xl mb-2 text-[#e5e2e3]">Paying out...</h3>
                <p className="text-sm text-[#909097]">Merchant is transferring INR to your account.</p>
              </>
            )}
            
            {status === "error" && (
              <div className="flex flex-col items-center">
                <span className="material-symbols-outlined text-[#ffb4ab] text-5xl mb-4">error</span>
                <h3 className="font-headline-md text-2xl mb-2 text-[#ffb4ab]">Cashout Failed</h3>
                <p className="text-sm text-[#909097] mb-8">{error}</p>
                <button onClick={() => setStatus("input")} className="px-8 py-3 rounded-lg border border-white/20 text-[#e5e2e3] font-label-caps tracking-widest text-[10px] uppercase hover:bg-white/5 transition-colors">
                  Try Again
                </button>
              </div>
            )}
          </section>
        )}

      </main>

      {/* Bottom Action Button */}
      {status === "input" && (
        <div className="fixed bottom-0 left-0 w-full px-6 py-8 z-[60] bg-gradient-to-t from-[#0e0e0f] via-[#0e0e0f]/95 to-transparent">
          <div className="max-w-lg mx-auto">
            <button 
              onClick={handleCashout}
              disabled={!isFormValid || !sellPrice}
              className={`w-full h-16 obsidian-glass text-[#e5e2e3] font-label-caps text-sm rounded-lg uppercase tracking-[0.3em] transition-all transform flex items-center justify-center gap-3 border border-white/20 hover:border-[#c0c6de]/50 group font-bold ${!isFormValid ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}
            >
              Confirm Cashout
              <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
