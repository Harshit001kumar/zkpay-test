"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord, timeAgo } from "@/lib/history";
import { ArrowRightLeft, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";

function StatusDot({ status }: { status?: string | null }) {
  const s = status || "pending";
  const settled = s === "settled";
  const failed = s === "failed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
        settled ? "text-secondary" : failed ? "text-error" : "text-warning"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          settled ? "bg-secondary" : failed ? "bg-error" : "bg-warning motion-safe:animate-pulse"
        }`}
      />
      <span>{settled ? "Complete" : failed ? "Failed" : "Pending"}</span>
    </span>
  );
}

export default function PaymentHistory() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "settled">("all");

  useEffect(() => {
    const load = () => {
      setTransactions(getTransactions());
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return transactions;
    if (filter === "pending") return transactions.filter((t) => t.status !== "settled" && t.status !== "failed");
    return transactions.filter((t) => t.status === "settled");
  }, [transactions, filter]);

  if (transactions.length === 0) {
    return (
      <div className="rounded-[1.75rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low border border-dashed border-outline-variant p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container mx-auto flex items-center justify-center text-on-surface-variant border border-outline-variant">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-on-surface">No swaps yet</p>
            <p className="text-xs text-on-surface-variant max-w-xs mx-auto leading-relaxed">
              Swaps created on this device appear here automatically with real-time settlement tracking.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] p-1.5 bg-surface-container-low/90 border border-outline-variant shadow-elevated space-y-3">
      {/* Filter Tabs Header */}
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-1.5 text-xs">
          {(["all", "pending", "settled"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                filter === tab
                  ? "bg-surface-container-high text-on-surface font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab === "all" ? "All Swaps" : tab === "pending" ? "Pending" : "Completed"}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-mono text-on-surface-variant">
          {filteredTransactions.length} {filteredTransactions.length === 1 ? "swap" : "swaps"}
        </span>
      </div>

      {/* Transaction List */}
      <ul className="rounded-[calc(1.75rem-0.375rem)] bg-surface-container-low border border-outline-variant divide-y divide-outline-variant overflow-hidden">
        {filteredTransactions.slice(0, 10).map((tx) => {
          const title =
            tx.fromAsset && tx.toAsset
              ? `${tx.fromAsset} → ${tx.toAsset}`
              : tx.title || "Cross-chain swap";

          return (
            <li key={tx.hash + tx.timestamp}>
              <button
                type="button"
                onClick={() => router.push(`/tx/${encodeURIComponent(tx.depositAddress || tx.hash)}`)}
                className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-container active:bg-surface-container-high transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="min-w-0 space-y-1">
                  <span className="block text-sm font-semibold text-on-surface truncate">{title}</span>
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <StatusDot status={tx.status} />
                    <span className="w-1 h-1 rounded-full bg-outline-variant" />
                    <span>{timeAgo(tx.timestamp)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    {tx.amountIn && tx.fromAsset ? (
                      <span className="block font-mono text-sm text-on-surface tabular-nums">
                        {tx.amountIn} {tx.fromAsset}
                      </span>
                    ) : (
                      <span className="block font-mono text-sm text-on-surface tabular-nums">
                        ${typeof tx.amountUSDC === "number" ? tx.amountUSDC.toFixed(2) : "0.00"}
                      </span>
                    )}
                    {tx.amountOut && tx.toAsset && (
                      <span className="block font-mono text-xs text-on-surface-variant tabular-nums">
                        {tx.amountOut} {tx.toAsset}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
