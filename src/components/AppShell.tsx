"use client";

import { useState } from "react";
import BottomNav, { BottomNavTab } from "./BottomNav";
import Dashboard from "./Dashboard";
import EarnFlow from "./EarnFlow";
import WalletConnect from "./WalletConnect";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");

  return (
    <div className="min-h-screen bg-white">
      {/* Global Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md z-40 px-5 flex justify-between items-center border-b border-gray-100">
        <h1 className="text-xl font-bold tracking-tight">ZkPay</h1>
        <WalletConnect />
      </header>

      {/* Main Content Area */}
      <main className="pt-20 pb-24 min-h-screen">
        {activeTab === "home" && <Dashboard />}
        {activeTab === "earn" && <EarnFlow />}
        
        {activeTab === "cards" && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <h2 className="text-2xl font-bold mb-2">ZkPay Cards</h2>
            <p className="text-gray-500">Virtual and physical cards are coming soon.</p>
          </div>
        )}
        
        {activeTab === "profile" && (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <h2 className="text-2xl font-bold mb-2">Profile</h2>
            <p className="text-gray-500">Manage your account and settings.</p>
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
