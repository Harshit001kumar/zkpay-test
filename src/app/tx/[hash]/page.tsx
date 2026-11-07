"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getTransactionByHash, TransactionRecord, updateTransactionStatus } from "@/lib/history";
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Share2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export default function SwapReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const rawHash = decodeURIComponent((params.hash as string) || "");
  const [tx, setTx] = useState<TransactionRecord | null>(null);
  const [liveStatus, setLiveStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!rawHash) {
      setLoading(false);
      return;
    }
    const record = getTransactionByHash(rawHash);
    if (record) {
      setTx(record);
    }

    const depositAddr = record?.depositAddress || rawHash;
    let active = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/v1/swap/status?depositAddress=${encodeURIComponent(depositAddr)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.success) {
          setLiveStatus(data);
          if (data.status === "settled" || data.status === "SUCCESS") {
            updateTransactionStatus(rawHash, "settled", data.swapDetails?.amountOutFormatted);
          }
        }
      } catch {
        // Ignore transient poll errors
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [rawHash]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  if (loading && !tx && !liveStatus) {
    return (
      <main className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-on-surface-variant font-mono">Loading swap receipt…</span>
        </div>
      </main>
    );
  }

  const statusStr = (liveStatus?.status || tx?.status || "pending").toLowerCase();
  const isSettled = statusStr === "settled" || statusStr === "success" || statusStr === "completed";
  const fromAsset = tx?.fromAsset || liveStatus?.fromAsset || "Token";
  const toAsset = tx?.toAsset || liveStatus?.toAsset || "USDC";
  const fromChain = (tx?.fromChain || liveStatus?.chain || "origin").toUpperCase();
  const toChain = (tx?.toChain || liveStatus?.destinationChain || "base").toUpperCase();
  const amountIn = tx?.amountIn || liveStatus?.swapDetails?.amountInFormatted || "—";
  const amountOut = liveStatus?.swapDetails?.amountOutFormatted || tx?.amountOut || "—";
  const depositAddress = tx?.depositAddress || liveStatus?.depositAddress || rawHash;
  const recipient = tx?.recipient || liveStatus?.recipient || "—";

  return (
    <main className="min-h-screen bg-surface text-on-surface px-4 py-8 sm:py-12">
      <div className="max-w-lg mx-auto space-y-6">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Swap</span>
        </button>

        <div className="rounded-3xl bg-surface-container border border-outline-variant/20 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary">
                {isSettled ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5 animate-pulse" />}
              </div>
              <div>
                <h1 className="text-base font-bold text-on-surface">Cross-Chain Swap Receipt</h1>
                <p className="text-xs text-on-surface-variant">
                  {isSettled ? "Completed & Settled On-Chain" : `Status: ${statusStr.toUpperCase()}`}
                </p>
              </div>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                isSettled
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              }`}
            >
              {isSettled ? "Settled" : statusStr}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] text-on-surface-variant block">Sent ({fromChain})</span>
              <span className="text-lg font-mono font-bold text-on-surface">
                {amountIn} {fromAsset}
              </span>
            </div>
            <ArrowRight className="w-5 h-5 text-on-surface-variant shrink-0" />
            <div className="text-right">
              <span className="text-[11px] text-on-surface-variant block">Received ({toChain})</span>
              <span className="text-lg font-mono font-bold text-secondary">
                {amountOut} {toAsset}
              </span>
            </div>
          </div>

          <div className="space-y-3 text-xs border-t border-outline-variant/15 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant">Deposit Address</span>
              <button
                type="button"
                onClick={() => copyToClipboard(depositAddress, "deposit")}
                className="inline-flex items-center gap-1.5 font-mono text-on-surface hover:text-secondary transition-colors cursor-pointer"
              >
                <span>
                  {depositAddress.slice(0, 8)}…{depositAddress.slice(-6)}
                </span>
                {copiedKey === "deposit" ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {recipient && recipient !== "—" && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-on-surface-variant">Recipient</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(recipient, "recipient")}
                  className="inline-flex items-center gap-1.5 font-mono text-on-surface hover:text-secondary transition-colors cursor-pointer"
                >
                  <span>
                    {recipient.slice(0, 8)}…{recipient.slice(-6)}
                  </span>
                  {copiedKey === "recipient" ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant">Execution Engine</span>
              <span className="font-medium text-on-surface inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                ZkPay Solver Network
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
