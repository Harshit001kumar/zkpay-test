"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";
import { formatUnits, encodeFunctionData, createWalletClient, custom, maxUint256 } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";
import { Html5Qrcode } from "html5-qrcode";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";
import { 
  getPublicClient, 
  getSellRate, 
  prepareOfframpOrder, 
  getOrderStatus, 
  sendPayoutAddress, 
  getOfframpLimits, 
  parseOrderIdFromReceipt,
  parseP2PError,
  calculateOrderFees,
  formatUpiName,
  P2P_SMALL_ORDER_THRESHOLD_BIGINT,
  P2P_SMALL_ORDER_FEE_BIGINT,
} from "@/lib/p2pkit";
import { saveTransaction } from "@/lib/history";
import { floorTo2Decimals, truncateTo2Decimals } from "@/lib/format";

import { 
  ArrowLeft, 
  QrCode, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  CameraOff,
  Coins,
  Sparkles,
  Info,
  Copy, 
  RefreshCw, 
  ShieldCheck, 
  Store,
  X,
  AlertCircle
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import DecryptedText from "@/components/ui/DecryptedText";
import { useCurrency } from "@/context/CurrencyContext";
import { parsePixData } from "@/lib/pixParser";
import { parsePayPalData } from "@/lib/paypalParser";

type FlowStep = "amount" | "authorizing" | "scanning_matching" | "delivering" | "settling" | "completed";

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2000];

export default function ScanAndPayFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { address, smartClient, primaryWallet: wallet, login, ready, authenticated } = useActiveAccount();
  const { getAccessToken } = usePrivy();
  const { currency, currencyMeta } = useCurrency();
  const activeAddress = (address || undefined) as `0x${string}` | undefined;

  const PRESET_AMOUNTS = currencyMeta.presets || [100, 250, 500, 1000, 2000];

  // Flow State
  const [step, setStep] = useState<FlowStep>("amount");
  const [amountInr, setAmountInr] = useState<string>("0");
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Available Base USDC balance (formatted to 2 decimal places)
  const { data: rawBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [activeAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!activeAddress,
      refetchInterval: 5000,
    },
  });

  const availableUsdc = rawBal !== undefined ? floorTo2Decimals(rawBal as bigint) : 0;

  // Keypad Handlers
  const handleKeypadChange = (newVal: string) => {
    setAmountInr(newVal);
  };

  const handleQuickAdd = (addInr: number) => {
    const curr = parseFloat(amountInr) || 0;
    const next = (curr + addInr).toFixed(2);
    setAmountInr(next);
  };

  const handleSetMax = () => {
    if (!sellPrice || availableUsdc <= 0) return;
    const rate = Number(sellPrice) / 1_000_000;
    
    // Total USDC required = principal + 1% fee + protocol fee (0.10 if principal <= 10)
    let maxPrincipalUsdc = 0;
    if (availableUsdc > 10.20) {
      maxPrincipalUsdc = availableUsdc / 1.01;
    } else if (availableUsdc > 0.11) {
      maxPrincipalUsdc = Math.max(0, (availableUsdc - 0.10) / 1.01);
    } else {
      maxPrincipalUsdc = 0;
    }

    const effectiveMaxUsdc = maxSellable ? Math.min(maxPrincipalUsdc, maxSellable) : maxPrincipalUsdc;
    // Floor INR to 2 decimal places so that we never round up into insufficient funds
    const finalInr = Math.max(0, Math.floor(effectiveMaxUsdc * rate * 100) / 100);
    setAmountInr(finalInr.toFixed(2));
  };

  const handleClear = () => {
    setAmountInr("0");
  };

  // Order & P2P State
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [feeTxHash, setFeeTxHash] = useState<string | null>(null);
  const [usdcAmountNum, setUsdcAmountNum] = useState<number>(0);
  const [merchantAcceptedOrder, setMerchantAcceptedOrder] = useState<any | null>(null);

  // Scanner & Recipient State
  const [scannedUpi, setScannedUpi] = useState<string>("");
  const [scannedMerchantName, setScannedMerchantName] = useState<string>("");
  const [manualUpiInput, setManualUpiInput] = useState<string>("");
  const [cameraLoading, setCameraLoading] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const deliveredOrderIdRef = useRef<string | null>(null);
  const isDeliveringUpiRef = useRef<boolean>(false);

  // 1. Fetch on-chain rate and limits on mount
  useEffect(() => {
    let isMounted = true;
    const fetchRateAndLimits = async () => {
      try {
        setRateLoading(true);
        const price = await getSellRate(currency);
        if (isMounted) setSellPrice(price);

        if (activeAddress) {
          try {
            const limits = await getOfframpLimits(activeAddress, currency);
            if (isMounted && limits?.sellLimit) {
              setMaxSellable(Number(limits.sellLimit));
            }
          } catch (limitErr) {
            console.warn(`[ScanAndPayFlow] Limits fetch warning, using ${currencyMeta.maxOrderFloorUsdc || 100} USDC baseline floor:`, limitErr);
            if (isMounted) setMaxSellable(currencyMeta.maxOrderFloorUsdc || 100);
          }
        }
      } catch (err: any) {
        console.error("[ScanAndPayFlow] Failed to fetch rates:", err);
        if (isMounted) setError("Unable to fetch live on-chain rate. Please try again.");
      } finally {
        if (isMounted) setRateLoading(false);
      }
    };

    fetchRateAndLimits();
    return () => { isMounted = false; };
  }, [activeAddress, currency, currencyMeta.maxOrderFloorUsdc]);

  // Rate Math Calculations
  const numericInr = parseFloat(amountInr) || 0;
  const rateInrPerUsdc = sellPrice ? Number(sellPrice) / 1_000_000 : 88.0;
  const baseUsdcPrincipal = rateInrPerUsdc > 0 ? numericInr / rateInrPerUsdc : 0;
  const fees = calculateOrderFees(baseUsdcPrincipal);
  const platformFeeUsdc = fees.zkPayFeeUsdc;
  const protocolFeeUsdc = fees.protocolFeeUsdc;
  const totalUsdcRequired = fees.totalRequiredUsdc;

  // 2. STEP 1 -> STEP 2: Place Order on-chain into escrow
  const handlePlaceOrder = async () => {
    if (!activeAddress) {
      login();
      return;
    }
    if (!sellPrice) {
      setError("Waiting for live on-chain exchange rate...");
      return;
    }
    if (numericInr <= 0) {
      setError(`Please enter a valid ${currencyMeta.code} amount.`);
      return;
    }

    try {
      setError(null);
      setStep("authorizing");

      const publicClient = getPublicClient();
      const senderAddress = activeAddress;

      const fiatPrincipal1e6 = BigInt(Math.floor(numericInr * 1_000_000));
      const usdcPrincipalBigInt = (fiatPrincipal1e6 * 1_000_000n) / sellPrice;
      const fiatFee1e6 = BigInt(Math.floor((numericInr * 0.01) * 1_000_000));
      const usdcFeeBigInt = (fiatFee1e6 * 1_000_000n) / sellPrice;

      const isSmallOrder = usdcPrincipalBigInt <= P2P_SMALL_ORDER_THRESHOLD_BIGINT;
      const protocolFeeBigInt = isSmallOrder ? P2P_SMALL_ORDER_FEE_BIGINT : 0n;
      const totalRequiredUsdcBigInt = usdcPrincipalBigInt + usdcFeeBigInt + protocolFeeBigInt;

      setUsdcAmountNum(Number(totalRequiredUsdcBigInt) / 1_000_000);

      // Verify on-chain balance
      const onChainBalance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [senderAddress],
      })) as bigint;

      const minGasBuffer = smartClient ? 10_000n : 0n; // 0.01 USDC buffer for ERC-20 paymaster gas
      if (onChainBalance < totalRequiredUsdcBigInt + minGasBuffer) {
        const balFloat = Number(onChainBalance) / 1_000_000;
        const reqFloat = Number(totalRequiredUsdcBigInt + minGasBuffer) / 1_000_000;
        const feeDetail = protocolFeeBigInt > 0n
          ? ` ($${(Number(usdcPrincipalBigInt) / 1e6).toFixed(2)} payment + $${(Number(usdcFeeBigInt) / 1e6).toFixed(2)} 1% fee + $${(Number(protocolFeeBigInt) / 1e6).toFixed(2)} protocol fee${smartClient ? " + ~$0.01 gas" : ""})`
          : ` ($${(Number(usdcPrincipalBigInt) / 1e6).toFixed(2)} payment + $${(Number(usdcFeeBigInt) / 1e6).toFixed(2)} 1% fee${smartClient ? " + ~$0.01 gas" : ""})`;
        throw new Error(
          `Insufficient USDC balance on Base. You have $${truncateTo2Decimals(balFloat)} USDC, but this payment requires $${reqFloat.toFixed(2)} USDC${feeDetail}.`
        );
      }

      // Check dynamic limits
      const effectiveLimit = maxSellable || 100;
      if (Number(usdcPrincipalBigInt) / 1_000_000 > effectiveLimit) {
        throw new Error(`Amount exceeds maximum single transaction limit of ${effectiveLimit} USDC.`);
      }

      const orderCall = await prepareOfframpOrder({
        userAddress: senderAddress,
        currency: currency,
        usdcAmount: usdcPrincipalBigInt,
        sellPrice: sellPrice,
      });

      const calls: { to: `0x${string}`; data: `0x${string}`; value: bigint }[] = [];

      // 1. Send 1% platform fee to Treasury
      if (usdcFeeBigInt > 0n) {
        calls.push({
          to: CONTRACTS.USDC as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [CONTRACTS.TREASURY as `0x${string}`, usdcFeeBigInt],
          }),
          value: 0n,
        });
      }

      // 2. Check allowance; Diamond pulls actualUsdtAmount (= principal + protocol fee) at setSellOrderUpi
      const currentAllowance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [senderAddress, CONTRACTS.DIAMOND],
      })) as bigint;

      const neededByDiamond = usdcPrincipalBigInt + protocolFeeBigInt;
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

      // 3. Place order into escrow
      calls.push({
        to: orderCall.to as `0x${string}`,
        data: orderCall.data as `0x${string}`,
        value: 0n,
      });

      let placedTxHash = "";
      let recordedFeeHash = "";

      // 1-Click Batched Smart Wallet Execution (gas paid in USDC via ERC-20 Paymaster)
      if (smartClient) {
        placedTxHash = await smartClient.sendTransaction({ calls });
        recordedFeeHash = placedTxHash;
        setFeeTxHash(placedTxHash);
      } else if (wallet) {
        // Fallback to sequential EOA calls if no smart account available
        const provider = await wallet.getEthereumProvider();
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i];
          const hash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: senderAddress,
              to: call.to,
              data: call.data,
            }],
          });
          await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
          if (i === 0 && usdcFeeBigInt > 0n) {
            recordedFeeHash = hash as string;
            setFeeTxHash(hash as string);
          }
          placedTxHash = hash as string;
        }
      }

      setTxHash(placedTxHash);

      // Parse orderId from receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: placedTxHash as `0x${string}` });
      const parsedOrderId = await parseOrderIdFromReceipt(receipt, activeAddress);

      if (parsedOrderId) {
        setOrderId(parsedOrderId);
        localStorage.setItem("pending_scan_order", JSON.stringify({
          orderId: parsedOrderId.toString(),
          hash: placedTxHash,
          amountINR: numericInr,
          amountUSDC: Number(totalRequiredUsdcBigInt) / 1_000_000,
        }));
      }

      // Immediately move to Step 3: Scan QR while matching liquidity!
      setStep("scanning_matching");
    } catch (err: any) {
      console.error("[ScanAndPayFlow] Order placement failed:", err);
      const parsed = await parseP2PError(err);
      setError(parsed.message || "Failed to place order.");
      setStep("amount");
    }
  };

  // 3. STEP 3: Background P2P Match Polling while user is scanning
  useEffect(() => {
    // Only poll while waiting for merchant match! Once matched or outside scanning_matching, stop immediately
    if (!orderId || step !== "scanning_matching" || merchantAcceptedOrder?.pubkey) return;

    let isPolling = true;
    const pollInterval = setInterval(async () => {
      try {
        const order = await getOrderStatus(orderId);
        if (!isPolling) return;

        if (order.status === "accepted" && order.pubkey) {
          setMerchantAcceptedOrder((prev: any) => {
            if (prev?.pubkey === order.pubkey && prev?.status === order.status) return prev;
            return order;
          });
        } else if (order.status === "completed") {
          setStep("completed");
          clearInterval(pollInterval);
        } else if (order.status === "cancelled") {
          setError("Order was cancelled by the network.");
          setStep("amount");
          clearInterval(pollInterval);
        }
      } catch (e) {
        console.warn("[ScanAndPayFlow] Error polling order status:", e);
      }
    }, 3000);

    return () => {
      isPolling = false;
      clearInterval(pollInterval);
    };
  }, [orderId, step, merchantAcceptedOrder?.pubkey]);

  // 4. STEP 3 Camera Scanner Setup
  const parseUpiString = useCallback((rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    // Check for Brazilian Pix (EMVCo or raw key)
    const pix = parsePixData(trimmed);
    if (pix.isValid && (pix.keyType === "emvco" || pix.pixKey)) {
      return {
        upiId: pix.pixKey || trimmed,
        name: pix.merchantName || (pix.keyType === "emvco" ? "Pix Merchant" : `Pix (${pix.keyType?.toUpperCase()})`),
      };
    }

    // Check for PayPal link, email, or handle
    const pp = parsePayPalData(trimmed);
    if (pp.isValid && pp.paypalId) {
      return {
        upiId: pp.paypalId,
        name: pp.name || "PayPal Recipient",
      };
    }

    // 1. Handle standard upi:// URI format safely across all browser environments
    if (trimmed.toLowerCase().startsWith("upi://")) {
      try {
        const queryIndex = trimmed.indexOf("?");
        const queryString = queryIndex !== -1 ? trimmed.slice(queryIndex + 1) : "";
        const params = new URLSearchParams(queryString);
        const upiId = params.get("pa") || "";
        let name = params.get("pn") || "";

        if (name) {
          name = decodeURIComponent(name.replace(/\+/g, " ")).trim();
        }
        
        if (!name && upiId) {
          name = formatUpiName(upiId);
        }

        if (upiId) {
          return { upiId, name: name || "Merchant" };
        }
      } catch (err) {
        console.warn("[parseUpiString] Error parsing UPI URI:", err);
      }
    }

    // 2. Handle raw UPI ID (e.g. merchant@okaxis)
    if (trimmed.includes("@")) {
      const match = trimmed.match(/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/);
      if (match) {
        const upiId = match[0];
        const name = formatUpiName(upiId);
        return { upiId, name };
      }
    }

    if (trimmed.startsWith("0x") && trimmed.length === 42) {
      return { upiId: trimmed, name: "Crypto Address" };
    }

    return null;
  }, []);

  const handleScanSuccess = useCallback((scannedText: string) => {
    const parsed = parseUpiString(scannedText);
    if (parsed && parsed.upiId) {
      setScannedUpi(parsed.upiId);
      setScannedMerchantName(parsed.name);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    }
  }, [parseUpiString]);

  useEffect(() => {
    if (step !== "scanning_matching" || scannedUpi) return;

    let isMounted = true;
    const scannerId = "p2p-camera-reader";

    const startCamera = async () => {
      try {
        setCameraLoading(true);
        setCameraError(null);
        await new Promise((r) => setTimeout(r, 200));
        if (!isMounted) return;

        const el = document.getElementById(scannerId);
        if (!el) return;

        const html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const scanConfig = {
          fps: 15,
          qrbox: (w: number, h: number) => {
            const min = Math.min(w, h);
            return { width: Math.floor(min * 0.82), height: Math.floor(min * 0.82) };
          },
          aspectRatio: 1.0,
        };

        try {
          await html5QrCode.start({ facingMode: "environment" }, scanConfig, handleScanSuccess, () => {});
        } catch {
          await html5QrCode.start({ facingMode: "user" }, scanConfig, handleScanSuccess, () => {});
        }

        if (isMounted) setCameraLoading(false);
      } catch (err) {
        if (isMounted) {
          setCameraLoading(false);
          setCameraError("Unable to access camera. Please enter the UPI ID manually below.");
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [step, scannedUpi, handleScanSuccess]);

  // 5. STEP 4: Deliver Encrypted UPI as soon as BOTH (QR is scanned AND Merchant is accepted)
  useEffect(() => {
    if (!orderId || !scannedUpi || !merchantAcceptedOrder?.pubkey || step !== "scanning_matching") return;

    const currentOrderIdStr = orderId.toString();
    if (deliveredOrderIdRef.current === currentOrderIdStr || isDeliveringUpiRef.current) {
      return;
    }

    isDeliveringUpiRef.current = true;
    deliveredOrderIdRef.current = currentOrderIdStr;

    const deliverUpi = async () => {
      try {
        setStep("delivering");
        // Use smartClient directly when available (email-only users have no primaryWallet)
        if (smartClient) {
          await sendPayoutAddress(smartClient as any, {
            orderId: orderId,
            paymentAddress: scannedUpi,
            merchantPublicKey: merchantAcceptedOrder.pubkey,
          });
        } else if (wallet) {
          const provider = await wallet.getEthereumProvider();
          const client = createWalletClient({
            account: wallet.address as `0x${string}`,
            chain: base,
            transport: custom(provider),
          });

          await sendPayoutAddress(client, {
            orderId: orderId,
            paymentAddress: scannedUpi,
            merchantPublicKey: merchantAcceptedOrder.pubkey,
          });
        } else {
          throw new Error("No wallet available to send payout address.");
        }

        const finalMerchantName = scannedMerchantName || (scannedUpi ? formatUpiName(scannedUpi) : "Merchant");

        // Save transaction to local history
        saveTransaction({
          hash: txHash || "",
          type: "payment",
          title: `Paid to ${finalMerchantName}`,
          amountINR: numericInr,
          amountUSDC: usdcAmountNum,
          fee: platformFeeUsdc,
          protocolFee: protocolFeeUsdc,
          recipient: scannedUpi,
          merchantName: finalMerchantName,
          orderId: orderId ? orderId.toString() : undefined,
          network: "Base",
          timestamp: Date.now(),
        });

        setStep("settling");

        // Wait for final on-chain completion
        const MAX_SETTLE_POLLS = 60;
        for (let i = 0; i < MAX_SETTLE_POLLS; i++) {
          const currentOrder = await getOrderStatus(orderId);
          if (currentOrder.status === "completed" || currentOrder.status === "paid") {
            setStep("completed");
            localStorage.removeItem("pending_scan_order");

            // Record monthly rewards for Scan & Pay (cashback & referral)
            if (activeAddress) {
              getAccessToken()
                .then((token) => {
                  return fetch("/api/rewards/record", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                      txHash,
                      feeTxHash,
                      orderId: orderId ? orderId.toString() : "",
                      principalUsdc: usdcAmountNum,
                      feeUsdc: platformFeeUsdc,
                      userAddress: activeAddress,
                    }),
                  });
                })
                .catch((err) => console.warn("[RewardsRecord] Ping error:", err));
            }

            break;
          }
          await new Promise(r => setTimeout(r, 3000));
        }
      } catch (err: any) {
        console.error("[ScanAndPayFlow] Failed to deliver encrypted UPI:", err);
        const parsed = await parseP2PError(err);
        setError(parsed.message || "Failed to deliver payout address.");
        isDeliveringUpiRef.current = false;
        deliveredOrderIdRef.current = null;
      }
    };

    deliverUpi();
  }, [orderId, scannedUpi, merchantAcceptedOrder?.pubkey, step, smartClient, wallet, txHash, feeTxHash, numericInr, usdcAmountNum, platformFeeUsdc, scannedMerchantName]);

  // ────────────── RENDER ──────────────

  return (
    <div className="fixed inset-0 z-[70] bg-surface text-on-surface font-sans flex flex-col overflow-y-auto min-h-[100dvh]">
      {/* Floating Header */}
      <header className="sticky top-3.5 z-50 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-xl mx-auto">
          <div className="pointer-events-auto px-4 py-2.5 rounded-full bg-surface-container-low/95 border border-primary/25 backdrop-blur-xl shadow-elevated flex items-center justify-between">
            <button
              onClick={onBack}
              disabled={step === "authorizing" || step === "delivering"}
              className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-on-surface transition-colors disabled:opacity-30 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Vault</span>
            </button>
            <div className="flex items-center gap-2 text-xs font-semibold text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span>{currencyMeta.code} / {currencyMeta.rail}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-5 pt-6 pb-32">
        {/* STEP 1: ENTER AMOUNT FIRST (WITH IN-APP NUMERIC KEYPAD) */}
        {step === "amount" && (
          <SpotlightCard className="p-5 sm:p-7 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated space-y-5">
            {/* Header / Subheader */}
            <div className="flex items-center justify-between pb-4 border-b border-primary/15">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight flex items-center gap-2">
                    <span>Scan &amp; Pay</span>
                  </h1>
                  <p className="text-xs text-on-surface-variant">
                    1. Amount / 2. Escrow / 3. Scan {currencyMeta.rail}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium text-on-surface-variant block">
                  Vault liquidity
                </span>
                <span className="text-xs font-mono tabular-nums font-bold text-primary">
                  ${availableUsdc.toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Recessed Numeric Input Well */}
            <div className="flex flex-col items-center justify-center py-4 px-4 rounded-2xl bg-surface-container border border-primary/15 relative overflow-hidden">
              <div className="w-full flex items-center justify-between mb-1 px-1">
                <span className="text-xs font-medium text-on-surface-variant">
                  Settlement amount ({currencyMeta.code})
                </span>
                <span className="text-xs font-semibold text-secondary">
                  {currencyMeta.rail}
                </span>
              </div>

              {/* Amount Display */}
              <div className="flex items-baseline justify-center my-2">
                <span className="font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums mr-1.5">
                  {currencyMeta.symbol}
                </span>
                <span className="font-mono text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-on-surface select-none">
                  {amountInr || "0"}
                </span>
                <span className="w-0.5 h-9 sm:h-11 bg-primary inline-block animate-pulse ml-1 rounded-full" />
              </div>

              {/* Live USD/USDC Conversion Subtext */}
              <div className="flex items-center gap-2 text-xs tabular-nums text-on-surface-variant mt-1">
                <span className="text-on-surface font-semibold">
                  ≈ <span className="font-mono">${totalUsdcRequired.toFixed(2)}</span> USDC
                </span>
                <span className="text-on-surface/20">/</span>
                <span className="font-mono text-primary">
                  {rateLoading ? "Syncing oracle…" : `1 USDC = ${currencyMeta.symbol}${rateInrPerUsdc.toFixed(2)}`}
                </span>
              </div>
            </div>

            {/* Quick Action Chips (Presets, Max, Clear) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={handleSetMax}
                disabled={availableUsdc <= 0}
                className="py-1.5 px-3 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-xs tabular-nums font-bold text-primary transition-colors shrink-0 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                Max
              </button>
              {PRESET_AMOUNTS.slice(0, 4).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAdd(amt)}
                  className="py-1.5 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-primary/15 font-mono text-xs tabular-nums text-on-surface-variant hover:text-on-surface transition-colors shrink-0 cursor-pointer whitespace-nowrap"
                >
                  +{currencyMeta.symbol}{amt}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="py-1.5 px-2.5 rounded-xl bg-error/10 hover:bg-error/20 border border-error/25 text-xs tabular-nums text-error font-semibold transition-colors shrink-0 ml-auto cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>

            {/* IN-APP NUMERIC KEYPAD */}
            <NumericKeypad
              value={amountInr}
              onChange={handleKeypadChange}
              onClear={handleClear}
              maxDecimals={2}
              maxDigits={7}
              className="py-1"
            />

            {/* Fee & Escrow Info Pill */}
            <div className="p-3.5 rounded-2xl bg-surface-container/90 border border-primary/15 flex flex-col gap-2 text-xs tabular-nums text-on-surface-variant">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>Platform fee (1%)</span>
                </div>
                <span className="text-on-surface font-mono font-bold">
                  ${platformFeeUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>Protocol fee</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">
                    {fees.isSmallOrder ? "<= $10 orders" : "Free > $10"}
                  </span>
                </div>
                <span className={fees.isSmallOrder ? "text-on-surface font-mono font-bold" : "text-secondary font-bold"}>
                  {fees.isSmallOrder ? `$${protocolFeeUsdc.toFixed(2)} USDC` : "Free"}
                </span>
              </div>
            </div>

            {/* Monthly Cashback Promo Pill */}
            <div className="p-3 rounded-2xl bg-secondary/10 border border-secondary/25 flex items-center justify-between text-xs tabular-nums text-secondary">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span className="font-semibold">Accrues monthly cashback</span>
              </div>
              <span className="text-xs text-on-surface-variant">Batch disbursed</span>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-xs tabular-nums text-error">
                {error}
              </div>
            )}

            {/* Action Button */}
            <ShimmerButton
              onClick={handlePlaceOrder}
              disabled={numericInr <= 0 || rateLoading}
              className="w-full py-4 rounded-2xl text-on-secondary font-bold text-xs whitespace-nowrap"
            >
              <span>
                Authorize &amp; place order ({currencyMeta.symbol}
                {numericInr > 0 ? numericInr.toFixed(2) : "0.00"})
              </span>
            </ShimmerButton>
          </SpotlightCard>
        )}

        {/* STEP 2: AUTHORIZING & ESCROWING USDC */}
        {step === "authorizing" && (
          <SpotlightCard className="p-8 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mx-auto">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">Locking Liquidity in Escrow</h2>
              <p className="text-xs text-on-surface-variant tabular-nums mt-1">
                Escrowing <span className="font-mono">${totalUsdcRequired.toFixed(2)}</span> USDC in P2P Diamond on Base L2
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container border border-primary/15 text-xs tabular-nums text-primary space-y-2">
              <p>Broadcasting gasless UserOperation on Base…</p>
              <div className="flex items-center justify-center gap-2 text-xs text-on-surface-variant">
                <span className="bg-surface-container-low border border-primary/15 px-2 py-0.5 rounded text-on-surface">
                  1. Fee routing (1%)
                </span>
                <span>/</span>
                <span className="bg-surface-container-low border border-primary/15 px-2 py-0.5 rounded text-on-surface">
                  2. Diamond escrow
                </span>
              </div>
            </div>
          </SpotlightCard>
        )}

        {/* STEP 3: SCAN QR CODE WHILE MATCHING IN BACKGROUND */}
        {step === "scanning_matching" && (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Real-Time Status Header */}
            <div className="p-4 rounded-2xl bg-secondary/10 border border-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary shrink-0" />
                <div>
                  <p className="text-xs font-bold text-secondary font-mono tabular-nums">
                    {orderId
                      ? `Order #${orderId.toString()} escrowed (${currencyMeta.symbol}${numericInr.toFixed(2)})`
                      : `${currencyMeta.symbol}${numericInr.toFixed(2)} in escrow`}
                  </p>
                  <p className="text-xs text-on-surface tabular-nums">
                    {merchantAcceptedOrder ? "LP node locked & ready" : "Matching LP node in background…"}
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-primary font-bold">
                ${totalUsdcRequired.toFixed(2)} USDC
              </div>
            </div>

            {/* Recipient Scanned Confirmation OR Camera Viewfinder */}
            {scannedUpi ? (
              <SpotlightCard className="p-6 md:p-8 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated space-y-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-secondary/15 border border-secondary/40 text-secondary flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Merchant Target Locked</h3>
                  <p className="text-sm font-mono tabular-nums text-primary mt-1">{scannedUpi}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-surface-container border border-primary/15 text-xs tabular-nums text-on-surface-variant flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>
                    {merchantAcceptedOrder
                      ? "Encrypting & delivering payload via ECIES…"
                      : "Awaiting LP node signature…"}
                  </span>
                </div>
              </SpotlightCard>
            ) : (
              <SpotlightCard className="p-6 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated space-y-5">
                <div className="text-center">
                  <span className="text-xs font-semibold text-secondary block mb-1">
                    Optical QR telemetry
                  </span>
                  <h2 className="text-lg font-bold text-on-surface">Scan Merchant {currencyMeta.rail} QR</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Supports {currencyMeta.railDescription}
                  </p>
                </div>

                {/* Camera Viewfinder Box with Machined Corner Reticles */}
                <div className="relative w-full aspect-square max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-surface-container border border-primary/25 flex items-center justify-center">
                  <div id="p2p-camera-reader" className="w-full h-full object-cover" />
                  {/* Corner Optical Reticles */}
                  <div className="pointer-events-none absolute inset-4">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-secondary rounded-tl-md" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-secondary rounded-tr-md" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-secondary rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-secondary rounded-br-md" />
                  </div>
                  {cameraLoading && (
                    <div className="absolute inset-0 bg-surface-container/90 flex flex-col items-center justify-center gap-2 text-xs text-on-surface-variant">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <span>Initializing optical sensor…</span>
                    </div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 bg-surface-container/95 p-4 flex flex-col items-center justify-center text-center gap-2 text-xs text-error">
                      <CameraOff className="w-8 h-8" />
                      <span>{cameraError}</span>
                    </div>
                  )}
                </div>

                {/* Manual Input Fallback */}
                <div className="pt-3 border-t border-primary/15 space-y-2">
                  <span className="text-xs font-semibold text-on-surface-variant block">
                    Or enter {currencyMeta.rail} ID manually
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={currencyMeta.placeholder}
                      value={manualUpiInput}
                      onChange={(e) => setManualUpiInput(e.target.value)}
                      className="flex-1 p-3 rounded-xl bg-surface-container border border-primary/20 text-xs font-mono tabular-nums text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleScanSuccess(manualUpiInput)}
                      disabled={!manualUpiInput.trim()}
                      className="px-4 py-3 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      Lock
                    </button>
                  </div>
                </div>
              </SpotlightCard>
            )}
          </div>
        )}

        {/* STEP 4 & 5: DELIVERING ENCRYPTED PAYLOAD & SETTLING */}
        {(step === "delivering" || step === "settling") && (
          <SpotlightCard className="p-8 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mx-auto">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {step === "delivering"
                  ? `Encrypting & Routing ${currencyMeta.rail}`
                  : `Settling ${currencyMeta.code} Instant Rail`}
              </h2>
              <p className="text-xs text-on-surface-variant tabular-nums mt-1">
                {step === "delivering"
                  ? `Delivering ${scannedUpi} via ECIES secp256k1 to matched LP node`
                  : `LP node is disbursing ${currencyMeta.symbol}${numericInr.toFixed(2)} over ${currencyMeta.rail} rails`}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-surface-container border border-primary/15 text-xs font-mono tabular-nums text-primary">
              {orderId ? `Order #${orderId.toString()} / escrow verified` : "Settling on Base L2…"}
            </div>
          </SpotlightCard>
        )}

        {/* STEP 6: COMPLETED SUCCESS RECEIPT */}
        {step === "completed" && (
          <SpotlightCard className="p-6 sm:p-7 bg-surface-container-low border border-primary/20 rounded-3xl shadow-elevated text-center space-y-5 animate-in zoom-in-95 duration-500">
            {/* Verification Badge */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="relative w-16 h-16 rounded-2xl border border-secondary/40 bg-surface-container flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-secondary" />
              </div>
            </div>

            <div>
              <span className="text-xs text-secondary font-semibold">
                Settlement verified
              </span>
              <h2 className="font-mono text-4xl font-black text-on-surface tracking-tight mt-1 tabular-nums">
                {currencyMeta.symbol}
                {numericInr.toFixed(2)}
              </h2>
              <p className="text-xs text-on-surface-variant tabular-nums mt-1">
                ≈ <span className="font-mono">${usdcAmountNum.toFixed(2)}</span> USDC
              </p>

              {/* Dynamic Merchant Name or Zero-Knowledge Status Badge */}
              <div className="mt-3">
                {scannedMerchantName || (scannedUpi ? formatUpiName(scannedUpi) : null) ? (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-container border border-primary/20 text-on-surface text-xs font-medium">
                    <Store className="w-3.5 h-3.5 text-primary" />
                    <span>
                      Settled to{" "}
                      <strong className="text-on-surface font-semibold">
                        {scannedMerchantName || formatUpiName(scannedUpi)}
                      </strong>
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/25 text-secondary text-xs font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Zero-knowledge proof verified</span>
                  </div>
                )}
              </div>

              {/* Monthly Cashback Celebration Pill */}
              <div className="mt-3 p-3 rounded-2xl bg-secondary/10 border border-secondary/25 flex items-center justify-between text-xs tabular-nums text-secondary">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-secondary shrink-0" />
                  <span className="font-bold">Added to monthly cashback pool</span>
                </div>
                <span className="text-xs text-on-surface-variant">Month-end</span>
              </div>
            </div>

            {/* Receipt Table */}
            <div className="p-4 rounded-2xl bg-surface-container border border-primary/15 space-y-2.5 text-xs tabular-nums text-left">
              {orderId && (
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Order ID</span>
                  <span className="font-mono text-primary font-bold">#{orderId.toString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Recipient ({currencyMeta.rail})</span>
                <span className="font-mono text-on-surface font-bold truncate max-w-[200px]">{scannedUpi}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Network</span>
                <span className="text-on-surface text-xs">Base L2 (gasless)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-on-surface-variant">Fees</span>
                <span className="font-mono text-on-surface text-xs">
                  ${platformFeeUsdc.toFixed(2)} platform /{" "}
                  {protocolFeeUsdc > 0 ? `$${protocolFeeUsdc.toFixed(2)} protocol` : "Free protocol"}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-primary/15">
                <span className="text-primary font-semibold">Total debited</span>
                <span className="font-mono text-on-surface font-bold">
                  ${(usdcAmountNum + protocolFeeUsdc).toFixed(2)} USDC
                </span>
              </div>
              {txHash && (
                <div className="pt-2 border-t border-primary/15 flex justify-between items-center">
                  <span className="text-on-surface-variant">Basescan proof</span>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:text-on-surface flex items-center gap-1 text-xs"
                  >
                    <span>
                      {txHash.slice(0, 8)}…{txHash.slice(-6)}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={onBack}
                className="w-full py-3.5 rounded-xl bg-secondary hover:brightness-110 text-on-secondary font-bold text-xs transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
              >
                Return to Vault
              </button>

              <div className="grid grid-cols-2 gap-2">
                {txHash && (
                  <button
                    onClick={() => router.push(`/tx/${txHash}`)}
                    className="py-2.5 px-3 rounded-xl bg-surface-container border border-primary/20 hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Full Receipt
                  </button>
                )}
                <button
                  onClick={async () => {
                    const finalName =
                      scannedMerchantName || (scannedUpi ? formatUpiName(scannedUpi) : "Merchant");
                    const shareText = `ZkPay Settlement Receipt\nAmount: ${currencyMeta.symbol}${numericInr.toFixed(2)} (${currencyMeta.code})\nRecipient: ${finalName} (${scannedUpi})\nOrder ID: #${orderId ? orderId.toString() : "N/A"}\nStatus: Settled via ${currencyMeta.rail}`;
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: "ZkPay Receipt", text: shareText });
                        return;
                      } catch {}
                    }
                    await navigator.clipboard.writeText(shareText);
                    alert("Receipt copied to clipboard!");
                  }}
                  className={`py-2.5 px-3 rounded-xl bg-surface-container border border-primary/20 hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    !txHash ? "col-span-2" : ""
                  }`}
                >
                  Share Receipt
                </button>
              </div>
            </div>
          </SpotlightCard>
        )}
      </main>
    </div>
  );
}
