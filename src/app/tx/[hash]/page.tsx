"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getTransactionByHash, TransactionRecord } from "@/lib/history";

export default function TransactionReceipt() {
  const params = useParams();
  const router = useRouter();
  const [tx, setTx] = useState<TransactionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hash = params.hash as string;
    if (hash) {
      const record = getTransactionByHash(hash);
      setTx(record);
    }
    setLoading(false);
  }, [params.hash]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      </main>
    );
  }

  if (!tx) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 gap-4">
        <p className="text-gray-500 text-sm">Transaction not found.</p>
        <button onClick={() => router.push("/")} className="btn-primary px-8">
          Go Home
        </button>
      </main>
    );
  }

  const isPayment = tx.type === "payment";
  const isCashout = tx.type === "cashout";
  const date = new Date(tx.timestamp);
  const formattedDate = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const shortHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}`;

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      {/* ─── Success Banner ─── */}
      <div className="w-full bg-black text-white flex flex-col items-center pt-14 pb-10 px-6 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-white/5"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5"></div>

        {/* Animated checkmark */}
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-5 animate-receipt-pop">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <p className="text-sm text-white/60 uppercase tracking-widest font-semibold mb-1">
          {isPayment ? "Payment Successful" : isCashout ? "Cash Out Successful" : "Transaction Complete"}
        </p>

        <h1 className="text-5xl font-bold tracking-tight mt-1">
          ₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </h1>

        <p className="text-white/40 text-sm mt-2">
          ≈ {tx.amountUSDC.toFixed(2)} USDC
        </p>
      </div>

      {/* ─── Transaction Details Card ─── */}
      <div className="w-full max-w-md px-5 -mt-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
          {/* Recipient */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">
              {isPayment ? "Paid To" : isCashout ? "Cash Out To" : "Recipient"}
            </p>
            <p className="text-base font-bold text-black truncate">{tx.recipient}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-0">
            <div className="px-5 py-4 border-b border-r border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Date</p>
              <p className="text-sm font-semibold">{formattedDate}</p>
            </div>
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Time</p>
              <p className="text-sm font-semibold">{formattedTime}</p>
            </div>
            <div className="px-5 py-4 border-b border-r border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Network</p>
              <p className="text-sm font-semibold">{tx.network}</p>
            </div>
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Fee (1%)</p>
              <p className="text-sm font-semibold">₹{tx.fee.toFixed(2)}</p>
            </div>
          </div>

          {/* Tx Hash */}
          <div className="px-5 py-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Transaction Hash</p>
            <a
              href={`https://sepolia.basescan.org/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-blue-600 underline break-all"
            >
              {shortHash}
            </a>
          </div>
        </div>
      </div>

      {/* ─── Actions ─── */}
      <div className="w-full max-w-md px-5 mt-6 flex flex-col gap-3 pb-10">
        <a
          href={`https://sepolia.basescan.org/tx/${tx.hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full text-center py-3 border-2 border-black rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors"
        >
          View on BaseScan
        </a>
        <button
          onClick={() => router.push("/")}
          className="btn-primary w-full py-3"
        >
          Back to Home
        </button>
      </div>
    </main>
  );
}
