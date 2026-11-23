"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SWAP_ALLOWED_TOKENS, TEMPORARILY_DISABLED_CHAINS } from "@/lib/constants";
import { CHAIN_METADATA, SupportedChainId, SwapTokenItem } from "@/lib/types";
import { isValidAddressForOriginAsset } from "@/lib/refundAddress";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import { LocalQrCode } from "@/components/ui/LocalQrCode";
import {
  ArrowRight,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  RotateCcw,
  ClipboardPaste,
  QrCode,
  Search,
  X,
  ExternalLink,
  AlertTriangle,
  Timer,
  ShieldCheck,
  Lock,
} from "lucide-react";

interface PublicPaylink {
  id: string;
  slug: string;
  title: string;
  description?: string;
  receiveAssetId: string;
  receiveSymbol: string;
  receiveChain: string;
  receiveDecimals: number;
  recipientAddress: string;
  amountMode: "OPEN" | "FIXED";
  fixedAmount?: string;
  fixedCurrency?: "USD" | "ASSET";
  singleUse: boolean;
  status: "ACTIVE" | "PAUSED" | "PAID";
  paidSwapId?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredPaylinkOrder {
  order: any;
  fromToken: SwapTokenItem;
  inputAmountFormatted: string;
  expectedOutFormatted: string;
}

const STABLES = new Set(["USDC", "USDT", "DAI"]);

function chainName(id: string): string {
  return CHAIN_METADATA[id as SupportedChainId]?.name || id.toUpperCase();
}

function shortAddr(a: string, head = 6, tail = 4): string {
  if (!a) return "";
  return a.length > head + tail + 2 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

function presetsFor(token: SwapTokenItem): string[] {
  if (STABLES.has(token.symbol)) return ["5", "10", "25", "100"];
  if (token.symbol === "BTC" || token.symbol === "WBTC") return ["0.001", "0.005", "0.01", "0.05"];
  if (token.symbol === "ETH") return ["0.005", "0.01", "0.05", "0.1"];
  if (token.symbol === "LTC") return ["0.05", "0.1", "0.5", "1"];
  return ["0.1", "0.5", "1", "5"];
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

function formatCountdown(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PaylinkCheckout({ slug }: { slug: string }) {
  const availableTokens = useMemo(
    () =>
      SWAP_ALLOWED_TOKENS.filter(
        (t) => !TEMPORARILY_DISABLED_CHAINS.has(t.blockchain)
      ) as unknown as SwapTokenItem[],
    []
  );

  const storageKey = `zkpay_paylink_active_${slug.toLowerCase()}`;

  const [paylink, setPaylink] = useState<PublicPaylink | null>(null);
  const [receivePriceUsd, setReceivePriceUsd] = useState<number | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  // Payment currency & input state
  const [fromToken, setFromToken] = useState<SwapTokenItem | null>(null);
  const [amountHuman, setAmountHuman] = useState<string>("10");
  const [refundTo, setRefundTo] = useState<string>("");
  const [showRefundBox, setShowRefundBox] = useState<boolean>(false);

  // Quote & order state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteResult, setQuoteResult] = useState<any | null>(null);

  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<StoredPaylinkOrder | null>(null);
  const [orderStatus, setOrderStatus] = useState<any | null>(null);

  // UI controls
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("all");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const loadPaylink = useCallback(async () => {
    setPageLoading(true);
    setNotFoundError(null);
    try {
      const res = await fetch(`/api/paylinks/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.paylink) {
        setNotFoundError(data.message || "Payment link not found.");
        setPaylink(null);
        return;
      }

      const pl: PublicPaylink = data.paylink;
      setPaylink(pl);
      setReceivePriceUsd(typeof data.receivePriceUsd === "number" ? data.receivePriceUsd : null);

      // Pick smart default payer token different from paylink receive token
      setFromToken((prev) => {
        if (prev) return prev;
        const preferred =
          availableTokens.find(
            (t) => t.symbol === "USDT" && t.blockchain === "polygon" && t.assetId !== pl.receiveAssetId
          ) ||
          availableTokens.find(
            (t) => t.symbol === "SOL" && t.assetId !== pl.receiveAssetId
          ) ||
          availableTokens.find((t) => t.assetId !== pl.receiveAssetId) ||
          availableTokens[0];
        if (preferred) {
          setAmountHuman(presetsFor(preferred)[1] || "10");
        }
        return preferred || null;
      });
    } catch {
      setNotFoundError("Unable to load payment link right now.");
    } finally {
      setPageLoading(false);
    }
  }, [slug, availableTokens]);

  useEffect(() => {
    loadPaylink();
  }, [loadPaylink]);

  // Restore active order from localStorage if present & unexpired
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: StoredPaylinkOrder = JSON.parse(raw);
      const deadline = parsed?.order?.deposit?.deadline;
      if (parsed?.order?.deposit?.address && (!deadline || new Date(deadline).getTime() > Date.now() - 3600_000)) {
        setActivePayment(parsed);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  const isSameAsset = Boolean(
    paylink &&
      fromToken &&
      fromToken.assetId.toLowerCase() === paylink.receiveAssetId.toLowerCase()
  );

  // Debounced live quote fetch
  const fetchLiveQuote = useCallback(async () => {
    if (!paylink || !fromToken || paylink.status !== "ACTIVE" || activePayment) return;

    if (paylink.amountMode === "OPEN") {
      if (isSameAsset) {
        setQuoteError(null);
        setQuoteResult({
          mode: "DIRECT_SAME_ASSET",
          depositAddress: paylink.recipientAddress,
          amountInFormatted: amountHuman.trim() || null,
          amountOutFormatted: amountHuman.trim() || null,
          feeBps: 0,
        });
        return;
      }
      const num = Number(amountHuman);
      if (!amountHuman.trim() || !Number.isFinite(num) || num <= 0) {
        setQuoteResult(null);
        setQuoteError(null);
        return;
      }
    }

    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await fetch(`/api/paylinks/${encodeURIComponent(paylink.slug)}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAsset: fromToken.assetId,
          originChain: fromToken.blockchain,
          ...(paylink.amountMode === "OPEN" ? { amountHuman: amountHuman.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setQuoteResult(null);
        setQuoteError(data.message || data.error || "Quote unavailable for this currency pair.");
        return;
      }
      setQuoteResult(data);
    } catch {
      setQuoteError("Unable to reach quote engine. Please retry.");
    } finally {
      setQuoteLoading(false);
    }
  }, [paylink, fromToken, amountHuman, isSameAsset, activePayment]);

  useEffect(() => {
    if (!paylink || !fromToken || paylink.status !== "ACTIVE" || activePayment) return;
    const delay = paylink.amountMode === "FIXED" || isSameAsset ? 80 : 380;
    const timer = setTimeout(fetchLiveQuote, delay);
    return () => clearTimeout(timer);
  }, [fetchLiveQuote, paylink, fromToken, amountHuman, isSameAsset, activePayment]);

  // Live status polling when an active swap payment exists
  useEffect(() => {
    const depAddr = activePayment?.order?.deposit?.address;
    if (!depAddr) return;

    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const poll = async () => {
      if (!active || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const res = await fetch(
          `/api/v1/swap/status?depositAddress=${encodeURIComponent(depAddr)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.success) return;
        setOrderStatus(data);

        const st = String(data.status || "").toUpperCase();
        const raw = String(data.rawStatus || "").toUpperCase();
        if (
          st === "SETTLED" ||
          st === "SUCCESS" ||
          st === "FAILED" ||
          st === "REFUNDED" ||
          st === "EXPIRED" ||
          raw === "SETTLED" ||
          raw === "SUCCESS" ||
          raw === "FAILED" ||
          raw === "REFUNDED" ||
          raw === "EXPIRED"
        ) {
          stopPolling();
        }
      } catch {
        // transient poll error
      }
    };

    poll();
    intervalId = setInterval(poll, 5000);
    return () => stopPolling();
  }, [activePayment?.order?.deposit?.address]);

  useEffect(() => {
    if (!pickerOpen) return;
    if (window.matchMedia?.("(pointer: fine)").matches) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [pickerOpen]);

  const chainOptions = useMemo(() => {
    const uniq = Array.from(new Set(availableTokens.map((t) => t.blockchain)));
    return ["all", ...uniq];
  }, [availableTokens]);

  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return availableTokens.filter((t) => {
      if (chainFilter !== "all" && t.blockchain !== chainFilter) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.blockchain.toLowerCase().includes(q)
      );
    });
  }, [availableTokens, chainFilter, searchQuery]);

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // clipboard denied
    }
  };

  const handlePasteRefund = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) {
        setRefundTo(txt.trim());
        setCreateError(null);
      }
    } catch {
      // denied
    }
  };

  const handleCreatePaymentOrder = async () => {
    if (!paylink || !fromToken || isSameAsset) return;
    setCreateError(null);

    if (refundTo.trim() && !isValidAddressForOriginAsset(fromToken.assetId, refundTo.trim())) {
      setCreateError(
        `Invalid ${chainName(fromToken.blockchain)} refund address.`
      );
      return;
    }

    setCreatingOrder(true);
    try {
      const res = await fetch(`/api/paylinks/${encodeURIComponent(paylink.slug)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAsset: fromToken.assetId,
          originChain: fromToken.blockchain,
          ...(paylink.amountMode === "OPEN"
            ? { amountHuman: amountHuman.trim() }
            : quoteResult?.inputAmountAtomic
            ? { quotedInputAtomic: quoteResult.inputAmountAtomic }
            : {}),
          ...(refundTo.trim() ? { refundTo: refundTo.trim() } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.order) {
        setCreateError(data.message || data.error || "Unable to create payment address.");
        return;
      }

      const stored: StoredPaylinkOrder = {
        order: data.order,
        fromToken,
        inputAmountFormatted:
          data.order?.deposit?.amount || quoteResult?.inputAmountFormatted || amountHuman,
        expectedOutFormatted:
          data.order?.settlement?.estimatedAmountOut ||
          quoteResult?.quote?.amountOutFormatted ||
          "—",
      };
      setActivePayment(stored);
      setOrderStatus(null);
      setShowQr(false);
      try {
        localStorage.setItem(storageKey, JSON.stringify(stored));
      } catch {
        // ignore
      }
    } catch (err: any) {
      setCreateError(err?.message || "Network error creating payment order.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleResetPayment = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setActivePayment(null);
    setOrderStatus(null);
    setShowQr(false);
    setCreateError(null);
    loadPaylink();
  };

  const deadlineSec = useCountdown(activePayment?.order?.deposit?.deadline || null);

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-surface text-on-surface"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 35% at 50% 0%, rgba(41, 112, 255, 0.08), transparent)",
      }}
    >
      {/* Minimal Header */}
      <header className="w-full border-b border-outline-variant bg-surface/90 backdrop-blur-xl pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
              Z
            </span>
            <span className="font-semibold text-sm tracking-tight text-on-surface">
              ZkPay
            </span>
          </Link>
          <span className="text-[11px] text-on-surface-variant inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
            <span>Non-custodial Paylink</span>
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[480px] mx-auto px-4 py-6 sm:py-10 pb-safe">
        {pageLoading ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-10 flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-on-surface-variant">Loading Paylink…</span>
          </div>
        ) : notFoundError || !paylink ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-6 text-center space-y-4">
            <div className="w-11 h-11 rounded-full bg-error/10 text-error mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-on-surface">Paylink unavailable</h1>
              <p className="text-xs text-on-surface-variant">
                {notFoundError || "This payment link does not exist."}
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-secondary text-on-secondary text-sm font-semibold"
            >
              Go to ZkPay
            </Link>
          </div>
        ) : paylink.status !== "ACTIVE" && !activePayment ? (
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-6 text-center space-y-4">
            <div
              className={`w-11 h-11 rounded-full mx-auto flex items-center justify-center ${
                paylink.status === "PAID"
                  ? "bg-secondary/15 text-secondary"
                  : "bg-warning/15 text-warning"
              }`}
            >
              {paylink.status === "PAID" ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-on-surface">{paylink.title}</h1>
              <p className="text-xs text-on-surface-variant">
                {paylink.status === "PAID"
                  ? "This single-use payment link has already been paid."
                  : "This payment link is temporarily paused by its creator."}
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-surface-container-high border border-outline-variant text-xs font-medium text-on-surface"
            >
              Powered by ZkPay
            </Link>
          </div>
        ) : activePayment ? (
          /* ── STEP 2: ACTIVE DEPOSIT & 4-STEP SETTLEMENT TRACKER ── */
          (() => {
            const depAddr = activePayment.order.deposit.address;
            const depositAmt = activePayment.inputAmountFormatted;
            const expectedOut = activePayment.expectedOutFormatted;
            const mappedStat = String(orderStatus?.status || "PENDING_DEPOSIT").toUpperCase();
            const rawStat = String(
              orderStatus?.rawStatus || orderStatus?.status || "PENDING_DEPOSIT"
            ).toUpperCase();

            const isFailed =
              mappedStat === "FAILED" ||
              mappedStat === "REFUNDED" ||
              mappedStat === "EXPIRED" ||
              rawStat === "FAILED" ||
              rawStat === "REFUNDED" ||
              rawStat === "EXPIRED" ||
              rawStat === "INCOMPLETE_DEPOSIT";

            let stepIndex = 0;
            if (
              mappedStat === "SETTLED" ||
              mappedStat === "SUCCESS" ||
              rawStat === "SETTLED" ||
              rawStat === "SUCCESS"
            ) {
              stepIndex = 3;
            } else if (
              rawStat.includes("FORWARD") ||
              rawStat.includes("PROCESS") ||
              rawStat.includes("PAYING") ||
              mappedStat === "PROCESSING"
            ) {
              stepIndex = 2;
            } else if (rawStat.includes("DETECTED") || rawStat.includes("KNOWN")) {
              stepIndex = 1;
            }
            const isSettled = stepIndex === 3;
            const deliveredOut = orderStatus?.settledAmount || expectedOut;
            const destExplorer: string | null = orderStatus?.destinationExplorerUrl || null;

            const steps = [
              {
                label: "Awaiting deposit",
                hint: `Send ${depositAmt} ${activePayment.fromToken.symbol} on ${chainName(
                  activePayment.fromToken.blockchain
                )}`,
              },
              {
                label: "Deposit detected",
                hint: `Confirming on ${chainName(activePayment.fromToken.blockchain)}`,
              },
              {
                label: `Converting to ${paylink.receiveSymbol}`,
                hint: `Settling to ${shortAddr(paylink.recipientAddress)}`,
              },
              {
                label: "Payment delivered",
                hint: `${paylink.receiveSymbol} sent to recipient`,
              },
            ];

            return (
              <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-6 space-y-5 animate-fade-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isFailed
                          ? "bg-error"
                          : isSettled
                          ? "bg-secondary"
                          : "bg-secondary animate-pulse"
                      }`}
                    />
                    <h2 className="text-base font-semibold text-on-surface truncate">
                      {isFailed
                        ? rawStat === "REFUNDED" || mappedStat === "REFUNDED"
                          ? "Payment refunded"
                          : "Payment not completed"
                        : isSettled
                        ? "Payment complete"
                        : stepIndex === 0
                        ? `Pay ${paylink.title}`
                        : "Processing payment"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetPayment}
                    className="h-9 px-2.5 rounded-xl inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isSettled || isFailed ? "Done" : "Change coin"}</span>
                  </button>
                </div>

                {/* Amount Pair Summary */}
                <div className="grid grid-cols-2 gap-px rounded-xl overflow-hidden bg-outline-variant border border-outline-variant">
                  <div className="bg-surface-container-low p-3.5 min-w-0">
                    <span className="text-xs text-on-surface-variant block">You send</span>
                    <span className="font-mono text-base font-semibold text-on-surface block truncate tabular-nums">
                      {depositAmt} {activePayment.fromToken.symbol}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {chainName(activePayment.fromToken.blockchain)}
                    </span>
                  </div>
                  <div className="bg-surface-container-low p-3.5 min-w-0">
                    <span className="text-xs text-on-surface-variant block">
                      {isSettled ? "Recipient got" : "Recipient gets"}
                    </span>
                    <span className="font-mono text-base font-semibold text-secondary block truncate tabular-nums">
                      {isSettled ? "" : "~"}
                      {isSettled ? deliveredOut : expectedOut} {paylink.receiveSymbol}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {chainName(paylink.receiveChain)} · {shortAddr(paylink.recipientAddress)}
                    </span>
                  </div>
                </div>

                {/* Deposit Box (while awaiting deposit) */}
                {stepIndex === 0 && !isFailed && (
                  <div className="space-y-3">
                    {deadlineSec !== null && (
                      <div
                        className={`flex items-center justify-between h-10 px-3 rounded-xl border text-xs ${
                          deadlineSec < 120
                            ? "border-error/30 bg-error-container/30 text-on-error-container"
                            : "border-outline-variant bg-surface-container-low text-on-surface-variant"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Timer className="w-3.5 h-3.5" />
                          <span>{deadlineSec === 0 ? "Quote expired" : "Deposit window"}</span>
                        </span>
                        <span className="font-mono tabular-nums text-on-surface">
                          {formatCountdown(deadlineSec)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/25">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
                      <p className="text-xs leading-relaxed text-on-surface">
                        Send{" "}
                        <strong className="font-semibold">
                          {depositAmt} {activePayment.fromToken.symbol}
                        </strong>{" "}
                        on{" "}
                        <strong className="font-semibold">
                          {chainName(activePayment.fromToken.blockchain)}
                        </strong>
                        . Funds convert automatically to {paylink.receiveSymbol}.
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-on-surface-variant block mb-1.5">
                        {chainName(activePayment.fromToken.blockchain)} deposit address · single use
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(depAddr, "dep-addr")}
                        className="w-full text-left p-3.5 rounded-xl bg-surface-container-low border border-outline-variant font-mono text-sm leading-relaxed text-on-surface break-all hover:border-secondary/40 transition-colors cursor-pointer"
                      >
                        {depAddr}
                      </button>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(depAddr, "dep-addr")}
                        className="h-12 px-4 rounded-xl bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {copiedKey === "dep-addr" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>{copiedKey === "dep-addr" ? "Copied" : "Copy address"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(String(depositAmt), "dep-amt")}
                        className="h-12 px-4 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {copiedKey === "dep-amt" ? (
                          <Check className="w-4 h-4 text-secondary" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>Amount</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQr((v) => !v)}
                        aria-label="Toggle QR code"
                        className={`h-12 w-12 rounded-xl border inline-flex items-center justify-center cursor-pointer ${
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
                          <LocalQrCode value={depAddr} size={240} alt="Deposit QR code" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Failed / Refunded Banner */}
                {isFailed && (
                  <div className="p-3.5 rounded-xl bg-error/10 border border-error/25 space-y-2">
                    <div className="flex items-start gap-2.5 text-xs text-error">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          {rawStat === "REFUNDED" || mappedStat === "REFUNDED"
                            ? "Automatically Refunded"
                            : rawStat === "EXPIRED" || mappedStat === "EXPIRED"
                            ? "Payment Window Expired"
                            : "Payment Failed"}
                        </p>
                        <p className="text-on-surface-variant mt-0.5">
                          {orderStatus?.error ||
                            "This payment could not be completed. Eligible deposits are automatically refunded."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live 4-Step Progress */}
                <ol className="space-y-0 pt-1">
                  {steps.map((s, idx) => {
                    const done = !isFailed && (isSettled || idx < stepIndex);
                    const current = !isFailed && !isSettled && idx === stepIndex;
                    return (
                      <li key={s.label} className="flex items-start gap-3">
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
                            <span
                              className={`w-px flex-1 min-h-[20px] ${
                                done ? "bg-secondary/60" : "bg-outline-variant"
                              }`}
                            />
                          )}
                        </div>
                        <div className="pb-4 -mt-0.5 min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              done || current ? "text-on-surface" : "text-on-surface-variant"
                            }`}
                          >
                            {s.label}
                          </p>
                          {current && (
                            <p className="text-xs text-on-surface-variant mt-0.5">{s.hint}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {isSettled && destExplorer && (
                  <a
                    href={destExplorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-11 rounded-xl bg-secondary/15 border border-secondary/30 text-secondary text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <span>View {paylink.receiveSymbol} settlement on explorer</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant text-xs text-on-surface-variant">
                  <span className="inline-flex items-center gap-1.5">
                    {!isSettled && !isFailed && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {isSettled ? "Delivered" : isFailed ? "Closed" : "Checking status automatically"}
                    </span>
                  </span>
                  <Link href={`/tx/${encodeURIComponent(depAddr)}`} className="font-mono hover:text-on-surface">
                    #{depAddr.slice(0, 8)}
                  </Link>
                </div>
              </div>
            );
          })()
        ) : (
          /* ── STEP 1: CHOOSE ANY PAY CURRENCY & AMOUNT ── */
          <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-6 space-y-5 animate-fade-in">
            {/* Recipient & Paylink Summary */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h1 className="text-lg sm:text-xl font-bold text-on-surface break-words">
                  {paylink.title}
                </h1>
                {paylink.description && (
                  <p className="text-xs text-on-surface-variant">{paylink.description}</p>
                )}
              </div>
              {paylink.amountMode === "FIXED" && paylink.fixedAmount && (
                <div className="px-3 py-1.5 rounded-xl bg-secondary/15 border border-secondary/30 text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-secondary block">
                    {paylink.fixedCurrency === "USD"
                      ? `$${paylink.fixedAmount} USD`
                      : `${paylink.fixedAmount} ${paylink.receiveSymbol}`}
                  </span>
                  {paylink.fixedCurrency === "USD" && receivePriceUsd && receivePriceUsd > 0 && (
                    <span className="text-[10px] font-mono text-on-surface-variant">
                      ≈ {(Number(paylink.fixedAmount) / receivePriceUsd).toFixed(4)} {paylink.receiveSymbol}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <CryptoIcon
                  symbol={paylink.receiveSymbol}
                  chain={paylink.receiveChain}
                  size="sm"
                  withChainBadge
                />
                <div className="min-w-0">
                  <span className="text-[11px] text-on-surface-variant block">
                    Recipient receives {paylink.receiveSymbol} ({chainName(paylink.receiveChain)})
                  </span>
                  <span className="font-mono text-xs text-on-surface block truncate">
                    {shortAddr(paylink.recipientAddress, 8, 6)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant text-on-surface-variant shrink-0">
                Verified format
              </span>
            </div>

            {/* Pay Currency Selector */}
            {fromToken && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-on-surface-variant block">
                  Pay with any supported crypto
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="w-full min-h-[56px] px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant hover:border-secondary/50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CryptoIcon
                      symbol={fromToken.symbol}
                      chain={fromToken.blockchain}
                      size="md"
                      withChainBadge
                    />
                    <div className="text-left min-w-0">
                      <span className="block text-sm font-semibold text-on-surface">
                        {fromToken.symbol}
                      </span>
                      <span className="block text-xs text-on-surface-variant truncate">
                        {fromToken.name} · {chainName(fromToken.blockchain)}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-on-surface-variant shrink-0" />
                </button>
              </div>
            )}

            {/* Same-Currency Direct Transfer OR Cross-Currency Conversion */}
            {fromToken && isSameAsset ? (
              <div className="space-y-3 pt-1 animate-fade-in-up">
                <div className="p-3 rounded-xl bg-secondary/10 border border-secondary/30 flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-secondary">Direct transfer · 0% swap fee</span>
                  <span className="text-on-surface-variant">Same currency selected</span>
                </div>

                {paylink.amountMode === "FIXED" && (
                  (() => {
                    const directAmt =
                      quoteResult?.amountInFormatted ||
                      (paylink.fixedCurrency === "ASSET"
                        ? paylink.fixedAmount
                        : receivePriceUsd && receivePriceUsd > 0 && paylink.fixedAmount
                        ? (Number(paylink.fixedAmount) / receivePriceUsd)
                            .toFixed(Math.min(6, paylink.receiveDecimals))
                            .replace(/\.?0+$/, "")
                        : null);
                    if (!directAmt) return null;
                    return (
                      <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] text-on-surface-variant block">Send amount</span>
                          <span className="font-mono text-base font-bold text-on-surface">
                            {directAmt} {paylink.receiveSymbol}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(String(directAmt), "direct-amt")}
                          className="h-9 px-3 rounded-lg bg-surface-container border border-outline-variant text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === "direct-amt" ? (
                            <Check className="w-3.5 h-3.5 text-secondary" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === "direct-amt" ? "Copied" : "Copy amount"}</span>
                        </button>
                      </div>
                    );
                  })()
                )}

                <div>
                  <span className="text-xs font-medium text-on-surface-variant block mb-1.5">
                    Send {paylink.receiveSymbol} ({chainName(paylink.receiveChain)}) directly to:
                  </span>
                  <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant font-mono text-sm text-on-surface break-all">
                    {paylink.recipientAddress}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(paylink.recipientAddress, "direct-addr")}
                    className="h-12 px-4 rounded-xl bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedKey === "direct-addr" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedKey === "direct-addr" ? "Address copied" : "Copy address"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQr((v) => !v)}
                    aria-label="Toggle QR code"
                    className={`h-12 w-12 rounded-xl border inline-flex items-center justify-center cursor-pointer ${
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
                      <LocalQrCode
                        value={paylink.recipientAddress}
                        size={240}
                        alt="Recipient wallet QR code"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              fromToken && (
                <div className="space-y-4">
                  {/* Open Amount Input OR Fixed Computed Pay Box */}
                  {paylink.amountMode === "OPEN" ? (
                    <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-on-surface-variant">
                          Amount you pay ({fromToken.symbol})
                        </span>
                        <div className="flex items-center gap-1">
                          {presetsFor(fromToken).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setAmountHuman(p)}
                              className={`h-6 px-2 rounded-md font-mono text-[11px] cursor-pointer transition-colors ${
                                amountHuman === p
                                  ? "bg-secondary/20 text-secondary font-semibold"
                                  : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amountHuman}
                        onChange={(e) => setAmountHuman(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-transparent font-mono text-2xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none tabular-nums"
                      />
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-on-surface-variant block">
                          Estimated amount to send
                        </span>
                        <span className="font-mono text-2xl font-bold text-on-surface tabular-nums">
                          {quoteLoading
                            ? "…"
                            : quoteResult?.inputAmountFormatted
                            ? `${quoteResult.inputAmountFormatted} ${fromToken.symbol}`
                            : "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={fetchLiveQuote}
                        disabled={quoteLoading}
                        aria-label="Refresh quote"
                        className="h-9 w-9 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${quoteLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  )}

                  {/* Conversion Summary */}
                  {quoteResult?.quote && !quoteLoading && (
                    <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-on-surface-variant">Recipient receives</span>
                        <span className="font-mono font-semibold text-secondary inline-flex items-center gap-1">
                          ~{quoteResult.quote.amountOutFormatted} {paylink.receiveSymbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-on-surface-variant">Conversion path</span>
                        <span className="text-on-surface inline-flex items-center gap-1">
                          {fromToken.symbol} <ArrowRight className="w-3 h-3" /> {paylink.receiveSymbol}
                        </span>
                      </div>
                      {typeof quoteResult.quote.timeEstimateSeconds === "number" && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Estimated arrival</span>
                          <span className="font-mono text-on-surface">
                            ~
                            {quoteResult.quote.timeEstimateSeconds < 90
                              ? `${quoteResult.quote.timeEstimateSeconds}s`
                              : `${Math.round(quoteResult.quote.timeEstimateSeconds / 60)}m`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {quoteError && (
                    <div className="p-3 rounded-xl bg-error/10 border border-error/25 text-xs text-error flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{quoteError}</span>
                    </div>
                  )}

                  {/* Optional Refund Address Accordion */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRefundBox((v) => !v)}
                      className="text-xs font-medium text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${showRefundBox ? "rotate-180" : ""}`}
                      />
                      <span>Add refund address (optional)</span>
                    </button>

                    {showRefundBox && (
                      <div className="mt-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant space-y-2 animate-fade-in-up">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-on-surface-variant">
                            Your {chainName(fromToken.blockchain)} refund wallet
                          </span>
                          <button
                            type="button"
                            onClick={handlePasteRefund}
                            className="text-[11px] text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ClipboardPaste className="w-3 h-3" />
                            <span>Paste</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={refundTo}
                          onChange={(e) => {
                            setRefundTo(e.target.value);
                            setCreateError(null);
                          }}
                          placeholder={
                            CHAIN_METADATA[fromToken.blockchain as SupportedChainId]
                              ?.addressPlaceholder || "Optional refund address"
                          }
                          spellCheck={false}
                          className="w-full h-10 px-3 rounded-xl bg-surface border border-outline-variant font-mono text-base sm:text-xs text-on-surface focus:outline-none focus:border-secondary/60"
                        />
                      </div>
                    )}
                  </div>

                  {createError && (
                    <div className="p-3 rounded-xl bg-error/10 border border-error/25 text-xs text-error flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{createError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      creatingOrder ||
                      quoteLoading ||
                      !!quoteError ||
                      !quoteResult?.quote
                    }
                    onClick={handleCreatePaymentOrder}
                    className="w-full h-14 px-5 rounded-xl bg-secondary hover:brightness-110 disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:cursor-not-allowed text-on-secondary font-semibold text-base transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    {creatingOrder && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>
                      {creatingOrder
                        ? "Preparing deposit address…"
                        : quoteLoading
                        ? "Fetching rate…"
                        : `Pay with ${fromToken.symbol}`}
                    </span>
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </main>

      {/* Currency Selector Modal */}
      {pickerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose payment currency"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4 animate-fade-in"
            onClick={() => setPickerOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-[440px] max-h-[85dvh] sm:rounded-2xl rounded-t-2xl bg-surface-container border border-outline-variant flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)]"
            >
              <div className="sm:hidden flex justify-center pt-2.5 pb-1">
                <span className="w-9 h-1 rounded-full bg-outline-variant" />
              </div>

              <div className="flex items-center justify-between px-4 pt-2 sm:pt-4 pb-3">
                <h4 className="text-base font-semibold text-on-surface">
                  Select payment currency
                </h4>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
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
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface border border-outline-variant text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary/60"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
                  {chainOptions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChainFilter(c)}
                      className={`h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-colors border ${
                        chainFilter === c
                          ? "bg-on-surface text-surface border-on-surface"
                          : "border-outline-variant text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {c === "all" ? "All" : chainName(c)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-2 pt-2 pb-2 mt-1 border-t border-outline-variant overscroll-contain">
                {filteredTokens.length === 0 ? (
                  <div className="py-12 text-center text-sm text-on-surface-variant">
                    No tokens match &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  filteredTokens.map((token) => {
                    const isSelected = fromToken?.assetId === token.assetId;
                    const sameAsDest =
                      paylink &&
                      token.assetId.toLowerCase() === paylink.receiveAssetId.toLowerCase();
                    return (
                      <button
                        key={token.assetId}
                        type="button"
                        onClick={() => {
                          if (fromToken && token.blockchain !== fromToken.blockchain) {
                            setRefundTo("");
                          }
                          setFromToken(token);
                          setAmountHuman(presetsFor(token)[1] || "10");
                          setQuoteResult(null);
                          setQuoteError(null);
                          setCreateError(null);
                          setShowQr(false);
                          setPickerOpen(false);
                          setSearchQuery("");
                          setChainFilter("all");
                        }}
                        className={`w-full min-h-[56px] px-2.5 py-2 rounded-xl text-left flex items-center gap-3 transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-secondary/10"
                            : "hover:bg-surface-container-high active:bg-surface-container-high"
                        }`}
                      >
                        <CryptoIcon
                          symbol={token.symbol}
                          chain={token.blockchain}
                          size="lg"
                          withChainBadge
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-on-surface">
                              {token.symbol}
                            </span>
                            {sameAsDest && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/15 text-secondary font-medium">
                                Direct · 0%
                              </span>
                            )}
                          </div>
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
