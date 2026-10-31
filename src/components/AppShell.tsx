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
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-surface gap-4">
        <div className="w-12 h-12 rounded-xl bg-surface-container border border-primary/25 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        </div>
        <span className="text-xs font-medium text-on-surface-variant">
          Initializing ZkPay enclave…
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-surface text-on-surface relative overflow-x-hidden selection:bg-primary/30">
      {/* Persistent 3D Spatial Continuity Layer (Low-Opacity Orbital Field) */}
      <div className="opacity-35 pointer-events-none">
        <SpatialCanvas3D />
      </div>

      {/* Global Currency Onboarding & Selector Modals */}
      <CurrencyModal mode="onboarding" />
      <CurrencyModal mode="selector" />

      {/* Floating Island Header */}
      <header className="fixed top-3.5 inset-x-0 z-40 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto flex justify-center">
          <div className="pointer-events-auto w-full px-3.5 sm:px-5 py-2.5 rounded-full bg-surface-container-low/95 border border-primary/25 backdrop-blur-xl shadow-elevated flex items-center justify-between gap-2">
            {/* Brand Emblem */}
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="flex items-center gap-2.5 text-left group cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
            >
              <div className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-extrabold text-xs tracking-tighter">
                Z
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-on-surface">
                    ZkPay
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/30 text-[10px] text-secondary font-semibold">
                    Base L2
                  </span>
                </div>
                <span className="text-[11px] font-medium text-on-surface-variant hidden xs:block">
                  Zero-knowledge rail
                </span>
              </div>
            </button>

            {/* Right Cluster: Global Rail Selector + Wallet Pill */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSelectorOpen(true)}
                className="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high border border-primary/25 hover:border-primary/50 transition-colors flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
                title="Switch global fiat settlement rail"
              >
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[11px] font-bold text-on-surface tabular-nums">
                  {currencyMeta.code}
                </span>
                <span className="hidden md:inline text-[11px] text-on-surface-variant">
                  / {currencyMeta.rail}
                </span>
                <ChevronDown className="w-3 h-3 text-on-surface-variant" />
              </button>

              <WalletConnect />
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
