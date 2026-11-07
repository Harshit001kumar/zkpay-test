"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord, timeAgo } from "@/lib/history";
import {
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

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
      <div className="rounded-2xl bg-surface-container-low border border-outline-variant/15 p-8 text-center space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-surface-container border border-outline-variant/20 mx-auto flex items-center justify-center text-on-surface-variant">
          <ArrowRightLeft className="w-4 h-4" />
        </div>
        <p className="text-xs font-semibold text-on-surface">No recent swaps yet</p>
        <p className="text-[11px] text-on-surface-variant max-w-xs mx-auto">
          Your cross-chain swaps executed from this browser will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {transactions.slice(0, 12).map((tx) => {
        const isSettled = tx.status === "settled";
        const isFailed = tx.status === "failed";
        const title =
          tx.fromAsset && tx.toAsset
            ? `${tx.fromAsset} → ${tx.toAsset}`
            : tx.title || "Cross-Chain Swap";

        return (
          <button
            key={tx.hash + tx.timestamp}
            type="button"
            onClick={() => router.push(`/tx/${encodeURIComponent(tx.depositAddress || tx.hash)}`)}
            className="w-full p-3.5 rounded-2xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/15 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-center shrink-0 text-secondary">
                {isSettled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isFailed ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-300" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                    {title}
                  </span>
                  <span className="text-[10px] font-mono text-on-surface-variant uppercase">
                    {tx.network}
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant block truncate">
                  {timeAgo(tx.timestamp)} · {tx.recipient ? `${tx.recipient.slice(0, 6)}…${tx.recipient.slice(-4)}` : ""}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                {tx.amountIn && tx.fromAsset ? (
                  <span className="block font-mono text-xs font-bold text-on-surface">
                    {tx.amountIn} {tx.fromAsset}
                  </span>
                ) : (
                  <span className="block font-mono text-xs font-bold text-on-surface">
                    ${tx.amountUSDC?.toFixed(2)}
                  </span>
                )}
                {tx.amountOut && tx.toAsset && (
                  <span className="block font-mono text-[11px] text-secondary">
                    → {tx.amountOut} {tx.toAsset}
                  </span>
                )}
              </div>
              <ArrowUpRight className="w-4 h-4 text-on-surface-variant group-hover:text-on-surface transition-colors" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
