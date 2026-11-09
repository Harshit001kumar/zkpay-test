"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord, timeAgo } from "@/lib/history";
import { ArrowRightLeft, ChevronRight } from "lucide-react";

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
          settled ? "bg-secondary" : failed ? "bg-error" : "bg-warning animate-pulse"
        }`}
      />
      {settled ? "Complete" : failed ? "Failed" : "Pending"}
    </span>
  );
}

export default function PaymentHistory() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  useEffect(() => {
    const load = () => {
      setTransactions(getTransactions());
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, []);

  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant p-8 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-surface-container mx-auto flex items-center justify-center text-on-surface-variant">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
        <p className="text-sm font-medium text-on-surface">No swaps yet</p>
        <p className="text-xs text-on-surface-variant max-w-xs mx-auto">
          Swaps you start from this device show up here so you can track them.
        </p>
      </div>
    );
  }

  return (
    <ul className="rounded-2xl bg-surface-container border border-outline-variant divide-y divide-outline-variant overflow-hidden">
      {transactions.slice(0, 12).map((tx) => {
        const title =
          tx.fromAsset && tx.toAsset
            ? `${tx.fromAsset} → ${tx.toAsset}`
            : tx.title || "Cross-chain swap";

        return (
          <li key={tx.hash + tx.timestamp}>
            <button
              type="button"
              onClick={() => router.push(`/tx/${encodeURIComponent(tx.depositAddress || tx.hash)}`)}
              className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-container-high active:bg-surface-container-high transition-colors cursor-pointer"
            >
              <div className="min-w-0 space-y-0.5">
                <span className="block text-sm font-semibold text-on-surface truncate">{title}</span>
                <span className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <StatusDot status={tx.status} />
                  <span aria-hidden="true">·</span>
                  <span>{timeAgo(tx.timestamp)}</span>
                </span>
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
  );
}
