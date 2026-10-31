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
      pending: "Waiting for deposit…",
      processing: "Swapping to USDC…",
      settling: "Finalizing…",
      settled: "Deposit Complete",
      failed: "Failed",
      refunded: "Refunded",
      expired: "Window Expired",
    };
    return states[status] || status;
  };

  return (
    <div className="bg-surface text-on-surface font-sans selection:bg-primary/30 min-h-[100dvh] flex flex-col z-[70] fixed inset-0 overflow-y-auto">
      {/* Floating Header */}
      <header className="sticky top-3.5 z-50 px-4 sm:px-6 pointer-events-none">
        <div className="max-w-lg mx-auto">
          <div className="pointer-events-auto px-4 py-2.5 rounded-full bg-surface-container-low/95 border border-primary/25 backdrop-blur-xl shadow-elevated flex items-center justify-between">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-on-surface transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Vault</span>
            </button>
            <span className="text-xs font-semibold text-on-surface-variant">
              NEAR 1Click · Bridge to Base
            </span>
            <span className="w-2 h-2 rounded-full bg-secondary" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-lg mx-auto px-4 sm:px-6 pt-6 pb-36 space-y-4">
        {/* Source Chain & Asset Selector */}
        <section className="relative z-30">
          <button
            type="button"
            onClick={() => !depositAddress && setIsAssetSelectOpen(!isAssetSelectOpen)}
            className={`w-full bg-surface-container-low border border-primary/20 p-4 sm:p-5 rounded-2xl flex items-center justify-between group transition-colors whitespace-nowrap ${
              depositAddress ? "opacity-60 cursor-not-allowed" : "hover:bg-surface-container active:scale-[0.99] cursor-pointer"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-surface-container border border-primary/25 flex items-center justify-center text-primary">
                <Coins className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="text-[11px] font-medium text-on-surface-variant block">
                  Origin asset
                </span>
                <p className="font-bold text-on-surface text-base tracking-tight">{sourceAsset.name}</p>
                <p className="text-xs text-secondary font-semibold">
                  {sourceAsset.blockchain.toUpperCase()} network
                </p>
              </div>
            </div>
            {!depositAddress && (
              <ChevronDown className="w-5 h-5 text-on-surface-variant group-hover:text-on-surface transition-colors" />
            )}
          </button>

          {isAssetSelectOpen && !depositAddress && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-surface-container border border-primary/25 shadow-elevated z-40 max-h-80 overflow-y-auto divide-y divide-primary/15">
              {DEPOSIT_ASSETS.map((asset) => (
                <button
                  key={`${asset.symbol}-${asset.blockchain}`}
                  type="button"
                  onClick={() => {
                    setSourceAsset(asset);
                    setIsAssetSelectOpen(false);
                  }}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-container-high transition-colors text-left cursor-pointer whitespace-nowrap"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-surface-container-low border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {asset.symbol.slice(0, 3)}
                    </div>
                    <div>
                      <p className="font-bold text-on-surface text-sm">{asset.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {asset.blockchain} network
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    Select
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Main Deposit Console */}
        <div className="rounded-3xl bg-surface-container-low border border-primary/20 shadow-elevated p-6 sm:p-8">
          {!depositAddress ? (
            // STEP 1 CONTENT
            <div className="w-full space-y-6">
              <div className="p-5 rounded-2xl bg-surface-container border border-primary/15 text-center">
                <p className="text-xs font-semibold text-on-surface-variant mb-3">
                  Amount to send ({sourceAsset.symbol})
                </p>
                <div className="relative inline-flex items-baseline justify-center">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="bg-transparent border-none text-center font-mono text-5xl sm:text-6xl font-black text-on-surface focus:ring-0 focus:outline-none p-0 w-52 tracking-tight tabular-nums"
                  />
                </div>
                <p className="text-xs text-primary font-bold mt-2">
                  {sourceAsset.symbol} on {sourceAsset.blockchain.toUpperCase()}
                </p>
              </div>

              {/* Optional Refund Address for Non-EVM assets */}
              {sourceAsset.blockchain !== "eth" &&
                sourceAsset.blockchain !== "arb" &&
                sourceAsset.blockchain !== "bsc" &&
                sourceAsset.blockchain !== "base" &&
                sourceAsset.blockchain !== "polygon" && (
                  <div className="space-y-2 text-left w-full bg-surface-container border border-primary/15 p-4 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-primary">
                        {sourceAsset.name} refund address
                      </label>
                      <span className="text-xs text-on-surface-variant">
                        Optional
                      </span>
                    </div>
                    <input
                      type="text"
                      value={refundAddress}
                      onChange={(e) => setRefundAddress(e.target.value.trim())}
                      placeholder={`Your ${sourceAsset.symbol} address if route expires`}
                      className="w-full bg-surface-container-low border border-primary/20 rounded-xl px-3.5 py-2.5 text-xs text-on-surface font-mono tabular-nums placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                )}

              {/* Estimated Receive Box */}
              <div className="bg-surface-container rounded-2xl p-5 border border-primary/15 space-y-2 text-center">
                <p className="text-xs font-semibold text-on-surface-variant">
                  Estimated Base L2 settlement
                </p>
                <div className="min-h-[40px] flex items-center justify-center">
                  {isEstimating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : estimatedReceive?.startsWith("Error:") ? (
                    <p className="text-xs font-bold text-error">
                      {estimatedReceive.replace("Error: ", "")}
                    </p>
                  ) : (
                    <p className="font-mono text-3xl font-extrabold text-on-surface tabular-nums tracking-tight">
                      {estimatedReceive || "0.00"}{" "}
                      <span className="font-sans text-xs text-secondary font-bold">
                        USDC
                      </span>
                    </p>
                  )}
                </div>
                {timeEstimate && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
                    <Clock className="w-3 h-3 text-secondary" />
                    <span>~{Math.ceil(timeEstimate / 60)} min settlement via NEAR 1Click</span>
                  </div>
                )}
              </div>

              {depositError && (
                <div className="bg-error/10 text-error p-3.5 rounded-2xl text-xs border border-error/30 text-center">
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
                className="w-full bg-secondary hover:brightness-110 text-on-secondary text-xs font-bold py-4 rounded-2xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer shadow-card whitespace-nowrap"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating intent address…</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Generate deposit address</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            // STEP 2 CONTENT
            <div className="w-full flex flex-col items-center space-y-7">
              <div className="bg-on-surface p-5 rounded-2xl shadow-elevated">
                <img
                  className="w-56 h-56 mix-blend-multiply"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(
                    depositAddress
                  )}&margin=0`}
                  alt="Deposit QR Code"
                />
              </div>

              <div className="w-full space-y-5 text-center">
                {deadlineRemaining && exchangeStatus === "pending" && (
                  <div
                    className={`inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container border border-primary/20 text-xs font-semibold tabular-nums ${
                      deadlineRemaining === "Expired" ? "text-error" : "text-secondary"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Intent window: {deadlineRemaining}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-on-surface-variant">
                    Deposit address ({sourceAsset.blockchain.toUpperCase()})
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <code className="font-mono tabular-nums text-xs sm:text-sm text-on-surface break-all w-full bg-surface-container p-4 rounded-2xl border border-primary/15">
                      {depositAddress}
                    </code>
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-primary/25 transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-secondary" />
                      ) : (
                        <Copy className="w-4 h-4 text-primary" />
                      )}
                      <span className="text-on-surface text-xs font-bold">
                        {copied ? "Address copied" : "Copy deposit address"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Deposit memo (required for Stellar/TON) */}
                {depositMemo && (
                  <div className="space-y-2 p-4 rounded-2xl bg-error/10 border border-error/30">
                    <p className="text-xs text-error font-bold flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Required memo
                    </p>
                    <div className="flex flex-col items-center gap-2">
                      <code className="font-mono tabular-nums text-sm text-on-surface bg-surface-container px-4 py-2 rounded-xl border border-error/30">
                        {depositMemo}
                      </code>
                      <button
                        type="button"
                        onClick={copyMemo}
                        className="text-xs font-semibold text-primary underline hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {copiedMemo ? "Memo copied" : "Copy memo"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-4 rounded-2xl bg-surface-container border border-primary/15 w-full flex items-center justify-between text-left">
                  <div>
                    <p className="text-xs text-on-surface-variant font-medium mb-0.5">
                      Settlement status
                    </p>
                    <p className="font-bold text-sm text-on-surface capitalize">
                      {getStatusText(exchangeStatus)}
                    </p>
                  </div>
                  {exchangeStatus === "settled" ? (
                    <div className="w-9 h-9 rounded-xl bg-secondary/20 border border-secondary/40 flex items-center justify-center">
                      <Check className="w-4 h-4 text-secondary" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-surface-container-low border border-primary/20 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
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
                  className="text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel / generate new route
                </button>
              </div>

              {/* Warning Notice */}
              <div className="w-full p-4 rounded-2xl bg-surface-container border border-primary/15 flex gap-3 items-start text-left">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Send only{" "}
                  <span className="text-on-surface font-bold">
                    {sourceAsset.symbol} ({sourceAsset.blockchain.toUpperCase()})
                  </span>{" "}
                  to this intent address.{depositMemo ? " Include the required memo above." : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
