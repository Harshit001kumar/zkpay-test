"use client";

import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useState } from "react";
import {
  Globe,
  ChevronDown,
  Home,
  TrendingUp,
  CreditCard,
  User,
} from "lucide-react";
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

  const desktopTabs: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "home", label: "Vault", icon: Home },
    { id: "earn", label: "Earn", icon: TrendingUp },
    { id: "cards", label: "Card", icon: CreditCard },
    { id: "profile", label: "Profile", icon: User },
  ];

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-surface gap-4">
        <div className="w-12 h-12 rounded-2xl bg-surface-container border border-outline-variant/20 flex items-center justify-center">
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
      {/* Persistent 3D Spatial Continuity Layer (Subtle Ambient Field) */}
      <div className="opacity-20 pointer-events-none">
        <SpatialCanvas3D />
      </div>

      {/* Global Currency Onboarding & Selector Modals */}
      <CurrencyModal mode="onboarding" />
      <CurrencyModal mode="selector" />

      {/* Structural Top Command Bar (Sticky, Non-Overlapping) */}
      <header className="sticky top-0 z-40 w-full bg-surface/90 border-b border-outline-variant/15 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          {/* Left: Brand Identity + Network Pill */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("home")}
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
                  Base
                </span>
              </div>
            </button>

            {/* Center: Integrated Desktop Workspace Switcher */}
            <nav
              aria-label="Primary workspace navigation"
              className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/15"
            >
              {desktopTabs.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-secondary text-on-secondary"
                        : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Cluster: Global Corridor Switcher + Wallet Identity */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSelectorOpen(true)}
              className="h-9 px-3 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/20 hover:border-primary/40 transition-colors flex items-center gap-2 cursor-pointer active:scale-95 whitespace-nowrap"
              title="Switch global fiat settlement corridor"
            >
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold text-on-surface">
                {currencyMeta.code}
              </span>
              <span className="hidden sm:inline text-xs text-on-surface-variant">
                / {currencyMeta.rail}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>

            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12 relative">
        {activeTab === "home" && <Dashboard />}
        {activeTab === "earn" && <EarnFlow />}
        {activeTab === "cards" && <CardsWaitlist />}
        {activeTab === "profile" && <Profile onBack={() => setActiveTab("home")} />}
      </main>

      {/* Mobile-Only Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
