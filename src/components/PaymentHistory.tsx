"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

interface Transaction {
  id: string;
  type: "payment" | "cashout" | "deposit";
  title: string;
  amount: string;
  date: string;
}

export default function PaymentHistory() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !authenticated || !wallets.length) {
      setLoading(false);
      return;
    }

    // In production, fetch from subgraph or indexer
    // For testnet demo, show placeholder data
    setTransactions([
      { id: "1", type: "payment", title: "Merchant Payment", amount: "-₹505.00", date: "Just now" },
      { id: "2", type: "deposit", title: "Deposit (ETH → USDC)", amount: "+₹8,350.00", date: "2 hours ago" },
      { id: "3", type: "cashout", title: "Cash Out to UPI", amount: "-₹2,020.00", date: "Yesterday" },
    ]);
    setLoading(false);
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

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
      {transactions.map((tx) => (
        <div key={tx.id} className="flex justify-between items-center p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-lg">
              {getIcon(tx.type)}
            </div>
            <div>
              <p className="font-semibold text-sm">{tx.title}</p>
              <p className="text-xs text-gray-500">{tx.date}</p>
            </div>
          </div>
          <p className={`font-semibold text-sm ${tx.amount.startsWith('+') ? 'text-green-600' : ''}`}>
            {tx.amount}
          </p>
        </div>
      ))}
    </div>
  );
}
