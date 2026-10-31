"use client";

import React, { useState, useEffect, useRef } from "react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useRouter } from "next/navigation";
import { encodeFunctionData, parseUnits, formatUnits, maxUint256 } from "viem";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { saveTransaction } from "@/lib/history";
import { PAYMENT_ID_FIELDS } from "@p2pdotme/sdk/country";
import { useCurrency } from "@/context/CurrencyContext";
import { identifyPixKeyType } from "@/lib/pixParser";
import { 
  getOfframpLimits, 
  getOfframpPrice, 
  prepareOfframpOrder, 
  sendPayoutAddress, 
  getOrderStatus,
  parseOrderIdFromReceipt,
  parseP2PError,
  getPublicClient,
  calculateOrderFees,
} from "@/lib/p2pkit";
import { truncateTo2Decimals } from "@/lib/format";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowDown,
} from "lucide-react";


type CashoutStatus = "input" | "processing" | "matching" | "paying" | "completed" | "error";

export default function CashoutFlow({ onBack }: { onBack?: () => void }) {
  const { ready, authenticated, address, primaryWallet, smartClient } = useActiveAccount();
  const { currency, currencyMeta } = useCurrency();

  const router = useRouter();
  
  const [amountStr, setAmountStr] = useState("");
  const [upiId, setUpiId] = useState("");
  const [status, setStatus] = useState<CashoutStatus>("input");
  const [error, setError] = useState<string | null>(null);
  
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [pendingOrderData, setPendingOrderData] = useState<any | null>(null);
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const isResumingCashoutRef = useRef<string | null>(null);
  const deliveredCashoutPayoutRef = useRef<string | null>(null);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmountStr(val);
    }
  };

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    
    let isMounted = true;
    
    const fetchConfig = async () => {
      try {
        const userAddress = address as `0x${string}`;
        const [limits, priceCfg] = await Promise.all([
          getOfframpLimits(userAddress, currency),
          getOfframpPrice(currency)
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
        const priceCfg = await getOfframpPrice(currency);
        if (isMounted) setSellPrice(priceCfg.sellPrice);
      } catch (err) {}
    }, 60000);
    
    return () => { 
      isMounted = false;
      clearInterval(interval);
    };
  }, [ready, authenticated, address, currency]);

  useEffect(() => {
    if (!ready || !authenticated || !address) return;
    const pendingOrderStr = localStorage.getItem("pending_cashout_order");
    if (pendingOrderStr) {
      try {
        const pending = JSON.parse(pendingOrderStr);
        if (pending.orderId && pending.upiId) {
          setUpiId(pending.upiId);
          setPendingOrderData(pending);
          setOrderId(BigInt(pending.orderId));
          setStatus("matching");
          resumePendingOrder(BigInt(pending.orderId), pending.upiId, pending.hash, pending);
        }
      } catch (e) {
        localStorage.removeItem("pending_cashout_order");
      }
    }
  }, [ready, authenticated, address]);

  const resumePendingOrder = async (orderId: bigint, savedUpiId: string, hash: string, pending: any) => {
    const orderIdStr = orderId.toString();
    if (isResumingCashoutRef.current === orderIdStr) return;
    isResumingCashoutRef.current = orderIdStr;

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
          setPendingOrderData(null);
          setStatus("completed");
          router.push(`/tx/${hash}`);
          return;
        }
        if (currentOrder.status === "cancelled") {
          localStorage.removeItem("pending_cashout_order");
          setPendingOrderData(null);
          throw new Error("Order was cancelled by the protocol.");
        }
        if (i === MAX_ACCEPT_POLLS - 1) {
          throw new Error("Merchant matching timed out after 10 minutes. Please try again.");
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      // Guard: strictly send payout address once per orderId
      if (deliveredCashoutPayoutRef.current !== orderIdStr) {
        deliveredCashoutPayoutRef.current = orderIdStr;

        // Use smartClient directly as walletClient when available (email-only users have no primaryWallet)
        if (smartClient) {
          await sendPayoutAddress(smartClient as any, {
            orderId,
            paymentAddress: savedUpiId,
            merchantPublicKey: acceptedOrder.pubkey,
          });
        } else if (primaryWallet) {
          const provider = await primaryWallet.getEthereumProvider();
          const { createWalletClient, custom } = await import("viem");
          const { base } = await import("viem/chains");
          const walletClient = createWalletClient({
            account: primaryWallet.address as `0x${string}`,
            chain: base,
            transport: custom(provider)
          });
          
          await sendPayoutAddress(walletClient, {
            orderId,
            paymentAddress: savedUpiId,
            merchantPublicKey: acceptedOrder.pubkey,
          });
        } else {
          throw new Error("No wallet available to send payout address.");
        }
      }

      setStatus("paying");
      const MAX_PAY_POLLS = 300;
      for (let j = 0; j < MAX_PAY_POLLS; j++) {
        const currentOrder = await getOrderStatus(orderId);
        if (currentOrder.status === "completed") {
          localStorage.removeItem("pending_cashout_order");
          setPendingOrderData(null);
          
          saveTransaction({
            hash: hash,
            type: "cashout",
            title: `Cash Out to ${savedUpiId}`,
            amountINR: pending.estimatedFiat || 0,
            amountUSDC: pending.totalUsdc || 0,
            fee: pending.feeUsdc || 0,
            protocolFee: pending.protocolFeeUsdc || 0,
            recipient: savedUpiId,
            orderId: orderId.toString(),
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
      if (e.message?.includes("cancelled")) {
        localStorage.removeItem("pending_cashout_order");
        setPendingOrderData(null);
      }
      setError(e.message || "Failed to deliver payout details to merchant.");
      setStatus("error");
      isResumingCashoutRef.current = null;
      deliveredCashoutPayoutRef.current = null;
    }
  };

  const amountUsdc = parseFloat(amountStr) || 0;
  const fees = calculateOrderFees(amountUsdc);
  const feeUsdc = fees.zkPayFeeUsdc;
  const protocolFeeUsdc = fees.protocolFeeUsdc;
  const totalUsdc = fees.totalRequiredUsdc;
  
  let estimatedFiat = 0;
  let rateDisplay = `1 USDC ≈ ${currencyMeta.symbol}0.00`;
  if (sellPrice) {
    const unitPrice = (1000000n * sellPrice) / 1000000n;
    rateDisplay = `1 USDC ≈ ${currencyMeta.symbol}${formatUnits(unitPrice, 6)}`;
  }

  if (amountUsdc > 0 && sellPrice) {
    const usdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
    const fiatBigInt = (usdcBigInt * BigInt(sellPrice)) / 1000000n;
    estimatedFiat = Number(formatUnits(fiatBigInt, 6));
  }

  if (!ready || (authenticated && !address)) {
    return (
      <div className="text-center p-8 text-sm text-outline flex flex-col items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span>Loading account…</span>
      </div>
    );
  }

  if (!authenticated || !address) {
    return <div className="text-center p-4 text-sm text-outline">Please sign in to cash out.</div>;
  }
  
  const isValidPayoutId = () => {
    if (!upiId.trim()) return false;
    if (currency === "BRL") {
      return Boolean(identifyPixKeyType(upiId) || upiId.length >= 8);
    }
    if (currency === "USD") {
      return upiId.includes("@") || /^[a-zA-Z0-9._-]{3,30}$/.test(upiId.replace(/^@/, ""));
    }
    try {
      const fields = PAYMENT_ID_FIELDS["INR"];
      if (!fields || fields.length === 0) return upiId.includes("@");
      return fields[0].validate(upiId);
    } catch (e) {
      return upiId.includes("@");
    }
  };

  const isFormValid = amountUsdc > 0 && isValidPayoutId() && maxSellable !== null && amountUsdc <= maxSellable;

  const handleCashout = async () => {
    if (!isFormValid || !sellPrice) return;

    try {
      setStatus("processing");
      setError(null);

      const wallet = primaryWallet;
      const activeAddr = (smartClient?.account?.address || wallet?.address || address) as `0x${string}`;
      const publicClient = getPublicClient();
      
      const principalUsdcBigInt = parseUnits(amountUsdc.toFixed(6), 6);
      const feeUsdcBigInt = parseUnits(feeUsdc.toFixed(6), 6);
      const protocolFeeBigInt = parseUnits(protocolFeeUsdc.toFixed(6), 6);
      const totalRequiredUsdc = principalUsdcBigInt + feeUsdcBigInt + protocolFeeBigInt;

      // Verify on-chain USDC balance before submitting
      const onChainBalance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [activeAddr],
      })) as bigint;

      const minGasBuffer = smartClient ? 10_000n : 0n; // 0.01 USDC buffer for ERC-20 paymaster gas
      if (onChainBalance < totalRequiredUsdc + minGasBuffer) {
        const balFloat = Number(onChainBalance) / 1_000_000;
        const reqFloat = Number(totalRequiredUsdc + minGasBuffer) / 1_000_000;
        const feeDetail = protocolFeeUsdc > 0 
          ? ` ($${amountUsdc.toFixed(2)} cashout + $${feeUsdc.toFixed(2)} 1% fee + $${protocolFeeUsdc.toFixed(2)} protocol fee${smartClient ? " + ~$0.01 gas" : ""})`
          : ` ($${amountUsdc.toFixed(2)} cashout + $${feeUsdc.toFixed(2)} 1% fee${smartClient ? " + ~$0.01 gas" : ""})`;
        throw new Error(
          `Insufficient USDC balance on Base. You have $${truncateTo2Decimals(balFloat)} USDC, but this cashout requires $${reqFloat.toFixed(2)} USDC${feeDetail}.`
        );
      }
      
      const orderCall = await prepareOfframpOrder({
        userAddress: activeAddr,
        currency: currency,
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

      // Check allowance; Diamond pulls actualUsdtAmount (= principal + protocol fee) at setSellOrderUpi
      const currentAllowance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [activeAddr, CONTRACTS.DIAMOND],
      })) as bigint;

      const neededByDiamond = principalUsdcBigInt + protocolFeeBigInt;
      if (currentAllowance < neededByDiamond) {
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

      // 1-Click Batched Smart Wallet Execution (gas paid in USDC via ERC-20 Paymaster)
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
      const orderId = await parseOrderIdFromReceipt(receipt, activeAddr);
      setOrderId(orderId);

      const pendingOrderData = {
        orderId: orderId.toString(),
        upiId: upiId,
        hash: hash,
        estimatedFiat: estimatedFiat,
        totalUsdc: totalUsdc,
        feeUsdc: feeUsdc,
        protocolFeeUsdc: protocolFeeUsdc,
        timestamp: Date.now()
      };
      localStorage.setItem("pending_cashout_order", JSON.stringify(pendingOrderData));
      setPendingOrderData(pendingOrderData);
      
      setStatus("matching");
      resumePendingOrder(orderId, upiId, hash, pendingOrderData);

    } catch (e: any) {
      console.error("Cashout failed", e);
      let errMsg = e?.message || "Transaction failed";
      
      if (e?.code === "CIRCLE_SELECTION_FAILED") {
        errMsg = "No merchants available right now. Please try again shortly.";
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
    <div className="fixed inset-0 z-[70] bg-surface text-on-surface font-sans overflow-y-auto">
      {/* Floating Header */}
      <header className="sticky top-3.5 z-50 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-lg mx-auto">
          <div className="pointer-events-auto px-4 py-2.5 rounded-full bg-surface-container-low/95 border border-primary/25 backdrop-blur-xl shadow-elevated flex items-center justify-between">
            <button
              onClick={onBack}
              aria-label="Go back"
              className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-on-surface transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Vault</span>
            </button>
            <span className="text-xs font-semibold text-on-surface-variant">
              Off-ramp · {currencyMeta.code}
            </span>
            <span className="w-2 h-2 rounded-full bg-secondary" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-lg mx-auto px-4 sm:px-6 pt-6 pb-40 flex flex-col gap-3 relative z-10">
        {initError && (
          <div className="bg-error/10 text-error p-4 rounded-2xl text-xs mb-2 border border-error/30">
            <span className="font-bold block mb-1 text-xs">
              Protocol limit notice
            </span>
            {initError}
          </div>
        )}

        {status === "input" && (
          <>
            {/* Module 1: Source USDC Input Well */}
            <section className="bg-surface-container-low border border-primary/20 p-6 sm:p-7 rounded-3xl shadow-elevated flex flex-col items-center text-center">
              <div className="flex justify-between items-center w-full mb-4">
                <span className="text-xs font-semibold text-on-surface-variant">
                  Source liquidity (Base USDC)
                </span>
                {maxSellable !== null && (
                  <button
                    type="button"
                    onClick={() => setAmountStr(String(maxSellable))}
                    className="text-xs text-primary hover:text-on-surface px-2.5 py-1 rounded-full bg-surface-container border border-primary/20 font-bold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Max: ${maxSellable}
                  </button>
                )}
              </div>

              <div className="w-full py-5 px-4 rounded-2xl bg-surface-container border border-primary/15 flex flex-col items-center">
                <div className="flex items-baseline justify-center">
                  <span className="text-3xl sm:text-4xl font-extrabold text-primary select-none mr-1">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={amountStr}
                    onChange={handleAmountChange}
                    className="bg-transparent border-none focus:ring-0 focus:outline-none font-mono text-5xl sm:text-6xl font-black p-0 text-center text-on-surface tracking-tight w-48 tabular-nums"
                    placeholder="0.00"
                  />
                </div>
                <span className="text-xs text-on-surface-variant mt-2">
                  USDC on Base Mainnet
                </span>
                {maxSellable !== null && amountUsdc > maxSellable && (
                  <p className="text-xs text-error mt-2 font-bold">
                    Exceeds order limit ({maxSellable} USDC)
                  </p>
                )}
              </div>
            </section>

            {/* Connector Node */}
            <div className="flex justify-center -my-1.5 relative z-20">
              <div className="w-9 h-9 rounded-xl bg-surface-container-low border border-primary/25 flex items-center justify-center text-primary shadow-dock-label">
                <ArrowDown className="w-4 h-4" />
              </div>
            </div>

            {/* Module 2: Conversion Telemetry */}
            <section className="bg-surface-container-low border border-primary/20 p-6 sm:p-7 rounded-3xl shadow-elevated relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-on-surface-variant">
                  Estimated payout
                </span>
                <span className="text-xs text-secondary font-semibold">
                  {currencyMeta.rail} rail
                </span>
              </div>

              <div className="py-4 px-4 rounded-2xl bg-surface-container border border-primary/15 text-center mb-5">
                <span className="font-mono text-4xl sm:text-5xl font-extrabold text-on-surface tracking-tight tabular-nums block">
                  {currencyMeta.symbol}
                  {estimatedFiat > 0 ? estimatedFiat.toFixed(2) : "0.00"}
                </span>
                <span className="text-xs text-on-surface-variant mt-1 block">
                  {currencyMeta.name} ({currencyMeta.code})
                </span>
              </div>

              <div className="space-y-2.5 pt-2 text-xs tabular-nums">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Oracle rate</span>
                  <span className="font-mono text-on-surface">{rateDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Platform fee (1%)</span>
                  <span className="font-mono text-on-surface">${feeUsdc.toFixed(2)} USDC</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-on-surface-variant">Protocol fee</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">
                      {fees.isSmallOrder ? "<= $10 orders" : "Free > $10"}
                    </span>
                  </div>
                  <span className={fees.isSmallOrder ? "font-mono text-on-surface" : "text-secondary font-bold"}>
                    {fees.isSmallOrder ? `$${protocolFeeUsdc.toFixed(2)} USDC` : "Free"}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-primary/15">
                  <span className="text-primary font-bold">Total debited</span>
                  <span className="font-mono text-on-surface font-bold">${totalUsdc.toFixed(2)} USDC</span>
                </div>
              </div>
            </section>

            {/* Module 3: Destination Account */}
            <section className="bg-surface-container-low border border-primary/20 p-6 rounded-3xl shadow-elevated mt-1">
              <span className="text-xs font-semibold text-on-surface-variant block mb-3">
                Destination account ({currencyMeta.rail})
              </span>
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-surface-container border border-primary/20 focus-within:border-primary/50 transition-colors">
                <div className="w-10 h-10 bg-surface-container-low rounded-xl flex items-center justify-center border border-primary/20 text-primary shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder={currencyMeta.placeholder}
                    className="w-full bg-transparent border-none p-0 text-sm sm:text-base font-mono text-on-surface focus:ring-0 outline-none placeholder:text-on-surface-variant/40 truncate"
                  />
                  {upiId && !isValidPayoutId() && (
                    <p className="text-xs text-error mt-1 font-bold truncate">
                      Invalid {currencyMeta.rail} identifier format
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Security Telemetry Badge */}
            <div className="mt-2 px-4 py-3.5 rounded-2xl border border-primary/15 flex gap-3 items-start bg-surface-container-low/70">
              <ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-on-surface-variant">
                ECIES secp256k1 encrypted payout routing. Your banking identifier is never stored on-chain in plaintext.
              </p>
            </div>
          </>
        )}

        {status !== "input" && (
          <section className="bg-surface-container-low border border-primary/20 p-8 sm:p-10 rounded-3xl shadow-elevated flex flex-col items-center text-center">
            {status !== "error" && (
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mb-6">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}

            {status === "processing" && (
              <>
                <h3 className="text-xl font-bold mb-1.5 text-on-surface">Escrowing USDC on Base…</h3>
                <p className="text-xs text-on-surface-variant">
                  Executing gasless UserOperation via P2P Diamond contract
                </p>
              </>
            )}

            {status === "matching" && (
              <>
                <h3 className="text-xl font-bold mb-1.5 text-on-surface">Matching Liquidity Node…</h3>
                <p className="text-xs text-on-surface-variant">
                  Selecting optimal {currencyMeta.rail} settlement node (typically 20 to 90s)
                </p>
                {(orderId || pendingOrderData?.orderId) && (
                  <div className="mt-5 px-4 py-2 rounded-full bg-surface-container border border-primary/20 text-xs tabular-nums text-primary inline-flex items-center gap-2">
                    <span className="text-on-surface-variant">Order ID:</span>
                    <strong className="font-mono text-on-surface font-bold">
                      #{orderId ? orderId.toString() : pendingOrderData?.orderId}
                    </strong>
                  </div>
                )}
              </>
            )}

            {status === "paying" && (
              <>
                <h3 className="text-xl font-bold mb-1.5 text-on-surface">
                  Disbursing {currencyMeta.code} Payout…
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Matched LP node is transferring {currencyMeta.code} via {currencyMeta.rail} rails.
                </p>
                {(orderId || pendingOrderData?.orderId) && (
                  <div className="mt-5 px-4 py-2 rounded-full bg-surface-container border border-primary/20 text-xs tabular-nums text-primary inline-flex items-center gap-2">
                    <span className="text-on-surface-variant">Order ID:</span>
                    <strong className="font-mono text-on-surface font-bold">
                      #{orderId ? orderId.toString() : pendingOrderData?.orderId}
                    </strong>
                  </div>
                )}
              </>
            )}

            {status === "error" && (
              <div className="flex flex-col items-center max-w-sm mx-auto text-center">
                <div className="w-14 h-14 rounded-2xl bg-error/10 border border-error/30 flex items-center justify-center text-error mb-4">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-error">Cashout Notice</h3>
                <p className="text-xs text-on-surface-variant mb-7 leading-relaxed">{error}</p>
                <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                  {pendingOrderData && (
                    <button
                      onClick={() => {
                        setError(null);
                        setStatus("matching");
                        resumePendingOrder(
                          BigInt(pendingOrderData.orderId),
                          pendingOrderData.upiId,
                          pendingOrderData.hash,
                          pendingOrderData
                        );
                      }}
                      className="px-5 py-3 rounded-xl bg-primary text-on-primary font-bold text-xs hover:brightness-110 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Retry Payload Delivery
                    </button>
                  )}
                  <button
                    onClick={() => {
                      localStorage.removeItem("pending_cashout_order");
                      setPendingOrderData(null);
                      setStatus("input");
                    }}
                    className="px-5 py-3 rounded-xl border border-primary/25 text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {pendingOrderData ? "Start New Order" : "Try Again"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Bottom Action Bar */}
      {status === "input" && (
        <div className="fixed bottom-0 left-0 w-full px-4 sm:px-6 py-5 z-[60] bg-gradient-to-t from-surface via-surface/95 to-transparent">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleCashout}
              disabled={!isFormValid || !sellPrice}
              className={`w-full py-4 rounded-2xl bg-secondary text-on-secondary text-xs font-bold transition-colors flex items-center justify-center gap-2.5 shadow-card group cursor-pointer whitespace-nowrap ${
                !isFormValid ? "opacity-40 cursor-not-allowed" : "hover:brightness-110 active:scale-[0.98]"
              }`}
            >
              <span>Confirm {currencyMeta.code} Cashout</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
