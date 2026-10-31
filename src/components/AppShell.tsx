"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import WalletConnect from "./WalletConnect";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import BottomNav from "./BottomNav";
import EarnFlow from "./EarnFlow";
import CardsWaitlist from "./CardsWaitlist";
import Profile from "./Profile";
import CurrencyModal from "./CurrencyModal";
import { useCurrency } from "@/context/CurrencyContext";
import { SpatialCanvas3D } from "@/components/ui/SpatialCanvas3D";

export type NavTab = "home" | "earn" | "cards" | "profile";

export default function AppShell() {
  const { ready, authenticated, login } = useActiveAccount();
  const { currencyMeta, setIsSelectorOpen } = useCurrency();
  const [activeTab, setActiveTab] = useState<NavTab>("home");

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#050608] gap-4">
        <div className="p-1.5 rounded-2xl bg-[#0B0E14] border border-[#2970FF]/25">
          <div className="w-12 h-12 rounded-xl bg-[#111622] border border-[#2970FF]/20 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(41,112,255,0.2)]">
            <div className="w-5 h-5 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A94A6]">
          INITIALIZING ZKPAY SPATIAL ENCLAVE
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#050608] text-[#F8FAFC] relative overflow-x-hidden selection:bg-[#2970FF]/30">
      {/* Persistent 3D Spatial Continuity Layer (Low-Opacity Orbital Field) */}
      <div className="opacity-35 pointer-events-none">
        <SpatialCanvas3D />
      </div>

      {/* Global Currency Onboarding & Selector Modals */}
      <CurrencyModal mode="onboarding" />
      <CurrencyModal mode="selector" />

      {/* Floating 3D Double-Bezel Glass Island Header */}
      <header className="fixed top-3.5 inset-x-0 z-40 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto flex justify-center">
          <div className="pointer-events-auto w-full p-1 rounded-full bg-[#0B0E14]/85 border border-[#2970FF]/25 backdrop-blur-2xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9)]">
            <div className="px-3.5 sm:px-5 py-2 rounded-full bg-[#0B0E14]/95 border border-white/[0.07] shadow-[inset_0_1px_0_rgba(41,112,255,0.18)] flex items-center justify-between gap-2">
              {/* Brand Emblem */}
              <button
                type="button"
                onClick={() => setActiveTab("home")}
                className="flex items-center gap-2.5 text-left group cursor-pointer active:scale-95 transition-transform"
              >
                <div className="w-8 h-8 rounded-full bg-[#CCFF00] text-[#050608] flex items-center justify-center font-extrabold text-xs tracking-tighter shadow-[0_0_20px_rgba(204,255,0,0.35)]">
                  Z
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm tracking-tight text-[#F8FAFC]">
                      ZKPAY
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 font-mono text-[9px] text-[#CCFF00] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse" />
                      BASE L2
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A94A6] hidden xs:block">
                    ZERO-KNOWLEDGE RAIL
                  </span>
                </div>
              </button>

              {/* Right Cluster: Global Rail Selector + Wallet Pill */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSelectorOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-[#111622] hover:bg-[#161D2B] border border-[#2970FF]/25 hover:border-[#2970FF]/50 transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Switch global fiat settlement rail"
                >
                  <Globe className="w-3.5 h-3.5 text-[#2970FF]" />
                  <span className="font-mono text-[11px] font-bold text-[#F8FAFC] tabular-nums">
                    {currencyMeta.code}
                  </span>
                  <span className="hidden md:inline font-mono text-[10px] text-[#8A94A6]">
                    / {currencyMeta.rail}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#8A94A6]" />
                </button>

                <WalletConnect />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-32 relative">
        {activeTab === "home" && <Dashboard />}
        {activeTab === "earn" && <EarnFlow />}
        {activeTab === "cards" && <CardsWaitlist />}
        {activeTab === "profile" && <Profile onBack={() => setActiveTab("home")} />}
      </main>

      {/* Machined Double-Bezel Bottom Navigation Dock */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
