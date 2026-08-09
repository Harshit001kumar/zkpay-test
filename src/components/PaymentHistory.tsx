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

    // Load real transactions from localStorage
    const txs = getTransactions();
    setTransactions(txs);
    setLoading(false);

    // Re-check every 3 seconds to pick up new transactions
    const interval = setInterval(() => {
      setTransactions(getTransactions());
    }, 3000);

    return () => clearInterval(interval);
  }, [ready, authenticated, wallets]);

  if (!ready || !authenticated || !wallets.length) {
    return <div className="text-center p-4 text-sm text-[#909097]">Connect wallet to view history.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <div className="w-6 h-6 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-8 text-sm text-[#909097] border border-dashed border-[#46464c] rounded-xl">
        No transactions yet. Make your first payment!
      </div>
    );
  }

  const getIcon = (type: string) => {
    switch (type) {
      case "payment": return "↑";
      case "cashout": return "↓";
      case "deposit": return "+";
      default: return "•";
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case "payment": return "bg-[#ffb4ab]/10 text-[#ffb4ab]";
      case "cashout": return "bg-[#bcc7de]/10 text-[#bcc7de]";
      case "deposit": return "bg-emerald-400/10 text-emerald-400";
      default: return "glass-card-static text-[#909097]";
    }
  };

  return (
    <div className="w-full glass-card overflow-hidden divide-y divide-[#46464c]">
      {transactions.map((tx) => (
        <button
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className="flex justify-between items-center p-4 hover:bg-white/5 transition-colors w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${getIconBg(tx.type)}`}>
              {getIcon(tx.type)}
            </div>
            <div>
              <p className="font-semibold text-sm text-[#e5e2e3]">{tx.title}</p>
              <p className="text-xs text-[#909097]">{timeAgo(tx.timestamp)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className={`font-semibold text-sm ${tx.type === "deposit" ? "text-emerald-400" : "text-[#e5e2e3]"}`}>
              {tx.type === "deposit" ? "+" : "-"}₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#46464c]">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}
