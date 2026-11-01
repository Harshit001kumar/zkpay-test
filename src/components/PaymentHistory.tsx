"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord } from "@/lib/history";
import { useCurrency } from "@/context/CurrencyContext";
import {
  ScanLine,
  Building2,
  Wallet,
  Receipt,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface PaymentHistoryProps {
  filter?: "all" | "payment" | "cashout";
}

export default function PaymentHistory({ filter = "all" }: PaymentHistoryProps) {
  const { ready, authenticated, address } = useActiveAccount();
  const { currencyMeta } = useCurrency();
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !authenticated || !address) {
      setLoading(false);
      return;
    }

    let lastRaw = "";
    try {
      lastRaw = localStorage.getItem("zkpay_transactions") || "";
    } catch {}

    const txs = getTransactions();
    setTransactions(txs);
    setLoading(false);

    const interval = setInterval(() => {
      try {
        const currentRaw = localStorage.getItem("zkpay_transactions") || "";
        if (currentRaw !== lastRaw) {
          lastRaw = currentRaw;
          setTransactions(getTransactions());
        }
      } catch {}
    }, 4000);

    return () => clearInterval(interval);
  }, [ready, authenticated, address]);

  if (!ready || (authenticated && !address)) {
    return (
      <div className="flex justify-center p-10">
        <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated || !address) {
    return (
      <div className="text-center p-10 text-xs font-medium text-on-surface-variant">
        Sign in to view settlement ledger
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    return tx.type === filter;
  });

  if (filteredTransactions.length === 0) {
    return (
      <div className="p-6 sm:p-7 flex flex-col gap-5">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-on-surface">
              {filter === "all"
                ? "No settlements recorded yet"
                : `No ${filter} records found`}
            </div>
            <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
              Every {currencyMeta.rail} QR payment and bank off-ramp generates a cryptographic receipt anchored on Base.
            </p>
          </div>
        </div>

        {/* 3-Step Settlement Pipeline Preview */}
        <div className="rounded-2xl bg-surface/60 border border-outline-variant/15 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-on-surface">
              How instant settlement works
            </span>
            <span className="text-[11px] font-medium text-secondary">
              {currencyMeta.code} / {currencyMeta.rail}
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-xs">
              <span className="w-5 h-5 rounded-full bg-surface-container border border-outline-variant/25 flex items-center justify-center font-mono text-[11px] font-bold text-primary shrink-0">
                1
              </span>
              <span className="text-on-surface-variant">
                Fund your gasless vault with Base USDC or bridge from 15+ chains
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="w-5 h-5 rounded-full bg-surface-container border border-outline-variant/25 flex items-center justify-center font-mono text-[11px] font-bold text-primary shrink-0">
                2
              </span>
              <span className="text-on-surface-variant">
                Scan any merchant {currencyMeta.rail} QR or enter a recipient ID
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="w-5 h-5 rounded-full bg-secondary/15 border border-secondary/35 flex items-center justify-center text-secondary shrink-0">
                <CheckCircle2 className="w-3 h-3" />
              </span>
              <span className="text-on-surface font-medium">
                Solver settles {currencyMeta.code} in seconds with on-chain proof
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderIcon = (type: string) => {
    switch (type) {
      case "payment":
        return <ScanLine className="w-4 h-4" />;
      case "cashout":
        return <Building2 className="w-4 h-4" />;
      case "deposit":
        return <Wallet className="w-4 h-4" />;
      default:
        return <Receipt className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status?: string) => {
    if (status === "pending") return "bg-warning";
    if (status === "failed") return "bg-error";
    return "bg-secondary";
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " / " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <div className="divide-y divide-outline-variant/15">
      {filteredTransactions.map((tx) => (
        <div
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className="px-4 sm:px-5 py-4 hover:bg-surface-container/60 transition-colors cursor-pointer group flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-1 h-8 rounded-full shrink-0 ${getStatusColor(tx.status)}`} />
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                tx.type === "deposit"
                  ? "bg-secondary/10 border-secondary/30 text-secondary"
                  : "bg-surface-container border-outline-variant/20 text-primary group-hover:border-primary/50"
              }`}
            >
              {renderIcon(tx.type)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight text-sm text-on-surface truncate">
                  {tx.title}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <span className="block font-mono text-[11px] text-on-surface-variant tabular-nums mt-0.5">
                {formatTime(tx.timestamp)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end justify-center shrink-0">
            <span
              className={`font-mono font-bold tracking-tight text-sm sm:text-base tabular-nums ${
                tx.type === "deposit" ? "text-secondary" : "text-on-surface"
              }`}
            >
              {tx.type === "deposit" ? "+" : "-"}
              {currencyMeta.symbol}
              {tx.amountINR.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {tx.amountUSDC > 0 && (
                <span className="font-mono text-[11px] text-on-surface-variant tabular-nums">
                  ${tx.amountUSDC.toFixed(2)}
                </span>
              )}
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  tx.status === "pending"
                    ? "bg-warning/15 text-warning"
                    : tx.status === "failed"
                    ? "bg-error/15 text-error"
                    : "bg-secondary/15 text-secondary"
                }`}
              >
                {tx.status || "settled"}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
