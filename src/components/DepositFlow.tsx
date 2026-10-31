"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState, useEffect } from "react";
import { DEPOSIT_ASSETS, TARGET_ASSET } from "@/lib/constants";
import {
  Copy,
  Check,
  Loader2,
  RefreshCw,
  ChevronDown,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Coins,
  ShieldCheck,
} from "lucide-react";

export default function DepositFlow({ onBack }: { onBack?: () => void }) {
  const { ready, authenticated, address } = useActiveAccount();
  const { wallets } = useWallets();

  // Step 1: Input state
  type DepositAsset = typeof DEPOSIT_ASSETS[number];
  const [sourceAsset, setSourceAsset] = useState<DepositAsset>(DEPOSIT_ASSETS[0]);
  const [depositAmount, setDepositAmount] = useState("0.01");
  const [refundAddress, setRefundAddress] = useState("");
  const [estimatedReceive, setEstimatedReceive] = useState<string | null>(null);
  const [timeEstimate, setTimeEstimate] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isAssetSelectOpen, setIsAssetSelectOpen] = useState(false);

  // Step 2: Deposit address state
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [depositMemo, setDepositMemo] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [exchangeStatus, setExchangeStatus] = useState<string>("waiting");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [deadlineRemaining, setDeadlineRemaining] = useState<string | null>(null);

  // Convert human amount to smallest units
  const toSmallestUnits = (amount: string, decimals: number): string => {
    try {
      const num = parseFloat(amount);
      if (isNaN(num) || num <= 0) return "0";
      // Use BigInt for precision
      const factor = BigInt(10 ** decimals);
      const whole = BigInt(Math.floor(num));
      const fractional = amount.includes(".")
        ? amount.split(".")[1].padEnd(decimals, "0").slice(0, decimals)
        : "0".repeat(decimals);
      return (whole * factor + BigInt(fractional)).toString();
    } catch {
      return "0";
    }
  };

  // Estimate effect
  useEffect(() => {
    const fetchEstimate = async () => {
      if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0 || !address) {
        setEstimatedReceive("0");
        setTimeEstimate(null);
        return;
      }
      setIsEstimating(true);
      try {
        const amountInUnits = toSmallestUnits(depositAmount, sourceAsset.decimals);
        if (amountInUnits === "0") {
          setEstimatedReceive("0");
          setIsEstimating(false);
          return;
        }
        const refundParam = refundAddress ? `&refundTo=${encodeURIComponent(refundAddress)}` : "";
        const res = await fetch(
          `/api/exchange/estimate?originAssetId=${encodeURIComponent(sourceAsset.assetId)}&amount=${amountInUnits}&recipientAddress=${address}${refundParam}`
        );
        const data = await res.json();
        if (res.ok && data.estimatedAmount) {
          setEstimatedReceive(data.estimatedAmount.toString());
          setTimeEstimate(data.timeEstimate || null);
        } else {
          setEstimatedReceive(`Error: ${data.error || data.message || "Unknown"}`);
          setTimeEstimate(null);
        }
      } catch (err: any) {
        setEstimatedReceive(`Error: ${err.message}`);
        setTimeEstimate(null);
      }
      setIsEstimating(false);
    };

    const delayDebounceFn = setTimeout(() => {
      fetchEstimate();
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [depositAmount, sourceAsset, address, refundAddress]);

  // Status polling by deposit address
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (depositAddress && exchangeStatus !== "settled" && exchangeStatus !== "failed" && exchangeStatus !== "expired" && exchangeStatus !== "refunded") {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/exchange/status?depositAddress=${encodeURIComponent(depositAddress)}`);
          const data = await res.json();
          if (data.status) {
            setExchangeStatus(data.status);
          }
        } catch (error) {
          console.error("Failed to poll status", error);
        }
      }, 8000);
    }
    return () => clearInterval(interval);
  }, [depositAddress, exchangeStatus]);

  // Deadline countdown
  useEffect(() => {
    if (!deadline) {
      setDeadlineRemaining(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(deadline).getTime() - Date.now();
      if (remaining <= 0) {
        setDeadlineRemaining("Expired");
        if (exchangeStatus === "pending" || exchangeStatus === "waiting") {
          setExchangeStatus("expired");
        }
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setDeadlineRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, exchangeStatus]);

  if (!ready || (authenticated && !address)) {
    return (
      <div className="bg-surface-container-lowest text-on-surface min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-outline">Initializing wallet account…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="bg-surface-container-lowest text-on-surface min-h-[100dvh] flex flex-col items-center justify-center p-6 gap-4 text-center">
        <p className="text-sm text-outline">Please sign in to make a deposit.</p>
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs font-semibold"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const baseAddress = address;

  const handleCreateDeposit = async () => {
    setIsCreating(true);
    setDepositError(null);
    try {
      const amountInUnits = toSmallestUnits(depositAmount, sourceAsset.decimals);
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originAssetId: sourceAsset.assetId,
          amount: amountInUnits,
          settleAddress: baseAddress,
          refundTo: refundAddress.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.payinAddress) {
        setDepositAddress(data.payinAddress);
        setDepositMemo(data.depositMemo || null);
        setDeadline(data.deadline || null);
        setExchangeStatus("pending");
      } else {
        setDepositError(data.error || "Failed to create deposit address. Please try again.");
      }
    } catch (error) {
      setDepositError("Network error: could not reach exchange service.");
    }
    setIsCreating(false);
  };

  const copyAddress = () => {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMemo = () => {
    if (!depositMemo) return;
    navigator.clipboard.writeText(depositMemo);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  const getStatusText = (status: string) => {
    const states: Record<string, string> = {
      pending: "Waiting for deposit...",
      processing: "Swapping to USDC...",
      settling: "Finalizing...",
      settled: "Deposit Complete",
      failed: "Failed",
      refunded: "Refunded",
      expired: "Window Expired",
    };
    return states[status] || status;
  };

  return (
    <div className="bg-[#050608] text-[#e5e5e8] font-sans selection:bg-[#2970FF]/30 min-h-[100dvh] flex flex-col z-[70] fixed inset-0 overflow-y-auto">
      {/* Floating Double-Bezel Header */}
      <header className="sticky top-3.5 z-50 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-lg mx-auto">
          <div className="pointer-events-auto p-1 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
            <div className="px-4 py-2 rounded-full bg-[#0B0E14]/95 border border-white/[0.06] flex items-center justify-between">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] font-bold text-[#2970FF] hover:text-white transition-colors active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>VAULT</span>
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8d90a1] font-bold">
                NEAR 1CLICK // BRIDGE TO BASE
              </span>
              <span className="w-2 h-2 rounded-full bg-[#CCFF00]" />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-lg mx-auto px-4 sm:px-6 pt-6 pb-36 space-y-4">
        {/* Source Chain & Asset Selector */}
        <section className="relative z-30">
          <div className="p-1.5 rounded-[26px] bg-white/[0.025] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => !depositAddress && setIsAssetSelectOpen(!isAssetSelectOpen)}
              className={`w-full bg-[#0B0E14] border border-white/[0.06] p-4 sm:p-5 rounded-[20px] flex items-center justify-between group transition-colors ${
                depositAddress ? "opacity-60 cursor-not-allowed" : "hover:bg-[#17181c] active:scale-[0.99] cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#111622] border border-white/[0.1] flex items-center justify-center text-[#2970FF]">
                  <Coins className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8d90a1] block">
                    ORIGIN ASSET
                  </span>
                  <p className="font-bold text-white text-base tracking-tight">{sourceAsset.name}</p>
                  <p className="font-mono text-[10px] text-[#CCFF00] uppercase tracking-[0.14em] font-semibold">
                    {sourceAsset.blockchain.toUpperCase()} NETWORK
                  </p>
                </div>
              </div>
              {!depositAddress && (
                <ChevronDown className="w-5 h-5 text-[#8d90a1] group-hover:text-white transition-colors" />
              )}
            </button>
          </div>

          {isAssetSelectOpen && !depositAddress && (
            <div className="absolute top-full left-0 right-0 mt-2 p-1.5 rounded-[24px] bg-[#0B0E14]/98 border border-white/[0.12] shadow-[0_30px_80px_rgba(0,0,0,0.95)] z-40 max-h-80 overflow-y-auto backdrop-blur-2xl">
              <div className="rounded-[18px] bg-[#111622] divide-y divide-white/[0.06] overflow-hidden">
                {DEPOSIT_ASSETS.map((asset) => (
                  <button
                    key={`${asset.symbol}-${asset.blockchain}`}
                    type="button"
                    onClick={() => {
                      setSourceAsset(asset);
                      setIsAssetSelectOpen(false);
                    }}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#2970FF] font-mono text-xs font-bold">
                        {asset.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{asset.name}</p>
                        <p className="font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.14em]">
                          {asset.blockchain} Network
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-[#2970FF] uppercase tracking-[0.12em]">
                      SELECT
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Main Double-Bezel Deposit Console */}
        <div className="p-1.5 rounded-[32px] bg-white/[0.025] border border-white/[0.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
          <div className="rounded-[26px] bg-[#0B0E14] border border-white/[0.07] p-6 sm:p-8">
            {!depositAddress ? (
              // STEP 1 CONTENT
              <div className="w-full space-y-6">
                <div className="p-5 rounded-2xl bg-[#111622] border border-white/[0.08] shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8d90a1] font-bold mb-3">
                    AMOUNT TO SEND ({sourceAsset.symbol})
                  </p>
                  <div className="relative inline-flex items-baseline justify-center">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="bg-transparent border-none text-center text-5xl sm:text-6xl font-black text-white focus:ring-0 focus:outline-none p-0 w-52 tracking-tight tabular-nums"
                    />
                  </div>
                  <p className="font-mono text-xs text-[#2970FF] uppercase tracking-[0.16em] font-bold mt-2">
                    {sourceAsset.symbol} ON {sourceAsset.blockchain.toUpperCase()}
                  </p>
                </div>

                {/* Optional Refund Address for Non-EVM assets */}
                {sourceAsset.blockchain !== "eth" &&
                  sourceAsset.blockchain !== "arb" &&
                  sourceAsset.blockchain !== "bsc" &&
                  sourceAsset.blockchain !== "base" &&
                  sourceAsset.blockchain !== "polygon" && (
                    <div className="space-y-2 text-left w-full bg-[#111622] border border-white/[0.08] p-4 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#2970FF] font-bold">
                          {sourceAsset.name} REFUND ADDRESS
                        </label>
                        <span className="font-mono text-[#8d90a1] text-[10px] uppercase">
                          OPTIONAL
                        </span>
                      </div>
                      <input
                        type="text"
                        value={refundAddress}
                        onChange={(e) => setRefundAddress(e.target.value.trim())}
                        placeholder={`Your ${sourceAsset.symbol} address if route expires`}
                        className="w-full bg-[#0B0E14] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono tabular-nums placeholder:text-[#8d90a1]/40 focus:outline-none focus:border-[#2970FF] transition-colors"
                      />
                    </div>
                  )}

                {/* Estimated Receive Box */}
                <div className="bg-[#111622] rounded-2xl p-5 border border-white/[0.08] space-y-2 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8d90a1] font-bold">
                    ESTIMATED BASE L2 SETTLEMENT
                  </p>
                  <div className="min-h-[40px] flex items-center justify-center">
                    {isEstimating ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#2970FF]" />
                    ) : estimatedReceive?.startsWith("Error:") ? (
                      <p className="text-xs font-mono font-bold text-[#f87171]">
                        {estimatedReceive.replace("Error: ", "")}
                      </p>
                    ) : (
                      <p className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
                        {estimatedReceive || "0.00"}{" "}
                        <span className="font-mono text-xs text-[#CCFF00] uppercase tracking-[0.14em]">
                          USDC
                        </span>
                      </p>
                    )}
                  </div>
                  {timeEstimate && (
                    <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] text-[#8d90a1]">
                      <Clock className="w-3 h-3 text-[#CCFF00]" />
                      <span>~{Math.ceil(timeEstimate / 60)} MIN SETTLEMENT VIA NEAR 1CLICK</span>
                    </div>
                  )}
                </div>

                {depositError && (
                  <div className="bg-[#f87171]/10 text-[#f87171] p-3.5 rounded-2xl text-xs font-mono border border-[#f87171]/30 text-center">
                    {depositError}
                  </div>
                )}

                <button
                  onClick={handleCreateDeposit}
                  disabled={
                    isCreating ||
                    !estimatedReceive ||
                    estimatedReceive.startsWith("Error") ||
                    isEstimating
                  }
                  className="w-full bg-gradient-to-b from-[#d8def8] to-[#a7add2] hover:from-white hover:to-white text-[#050608] font-mono uppercase tracking-[0.14em] text-xs font-bold py-4 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-[0_12px_30px_rgba(192,198,222,0.2)]"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>GENERATING INTENT ADDRESS...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>GENERATE DEPOSIT ADDRESS</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              // STEP 2 CONTENT
              <div className="w-full flex flex-col items-center space-y-7">
                <div className="p-1.5 rounded-[28px] bg-white/[0.06] border border-white/[0.12]">
                  <div className="bg-white p-5 rounded-[22px] shadow-2xl">
                    <img
                      className="w-56 h-56 mix-blend-multiply"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(
                        depositAddress
                      )}&margin=0`}
                      alt="Deposit QR Code"
                    />
                  </div>
                </div>

                <div className="w-full space-y-5 text-center">
                  {deadlineRemaining && exchangeStatus === "pending" && (
                    <div
                      className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-[#111622] border border-white/[0.08] font-mono text-xs tabular-nums ${
                        deadlineRemaining === "Expired" ? "text-[#f87171]" : "text-[#CCFF00]"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>INTENT WINDOW: {deadlineRemaining}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8d90a1] font-bold">
                      DEPOSIT ADDRESS ({sourceAsset.blockchain.toUpperCase()})
                    </p>
                    <div className="flex flex-col items-center gap-3">
                      <code className="font-mono tabular-nums text-xs sm:text-sm text-white break-all w-full bg-[#111622] p-4 rounded-2xl border border-white/[0.08]">
                        {depositAddress}
                      </code>
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] transition-colors active:scale-95 cursor-pointer"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-[#CCFF00]" />
                        ) : (
                          <Copy className="w-4 h-4 text-[#2970FF]" />
                        )}
                        <span className="font-mono text-white uppercase tracking-[0.14em] text-[10px] font-bold">
                          {copied ? "ADDRESS COPIED" : "COPY DEPOSIT ADDRESS"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Deposit memo (required for Stellar/TON) */}
                  {depositMemo && (
                    <div className="space-y-2 p-4 rounded-2xl bg-[#f87171]/10 border border-[#f87171]/30">
                      <p className="font-mono text-[10px] text-[#f87171] uppercase tracking-[0.14em] font-bold flex items-center justify-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> REQUIRED MEMO
                      </p>
                      <div className="flex flex-col items-center gap-2">
                        <code className="font-mono tabular-nums text-sm text-white bg-[#111622] px-4 py-2 rounded-xl border border-[#f87171]/30">
                          {depositMemo}
                        </code>
                        <button
                          type="button"
                          onClick={copyMemo}
                          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#2970FF] underline hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedMemo ? "MEMO COPIED" : "COPY MEMO"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-[#111622] border border-white/[0.08] w-full flex items-center justify-between text-left">
                    <div>
                      <p className="font-mono text-[10px] text-[#8d90a1] uppercase tracking-[0.14em] font-bold mb-0.5">
                        SETTLEMENT STATUS
                      </p>
                      <p className="font-bold text-sm text-white capitalize">
                        {getStatusText(exchangeStatus)}
                      </p>
                    </div>
                    {exchangeStatus === "settled" ? (
                      <div className="w-9 h-9 rounded-xl bg-[#CCFF00]/20 border border-[#CCFF00]/40 flex items-center justify-center">
                        <Check className="w-4 h-4 text-[#CCFF00]" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.1] flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-[#2970FF] animate-spin" />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDepositAddress(null);
                      setDepositMemo(null);
                      setDeadline(null);
                      setExchangeStatus("waiting");
                    }}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8d90a1] hover:text-white transition-colors cursor-pointer"
                  >
                    CANCEL / GENERATE NEW ROUTE
                  </button>
                </div>

                {/* Warning Notice */}
                <div className="w-full p-4 rounded-2xl bg-[#111622] border border-white/[0.08] flex gap-3 items-start text-left">
                  <ShieldCheck className="w-4 h-4 text-[#2970FF] shrink-0 mt-0.5" />
                  <p className="font-mono text-[11px] text-[#8d90a1] leading-relaxed">
                    Send only{" "}
                    <span className="text-white font-bold">
                      {sourceAsset.symbol} ({sourceAsset.blockchain.toUpperCase()})
                    </span>{" "}
                    to this intent address.{depositMemo ? " Include the required memo above." : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
