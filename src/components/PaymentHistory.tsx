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
    return <div className="text-center p-4 text-sm text-gray-500">Connect wallet to view history.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
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
      case "payment": return "bg-red-50 text-red-500";
      case "cashout": return "bg-orange-50 text-orange-500";
      case "deposit": return "bg-green-50 text-green-500";
      default: return "bg-gray-100 text-gray-500";
    }
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
      {transactions.map((tx) => (
        <button
          key={tx.hash}
          onClick={() => router.push(`/tx/${tx.hash}`)}
          className="flex justify-between items-center p-4 hover:bg-gray-50 transition-colors w-full text-left"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${getIconBg(tx.type)}`}>
              {getIcon(tx.type)}
            </div>
            <div>
              <p className="font-semibold text-sm">{tx.title}</p>
              <p className="text-xs text-gray-500">{timeAgo(tx.timestamp)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className={`font-semibold text-sm ${tx.type === "deposit" ? "text-green-600" : ""}`}>
              {tx.type === "deposit" ? "+" : "-"}₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}
