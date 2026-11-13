"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord, timeAgo } from "@/lib/history";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import { chainVisual } from "@/lib/chainVisuals";
import {
  ArrowRight,
  Search,
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Layers,
} from "lucide-react";

export function InAppActivity({ onNewSwap }: { onNewSwap?: () => void }) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "settled" | "failed">("all");
  const [search, setSearch] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setTransactions(getTransactions());
    load();
    const interval = setInterval(load, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filter === "pending" && (tx.status === "settled" || tx.status === "failed")) return false;
      if (filter === "settled" && tx.status !== "settled") return false;
      if (filter === "failed" && tx.status !== "failed") return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const str = `${tx.fromAsset || ""} ${tx.toAsset || ""} ${tx.depositAddress || ""} ${tx.hash || ""}`.toLowerCase();
        return str.includes(q);
      }
      return true;
    });
  }, [transactions, filter, search]);

  const pendingCount = useMemo(
    () => transactions.filter((t) => t.status !== "settled" && t.status !== "failed").length,
    [transactions]
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full pb-12 animate-fade-in-up">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary motion-safe:animate-pulse" />
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-on-surface">
              Swap Activity
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Real-time multi-chain settlements created on this device.
          </p>
        </div>

        {onNewSwap && (
          <button
            type="button"
            onClick={onNewSwap}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-2 hover:brightness-110 active:scale-95 transition-transform cursor-pointer"
          >
            <span>Start new swap</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter bar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container border border-outline-variant overflow-x-auto no-scrollbar">
          {(["all", "pending", "settled", "failed"] as const).map((tab) => {
            const isSel = filter === tab;
            const badge = tab === "pending" && pendingCount > 0 ? pendingCount : null;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  isSel
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span>
                  {tab === "all" ? "All Swaps" : tab === "pending" ? "In Progress" : tab === "settled" ? "Completed" : "Failed"}
                </span>
                {badge && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-secondary text-on-secondary text-[10px] font-bold">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset or address…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container border border-outline-variant text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary/60"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-[2rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
          <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-dashed border-outline-variant p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-container mx-auto flex items-center justify-center text-on-surface-variant border border-outline-variant">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-on-surface">No transactions found</h3>
              <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                {search ? "No swaps match your search criteria." : "Swaps you execute will appear here with live solver tracking and explorer links."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx) => {
            const isSettled = tx.status === "settled";
            const isFailed = tx.status === "failed";
            const fromAsset = tx.fromAsset || "SOL";
            const toAsset = tx.toAsset || "USDC";
            const fromChain = tx.fromChain || "sol";
            const toChain = tx.toChain || "base";
            const depAddr = tx.depositAddress || tx.hash || "";

            return (
              <div
                key={tx.hash + tx.timestamp}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/tx/${encodeURIComponent(depAddr)}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/tx/${encodeURIComponent(depAddr)}`);
                  }
                }}
                className="rounded-2xl p-4 bg-surface-container-low/90 border border-outline-variant hover:border-outline hover:bg-surface-container transition-all space-y-3 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Token icons + route */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center -space-x-2">
                      <CryptoIcon symbol={fromAsset} chain={fromChain} size="md" />
                      <CryptoIcon symbol={toAsset} chain={toChain} size="md" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-bold text-sm text-on-surface truncate">
                        <span>{fromAsset}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-on-surface-variant" />
                        <span>{toAsset}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                        <span>{chainVisual(fromChain).name}</span>
                        <span>→</span>
                        <span>{chainVisual(toChain).name}</span>
                        <span className="w-1 h-1 rounded-full bg-outline-variant" />
                        <span>{timeAgo(tx.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status chip & details link */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        isSettled
                          ? "bg-secondary/15 text-secondary border border-secondary/30"
                          : isFailed
                          ? "bg-error/15 text-error border border-error/30"
                          : "bg-warning/15 text-warning border border-warning/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSettled ? "bg-secondary" : isFailed ? "bg-error" : "bg-warning motion-safe:animate-pulse"
                        }`}
                      />
                      <span>{isSettled ? "Settled" : isFailed ? "Failed" : "In Progress"}</span>
                    </span>

                    <span className="w-7 h-7 rounded-lg bg-surface-container group-hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-on-surface transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* Amount details row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-outline-variant/60 text-xs">
                  <div className="p-2.5 rounded-xl bg-surface-container/60">
                    <span className="text-[10px] text-on-surface-variant block">You Sent</span>
                    <span className="font-mono font-semibold text-on-surface">
                      {tx.amountIn || "—"} {fromAsset}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-container/60">
                    <span className="text-[10px] text-on-surface-variant block">You Receive</span>
                    <span className="font-mono font-semibold text-secondary">
                      {tx.amountOut || "—"} {toAsset}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-container/60 col-span-2 sm:col-span-1 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] text-on-surface-variant block">Deposit Address</span>
                      <span className="font-mono text-[11px] text-on-surface truncate block">
                        {depAddr ? `${depAddr.slice(0, 8)}…${depAddr.slice(-6)}` : "—"}
                      </span>
                    </div>

                    {depAddr && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(depAddr, tx.hash);
                        }}
                        className="w-7 h-7 rounded-lg bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer shrink-0"
                        title="Copy deposit address"
                      >
                        {copiedKey === tx.hash ? (
                          <Check className="w-3.5 h-3.5 text-secondary" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
