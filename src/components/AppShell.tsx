"use client";

import { useState, useEffect } from "react";
import BottomNav, { BottomNavTab } from "./BottomNav";
import Dashboard from "./Dashboard";
import EarnFlow from "./EarnFlow";
import WalletConnect from "./WalletConnect";
import CardsWaitlist from "./CardsWaitlist";
import Profile from "./Profile";
import CurrencyModal from "./CurrencyModal";
import { Shield } from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { usePrivy } from "@privy-io/react-auth";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");
  const { address, authenticated } = useActiveAccount();
  const { getAccessToken } = usePrivy();

  // Capture ?tab= or ?ref= query parameter
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("tab") as BottomNavTab;
      if (tabParam && ["home", "earn", "cards", "profile"].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Global Header — Frosted Obsidian Glass */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface/95  z-40 px-5 md:px-8 flex justify-between items-center border-b border-white/10 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
            <Shield className="w-4 h-4" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
            <span className="text-primary">Zk</span>Pay
          </h1>
        </div>

        <WalletConnect />
      </header>

      {/* Main Content Area */}
      <main className="pt-20 pb-24 min-h-screen">
        {activeTab === "home" && <Dashboard />}
        {activeTab === "earn" && <EarnFlow />}
        {activeTab === "cards" && <CardsWaitlist />}
        {activeTab === "profile" && <Profile />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Global Currency Modals */}
      <CurrencyModal mode="onboarding" />
      <CurrencyModal mode="selector" />
    </div>
  );
}
