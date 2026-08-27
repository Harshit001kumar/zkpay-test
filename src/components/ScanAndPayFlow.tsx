"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { formatUnits, encodeFunctionData, createWalletClient, custom } from "viem";
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
  parseP2PError 
} from "@/lib/p2pkit";
import { saveTransaction } from "@/lib/history";
import { 
  ArrowLeft, 
  QrCode, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  ExternalLink, 
  CameraOff, 
  Sparkles,
  Store,
  Wallet,
  RefreshCw,
  Send
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";

type FlowStep = "amount" | "authorizing" | "scanning_matching" | "delivering" | "settling" | "completed";

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2000];

export default function ScanAndPayFlow({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const { login, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets?.[0];

  // Flow State
  const [step, setStep] = useState<FlowStep>("amount");
  const [amountInr, setAmountInr] = useState<string>("150");
  const [sellPrice, setSellPrice] = useState<bigint | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [maxSellable, setMaxSellable] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Available Base USDC balance (formatted to 2 decimal places)
  const { data: rawBal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [wallet?.address as `0x${string}` ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: !!wallet?.address,
      refetchInterval: 5000,
    },
  });

  const availableUsdc = rawBal !== undefined ? Number(formatUnits(rawBal as bigint, 6)) : 0;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
      setAmountInr(val);
    }
  };

  // Order & P2P State
  const [orderId, setOrderId] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [usdcAmountNum, setUsdcAmountNum] = useState<number>(0);
  const [merchantAcceptedOrder, setMerchantAcceptedOrder] = useState<any | null>(null);

  // Scanner & Recipient State
  const [scannedUpi, setScannedUpi] = useState<string>("");
  const [scannedMerchantName, setScannedMerchantName] = useState<string>("");
  const [manualUpiInput, setManualUpiInput] = useState<string>("");
  const [cameraLoading, setCameraLoading] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 1. Fetch on-chain rate and limits on mount
  useEffect(() => {
    let isMounted = true;
    const fetchRateAndLimits = async () => {
      try {
        setRateLoading(true);
        const price = await getSellRate("INR");
        if (isMounted) setSellPrice(price);

        if (wallet?.address) {
          const limits = await getOfframpLimits(wallet.address as `0x${string}`, "INR");
          if (isMounted && limits?.maxSellableUsdc) {
            setMaxSellable(limits.maxSellableUsdc);
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
  }, [wallet?.address]);

  // Rate Math Calculations
  const numericInr = parseFloat(amountInr) || 0;
  const rateInrPerUsdc = sellPrice ? Number(sellPrice) / 1_000_000 : 88.0;
  const baseUsdcPrincipal = rateInrPerUsdc > 0 ? numericInr / rateInrPerUsdc : 0;
  const platformFeeUsdc = baseUsdcPrincipal * 0.01; // 1% fee
  const totalUsdcRequired = baseUsdcPrincipal + platformFeeUsdc;

  // 2. STEP 1 -> STEP 2: Place Order on-chain into escrow
  const handlePlaceOrder = async () => {
    if (!wallet || !wallet.address) {
      login();
      return;
    }
    if (!sellPrice) {
      setError("Waiting for live on-chain exchange rate...");
      return;
    }
    if (numericInr <= 0) {
      setError("Please enter a valid INR amount.");
      return;
    }

    try {
      setError(null);
      setStep("authorizing");

      const provider = await wallet.getEthereumProvider();
      const publicClient = getPublicClient();

      const fiatPrincipal1e6 = BigInt(Math.floor(numericInr * 1_000_000));
      const usdcPrincipalBigInt = (fiatPrincipal1e6 * 1_000_000n) / sellPrice;
      const fiatFee1e6 = BigInt(Math.floor((numericInr * 0.01) * 1_000_000));
      const usdcFeeBigInt = (fiatFee1e6 * 1_000_000n) / sellPrice;
      const totalRequiredUsdcBigInt = usdcPrincipalBigInt + usdcFeeBigInt;

      setUsdcAmountNum(Number(totalRequiredUsdcBigInt) / 1_000_000);

      // Verify on-chain balance
      const onChainBalance = (await publicClient.readContract({
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [wallet.address as `0x${string}`],
      })) as bigint;

      if (onChainBalance < totalRequiredUsdcBigInt) {
        const balFloat = Number(onChainBalance) / 1_000_000;
        const reqFloat = Number(totalRequiredUsdcBigInt) / 1_000_000;
        throw new Error(
          `Insufficient USDC balance on Base. You have $${balFloat.toFixed(2)} USDC, but this payment requires $${reqFloat.toFixed(2)} USDC ($${(Number(usdcPrincipalBigInt) / 1e6).toFixed(2)} payment + $${(Number(usdcFeeBigInt) / 1e6).toFixed(2)} fee).`
        );
      }

      // Check dynamic limits
      const effectiveLimit = maxSellable || 100;
      if (Number(usdcPrincipalBigInt) / 1_000_000 > effectiveLimit) {
        throw new Error(`Amount exceeds maximum single transaction limit of ${effectiveLimit} USDC.`);
      }

      const orderCall = await prepareOfframpOrder({
        userAddress: wallet.address as `0x${string}`,
        currency: "INR",
        usdcAmount: usdcPrincipalBigInt,
        sellPrice: sellPrice,
      });

      const calls = [];

      // 1. Send 1% platform fee to Treasury
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

      // 2. Approve allowance if needed
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

      // 3. Place order into escrow
      calls.push({
        to: orderCall.to,
        data: orderCall.data,
      });

      let placedTxHash = "";

      try {
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
            placedTxHash = statusRes.receipts[0].transactionHash || statusRes.receipts[0].blockHash;
            break;
          }
          if (statusRes.status === "FAILED" || statusRes.status === "REJECTED") {
            throw new Error(`Transaction ${statusRes.status.toLowerCase()} by wallet`);
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (batchErr: any) {
        // Fallback to sequential EOA calls
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
          placedTxHash = hash as string;
        }
      }

      setTxHash(placedTxHash);

      // Parse orderId from receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: placedTxHash as `0x${string}` });
      const { toEventSelector } = await import("viem");
      const orderPlacedTopic0 = toEventSelector("OrderPlaced(uint256,address,uint256,bytes32,uint256,uint256,uint256)");
      
      let parsedOrderId: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.topics.length >= 2 && log.topics[0] === orderPlacedTopic0) {
          try {
            const topic = log.topics[1];
            if (topic) {
              parsedOrderId = BigInt(topic);
              break;
            }
          } catch {}
        }
      }

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
      setError(parseP2PError(err));
      setStep("amount");
    }
  };

  // 3. STEP 3: Background P2P Match Polling while user is scanning
  useEffect(() => {
    if (!orderId || (step !== "scanning_matching" && step !== "delivering")) return;

    let isPolling = true;
    const pollInterval = setInterval(async () => {
      try {
        const order = await getOrderStatus(orderId);
        if (!isPolling) return;

        if (order.status === "accepted" && order.pubkey) {
          setMerchantAcceptedOrder(order);
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
    }, 2500);

    return () => {
      isPolling = false;
      clearInterval(pollInterval);
    };
  }, [orderId, step]);

  // 4. STEP 3 Camera Scanner Setup
  const parseUpiString = useCallback((rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    if (trimmed.toLowerCase().startsWith("upi://pay")) {
      try {
        const url = new URL(trimmed);
        const upiId = url.searchParams.get("pa") || "";
        const name = url.searchParams.get("pn") || "Merchant";
        return { upiId, name };
      } catch {}
    }

    if (trimmed.includes("@") && !trimmed.includes(" ")) {
      return { upiId: trimmed, name: trimmed.split("@")[0] };
    }

    if (trimmed.startsWith("0x")) {
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

    let isExecuting = false;
    const deliverUpi = async () => {
      if (isExecuting) return;
      isExecuting = true;

      try {
        setStep("delivering");
        const wallet = wallets?.[0];
        if (!wallet) throw new Error("Wallet not connected");

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

        // Save transaction to local history
        saveTransaction({
          hash: txHash || "",
          type: "payment",
          title: `Paid to ${scannedMerchantName || scannedUpi}`,
          amountINR: numericInr,
          amountUSDC: usdcAmountNum,
          fee: platformFeeUsdc,
          recipient: scannedUpi,
          network: "Base Mainnet",
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
            break;
          }
          await new Promise(r => setTimeout(r, 2500));
        }
      } catch (err: any) {
        console.error("[ScanAndPayFlow] Failed to deliver encrypted UPI:", err);
        setError(parseP2PError(err));
      }
    };

    deliverUpi();
  }, [orderId, scannedUpi, merchantAcceptedOrder, step, wallets, txHash, numericInr, usdcAmountNum, platformFeeUsdc, scannedMerchantName]);

  // ────────────── RENDER ──────────────

  return (
    <div className="fixed inset-0 z-50 bg-[#131315] text-[#e5e2e3] font-sans flex flex-col overflow-y-auto min-h-[100dvh]">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#c0c6de]/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 -right-40 w-96 h-96 bg-[#8a92a6]/5 rounded-full blur-[140px]" />
      </div>

      {/* Top App Bar */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-2xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={step === "authorizing" || step === "delivering"}
          className="inline-flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#909097] hover:text-[#e5e2e3] transition-colors disabled:opacity-30"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK</span>
        </button>
        <div className="flex items-center gap-2 text-xs font-mono text-[#c0c6de]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>BASE MAINNET (8453)</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl mx-auto w-full px-5 py-6 md:py-8">
        
        {/* STEP 1: ENTER INR AMOUNT FIRST */}
        {step === "amount" && (
          <SpotlightCard className="p-6 md:p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] space-y-6">
            <div className="flex items-center gap-3 pb-5 border-b border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de]">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  Scan & Pay
                </h1>
                <p className="text-xs text-[#909097] font-mono">
                  1. Enter Amount ➔ 2. Place Escrow ➔ 3. Scan QR
                </p>
              </div>
            </div>

            {/* INR Input Field */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                  PAYMENT AMOUNT (INR)
                </label>
                <span className="text-[11px] font-mono text-[#c0c6de]">
                  Balance: ${availableUsdc.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex items-center p-4 rounded-2xl bg-black/40 border border-white/10 focus-within:border-[#c0c6de] transition-colors">
                <span className="text-3xl md:text-4xl font-extrabold text-[#c0c6de] font-mono mr-2">
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amountInr}
                  onChange={handleAmountChange}
                  autoFocus
                  className="bg-transparent border-none p-0 text-3xl md:text-4xl font-extrabold text-white focus:outline-none w-full font-mono tracking-tight"
                />
              </div>

              {/* Preset Chips */}
              <div className="flex gap-2 pt-1 overflow-x-auto pb-1">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountInr(amt.toFixed(2))}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#c6c6cd] hover:text-white transition-colors shrink-0"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Exchange & Fee Breakdown Card */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between items-center text-[#909097]">
                <span>On-Chain Rate</span>
                <span className="text-white font-bold">
                  {rateLoading ? "Fetching..." : `1 USDC ≈ ₹${rateInrPerUsdc.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between items-center text-[#909097]">
                <span>Principal Amount</span>
                <span className="text-white">${baseUsdcPrincipal.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between items-center text-[#909097]">
                <span>Platform Fee (1%)</span>
                <span className="text-[#c0c6de]">${platformFeeUsdc.toFixed(2)} USDC</span>
              </div>
              <div className="h-px bg-white/10 my-1" />
              <div className="flex justify-between items-center text-sm font-bold">
                <span className="text-white">Total Required</span>
                <span className="text-white text-base">${totalUsdcRequired.toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-xs text-[#ffb4ab]">
                {error}
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={numericInr <= 0 || rateLoading}
              className="w-full py-4 rounded-2xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Authorize & Place Order (₹{numericInr || 0})</span>
            </button>
          </SpotlightCard>
        )}

        {/* STEP 2: AUTHORIZING & ESCROWING USDC */}
        {step === "authorizing" && (
          <SpotlightCard className="p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de] mx-auto animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Placing Order into Escrow</h2>
              <p className="text-xs text-[#909097] font-mono mt-1">
                Locking ${totalUsdcRequired.toFixed(2)} USDC into P2P Diamond contract on Base
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs font-mono text-[#c0c6de]">
              Please confirm the transaction in your wallet...
            </div>
          </SpotlightCard>
        )}

        {/* STEP 3: SCAN QR CODE WHILE MATCHING IN BACKGROUND */}
        {step === "scanning_matching" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Real-Time Status Header */}
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <div>
                  <p className="text-xs font-bold text-emerald-400 font-mono uppercase">
                    {orderId ? `Order #${orderId.toString()} Escrowed (₹${numericInr})` : `₹${numericInr} In Escrow`}
                  </p>
                  <p className="text-[11px] text-[#c6c6cd] font-mono">
                    {merchantAcceptedOrder ? "✅ P2P Merchant Ready!" : "Matching liquidity in background..."}
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono text-[#c0c6de] font-bold">
                ${totalUsdcRequired.toFixed(2)} USDC
              </div>
            </div>

            {/* Recipient Scanned Confirmation OR Camera Viewfinder */}
            {scannedUpi ? (
              <SpotlightCard className="p-6 md:p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl space-y-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Merchant Identified</h3>
                  <p className="text-sm font-mono text-[#c0c6de] mt-1">{scannedUpi}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs font-mono text-[#909097] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#c0c6de]" />
                  <span>
                    {merchantAcceptedOrder 
                      ? "Delivering encrypted payment details..." 
                      : "Connecting with matched merchant..."}
                  </span>
                </div>
              </SpotlightCard>
            ) : (
              <SpotlightCard className="p-6 bg-[#1b1b1d] border border-white/15 rounded-3xl space-y-5">
                <div className="text-center">
                  <h2 className="text-lg font-bold text-white">Point Camera at Merchant QR</h2>
                  <p className="text-xs text-[#909097] font-mono mt-0.5">
                    Works with Google Pay, PhonePe, Paytm, BharatPe, or Any UPI QR
                  </p>
                </div>

                {/* Camera Viewfinder Box */}
                <div className="relative w-full aspect-square max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-black border border-white/15 flex items-center justify-center">
                  <div id="p2p-camera-reader" className="w-full h-full object-cover" />
                  {cameraLoading && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-xs font-mono text-[#909097]">
                      <Loader2 className="w-6 h-6 animate-spin text-[#c0c6de]" />
                      <span>Starting Camera...</span>
                    </div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 bg-black/90 p-4 flex flex-col items-center justify-center text-center gap-2 text-xs font-mono text-[#ffb4ab]">
                      <CameraOff className="w-8 h-8" />
                      <span>{cameraError}</span>
                    </div>
                  )}
                </div>

                {/* Manual UPI Input Fallback */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <span className="text-[10px] font-label-caps text-[#909097] tracking-widest uppercase font-bold">
                    OR TYPE UPI ID MANUALLY
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. merchant@okaxis"
                      value={manualUpiInput}
                      onChange={(e) => setManualUpiInput(e.target.value)}
                      className="flex-1 p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder:text-[#909097]/40 focus:border-[#c0c6de] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleScanSuccess(manualUpiInput)}
                      disabled={!manualUpiInput.trim()}
                      className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-mono font-bold transition-all disabled:opacity-40"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </SpotlightCard>
            )}
          </div>
        )}

        {/* STEP 4 & 5: DELIVERING ENCRYPTED UPI & SETTLING */}
        {(step === "delivering" || step === "settling") && (
          <SpotlightCard className="p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de] mx-auto animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {step === "delivering" ? "Encrypting & Delivering UPI" : "Merchant Settling Fiat"}
              </h2>
              <p className="text-xs text-[#909097] font-mono mt-1">
                {step === "delivering" 
                  ? `Delivering ${scannedUpi} encrypted via ECIES to matched merchant`
                  : `Merchant is transferring ₹${numericInr} via UPI instant rails`}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs font-mono text-[#c0c6de]">
              {orderId ? `Order #${orderId.toString()} • Safe On-Chain Escrow` : "Processing on Base..."}
            </div>
          </SpotlightCard>
        )}

        {/* STEP 6: COMPLETED SUCCESS RECEIPT */}
        {step === "completed" && (
          <SpotlightCard className="p-8 bg-[#1b1b1d] border border-white/15 rounded-3xl text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Payment Successful!</h2>
              <p className="text-xs text-[#909097] font-mono mt-1">
                Settled in Indian Rupees directly to merchant
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-3 text-xs font-mono text-left">
              <div className="flex justify-between">
                <span className="text-[#909097]">Amount Paid</span>
                <span className="text-white font-bold text-sm">₹{numericInr.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#909097]">Crypto Settled</span>
                <span className="text-white">${usdcAmountNum.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#909097]">Recipient UPI</span>
                <span className="text-[#c0c6de] font-bold">{scannedUpi}</span>
              </div>
              {txHash && (
                <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                  <span className="text-[#909097]">Base Receipt</span>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#c0c6de] hover:underline flex items-center gap-1"
                  >
                    <span>Basescan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={onBack}
              className="w-full py-4 rounded-2xl bg-[#e5e2e3] hover:bg-white text-[#131315] font-bold text-xs tracking-[0.2em] font-label-caps uppercase transition-all shadow-lg hover:shadow-white/10 cursor-pointer"
            >
              Done / Return to Dashboard
            </button>
          </SpotlightCard>
        )}

      </main>
    </div>
  );
}
