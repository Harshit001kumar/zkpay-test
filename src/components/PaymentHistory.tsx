"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, timeAgo, TransactionRecord } from "@/lib/history";
import { ScanLine, Building2, Wallet, Receipt } from "lucide-react";

export default function PaymentHistory() {
  const { ready, authenticated, address } = useActiveAccount();
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
      <div className="flex justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authenticated || !address) {
    return <div className="text-center p-8 text-sm text-outline">Sign in to view history.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-12 text-sm text-outline border border-dashed border-outline-variant rounded-xl m-4">
        No transactions yet. Make your first payment!
      </div>
    );
  }

  const renderIcon = (type: string) => {
    switch (type) {
      case "payment": return <ScanLine className="w-5 h-5" />;
      case "cashout": return <Building2 className="w-5 h-5" />;
      case "deposit": return <Wallet className="w-5 h-5" />;
      default: return <Receipt className="w-5 h-5" />;
    }
  };

  const getStatusColor = (type: string, status?: string) => {
    if (status === "pending") return "bg-warning";
    if (status === "failed") return "bg-error";
    return "bg-success";
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " • " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Table Header */}
      <div className="hidden md:grid grid-cols-12 px-8 py-3 bg-white/[0.02] border-b border-white/5">
        <div className="col-span-6 font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">ENTITY</div>
        <div className="col-span-3 font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">TIMESTAMP</div>
        <div className="col-span-3 text-right font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">VALUATION</div>
      </div>

      {transactions.map((tx, idx) => (
        <div
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className={`grid grid-cols-12 px-6 md:px-8 py-8 hover:bg-white/[0.03] transition-colors cursor-pointer group items-center ${idx !== transactions.length - 1 ? 'border-b border-white/5' : ''}`}
        >
          <div className="col-span-7 md:col-span-6 flex items-center gap-4">
            <div className={`w-[2px] h-[40px] rounded-sm ${getStatusColor(tx.type, tx.status)}`}></div>
            <div className={`w-12 h-12 rounded-sm flex items-center justify-center border ${tx.type === "deposit" ? "bg-primary/10 border-primary/20 text-primary" : "bg-white/[0.05] border-white/10 text-on-surface"}`}>
              {renderIcon(tx.type)}
            </div>
            <div>
              <span className={`block font-medium tracking-tight text-lg mb-0.5 ${tx.type === "deposit" ? "text-primary" : "text-on-surface"}`}>{tx.title}</span>
              <span className="md:hidden block font-label-caps text-[8px] text-on-surface-variant tracking-normal">{formatTime(tx.timestamp)}</span>
            </div>
          </div>
          
          <div className="hidden md:col-span-3 md:flex items-center">
            <span className="font-body-md text-on-surface-variant text-sm tracking-tight">{formatTime(tx.timestamp)}</span>
          </div>
          
          <div className="col-span-5 md:col-span-3 flex flex-col items-end justify-center">
            <span className={`font-medium tracking-tight text-xl font-bold ${tx.type === "deposit" ? "text-primary" : "text-on-surface"}`}>
              {tx.type === "deposit" ? "+" : "-"}₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`font-label-caps text-[8px] font-bold tracking-normal  ${tx.status === "pending" ? "text-warning" : tx.status === "failed" ? "text-error" : "text-success"}`}>
              {tx.status}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
