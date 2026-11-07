"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  Terminal,
  Code2,
  User,
  ArrowUpRight,
} from "lucide-react";
import WalletConnect from "./WalletConnect";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import BottomNav from "./BottomNav";
import Profile from "./Profile";
import { SpatialCanvas3D } from "@/components/ui/SpatialCanvas3D";

export type NavTab = "swap" | "profile";

export default function AppShell() {
  const { ready, authenticated, login } = useActiveAccount();
  const [activeTab, setActiveTab] = useState<NavTab>("swap");

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-surface gap-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-container border border-outline-variant/20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        </div>
        <span className="text-xs font-medium text-on-surface-variant">
          Initializing ZkPay Swap Engine…
        </span>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-surface text-on-surface relative overflow-x-hidden selection:bg-primary/30">
      <div className="opacity-20 pointer-events-none">
        <SpatialCanvas3D />
      </div>

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 w-full bg-surface/90 border-b border-outline-variant/15 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("swap")}
              className="flex items-center gap-2.5 text-left group cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
            >
              <div className="w-8 h-8 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-extrabold text-sm tracking-tight">
                Z
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-on-surface">
                  ZkPay
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-container border border-outline-variant/20 text-[11px] text-on-surface-variant font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  Cross-Chain Swap API
                </span>
              </div>
            </button>

            {/* Desktop Navigation */}
            <nav
              aria-label="Primary workspace navigation"
              className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/15"
            >
              <button
                type="button"
                onClick={() => setActiveTab("swap")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                  activeTab === "swap"
                    ? "bg-secondary text-on-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Swap</span>
              </button>

              <Link
                href="/partner"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-secondary" />
                <span>Partner Portal</span>
                <ArrowUpRight className="w-3 h-3 opacity-60" />
              </Link>

              <Link
                href="/docs"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>API Docs</span>
              </Link>

              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                  activeTab === "profile"
                    ? "bg-secondary text-on-secondary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Account & Keys</span>
              </button>
            </nav>
          </div>

          {/* Right: Wallet Connect */}
          <div className="flex items-center gap-2.5">
            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-28 md:pb-12 relative z-10">
        {activeTab === "swap" && <Dashboard />}
        {activeTab === "profile" && <Profile onBack={() => setActiveTab("swap")} />}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
