"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, TransactionRecord } from "@/lib/history";
import { useCurrency } from "@/context/CurrencyContext";
import { ScanLine, Building2, Wallet, Receipt, ArrowUpRight, ShieldCheck } from "lucide-react";

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
        <div className="w-6 h-6 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated || !address) {
    return (
      <div className="text-center p-10 font-mono text-xs uppercase tracking-[0.14em] text-[#8d90a1]">
        SIGN IN TO VIEW SETTLEMENT LEDGER
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="w-6 h-6 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    return tx.type === filter;
  });

  if (filteredTransactions.length === 0) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#8d90a1]">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.15em] text-[#e5e5e8]">
          {filter === "all"
            ? "NO SETTLEMENTS RECORDED YET"
            : `NO ${filter.toUpperCase()} RECORDS FOUND`}
        </div>
        <p className="text-xs text-[#8d90a1] max-w-xs">
          Execute a Scan &amp; Pay or Cash Out order to populate your cryptographic settlement ledger.
        </p>
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
    if (status === "pending") return "bg-[#fbbf24]";
    if (status === "failed") return "bg-[#f87171]";
    return "bg-[#34d399]";
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
    <div className="divide-y divide-white/[0.06]">
      {/* Desktop Ledger Header */}
      <div className="hidden md:grid grid-cols-12 px-7 py-3.5 bg-[#09090b]/60">
        <div className="col-span-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8d90a1]">
          SETTLEMENT ENTITY
        </div>
        <div className="col-span-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8d90a1]">
          TIMESTAMP
        </div>
        <div className="col-span-3 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-[#8d90a1]">
          VALUATION
        </div>
      </div>

      {filteredTransactions.map((tx) => (
        <div
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className="grid grid-cols-12 px-5 sm:px-7 py-5 hover:bg-white/[0.025] transition-colors cursor-pointer group items-center gap-2"
        >
          <div className="col-span-7 md:col-span-6 flex items-center gap-3.5 min-w-0">
            <div className={`w-1 h-9 rounded-full shrink-0 ${getStatusColor(tx.status)}`} />
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                tx.type === "deposit"
                  ? "bg-[#34d399]/10 border-[#34d399]/25 text-[#34d399]"
                  : "bg-[#09090b] border-white/[0.08] text-[#c0c6de] group-hover:border-[#c0c6de]/40"
              }`}
            >
              {renderIcon(tx.type)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight text-sm sm:text-base text-white truncate">
                  {tx.title}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#8d90a1] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <span className="md:hidden block font-mono text-[10px] text-[#8d90a1] tabular-nums mt-0.5">
                {formatTime(tx.timestamp)}
              </span>
            </div>
          </div>

          <div className="hidden md:col-span-3 md:flex items-center">
            <span className="font-mono text-xs text-[#8d90a1] tabular-nums">
              {formatTime(tx.timestamp)}
            </span>
          </div>

          <div className="col-span-5 md:col-span-3 flex flex-col items-end justify-center">
            <span
              className={`font-bold tracking-tight text-base sm:text-lg tabular-nums ${
                tx.type === "deposit" ? "text-[#34d399]" : "text-white"
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
                <span className="font-mono text-[10px] text-[#8d90a1] tabular-nums">
                  ${tx.amountUSDC.toFixed(2)} USDC
                </span>
              )}
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded ${
                  tx.status === "pending"
                    ? "bg-[#fbbf24]/10 text-[#fbbf24]"
                    : tx.status === "failed"
                    ? "bg-[#f87171]/10 text-[#f87171]"
                    : "bg-[#34d399]/10 text-[#34d399]"
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
