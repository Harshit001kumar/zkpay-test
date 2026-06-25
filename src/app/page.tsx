"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useState, useEffect, useCallback } from "react";
import WalletConnect from "@/components/WalletConnect";
import PaymentEntry from "@/components/PaymentEntry";
import CashoutFlow from "@/components/CashoutFlow";
import PaymentHistory from "@/components/PaymentHistory";
import dynamic from "next/dynamic";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { CONTRACTS } from "@/lib/constants";
import { ERC20_ABI } from "@/lib/abi";

const Scanner = dynamic(() => import("@/components/Scanner"), { ssr: false });
const DepositFlow = dynamic(() => import("@/components/DepositFlow"), { ssr: false });

type ActiveTab = "pay" | "cashout" | "deposit";

export default function Home() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [balance, setBalance] = useState("0.00");
  const [activeTab, setActiveTab] = useState<ActiveTab>("pay");
  const [isScanning, setIsScanning] = useState(false);
  const [merchantId, setMerchantId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      if (!ready || !authenticated || !wallets.length) return;
      const wallet = wallets[0];

      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      try {
        const bal = await publicClient.readContract({
          address: CONTRACTS.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [wallet.address as `0x${string}`],
        });
        setBalance(formatUnits(bal as bigint, 6));
      } catch (e) {
        console.error("Failed to fetch balance", e);
      }
    }
    fetchBalance();
  }, [ready, authenticated, wallets]);

  const handleScan = useCallback((data: string) => {
    setIsScanning(false);
    setMerchantId(data);
  }, []);

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMerchantId(null);
  };

  // ─── Loading State ───
  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  // ─── Unauthenticated Landing ───
  if (!authenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full flex flex-col items-center gap-8 animate-fade-in-up">
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-4xl font-bold tracking-tighter">ZkPay</h1>
            <p className="text-center text-gray-500 text-sm leading-relaxed">
              Pay merchants in INR via UPI.<br />
              Settled instantly in USDC on Base.
            </p>
          </div>

          <div className="w-full flex flex-col gap-3">
            <button onClick={login} className="btn-primary w-full">
              Connect Wallet
            </button>
            <p className="text-center text-xs text-gray-400">
              Base Sepolia Testnet
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ─── Authenticated Dashboard ───
  return (
    <main className="min-h-screen pb-32 flex flex-col items-center">
      {isScanning && (
        <Scanner onScan={handleScan} onCancel={() => setIsScanning(false)} />
      )}

      <div className="w-full max-w-md px-5 pt-6 pb-4 flex flex-col gap-6">
        {/* Header */}
        <header className="flex justify-between items-center animate-fade-in-up">
          <h1 className="text-xl font-bold tracking-tight">ZkPay</h1>
          <WalletConnect />
        </header>

        {/* Balance Card */}
        <section
          className="bg-black text-white rounded-2xl p-6 flex flex-col items-center gap-1 animate-fade-in-up"
          style={{ animationDelay: "0.05s" }}
        >
          <p className="text-[11px] font-semibold tracking-widest uppercase text-white/50">
            USDC Balance
          </p>
          <h2 className="text-4xl font-bold tracking-tighter mt-1">${balance}</h2>
          <p className="text-xs text-white/40 mt-1">Base Sepolia</p>
        </section>

        {/* Tab Switcher */}
        <nav
          className="flex bg-gray-100 rounded-lg p-1 gap-1 animate-fade-in-up"
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
              className={`flex-1 text-sm font-semibold py-2.5 rounded-md transition-all ${
                activeTab === tab.id
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-500 hover:text-black"
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
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold">Scan to Pay</h3>
                <p className="text-sm text-gray-500 mt-1">
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
            <PaymentEntry
              merchantId={merchantId}
              onCancel={() => setMerchantId(null)}
            />
          )}

          {/* ── Cash Out Tab ── */}
          {activeTab === "cashout" && <CashoutFlow />}

          {/* ── Deposit Tab ── */}
          {activeTab === "deposit" && <DepositFlow />}
        </div>

        {/* Recent Activity */}
        <section
          className="animate-fade-in-up border-t border-gray-100 pt-6"
          style={{ animationDelay: "0.2s" }}
        >
          <h3 className="text-base font-bold mb-3">Recent Activity</h3>
          <PaymentHistory />
        </section>
      </div>
    </main>
  );
}
