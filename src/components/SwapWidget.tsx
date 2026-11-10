"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { SWAP_ALLOWED_TOKENS } from "@/lib/constants";
import { CHAIN_METADATA, SupportedChainId, SwapTokenItem } from "@/lib/types";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { saveTransaction, updateTransactionStatus } from "@/lib/history";
import { chainVisual, tokenColor, POPULAR_PAIRS, type PopularPair } from "@/lib/chainVisuals";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import {
  ArrowDownUp,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  SlidersHorizontal,
  Wallet,
  RotateCcw,
  ClipboardPaste,
  QrCode,
  Search,
  X,
  ExternalLink,
  AlertTriangle,
  Timer,
  Zap,
} from "lucide-react";

interface SwapWidgetProps {
  compact?: boolean;
  onSwapCreated?: () => void;
  /** Prefill a route, e.g. { from: "SOL:sol", to: "USDC:base" } */
  pair?: PopularPair | null;
}

function findToken(key: string): SwapTokenItem | undefined {
  const [symbol, chain] = key.split(":");
  return SWAP_ALLOWED_TOKENS.find((t) => t.symbol === symbol && t.blockchain === chain);
}

const EVM_CHAINS = new Set(["base", "eth", "arb", "polygon", "bsc"]);
const STABLES = new Set(["USDC", "USDT", "DAI"]);

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

/** Token-aware quick amount presets (a 0.1 USDC preset is useless; a 50 BTC preset is absurd). */
function presetsFor(token: SwapTokenItem): string[] {
  if (STABLES.has(token.symbol)) return ["10", "50", "100", "500"];
  if (token.symbol === "BTC" || token.symbol === "WBTC") return ["0.001", "0.005", "0.01", "0.05"];
  if (token.symbol === "ETH") return ["0.01", "0.05", "0.1", "0.5"];
  return ["0.1", "0.5", "1", "5"];
}

function chainName(id: string): string {
  return CHAIN_METADATA[id as SupportedChainId]?.name || id.toUpperCase();
}

function shortAddr(a: string, head = 6, tail = 4): string {
  if (!a) return "";
  return a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

/** Crisp vector crypto logo with optional chain indicator badge. */
function TokenMark({ symbol, chain, size = "md" }: { symbol: string; chain?: string; size?: "sm" | "md" }) {
  return (
    <CryptoIcon
      symbol={symbol}
      chain={chain}
      size={size === "sm" ? "sm" : "lg"}
      withChainBadge={!!chain}
    />
  );
}

function useCountdown(deadline?: string | number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const end = typeof deadline === "number" ? deadline : new Date(deadline).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - now) / 1000));
}

function formatCountdown(sec: number) {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SwapWidget({ compact = false, onSwapCreated, pair = null }: SwapWidgetProps) {
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
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Selector sheet state
  const [selectorSide, setSelectorSide] = useState<"from" | "to" | null>(null);
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchRef = useRef<HTMLInputElement | null>(null);

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
  const [showQr, setShowQr] = useState<boolean>(false);
  const [pasteSupported, setPasteSupported] = useState<boolean>(false);
  const [flipTurns, setFlipTurns] = useState<number>(0);
  const [mounted, setMounted] = useState<boolean>(false);

  const secondsLeft = useCountdown(activeOrder?.deposit?.deadline || null);

  useEffect(() => {
    setMounted(true);
    setPasteSupported(typeof navigator !== "undefined" && !!navigator.clipboard?.readText);
  }, []);

  // Apply an externally requested route (landing page quick routes)
  useEffect(() => {
    if (!pair || activeOrder) return;
    const f = findToken(pair.from);
    const t = findToken(pair.to);
    if (f) setFromToken(f);
    if (t) {
      setToToken(t);
      setRecipient("");
    }
    if (f) setAmountInHuman(presetsFor(f)[1] || "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

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
          swapType: "FLEX_INPUT",
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

  // Token sheet: lock body scroll, close on Escape, focus search on desktop
  useEffect(() => {
    if (!selectorSide) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectorSide(null);
    };
    window.addEventListener("keydown", onKey);
    // Avoid popping the mobile keyboard over the list; focus only on pointer-fine devices.
    if (window.matchMedia?.("(pointer: fine)").matches) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [selectorSide]);

  const handleFlipTokens = () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    setFromToken(prevTo);
    setToToken(prevFrom);
    setFlipTurns((n) => n + 1);
    if (prevFrom.blockchain !== prevTo.blockchain) setRecipient("");
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
        swapType: "FLEX_INPUT",
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
      setShowQr(false);

      const depAddress = order.deposit?.address || order.quote?.depositAddress || "";
      saveTransaction({
        hash: depAddress || order.orderId || order.swapId || `swap_${Date.now()}`,
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
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(10); } catch {}
    }
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePasteRecipient = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setRecipient(text);
    } catch {
      // Clipboard permission denied — user can still long-press paste into the field.
    }
  };

  const chainOptions = useMemo(() => {
    const seen: string[] = [];
    SWAP_ALLOWED_TOKENS.forEach((t) => {
      if (!seen.includes(t.blockchain)) seen.push(t.blockchain);
    });
    return ["all", ...seen];
  }, []);

  const filteredTokens = useMemo(() => {
    return SWAP_ALLOWED_TOKENS.filter((t) => {
      if (chainFilter !== "all" && t.blockchain !== chainFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.blockchain.toLowerCase().includes(q) ||
          chainName(t.blockchain).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [chainFilter, searchQuery]);

  const fromChainMeta = CHAIN_METADATA[fromToken.blockchain as SupportedChainId];
  const toChainMeta = CHAIN_METADATA[toToken.blockchain as SupportedChainId];

  const openSelector = (side: "from" | "to") => {
    setSelectorSide(side);
    setChainFilter("all");
    setSearchQuery("");
  };

  // ── ACTIVE DEPOSIT & LIVE SETTLEMENT VIEW ──
  if (activeOrder) {
    const depAddr = activeOrder.deposit?.address || activeOrder.quote?.depositAddress || "";
    const exactDepositAmount = activeOrder.deposit?.amountFormatted || amountInHuman;
    const expectedOut = activeOrder.quote?.amountOutFormatted || quoteData?.amountOutFormatted || "—";
    const rawStat = (orderStatus?.status || "PENDING_DEPOSIT").toUpperCase();

    const isFailed = rawStat === "FAILED" || rawStat === "REFUNDED" || rawStat === "EXPIRED";
    let stepIndex = 0;
    if (rawStat.includes("DETECTED") || rawStat.includes("KNOWN")) stepIndex = 1;
    else if (rawStat.includes("FORWARD") || rawStat.includes("PROCESS") || rawStat.includes("SWAP")) stepIndex = 2;
    else if (rawStat === "SETTLED" || rawStat === "SUCCESS" || rawStat === "COMPLETED") stepIndex = 3;
    const isSettled = stepIndex === 3;

    const destExplorer: string | null = orderStatus?.destinationExplorerUrl || null;
    const deliveredOut = orderStatus?.swapDetails?.amountOutFormatted || expectedOut;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(depAddr)}&color=090A0E&bgcolor=ffffff&margin=8`;

    const steps = [
      { label: "Awaiting deposit", hint: `Send ${fromToken.symbol} on ${chainName(fromToken.blockchain)}` },
      { label: "Deposit detected", hint: `Waiting for ${fromChainMeta?.finalityLabel || "network"} confirmation` },
      { label: "Swapping", hint: "Solver network is filling your order" },
      { label: "Delivered", hint: `${toToken.symbol} sent to ${shortAddr(recipient)}` },
    ];

    const resetOrder = () => {
      setActiveOrder(null);
      setOrderStatus(null);
      setShowQr(false);
    };

    return (
      <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isFailed ? "bg-error" : isSettled ? "bg-secondary" : "bg-secondary animate-pulse"
              }`}
            />
            <h3 className="text-base font-semibold text-on-surface truncate">
              {isFailed ? "Swap not completed" : isSettled ? "Swap complete" : stepIndex === 0 ? "Send your deposit" : "Swap in progress"}
            </h3>
          </div>
          <button
            type="button"
            onClick={resetOrder}
            className="h-10 px-3 -mr-1 rounded-xl inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New swap</span>
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-px rounded-xl overflow-hidden bg-outline-variant border border-outline-variant">
          <div className="bg-surface-container-low p-3.5 min-w-0">
            <span className="text-xs text-on-surface-variant block">You send</span>
            <span className="font-mono text-base sm:text-lg font-semibold text-on-surface block truncate tabular-nums">
              {exactDepositAmount} {fromToken.symbol}
            </span>
            <span className="text-[11px] text-on-surface-variant">on {chainName(fromToken.blockchain)}</span>
          </div>
          <div className="bg-surface-container-low p-3.5 min-w-0">
            <span className="text-xs text-on-surface-variant block">{isSettled ? "You received" : "You receive"}</span>
            <span className="font-mono text-base sm:text-lg font-semibold text-secondary block truncate tabular-nums">
              {isSettled ? "" : "~"}{isSettled ? deliveredOut : expectedOut} {toToken.symbol}
            </span>
            <span className="text-[11px] text-on-surface-variant">on {chainName(toToken.blockchain)}</span>
          </div>
        </div>

        {/* Deposit instructions — address first, QR on demand */}
        {stepIndex === 0 && !isFailed && (
          <div className="space-y-3">
            {secondsLeft !== null && (
              <div
                className={`flex items-center justify-between h-10 px-3 rounded-xl border text-xs ${
                  secondsLeft < 120
                    ? "border-error/30 bg-error-container/30 text-on-error-container"
                    : "border-outline-variant bg-surface-container-low text-on-surface-variant"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{secondsLeft === 0 ? "Quote expired" : "Deposit window"}</span>
                </span>
                <span className="font-mono tabular-nums text-on-surface">{formatCountdown(secondsLeft)}</span>
              </div>
            )}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/25">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
              <p className="text-xs leading-relaxed text-on-surface">
                Send exactly <strong className="font-semibold">{exactDepositAmount} {fromToken.symbol}</strong> on the{" "}
                <strong className="font-semibold">{chainName(fromToken.blockchain)}</strong> network. Other tokens or networks cannot be recovered.
              </p>
            </div>

            <div>
              <span className="text-xs font-medium text-on-surface-variant block mb-1.5">
                {chainName(fromToken.blockchain)} deposit address · single use
              </span>
              <button
                type="button"
                onClick={() => copyText(depAddr, "addr")}
                className="w-full text-left p-3.5 rounded-xl bg-surface-container-low border border-outline-variant font-mono text-sm leading-relaxed text-on-surface break-all hover:border-secondary/40 transition-colors cursor-pointer"
                aria-label="Copy deposit address"
              >
                {depAddr}
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <button
                type="button"
                onClick={() => copyText(depAddr, "addr")}
                className="h-12 px-4 rounded-xl bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
              >
                {copiedField === "addr" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedField === "addr" ? "Copied" : "Copy address"}</span>
              </button>
              <button
                type="button"
                onClick={() => copyText(String(exactDepositAmount), "amt")}
                className="h-12 px-4 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
              >
                {copiedField === "amt" ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                <span>Amount</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQr((v) => !v)}
                aria-expanded={showQr}
                aria-label={showQr ? "Hide QR code" : "Show QR code"}
                className={`h-12 w-12 rounded-xl border inline-flex items-center justify-center cursor-pointer active:scale-[0.98] transition-colors ${
                  showQr
                    ? "bg-secondary/15 border-secondary/40 text-secondary"
                    : "bg-surface-container-high border-outline-variant text-on-surface"
                }`}
              >
                <QrCode className="w-5 h-5" />
              </button>
            </div>

            {showQr && (
              <div className="flex justify-center pt-1 animate-fade-in-up">
                <div className="w-52 h-52 rounded-xl bg-white p-2">
                  <img src={qrUrl} alt="Deposit address QR code" className="w-full h-full object-contain" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="p-3.5 rounded-xl bg-error-container/40 border border-error/25 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-error" />
              <div className="text-sm leading-relaxed text-on-error-container">
                <p className="font-semibold mb-0.5">
                  {rawStat === "REFUNDED"
                    ? "Order Refunded / Cancelled"
                    : rawStat === "EXPIRED"
                    ? "Quote Expired"
                    : "Swap Could Not Be Completed"}
                </p>
                <p className="text-xs text-on-error-container/90">
                  {rawStat === "REFUNDED"
                    ? "The solver could not fill this order. If refunded to ZkPay Treasury, our support team will disburse funds to your wallet immediately."
                    : rawStat === "EXPIRED"
                    ? "This quote expired before a deposit arrived. If you already sent funds, contact support below with your deposit address."
                    : "If you deposited funds, they are protected in ZkPay Treasury. Contact support with your transaction details to receive your refund."}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-error/20 flex flex-wrap items-center justify-between gap-2">
              <a
                href="https://t.me/zkpay_support"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3.5 rounded-lg bg-error text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <span>Contact Support for Refund</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {depAddr && (
                <button
                  type="button"
                  onClick={() => copyText(depAddr, "fail_dep")}
                  className="h-9 px-3 rounded-lg bg-surface-container-high/80 border border-outline-variant text-on-surface text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-container-highest cursor-pointer active:scale-95 transition-all"
                >
                  {copiedField === "fail_dep" ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>Copy Deposit Address</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Settled state */}
        {isSettled && (
          <div className="flex flex-col items-center text-center gap-2 py-2">
            <div className="w-12 h-12 rounded-full bg-secondary/15 text-secondary flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm text-on-surface-variant">
              Delivered to <span className="font-mono text-on-surface">{shortAddr(recipient)}</span>
            </p>
            {destExplorer && (
              <a
                href={destExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:bg-secondary/10 transition-colors"
              >
                <span>View on explorer</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {/* Vertical progress stepper */}
        {!isFailed && (
          <ol className="space-y-0">
            {steps.map((s, idx) => {
              const done = idx < stepIndex || isSettled;
              const current = idx === stepIndex && !isSettled;
              return (
                <li key={s.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                        done
                          ? "bg-secondary border-secondary text-on-secondary"
                          : current
                          ? "border-secondary text-secondary"
                          : "border-outline-variant text-transparent"
                      }`}
                    >
                      {done ? (
                        <Check className="w-3 h-3" strokeWidth={3} />
                      ) : current ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                      ) : null}
                    </span>
                    {idx < steps.length - 1 && (
                      <span className={`w-px flex-1 min-h-[20px] ${done ? "bg-secondary/60" : "bg-outline-variant"}`} />
                    )}
                  </div>
                  <div className="pb-4 -mt-0.5 min-w-0">
                    <p className={`text-sm font-medium ${done || current ? "text-on-surface" : "text-on-surface-variant"}`}>
                      {s.label}
                    </p>
                    {current && <p className="text-xs text-on-surface-variant mt-0.5">{s.hint}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-outline-variant text-xs text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            {!isSettled && !isFailed && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSettled || isFailed ? "Saved to recent swaps" : "Updating automatically"}</span>
          </span>
          {depAddr && (
            <a
              href={`/tx/${encodeURIComponent(depAddr)}`}
              className="font-mono hover:text-on-surface transition-colors"
            >
              #{String(activeOrder.orderId || depAddr).slice(0, 10)}
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── STANDARD SWAP ENTRY VIEW ──
  const amountValid = !!toAtomicUnits(amountInHuman, fromToken.decimals);
  const recipientMissing = !recipient.trim();
  const ctaDisabled = creatingOrder || quoteLoading || !!quoteError || !quoteData || recipientMissing;
  const ctaLabel = creatingOrder
    ? "Creating deposit address…"
    : !amountValid
    ? "Enter an amount"
    : quoteLoading
    ? "Fetching best rate…"
    : quoteError
    ? "Quote unavailable"
    : recipientMissing
    ? `Enter ${chainName(toToken.blockchain)} address`
    : `Swap ${fromToken.symbol} to ${toToken.symbol}`;

  const rate =
    quoteData?.amountOutFormatted && Number(amountInHuman) > 0
      ? Number(quoteData.amountOutFormatted) / Number(amountInHuman)
      : null;
  const feeBps: number | null =
    typeof quoteData?.feeBreakdown?.totalDeductionsBps === "number"
      ? quoteData.feeBreakdown.totalDeductionsBps
      : typeof quoteData?.feeBreakdown?.totalCustomFeeBps === "number"
      ? quoteData.feeBreakdown.totalCustomFeeBps + (quoteData.feeBreakdown.networkProtocolFeeBps || 0)
      : null;
  const etaSeconds: number | null = typeof quoteData?.timeEstimateSeconds === "number" ? quoteData.timeEstimateSeconds : null;

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant p-3 sm:p-5 space-y-2 relative">
      {/* Header Row */}
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-semibold text-on-surface">Swap</h2>
          <span className="hidden min-[380px]:inline-flex items-center gap-1 h-6 px-2 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-on-primary-container whitespace-nowrap">
            <Zap className="w-3 h-3" />
            <span>
              {chainVisual(fromToken.blockchain).code} to {chainVisual(toToken.blockchain).code}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className={`h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-sm transition-colors cursor-pointer ${
            showAdvanced
              ? "bg-secondary/15 text-secondary"
              : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          }`}
          title="Slippage & refund settings"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="font-mono text-xs">{(slippageBps / 100).toFixed(1)}%</span>
        </button>
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant space-y-2 animate-fade-in-up">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-on-surface">Max Slippage Tolerance</span>
            <span className="font-mono text-secondary">{(slippageBps / 100).toFixed(1)}%</span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-container">
            {[50, 100, 200].map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className={`h-9 rounded-lg font-mono text-sm font-medium transition-colors cursor-pointer ${
                  slippageBps === bps
                    ? "bg-surface-container-highest text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FROM BOX */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant focus-within:border-outline space-y-3 transition-colors">
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <label htmlFor="swap-amount" className="font-medium">You pay</label>
          <span>on {chainName(fromToken.blockchain)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <input
            id="swap-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountInHuman}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^\d*\.?\d*$/.test(v)) setAmountInHuman(v);
            }}
            placeholder="0"
            className="w-full min-w-0 bg-transparent font-mono text-[28px] sm:text-[32px] leading-tight font-semibold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none tabular-nums"
          />

          <button
            type="button"
            onClick={() => openSelector("from")}
            aria-label={`Change token to pay, currently ${fromToken.symbol} on ${chainName(fromToken.blockchain)}`}
            className="shrink-0 h-12 pl-1.5 pr-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant flex items-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
          >
            <TokenMark symbol={fromToken.symbol} chain={fromToken.blockchain} size="sm" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-sm font-semibold text-on-surface">{fromToken.symbol}</span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">{chainName(fromToken.blockchain)}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {presetsFor(fromToken).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmountInHuman(p)}
              className={`h-8 px-3 rounded-full border text-xs font-mono font-medium whitespace-nowrap transition-colors cursor-pointer ${
                amountInHuman === p
                  ? "border-secondary/50 bg-secondary/10 text-secondary"
                  : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* FLIP BUTTON */}
      <div className="flex justify-center -my-4 relative z-10">
        <motion.button
          type="button"
          onClick={handleFlipTokens}
          animate={{ rotate: flipTurns * 180 }}
          whileTap={{ scale: 0.88 }}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
          className="w-11 h-11 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary border-4 border-surface-container flex items-center justify-center text-on-surface transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
          aria-label="Switch tokens"
        >
          <ArrowDownUp className="w-4 h-4" />
        </motion.button>
      </div>

      {/* TO BOX */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant space-y-3">
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span className="font-medium">You receive</span>
          <span>on {chainName(toToken.blockchain)}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="w-full min-w-0 font-mono text-[28px] sm:text-[32px] leading-tight font-semibold tabular-nums truncate" aria-live="polite">
            {quoteLoading ? (
              <span className="inline-block h-8 w-32 rounded-lg bg-surface-container-high animate-pulse align-middle" />
            ) : quoteData?.amountOutFormatted ? (
              <span className="text-on-surface">{quoteData.amountOutFormatted}</span>
            ) : (
              <span className="text-on-surface-variant/40">0</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => openSelector("to")}
            aria-label={`Change token to receive, currently ${toToken.symbol} on ${chainName(toToken.blockchain)}`}
            className="shrink-0 h-12 pl-1.5 pr-2.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant flex items-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
          >
            <TokenMark symbol={toToken.symbol} chain={toToken.blockchain} size="sm" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-sm font-semibold text-on-surface">{toToken.symbol}</span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">{chainName(toToken.blockchain)}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
      </div>

      {/* RATE & ROUTE */}
      {quoteData && !quoteLoading && (
        <div className="rounded-xl border border-outline-variant">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-sm cursor-pointer"
          >
            <span className="font-mono text-xs sm:text-sm text-on-surface truncate">
              {rate !== null
                ? `1 ${fromToken.symbol} ≈ ${rate < 0.01 ? rate.toPrecision(3) : rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toToken.symbol}`
                : "Rate details"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant shrink-0">
              {etaSeconds !== null && <span>~{etaSeconds < 90 ? `${etaSeconds}s` : `${Math.round(etaSeconds / 60)}m`}</span>}
              <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </span>
          </button>
          {showDetails && (
            <dl className="px-4 pb-3 pt-1 space-y-2 text-xs border-t border-outline-variant">
              <div className="flex justify-between gap-3 pt-2">
                <dt className="text-on-surface-variant">Minimum received</dt>
                <dd className="font-mono text-on-surface text-right">
                  {quoteData.minAmountOutFormatted} {toToken.symbol}
                </dd>
              </div>
              {feeBps !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-on-surface-variant">Total fees</dt>
                  <dd className="font-mono text-on-surface">{(feeBps / 100).toFixed(2)}%</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Max slippage</dt>
                <dd className="font-mono text-on-surface">{(slippageBps / 100).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant">Route</dt>
                <dd className="text-on-surface text-right">
                  {chainName(fromToken.blockchain)} → {chainName(toToken.blockchain)} via solver network
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {/* RECIPIENT ADDRESS INPUT */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant focus-within:border-outline space-y-2 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="swap-recipient" className="text-xs font-medium text-on-surface-variant">
            Send to {toChainMeta?.name || toToken.blockchain.toUpperCase()} address
          </label>
          {address && EVM_CHAINS.has(toToken.blockchain) && recipient.toLowerCase() !== address.toLowerCase() && (
            <button
              type="button"
              onClick={() => setRecipient(address)}
              className="h-8 -my-1 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-medium text-secondary hover:bg-secondary/10 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>My wallet</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="swap-recipient"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={toChainMeta?.addressPlaceholder || `${toToken.blockchain.toUpperCase()} wallet address`}
            className="w-full min-w-0 h-10 bg-transparent font-mono text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
          />
          {recipient ? (
            <button
              type="button"
              onClick={() => setRecipient("")}
              aria-label="Clear address"
              className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            pasteSupported && (
              <button
                type="button"
                onClick={handlePasteRecipient}
                className="shrink-0 h-10 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium text-on-surface bg-surface-container-high hover:bg-surface-container-highest cursor-pointer active:scale-[0.98]"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Paste</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* OPTIONAL REFUND ADDRESS INPUT */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant focus-within:border-outline space-y-2 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="swap-refund" className="text-xs font-medium text-on-surface flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Refund address on {chainName(fromToken.blockchain)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant font-semibold">
              Optional
            </span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="swap-refund"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={refundTo}
            onChange={(e) => setRefundTo(e.target.value)}
            placeholder={fromChainMeta?.addressPlaceholder || `${fromToken.blockchain.toUpperCase()} refund address`}
            className="w-full min-w-0 h-10 bg-transparent font-mono text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
          />
          {refundTo ? (
            <button
              type="button"
              onClick={() => setRefundTo("")}
              aria-label="Clear refund address"
              className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            pasteSupported && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = (await navigator.clipboard.readText()).trim();
                    if (text) setRefundTo(text);
                  } catch {}
                }}
                className="shrink-0 h-10 px-3 rounded-lg inline-flex items-center gap-1.5 text-sm font-medium text-on-surface bg-surface-container-high hover:bg-surface-container-highest cursor-pointer active:scale-[0.98]"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>Paste</span>
              </button>
            )
          )}
        </div>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          Optional. If left blank, failed deposits route to ZkPay Treasury protection and our support team will refund you directly.
        </p>
      </div>

      {/* ERROR DISPLAY */}
      {(quoteError || createError) && (
        <div role="alert" className="p-3 rounded-xl bg-error-container/40 border border-error/25 flex items-start gap-2 text-sm text-on-error-container">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-error" />
          <span>{createError || quoteError}</span>
        </div>
      )}

      {/* SUBMIT CTA */}
      <button
        type="button"
        disabled={ctaDisabled}
        onClick={handleCreateSwap}
        className="w-full h-14 px-5 rounded-xl bg-secondary hover:brightness-110 disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:cursor-not-allowed text-on-secondary font-semibold text-base transition-colors cursor-pointer active:scale-[0.99] flex items-center justify-center gap-2"
      >
        {(creatingOrder || quoteLoading) && amountValid && <RefreshCw className="w-4 h-4 animate-spin" />}
        <span>{ctaLabel}</span>
      </button>

      {/* TOKEN SELECTOR — bottom sheet on mobile, centered dialog on desktop.
          Portaled to <body> so 3D-transformed ancestors cannot trap position: fixed. */}
      {selectorSide && mounted && createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Select ${selectorSide === "from" ? "token to pay" : "token to receive"}`}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in"
            onClick={() => setSelectorSide(null)}
          />
          <div className="relative w-full sm:max-w-md h-[85dvh] sm:h-[min(640px,85dvh)] rounded-t-2xl sm:rounded-2xl bg-surface-container border border-outline-variant flex flex-col animate-sheet-up pb-safe">
            {/* Drag handle (mobile affordance) */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <span className="w-10 h-1 rounded-full bg-outline-variant" />
            </div>

            <div className="flex items-center justify-between px-4 pt-2 sm:pt-4 pb-3">
              <h4 className="text-base font-semibold text-on-surface">
                {selectorSide === "from" ? "You pay" : "You receive"}
              </h4>
              <button
                type="button"
                onClick={() => setSelectorSide(null)}
                aria-label="Close"
                className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search token or network"
                  className="w-full h-12 pl-10 pr-3 rounded-xl bg-surface border border-outline-variant text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                {chainOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChainFilter(c)}
                    className={`h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer transition-colors border ${
                      chainFilter === c
                        ? "bg-on-surface text-surface border-on-surface"
                        : "border-outline-variant text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {c === "all" ? "All" : chainName(c)}
                  </button>
                ))}
              </div>

              {!searchQuery.trim() && chainFilter === "all" && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-on-surface-variant">Popular routes</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                    {POPULAR_PAIRS.map((p) => {
                      const f = findToken(p.from);
                      const t = findToken(p.to);
                      if (!f || !t) return null;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            setFromToken(f);
                            setToToken(t);
                            setRecipient("");
                            setSelectorSide(null);
                          }}
                          className="h-9 pl-1 pr-3 rounded-full border border-outline-variant bg-surface-container-low hover:border-secondary/40 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                        >
                          <span className="flex -space-x-1.5">
                            <TokenMark symbol={f.symbol} size="sm" />
                            <TokenMark symbol={t.symbol} size="sm" />
                          </span>
                          <span className="text-xs font-medium text-on-surface">
                            {f.symbol} to {t.symbol}
                          </span>
                          <span className="text-[10px] text-on-surface-variant">{chainVisual(t.blockchain).code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-2 pt-2 pb-2 mt-1 border-t border-outline-variant overscroll-contain">
              {filteredTokens.length === 0 ? (
                <div className="py-12 text-center text-sm text-on-surface-variant">
                  No tokens match &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredTokens.map((token) => {
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
                      className={`w-full min-h-[60px] px-2.5 py-2 rounded-xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                        isSelected ? "bg-secondary/10" : "hover:bg-surface-container-high active:bg-surface-container-high"
                      }`}
                    >
                      <TokenMark symbol={token.symbol} chain={token.blockchain} />
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-on-surface">{token.symbol}</span>
                        <span className="block text-xs text-on-surface-variant truncate">
                          {token.name} · {chainName(token.blockchain)}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-secondary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
