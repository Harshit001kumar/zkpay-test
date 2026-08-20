"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useCallback } from "react";
import { useReadContract } from "wagmi";
import PaymentEntry from "@/components/PaymentEntry";
import CashoutFlow from "@/components/CashoutFlow";
import PaymentHistory from "@/components/PaymentHistory";
import dynamic from "next/dynamic";
import { base } from "viem/chains";
import { formatUnits, erc20Abi } from "viem";
import { CONTRACTS, CHAIN } from "@/lib/constants";
import { MerchantData } from "@/lib/types";

import PayLinkModal from "@/components/PayLinkModal";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const DepositFlow = dynamic(() => import("@/components/DepositFlow"), { ssr: false });

type ActiveTab = "pay" | "cashout" | "deposit" | "vault";

export default function Dashboard() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("vault");
  const [isScanning, setIsScanning] = useState(false);
  const [merchantId, setMerchantId] = useState<MerchantData | null>(null);
  const [isPayLinkOpen, setIsPayLinkOpen] = useState(false);

  // Fetch USDC balance automatically via Wagmi useReadContract
  const walletAddress = wallets?.[0]?.address as `0x${string}` | undefined;
  
  const { data: bal } = useReadContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress ?? "0x0000000000000000000000000000000000000000"],
    chainId: base.id,
    query: {
      enabled: ready && authenticated && !!walletAddress,
      refetchInterval: 5000, // Poll every 5 seconds
    }
  });

  const balance = bal !== undefined ? formatUnits(bal as bigint, 6) : "0.00";

  const handleScan = useCallback((data: MerchantData) => {
    setIsScanning(false);
    setMerchantId(data);
  }, []);

  const switchTab = (tab: ActiveTab) => {
    if (tab === "pay") {
      setIsScanning(true);
    } else {
      setActiveTab(tab);
      setMerchantId(null);
    }
  };

  if (isScanning) {
    return <Scanner onScan={handleScan} onCancel={() => setIsScanning(false)} />;
  }

  if (merchantId) {
    return <PaymentEntry merchantData={merchantId} onCancel={() => setMerchantId(null)} />;
  }

  // Temporary fix for routing back to dashboard from sub-flows
  if (activeTab === "cashout") return <div className="p-8"><button onClick={() => setActiveTab("vault")} className="text-primary mb-4">&larr; Back</button><CashoutFlow /></div>;
  if (activeTab === "deposit") return <div className="p-8"><button onClick={() => setActiveTab("vault")} className="text-primary mb-4">&larr; Back</button><DepositFlow /></div>;

  return (
    <main className="relative z-10 max-w-[1440px] mx-auto pt-8 pb-24 px-5 md:px-8">
      {/* Hero Section */}
      <section className="mb-8">
        <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-8 md:p-12 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all hover:shadow-[0_30px_60px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.2)] group">
          <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[160px] leading-none text-white font-light">security</span>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">TOTAL PORTFOLIO</span>
              <div className="h-px w-8 bg-white/20"></div>
            </div>
            <h1 className="font-display-xl text-[#e5e2e3] text-5xl md:text-[80px] tracking-tighter mb-12 font-medium">
              ${balance} <span className="text-[#c6c6cd]/40 font-extralight text-3xl md:text-[80px]">USDC</span>
            </h1>
            <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-16 pt-8 border-t border-white/10">
              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">NETWORK</span>
                <span className="font-body-md font-medium tracking-tight text-[#e5e2e3]">{CHAIN.name}</span>
              </div>
              <div className="hidden md:block w-px h-8 bg-white/10"></div>
              <div className="flex flex-col gap-1 text-right md:text-left">
                <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">LAST SYNC</span>
                <span className="font-body-md font-medium text-[#c0c6de] tracking-tight">Just now</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Actions */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-12">
        <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          <button onClick={() => switchTab("pay")} className="bg-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-5 md:p-6 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-3 group hover:bg-white/10 transition-all border border-white/15 text-[#e5e2e3]">
            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">qr_code_scanner</span>
            <span className="font-label-caps text-[10px] tracking-[0.25em] font-bold">SCAN & PAY</span>
          </button>
          <button onClick={() => switchTab("cashout")} className="bg-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-5 md:p-6 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-3 group hover:bg-white/10 transition-all border border-white/15 text-[#e5e2e3]">
            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">north_east</span>
            <span className="font-label-caps text-[10px] tracking-[0.25em] font-bold">CASH OUT</span>
          </button>
          <button onClick={() => switchTab("deposit")} className="bg-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-5 md:p-6 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-3 group hover:bg-white/10 transition-all border border-white/15 text-[#e5e2e3]">
            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">south_west</span>
            <span className="font-label-caps text-[10px] tracking-[0.25em] font-bold">DEPOSIT</span>
          </button>
          <button onClick={() => setIsPayLinkOpen(true)} className="bg-gradient-to-b from-purple-950/40 to-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-5 md:p-6 rounded-xl flex flex-col items-center justify-center gap-2 md:gap-3 group hover:bg-purple-900/30 transition-all border border-purple-500/30 text-purple-200">
            <span className="material-symbols-outlined text-2xl text-purple-400 group-hover:scale-110 transition-transform">link</span>
            <span className="font-label-caps text-[10px] tracking-[0.25em] font-bold">PAY LINK</span>
          </button>
        </div>
        <div className="md:col-span-4 bg-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-6 rounded-xl flex items-center justify-between border border-white/15 text-[#e5e2e3]">
          <div>
            <p className="font-label-caps text-[9px] text-[#c6c6cd] mb-1 tracking-[0.25em] font-bold">DEVELOPER API</p>
            <a href="/docs" target="_blank" className="font-headline-md text-base text-purple-400 hover:text-purple-300 font-semibold tracking-tight flex items-center gap-1.5 transition-colors">
              Docs & Bots <span className="material-symbols-outlined text-sm">open_in_new</span>
            </a>
          </div>
          <div className="w-12 h-12 rounded-full border border-purple-500/30 flex items-center justify-center bg-purple-500/10">
            <span className="material-symbols-outlined text-purple-400 text-xl">terminal</span>
          </div>
        </div>
      </section>

      {/* Pay Link Modal */}
      <PayLinkModal isOpen={isPayLinkOpen} onClose={() => setIsPayLinkOpen(false)} />

      {/* Transaction Ledger */}
      <section>
        <div className="flex items-center justify-between mb-6 px-1 text-[#e5e2e3]">
          <h2 className="font-label-caps text-[10px] text-[#c6c6cd] tracking-[0.25em] font-bold">RECENT ACTIVITY</h2>
          <div className="flex gap-6">
            <button className="text-[9px] font-label-caps text-[#c0c6de] border-b border-[#c0c6de] font-bold tracking-[0.25em]">ALL</button>
            <button className="text-[9px] font-label-caps text-[#c6c6cd]/60 hover:text-[#e5e2e3] transition-colors font-bold tracking-[0.25em]">SENT</button>
            <button className="text-[9px] font-label-caps text-[#c6c6cd]/60 hover:text-[#e5e2e3] transition-colors font-bold tracking-[0.25em]">RECEIVED</button>
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden border border-white/15">
          <PaymentHistory />
        </div>
        <div className="mt-8 flex justify-center">
          <button className="font-label-caps text-[9px] font-bold text-[#c6c6cd] hover:text-[#c0c6de] transition-all flex items-center gap-3 tracking-[0.3em]">
             EXPORT AUDIT LOG <span className="material-symbols-outlined text-[14px]">download</span>
          </button>
        </div>
      </section>
    </main>
  );
}
