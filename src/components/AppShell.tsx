"use client";

import { useState } from "react";
import BottomNav, { BottomNavTab } from "./BottomNav";
import Dashboard from "./Dashboard";
import EarnFlow from "./EarnFlow";
import WalletConnect from "./WalletConnect";
import CardsWaitlist from "./CardsWaitlist";
import Profile from "./Profile";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");

  return (
    <div className="min-h-screen bg-[#131315]">
      {/* Global Header — Frosted Glass */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#131315]/80 backdrop-blur-glass z-40 px-5 flex justify-between items-center border-b border-[#46464c]">
        <h1 className="text-xl font-bold tracking-tight text-[#e5e2e3]">
          <span className="text-[#c0c6de]">Zk</span>Pay
        </h1>
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
    </div>
  );
}
