"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import WalletConnect from "./WalletConnect";
import LandingPage from "./LandingPage";
import Dashboard from "./Dashboard";
import Profile from "./Profile";
import { InAppActivity } from "./inapp/InAppActivity";
import { InAppPartner } from "./inapp/InAppPartner";

export type NavTab = "swap" | "activity" | "partner" | "account";

const NAV_TABS: { id: NavTab; label: string }[] = [
  { id: "swap", label: "Swap" },
  { id: "activity", label: "Track" },
  { id: "partner", label: "Partner" },
  { id: "account", label: "Account" },
];

export default function AppShell() {
  const { ready, authenticated, login } = useActiveAccount();
  const [activeTab, setActiveTab] = useState<NavTab>("swap");
  const reduceMotion = useReducedMotion();

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-surface gap-3">
        <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-on-surface-variant">Loading...</span>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingPage login={login} />;
  }

  const renderTabButton = (tab: { id: NavTab; label: string }, mobile = false) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={`${mobile ? "m" : "d"}-${tab.id}`}
        type="button"
        onClick={() => setActiveTab(tab.id)}
        aria-current={isActive ? "page" : undefined}
        className={`relative h-8 ${
          mobile ? "w-full rounded-lg" : "px-4 rounded-full"
        } text-xs font-semibold inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
          isActive
            ? "text-on-secondary"
            : "text-on-surface-variant hover:text-on-surface"
        }`}
      >
        {isActive &&
          (reduceMotion ? (
            <span
              aria-hidden="true"
              className={`absolute inset-0 bg-secondary ${
                mobile ? "rounded-lg" : "rounded-full"
              }`}
            />
          ) : (
            <motion.span
              layoutId={mobile ? "cmd-pill-mobile" : "cmd-pill-desktop"}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              aria-hidden="true"
              className={`absolute inset-0 bg-secondary ${
                mobile ? "rounded-lg" : "rounded-full"
              }`}
            />
          ))}
        <span className="relative z-10">{tab.label}</span>
      </button>
    );
  };

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col bg-surface text-on-surface overflow-x-hidden selection:bg-secondary selection:text-on-secondary"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 70% 35% at 50% 0%, rgba(41, 112, 255, 0.08), transparent)",
      }}
    >
      {/* Unified Sticky Command Header */}
      <header className="sticky top-0 z-40 w-full bg-surface/90 backdrop-blur-xl border-b border-outline-variant pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("swap")}
            className="flex items-center gap-2.5 h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer active:scale-95 transition-transform"
            aria-label="ZkPay home"
          >
            <span className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
              Z
            </span>
            <span className="font-semibold text-sm tracking-tight text-on-surface">
              ZkPay
            </span>
          </button>

          {/* Desktop Segmented Pill Switcher */}
          <nav
            aria-label="Workspace switcher"
            className="hidden md:inline-flex items-center p-1 rounded-full bg-surface-container-low border border-outline-variant gap-0.5"
          >
            {NAV_TABS.map((t) => renderTabButton(t, false))}
          </nav>

          <WalletConnect />
        </div>

        {/* Mobile Segmented Pill Switcher (< md) */}
        <div className="md:hidden px-3 pb-2.5">
          <nav
            aria-label="Mobile workspace switcher"
            className="grid grid-cols-4 p-1 rounded-xl bg-surface-container-low border border-outline-variant gap-1"
          >
            {NAV_TABS.map((t) => renderTabButton(t, true))}
          </nav>
        </div>
      </header>

      {/* Focused Workspace */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-12 pb-safe">
        <div className={activeTab === "swap" ? "block animate-fade-in" : "hidden"}>
          <Dashboard onSelectTab={setActiveTab} />
        </div>
        <div className={activeTab === "activity" ? "block animate-fade-in" : "hidden"}>
          <InAppActivity onNewSwap={() => setActiveTab("swap")} />
        </div>
        <div className={activeTab === "partner" ? "block animate-fade-in" : "hidden"}>
          <InAppPartner />
        </div>
        <div className={activeTab === "account" ? "block animate-fade-in" : "hidden"}>
          <Profile onBack={() => setActiveTab("swap")} />
        </div>
      </main>
    </div>
  );
}
