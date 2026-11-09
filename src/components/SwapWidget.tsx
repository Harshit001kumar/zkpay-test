"use client";

import React, { useState, useEffect, useMemo } from "react";
import { SWAP_ALLOWED_TOKENS } from "@/lib/constants";
import { CHAIN_METADATA, SupportedChainId, SwapTokenItem } from "@/lib/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { saveTransaction, updateTransactionStatus } from "@/lib/history";
import {
  ArrowDownUp,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

interface SwapWidgetProps {
  compact?: boolean;
  onSwapCreated?: () => void;
}

const EVM_CHAINS = new Set(["base", "eth", "arb", "polygon", "bsc"]);

function toAtomicUnits(humanAmount: string, decimals: number): string | null {
  const clean = humanAmount.trim();
  if (!clean || isNaN(Number(clean)) || Number(clean) <= 0) return null;
  try {
    const [whole = "0", frac = ""] = clean.split(".");
    const paddedFrac = frac.slice(0, decimals).padEnd(decimals, "0");
    const combined = `${whole}${paddedFrac}`.replace(/^0+/, "") || "0";
    const bi = BigInt(combined);
    return bi > 0n ? bi.toString() : null;
  } catch {
    return null;
  }
}

export default function SwapWidget({ compact = false, onSwapCreated }: SwapWidgetProps) {
  const { address } = useActiveAccount();

  // Default: SOL (Solana) -> USDC (Base)
  const defaultFrom =
    SWAP_ALLOWED_TOKENS.find((t) => t.symbol === "SOL" && t.blockchain === "sol") ||
    SWAP_ALLOWED_TOKENS[0];
  const defaultTo =
    SWAP_ALLOWED_TOKENS.find((t) => t.symbol === "USDC" && t.blockchain === "base") ||
    SWAP_ALLOWED_TOKENS[5];

  const [fromToken, setFromToken] = useState<SwapTokenItem>(defaultFrom);
  const [toToken, setToToken] = useState<SwapTokenItem>(defaultTo);
  const [amountInHuman, setAmountInHuman] = useState<string>("1");
  const [recipient, setRecipient] = useState<string>("");
  const [refundTo, setRefundTo] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState<number>(100); // 1.0%
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Selector modal state
  const [selectorSide, setSelectorSide] = useState<"from" | "to" | null>(null);
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Quote state
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [quoteData, setQuoteData] = useState<any | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Active order state
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [orderStatus, setOrderStatus] = useState<any | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Auto-fill connected EVM wallet when destination chain is EVM and recipient is empty
  useEffect(() => {
    if (address && EVM_CHAINS.has(toToken.blockchain) && !recipient) {
      setRecipient(address);
    }
  }, [address, toToken.blockchain]);

  // Debounced live quote fetching
  useEffect(() => {
    if (activeOrder) return;

    const atomic = toAtomicUnits(amountInHuman, fromToken.decimals);
    if (!atomic) {
      setQuoteData(null);
      setQuoteError(null);
      return;
    }

    if (fromToken.assetId === toToken.assetId) {
      setQuoteData(null);
      setQuoteError("Source and destination asset cannot be identical.");
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          fromAsset: fromToken.symbol,
          chain: fromToken.blockchain,
          toAsset: toToken.symbol,
          destinationChain: toToken.blockchain,
          amount: atomic,
          slippageBps: String(slippageBps),
        });
        const res = await fetch(`/api/v1/swap/quote?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success) {
          setQuoteData(null);
          setQuoteError(data.message || data.error || "Unable to fetch quote for this amount.");
        } else {
          setQuoteData(data.quote);
          setQuoteError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setQuoteData(null);
          setQuoteError(err?.message || "Network error while fetching quote.");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amountInHuman, fromToken, toToken, slippageBps, activeOrder]);

  // Poll active order status
  useEffect(() => {
    const depAddr = activeOrder?.deposit?.address || activeOrder?.quote?.depositAddress;
    if (!depAddr) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/swap/status?depositAddress=${encodeURIComponent(depAddr)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.success) {
          setOrderStatus(data);
          const s = (data.status || "").toUpperCase();
          if (s === "SETTLED" || s === "SUCCESS" || s === "COMPLETED") {
            updateTransactionStatus(depAddr, "settled", data.swapDetails?.amountOutFormatted);
          } else if (s === "FAILED" || s === "REFUNDED" || s === "EXPIRED") {
            updateTransactionStatus(depAddr, "failed");
          }
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeOrder]);

  const handleFlipTokens = () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    setFromToken(prevTo);
    setToToken(prevFrom);
    if (quoteData?.amountOutFormatted) {
      setAmountInHuman(String(quoteData.amountOutFormatted));
    }
  };

  const handleCreateSwap = async () => {
    setCreateError(null);
    const atomic = toAtomicUnits(amountInHuman, fromToken.decimals);
    if (!atomic) {
      setCreateError("Please enter a valid swap amount.");
      return;
    }
    const cleanRecipient = recipient.trim();
    if (!cleanRecipient) {
      setCreateError(`Please enter a valid ${CHAIN_METADATA[toToken.blockchain as SupportedChainId]?.name || toToken.blockchain.toUpperCase()} recipient address.`);
      return;
    }

    setCreatingOrder(true);
    try {
      const payload: Record<string, any> = {
        fromAsset: fromToken.symbol,
        chain: fromToken.blockchain,
        toAsset: toToken.symbol,
        destinationChain: toToken.blockchain,
        amount: atomic,
        recipient: cleanRecipient,
        slippageBps,
      };
      if (refundTo.trim()) {
        payload.refundTo = refundTo.trim();
      }

      const res = await fetch("/api/v1/swap/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setCreateError(data.message || data.error || "Failed to create swap order.");
        setCreatingOrder(false);
        return;
      }

      const order = data.order;
      setActiveOrder(order);
      setOrderStatus({ status: "PENDING_DEPOSIT" });

      const depAddress = order.deposit?.address || order.quote?.depositAddress || "";
      saveTransaction({
        hash: depAddress || order.orderId,
        type: "swap",
        title: `Swap ${fromToken.symbol} → ${toToken.symbol}`,
        fromAsset: fromToken.symbol,
        toAsset: toToken.symbol,
        fromChain: fromToken.blockchain,
        toChain: toToken.blockchain,
        amountIn: amountInHuman,
        amountOut: order.quote?.amountOutFormatted || quoteData?.amountOutFormatted || "0",
        depositAddress: depAddress,
        amountINR: 0,
        amountUSDC: parseFloat(order.quote?.amountOutFormatted || "0") || 0,
        fee: 0,
        recipient: cleanRecipient,
        orderId: order.orderId,
        network: `${fromToken.blockchain.toUpperCase()} → ${toToken.blockchain.toUpperCase()}`,
        timestamp: Date.now(),
        status: "pending",
      });

      onSwapCreated?.();
    } catch (err: any) {
      setCreateError(err?.message || "Network error creating swap order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const copyText = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const filteredTokens = useMemo(() => {
    return SWAP_ALLOWED_TOKENS.filter((t) => {
      if (chainFilter !== "all" && t.blockchain !== chainFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.blockchain.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [chainFilter, searchQuery]);

  const fromChainMeta = CHAIN_METADATA[fromToken.blockchain as SupportedChainId];
  const toChainMeta = CHAIN_METADATA[toToken.blockchain as SupportedChainId];

  // ── ACTIVE DEPOSIT & LIVE SETTLEMENT VIEW ──
  if (activeOrder) {
    const depAddr = activeOrder.deposit?.address || activeOrder.quote?.depositAddress || "";
    const exactDepositAmount = activeOrder.deposit?.amountFormatted || amountInHuman;
    const expectedOut = activeOrder.quote?.amountOutFormatted || quoteData?.amountOutFormatted || "—";
    const rawStat = (orderStatus?.status || "PENDING_DEPOSIT").toUpperCase();

    let stepIndex = 0;
    if (rawStat.includes("DETECTED") || rawStat.includes("KNOWN")) stepIndex = 1;
    else if (rawStat.includes("FORWARD") || rawStat.includes("PROCESS") || rawStat.includes("SWAP")) stepIndex = 2;
    else if (rawStat === "SETTLED" || rawStat === "SUCCESS" || rawStat === "COMPLETED") stepIndex = 3;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(depAddr)}&color=131315&bgcolor=ffffff&margin=8`;

    return (
      <div className="rounded-3xl bg-surface-container border border-outline-variant/20 p-5 sm:p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-outline-variant/15">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <h3 className="text-sm font-bold text-on-surface">
              {stepIndex === 3 ? "Swap Settled On-Chain" : "Send Deposit to Execute Swap"}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveOrder(null);
              setOrderStatus(null);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Swap</span>
          </button>
        </div>

        {/* Summary Pill */}
        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-on-surface-variant block">You Send ({fromToken.blockchain.toUpperCase()})</span>
            <span className="font-mono text-base sm:text-lg font-extrabold text-on-surface">
              {exactDepositAmount} {fromToken.symbol}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-on-surface-variant shrink-0" />
          <div className="text-right">
            <span className="text-[11px] text-on-surface-variant block">You Receive ({toToken.blockchain.toUpperCase()})</span>
            <span className="font-mono text-base sm:text-lg font-extrabold text-secondary">
              ~{expectedOut} {toToken.symbol}
            </span>
          </div>
        </div>

        {/* QR + Single Deposit Address */}
        {stepIndex < 3 && (
          <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-surface/70 border border-outline-variant/15">
            <div className="w-36 h-36 rounded-2xl bg-white p-2 shrink-0 flex items-center justify-center">
              <img
                src={qrUrl}
                alt="Deposit Address QR"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            <div className="flex-1 w-full space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                  Single-Use {fromToken.blockchain.toUpperCase()} Deposit Address
                </span>
                <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 font-mono text-xs text-on-surface break-all">
                  {depAddr}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyText(depAddr, "addr")}
                  className="flex-1 py-2 px-3 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                >
                  {copiedField === "addr" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedField === "addr" ? "Address Copied" : "Copy Address"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => copyText(String(exactDepositAmount), "amt")}
                  className="py-2 px-3 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedField === "amt" ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy Amount</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4-Stage Reactive Progress */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-4 gap-1.5">
            {["Awaiting Deposit", "Detected", "Swapping", "Settled"].map((label, idx) => {
              const active = idx <= stepIndex;
              return (
                <div key={label} className="space-y-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      active ? "bg-secondary" : "bg-surface-container-high"
                    }`}
                  />
                  <span
                    className={`block text-[10px] font-semibold text-center ${
                      active ? "text-on-surface" : "text-on-surface-variant/60"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-1">
            <span className="inline-flex items-center gap-1.5">
              {stepIndex === 3 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-secondary" />
              )}
              <span>
                {stepIndex === 3
                  ? `Delivered to ${recipient.slice(0, 6)}…${recipient.slice(-4)}`
                  : "Auto-polling blockchain every 5s…"}
              </span>
            </span>
            <span className="font-mono text-[10px]">ID: {activeOrder.orderId?.slice(0, 10)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── STANDARD SWAP ENTRY VIEW ──
  return (
    <div className="rounded-3xl bg-surface-container border border-outline-variant/20 p-4 sm:p-6 space-y-3.5 shadow-2xl relative">
      {/* Header Row */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold tracking-tight text-on-surface">Instant Cross-Chain Swap</span>
          <span className="px-2 py-0.5 rounded-md bg-secondary/10 border border-secondary/25 text-[10px] font-bold text-secondary">
            9 Chains
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`p-1.5 rounded-xl border text-xs inline-flex items-center gap-1 transition-colors cursor-pointer ${
            showAdvanced
              ? "bg-secondary/15 border-secondary/30 text-secondary"
              : "bg-surface-container-low border-outline-variant/15 text-on-surface-variant hover:text-on-surface"
          }`}
          title="Slippage & Refund Settings"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">{(slippageBps / 100).toFixed(1)}%</span>
        </button>
      </div>

      {/* Advanced Settings Drawer */}
      {showAdvanced && (
        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant font-medium">Max Slippage Tolerance</span>
            <div className="flex items-center gap-1">
              {[50, 100, 200].map((bps) => (
                <button
                  key={bps}
                  type="button"
                  onClick={() => setSlippageBps(bps)}
                  className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer ${
                    slippageBps === bps
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {(bps / 100).toFixed(1)}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-on-surface-variant mb-1">
              Origin Refund Address (Optional — for {fromToken.blockchain.toUpperCase()})
            </label>
            <input
              type="text"
              value={refundTo}
              onChange={(e) => setRefundTo(e.target.value)}
              placeholder={fromChainMeta?.addressPlaceholder || `Optional ${fromToken.blockchain.toUpperCase()} refund address`}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-outline-variant/20 text-xs font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-secondary"
            />
          </div>
        </div>
      )}

      {/* FROM BOX */}
      <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-2">
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span className="font-medium">You Pay</span>
          <span className="font-mono text-[11px]">
            Network: <strong className="text-on-surface uppercase">{fromToken.blockchain}</strong>
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amountInHuman}
            onChange={(e) => setAmountInHuman(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent font-mono text-2xl sm:text-3xl font-extrabold text-on-surface focus:outline-none tabular-nums"
          />

          <button
            type="button"
            onClick={() => {
              setSelectorSide("from");
              setChainFilter("all");
              setSearchQuery("");
            }}
            className="shrink-0 px-3 py-2 rounded-2xl bg-surface-container-high hover:bg-surface border border-outline-variant/25 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <div className="text-left">
              <span className="block text-sm font-extrabold text-on-surface leading-tight">
                {fromToken.symbol}
              </span>
              <span className="block text-[10px] font-semibold text-on-surface-variant uppercase leading-tight">
                {fromToken.blockchain}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
      </div>

      {/* FLIP BUTTON */}
      <div className="flex justify-center -my-5 relative z-10">
        <button
          type="button"
          onClick={handleFlipTokens}
          className="w-9 h-9 rounded-xl bg-surface-container-high hover:bg-secondary hover:text-on-secondary border border-outline-variant/30 flex items-center justify-center text-on-surface transition-all cursor-pointer active:scale-90 shadow-md"
          title="Switch tokens"
        >
          <ArrowDownUp className="w-4 h-4" />
        </button>
      </div>

      {/* TO BOX */}
      <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-2">
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span className="font-medium">You Receive (Estimated)</span>
          <span className="font-mono text-[11px]">
            Network: <strong className="text-on-surface uppercase">{toToken.blockchain}</strong>
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="w-full font-mono text-2xl sm:text-3xl font-extrabold tabular-nums truncate">
            {quoteLoading ? (
              <span className="text-on-surface-variant/50 animate-pulse">Quoting…</span>
            ) : quoteData?.amountOutFormatted ? (
              <span className="text-secondary">{quoteData.amountOutFormatted}</span>
            ) : (
              <span className="text-on-surface-variant/40">0.00</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectorSide("to");
              setChainFilter("all");
              setSearchQuery("");
            }}
            className="shrink-0 px-3 py-2 rounded-2xl bg-surface-container-high hover:bg-surface border border-outline-variant/25 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <div className="text-left">
              <span className="block text-sm font-extrabold text-on-surface leading-tight">
                {toToken.symbol}
              </span>
              <span className="block text-[10px] font-semibold text-on-surface-variant uppercase leading-tight">
                {toToken.blockchain}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        {quoteData && !quoteLoading && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-on-surface-variant border-t border-outline-variant/10">
            <span>Min. received: {quoteData.minAmountOutFormatted} {toToken.symbol}</span>
            <span className="inline-flex items-center gap-1 text-secondary font-medium">
              <Clock className="w-3 h-3" />
              {fromChainMeta?.finalityLabel || "~15s"}
            </span>
          </div>
        )}
      </div>

      {/* RECIPIENT ADDRESS INPUT */}
      <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-on-surface-variant">
            Destination {toChainMeta?.name || toToken.blockchain.toUpperCase()} Address
          </label>
          {address && EVM_CHAINS.has(toToken.blockchain) && recipient.toLowerCase() !== address.toLowerCase() && (
            <button
              type="button"
              onClick={() => setRecipient(address)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline cursor-pointer"
            >
              <Wallet className="w-3 h-3" />
              <span>Use Connected Wallet</span>
            </button>
          )}
        </div>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder={toChainMeta?.addressPlaceholder || `Enter ${toToken.blockchain.toUpperCase()} recipient wallet address`}
          className="w-full bg-transparent font-mono text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
        />
      </div>

      {/* ERROR DISPLAY */}
      {(quoteError || createError) && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <span>{createError || quoteError}</span>
        </div>
      )}

      {/* SUBMIT CTA */}
      <button
        type="button"
        disabled={creatingOrder || quoteLoading || !!quoteError || !quoteData}
        onClick={handleCreateSwap}
        className="w-full h-13 py-3.5 px-5 rounded-2xl bg-secondary hover:bg-secondary/90 disabled:opacity-40 text-on-secondary font-extrabold text-sm sm:text-base transition-all cursor-pointer active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg"
      >
        {creatingOrder ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Generating Single-Use Deposit Address…</span>
          </>
        ) : (
          <>
            <span>Swap {fromToken.symbol} to {toToken.symbol}</span>
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* TOKEN SELECTOR MODAL */}
      {selectorSide && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-surface-container border border-outline-variant/25 p-5 space-y-4 max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-on-surface">
                Select {selectorSide === "from" ? "Source" : "Destination"} Token
              </h4>
              <button
                type="button"
                onClick={() => setSelectorSide(null)}
                className="text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer px-2 py-1"
              >
                Close
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token or chain (e.g. SOL, USDC, BTC, Polygon)…"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-outline-variant/20 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-secondary"
            />

            {/* Chain filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {["all", "base", "sol", "eth", "btc", "polygon", "bsc", "tron", "ltc"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChainFilter(c)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase whitespace-nowrap cursor-pointer transition-colors ${
                    chainFilter === c
                      ? "bg-secondary text-on-secondary"
                      : "bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Token list */}
            <div className="overflow-y-auto space-y-1.5 pr-1 flex-1">
              {filteredTokens.map((token) => {
                const isSelected =
                  selectorSide === "from"
                    ? token.assetId === fromToken.assetId
                    : token.assetId === toToken.assetId;
                return (
                  <button
                    key={token.assetId}
                    type="button"
                    onClick={() => {
                      if (selectorSide === "from") {
                        setFromToken(token);
                      } else {
                        setToToken(token);
                      }
                      setSelectorSide(null);
                    }}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-secondary/15 border-secondary/40"
                        : "bg-surface-container-low hover:bg-surface-container-high border-outline-variant/10"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-on-surface">{token.symbol}</span>
                        <span className="px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/20 text-[10px] font-bold uppercase text-on-surface-variant">
                          {token.blockchain}
                        </span>
                      </div>
                      <span className="text-xs text-on-surface-variant block mt-0.5">{token.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-on-surface-variant">
                      {token.decimals} dec
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
