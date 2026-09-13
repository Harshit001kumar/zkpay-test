"use client";

import { useState, useEffect } from "react";
import BottomNav, { BottomNavTab } from "./BottomNav";
import Dashboard from "./Dashboard";
import EarnFlow from "./EarnFlow";
import WalletConnect from "./WalletConnect";
import CardsWaitlist from "./CardsWaitlist";
import Profile from "./Profile";
import { Shield } from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<BottomNavTab>("home");
  const { address, authenticated } = useActiveAccount();

  // Capture ?ref= query parameter and store in localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refParam = urlParams.get("ref");
      if (refParam && refParam.trim()) {
        localStorage.setItem("zkpay_pending_ref", refParam.trim());
      }
    } catch {}
  }, []);

  // When user connects wallet, register referral if pending
  useEffect(() => {
    if (!authenticated || !address) return;
    try {
      const pendingRef = localStorage.getItem("zkpay_pending_ref");
      if (pendingRef) {
        fetch("/api/referrals/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: address,
            referrerCodeOrAddress: pendingRef,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              localStorage.removeItem("zkpay_pending_ref");
            }
          })
          .catch((err) => console.warn("[Referral] Registration ping failed:", err));
      }
    } catch {}
  }, [authenticated, address]);

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3]">
      {/* Global Header — Frosted Obsidian Glass */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#131315]/95 backdrop-blur-2xl z-40 px-5 md:px-8 flex justify-between items-center border-b border-white/10 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de]">
            <Shield className="w-4 h-4" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
            <span className="text-[#c0c6de]">Zk</span>Pay
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
    </div>
  );
}
