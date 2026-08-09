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
      <main className="min-h-screen flex items-center justify-center bg-[#131315]">
        <div className="w-8 h-8 border-2 border-[#c0c6de] border-t-transparent rounded-full animate-spin"></div>
      </main>
    );
  }

  if (!tx) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#131315] px-6 gap-4">
        <p className="text-[#909097] text-sm">Transaction not found.</p>
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
    <main className="min-h-screen pt-20 pb-12 px-5 flex flex-col items-center justify-start overflow-hidden relative bg-[#131315] selection:bg-[#c0c6de] selection:text-[#2a3043]">
      
      {/* Transaction Canvas */}
      <div className="w-full max-w-[480px] glass-card p-6 md:p-10 space-y-12 rounded-xl mt-4">
        
        {/* Status Header */}
        <section className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 rounded-full border-[3px] border-[#c0c6de] flex items-center justify-center animate-receipt-pop text-[#c0c6de]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold uppercase tracking-widest text-[#e5e2e3]">
              {isPayment ? "Payment Successful" : isCashout ? "Cash Out Successful" : "Transaction Complete"}
            </h1>
            <p className="text-sm text-[#909097] font-medium">Your transaction has been finalized on-chain.</p>
          </div>
        </section>

        {/* Amount Section */}
        <section className="py-10 border-y border-[#46464c] text-center space-y-3">
          <div className="text-4xl md:text-5xl font-extrabold tracking-tighter text-[#c0c6de]">
            ₹{tx.amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="font-mono text-sm text-[#909097] flex items-center justify-center gap-2 font-medium">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {tx.amountUSDC.toFixed(2)} USDC
          </div>
        </section>

        {/* Details Section */}
        <section className="space-y-6">
          <h3 className="label-caps border-b border-[#46464c] pb-2">
            Transaction Details
          </h3>
          <div className="space-y-4">
            
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#909097]">
                {isPayment ? "Paid To" : isCashout ? "Cash Out To" : "Recipient"}
              </span>
              <div className="text-right flex flex-col items-end">
                <p className="font-bold text-[#e5e2e3] text-sm max-w-[150px] truncate" title={tx.recipient}>
                  {tx.recipient}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#909097]">Date & Time</span>
              <div className="text-right">
                <p className="font-mono text-sm font-medium text-[#e5e2e3]">{formattedDate}</p>
                <p className="font-mono text-xs text-[#909097] mt-0.5">{formattedTime}</p>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#909097]">Network</span>
              <span className="text-sm font-bold text-[#e5e2e3] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#c0c6de]"></span>
                {tx.network}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-[#909097]">Platform Fee (1%)</span>
              <span className="font-mono text-sm font-medium text-[#e5e2e3]">
                ₹{tx.fee.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-sm font-semibold text-[#909097]">Transaction Hash</span>
              <a
                href={`https://basescan.org/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 glass-card-static px-3 py-1.5 rounded cursor-pointer hover:bg-white/5 transition-colors group"
              >
                <span className="font-mono text-xs font-medium text-[#c0c6de] underline">
                  {shortHash}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#909097] group-hover:text-[#c0c6de] transition-colors">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </a>
            </div>

          </div>
        </section>

        {/* Actions */}
        <section className="grid grid-cols-1 gap-3 pt-2">
          <button
            onClick={() => router.push("/")}
            className="w-full btn-primary"
          >
            Back to Home
          </button>
          <a
            href={`https://basescan.org/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full btn-secondary flex items-center justify-center gap-2"
          >
            View on BaseScan
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </section>

      </div>

      {/* Decorative Aesthetic Element */}
      <div className="mt-10 text-center opacity-40 select-none">
        <span className="font-mono text-[10px] font-bold tracking-[0.4em] text-[#909097]">SECURE PROTOCOL • ZK-SNARK VERIFIED</span>
      </div>

    </main>
  );
}
