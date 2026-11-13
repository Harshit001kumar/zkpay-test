"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getTransactionByHash, TransactionRecord, updateTransactionStatus } from "@/lib/history";
import { CHAIN_METADATA, SupportedChainId } from "@/lib/types";
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

function chainName(id: string): string {
  return CHAIN_METADATA[id.toLowerCase() as SupportedChainId]?.name || id.toUpperCase();
}

export default function SwapReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const rawHashParam = typeof params?.hash === "string" ? params.hash : Array.isArray(params?.hash) ? params.hash[0] : "";
  const rawHash = decodeURIComponent(rawHashParam || "");
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
          const s = (data.status || "").toLowerCase();
          const raw = (data.rawStatus || "").toUpperCase();
          const settledOut = data.settledAmount || data.swapDetails?.amountOutFormatted;
          if (s === "settled" || s === "success" || s === "completed" || raw === "SUCCESS" || raw === "SETTLED") {
            updateTransactionStatus(rawHash, "settled", settledOut);
          } else if (
            s === "failed" ||
            s === "refunded" ||
            s === "expired" ||
            raw === "FAILED" ||
            raw === "REFUNDED" ||
            raw === "EXPIRED" ||
            raw === "INCOMPLETE_DEPOSIT"
          ) {
            updateTransactionStatus(rawHash, "failed");
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
      <main className="min-h-[100dvh] bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-on-surface-variant">Loading receipt…</span>
        </div>
      </main>
    );
  }

  const statusStr = (liveStatus?.status || tx?.status || "pending").toLowerCase();
  const isSettled = statusStr === "settled" || statusStr === "success" || statusStr === "completed";
  const isFailed = statusStr === "failed" || statusStr === "refunded" || statusStr === "expired";
  const fromAsset = tx?.fromAsset || liveStatus?.fromAsset || null;
  const toAsset = tx?.toAsset || liveStatus?.toAsset || null;
  const fromChain = tx?.fromChain || liveStatus?.chain || null;
  const toChain = tx?.toChain || liveStatus?.destinationChain || null;
  const amountIn = liveStatus?.depositedAmount || tx?.amountIn || liveStatus?.swapDetails?.amountInFormatted || "—";
  const amountOut = liveStatus?.settledAmount || liveStatus?.swapDetails?.amountOutFormatted || tx?.amountOut || "—";
  const depositAddress = tx?.depositAddress || liveStatus?.depositAddress || rawHash;
  const recipient = tx?.recipient || liveStatus?.recipient || null;
  const destExplorer: string | null =
    typeof liveStatus?.destinationExplorerUrl === "string" && liveStatus.destinationExplorerUrl.startsWith("https://")
      ? liveStatus.destinationExplorerUrl
      : null;
  const destTxHash: string | null = liveStatus?.destinationTxHash || null;
  const originTxHash: string | null = liveStatus?.originTxHash || liveStatus?.forwardTxHash || null;

  const statusLabel = isSettled
    ? "Complete"
    : isFailed
    ? statusStr === "refunded"
      ? "Refunded"
      : statusStr === "expired"
      ? "Expired"
      : "Failed"
    : "In progress";

  const Row = ({ label, value, copyKey }: { label: string; value: string; copyKey?: string }) => (
    <div className="flex items-center justify-between gap-3 min-h-[44px]">
      <span className="text-sm text-on-surface-variant">{label}</span>
      {copyKey ? (
        <button
          type="button"
          onClick={() => copyToClipboard(value, copyKey)}
          className="h-9 -mr-2 px-2 rounded-lg inline-flex items-center gap-1.5 font-mono text-sm text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          <span>{value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value}</span>
          {copiedKey === copyKey ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5 text-on-surface-variant" />}
        </button>
      ) : (
        <span className="text-sm text-on-surface text-right">{value}</span>
      )}
    </div>
  );

  return (
    <main className="min-h-[100dvh] bg-surface text-on-surface px-3 sm:px-4 py-4 sm:py-10 pb-safe">
      <div className="max-w-lg mx-auto space-y-4">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="h-10 -ml-2 px-2 rounded-xl inline-flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="rounded-2xl bg-surface-container border border-outline-variant p-5 sm:p-6 space-y-5">
          {/* Status hero */}
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isSettled ? "bg-secondary/15 text-secondary" : isFailed ? "bg-error/15 text-error" : "bg-warning/15 text-warning"
              }`}
            >
              {isSettled ? <CheckCircle2 className="w-6 h-6" /> : isFailed ? <AlertCircle className="w-6 h-6" /> : <Clock className="w-6 h-6 animate-pulse" />}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-on-surface">Swap {statusLabel.toLowerCase()}</h1>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {isSettled
                  ? toAsset && toChain
                    ? `${toAsset} delivered on ${chainName(toChain)}`
                    : "Swap delivered to destination"
                  : isFailed
                  ? statusStr === "refunded"
                    ? "Funds refunded to origin"
                    : statusStr === "expired"
                    ? "Deposit window expired"
                    : "This swap did not complete"
                  : "This page updates automatically"}
              </p>
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-px rounded-xl overflow-hidden bg-outline-variant border border-outline-variant">
            <div className="bg-surface-container-low p-3.5 min-w-0">
              <span className="text-xs text-on-surface-variant block">Sent</span>
              <span className="font-mono text-base font-semibold text-on-surface block truncate tabular-nums">
                {amountIn}{fromAsset ? ` ${fromAsset}` : ""}
              </span>
              <span className="text-[11px] text-on-surface-variant">{fromChain ? chainName(fromChain) : "Origin chain"}</span>
            </div>
            <div className="bg-surface-container-low p-3.5 min-w-0">
              <span className="text-xs text-on-surface-variant block">{isSettled ? "Received" : "Expected"}</span>
              <span className="font-mono text-base font-semibold text-secondary block truncate tabular-nums">
                {amountOut}{toAsset ? ` ${toAsset}` : ""}
              </span>
              <span className="text-[11px] text-on-surface-variant">{toChain ? chainName(toChain) : "Destination chain"}</span>
            </div>
          </div>

          {/* Details */}
          <div className="divide-y divide-outline-variant">
            <Row label="Status" value={statusLabel} />
            <Row label="Deposit address" value={depositAddress} copyKey="deposit" />
            {recipient && <Row label="Recipient" value={recipient} copyKey="recipient" />}
            {originTxHash && <Row label="Deposit tx" value={originTxHash} copyKey="origin" />}
            {destTxHash && <Row label="Delivery tx" value={destTxHash} copyKey="dest" />}
          </div>

          {destExplorer && (
            <a
              href={destExplorer}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 w-full rounded-xl bg-surface-container-high border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center justify-center gap-2 hover:border-outline transition-colors"
            >
              <span>View on explorer</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
