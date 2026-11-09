"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState } from "react";
import Link from "next/link";
import WalletConnect from "./WalletConnect";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import BottomNav from "./BottomNav";
import Profile from "./Profile";
import { SpatialMultiChain3D } from "@/components/ui/SpatialMultiChain3D";

export type NavTab = "swap" | "profile";

export default function AppShell() {
  const { ready, authenticated, login } = useActiveAccount();
  const [activeTab, setActiveTab] = useState<NavTab>("swap");

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-surface gap-3">
        <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-on-surface-variant">Loading…</span>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  const navItem = (active: boolean) =>
    `h-9 px-3.5 rounded-lg text-sm font-medium inline-flex items-center transition-colors cursor-pointer ${
      active ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"
    }`;

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-surface text-on-surface overflow-x-hidden">
      <SpatialMultiChain3D />
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 w-full bg-surface/85 border-b border-outline-variant backdrop-blur-xl">
        <div className="max-w-6xl mx-auto h-14 sm:h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("swap")}
              className="flex items-center gap-2 h-10 cursor-pointer active:scale-[0.98] transition-transform"
              aria-label="ZkPay home"
            >
              <span className="w-7 h-7 rounded-lg bg-on-surface text-surface flex items-center justify-center font-bold text-sm">
                Z
              </span>
              <span className="font-semibold text-base tracking-tight text-on-surface">ZkPay</span>
            </button>

            {/* Desktop Navigation */}
            <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
              <button type="button" onClick={() => setActiveTab("swap")} className={navItem(activeTab === "swap")}>
                Swap
              </button>
              <Link href="/partner" className={navItem(false)}>
                Partner
              </Link>
              <Link href="/docs" className={navItem(false)}>
                Docs
              </Link>
              <button type="button" onClick={() => setActiveTab("profile")} className={navItem(activeTab === "profile")}>
                Account
              </button>
            </nav>
          </div>

          <WalletConnect />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-safe-nav md:pb-12">
        {activeTab === "swap" && <Dashboard />}
        {activeTab === "profile" && <Profile onBack={() => setActiveTab("swap")} />}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
