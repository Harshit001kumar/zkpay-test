"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTransactions, timeAgo, TransactionRecord } from "@/lib/history";

export default function PaymentHistory() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) {
      setLoading(false);
      return;
    }

    const txs = getTransactions();
    setTransactions(txs);
    setLoading(false);

    const interval = setInterval(() => {
      setTransactions(getTransactions());
    }, 3000);

    return () => clearInterval(interval);
  }, [ready, authenticated, wallets]);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-8 text-sm text-[#909097]">Connect wallet to view history.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-6 h-6 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-12 text-sm text-[#909097] border border-dashed border-[#46464c] rounded-xl m-4">
        No transactions yet. Make your first payment!
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "payment": return "qr_code_scanner";
      case "cashout": return "account_balance";
      case "deposit": return "account_balance_wallet";
      default: return "receipt_long";
    }
  };

  const getStatusColor = (type: string, status?: string) => {
    if (status === "pending") return "bg-amber-500";
    if (status === "failed") return "bg-red-500";
    return "bg-emerald-500";
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " • " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      {/* Table Header */}
      <div className="hidden md:grid grid-cols-12 px-8 py-3 bg-white/[0.02] border-b border-white/5">
        <div className="col-span-6 font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">ENTITY</div>
        <div className="col-span-3 font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">TIMESTAMP</div>
        <div className="col-span-3 text-right font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">VALUATION</div>
      </div>

      {transactions.map((tx, idx) => (
        <div
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className={`grid grid-cols-12 px-6 md:px-8 py-8 hover:bg-white/[0.03] transition-colors cursor-pointer group items-center ${idx !== transactions.length - 1 ? 'border-b border-white/5' : ''}`}
        >
          <div className="col-span-7 md:col-span-6 flex items-center gap-4">
            <div className={`w-[2px] h-[40px] rounded-sm ${getStatusColor(tx.type, tx.status)}`}></div>
            <div className={`w-12 h-12 rounded-sm flex items-center justify-center border ${tx.type === "deposit" ? "bg-[#c0c6de]/10 border-[#c0c6de]/20 text-[#c0c6de]" : "bg-white/[0.05] border-white/10 text-[#e5e2e3]"}`}>
              <span className="material-symbols-outlined">{getIcon(tx.type)}</span>
            </div>
            <div>
              <span className={`block font-medium tracking-tight text-lg mb-0.5 ${tx.type === "deposit" ? "text-[#c0c6de]" : "text-[#e5e2e3]"}`}>{tx.title}</span>
              <span className="md:hidden block font-label-caps text-[8px] text-[#c6c6cd] tracking-[0.1em]">{formatTime(tx.timestamp)}</span>
            </div>
          </div>
          
          <div className="hidden md:col-span-3 md:flex items-center">
            <span className="font-body-md text-[#c6c6cd] text-sm tracking-tight">{formatTime(tx.timestamp)}</span>
          </div>
          
          <div className="col-span-5 md:col-span-3 flex flex-col items-end justify-center">
            <span className={`font-medium tracking-tight text-xl font-bold ${tx.type === "deposit" ? "text-[#c0c6de]" : "text-[#e5e2e3]"}`}>
              {tx.type === "deposit" ? "+" : "-"}₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`font-label-caps text-[8px] font-bold tracking-[0.25em] uppercase ${tx.status === "pending" ? "text-amber-500" : tx.status === "failed" ? "text-red-500" : "text-emerald-400"}`}>
              {tx.status}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
