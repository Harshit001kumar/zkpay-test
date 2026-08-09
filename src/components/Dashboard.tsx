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

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const DepositFlow = dynamic(() => import("@/components/DepositFlow"), { ssr: false });

type ActiveTab = "pay" | "cashout" | "deposit";

export default function Dashboard() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("pay");
  const [isScanning, setIsScanning] = useState(false);
  const [merchantId, setMerchantId] = useState<MerchantData | null>(null);

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
    setActiveTab(tab);
    setMerchantId(null);
  };

  return (
    <div className="flex flex-col items-center">
      {isScanning && (
        <Scanner onScan={handleScan} onCancel={() => setIsScanning(false)} />
      )}

      <div className="w-full max-w-md px-5 flex flex-col gap-6">

        {/* Balance Card — Glass */}
        <section
          className="glass-card p-6 flex flex-col items-center gap-1 animate-fade-in-up animate-glow-pulse"
          style={{ animationDelay: "0.05s" }}
        >
          <p className="label-caps text-[#909097]">
            USDC Balance
          </p>
          <h2 className="text-4xl font-bold tracking-tighter mt-1 text-[#e5e2e3]">${balance}</h2>
          <p className="text-xs text-[#46464c] mt-1">{CHAIN.name}</p>
        </section>

        {/* Tab Switcher — Glass Pill */}
        <nav
          className="flex glass-card-static p-1 gap-1 animate-fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          {([
            { id: "pay" as ActiveTab, label: "Pay" },
            { id: "cashout" as ActiveTab, label: "Cash Out" },
            { id: "deposit" as ActiveTab, label: "Deposit" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "bg-white/10 text-[#c0c6de] shadow-sm"
                  : "text-[#909097] hover:text-[#c6c6cd]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
          {/* ── Pay Tab ── */}
          {activeTab === "pay" && !merchantId && (
            <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-[#c0c6de]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#e5e2e3]">Scan to Pay</h3>
                <p className="text-sm text-[#909097] mt-1">
                  Scan a merchant QR code to pay in INR via UPI.
                </p>
              </div>
              <button
                onClick={() => setIsScanning(true)}
                className="btn-primary w-full mt-2"
              >
                Open Scanner
              </button>
            </div>
          )}

          {activeTab === "pay" && merchantId && (
            <PaymentEntry merchantData={merchantId} onCancel={() => setMerchantId(null)} />
          )}

          {/* ── Cash Out Tab ── */}
          {activeTab === "cashout" && <CashoutFlow />}

          {/* ── Deposit Tab ── */}
          {activeTab === "deposit" && <DepositFlow />}
        </div>

        {/* Recent Activity */}
        {activeTab === "pay" && !merchantId && (
          <section
            className="animate-fade-in-up border-t border-[#46464c] pt-6"
            style={{ animationDelay: "0.2s" }}
          >
            <h3 className="text-base font-bold mb-3 text-[#e5e2e3]">Recent Activity</h3>
            <PaymentHistory />
          </section>
        )}
      </div>
    </div>
  );
}
