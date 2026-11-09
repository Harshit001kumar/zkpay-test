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
    `h-8 px-3.5 rounded-full text-xs font-semibold inline-flex items-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
      active
        ? "bg-surface-container text-on-surface"
        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
    }`;

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-surface text-on-surface overflow-x-hidden selection:bg-secondary selection:text-on-secondary">
      {/* 3D Multi-Chain Spatial Universe Background */}
      <SpatialMultiChain3D />

      {/* Floating Island Glass Header */}
      <header className="fixed top-3 sm:top-5 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 px-4 sm:px-6 rounded-full bg-surface-container-low/85 backdrop-blur-2xl border border-outline-variant shadow-elevated flex items-center justify-between gap-3 pointer-events-auto">
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("swap")}
              className="flex items-center gap-2.5 h-10 active:scale-95 transition-transform cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-lg"
              aria-label="ZkPay home"
            >
              <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-extrabold text-sm">
                Z
              </span>
              <span className="font-bold text-base tracking-tight text-on-surface">ZkPay</span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/10 border border-secondary/30 text-[10px] text-secondary font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
                <span>9 chains</span>
              </span>
            </button>

            {/* Desktop Navigation Tabs */}
            <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("swap")}
                className={navItem(activeTab === "swap")}
              >
                Swap
              </button>
              <Link href="/partner" className={navItem(false)}>
                Partner
              </Link>
              <Link href="/docs" className={navItem(false)}>
                Docs
              </Link>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={navItem(activeTab === "profile")}
              >
                Account
              </button>
            </nav>
          </div>

          <WalletConnect />
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-safe-nav md:pb-16 relative z-10">
        {activeTab === "swap" && <Dashboard />}
        {activeTab === "profile" && <Profile onBack={() => setActiveTab("swap")} />}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
