"use client";

import React from "react";
import { NavTab } from "./AppShell";
import { ArrowRightLeft, Activity, Terminal, User } from "lucide-react";

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

const itemBase =
  "flex flex-col items-center justify-center gap-1 min-h-[54px] rounded-xl transition-colors cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none";

function Indicator({ active }: { active: boolean }) {
  return (
    <span
      className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-full transition-all duration-200 ${
        active ? "bg-secondary opacity-100 shadow-[0_0_8px_#CCFF00]" : "opacity-0"
      }`}
    />
  );
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-surface-container-low/95 border-t border-outline-variant backdrop-blur-2xl pb-safe">
      <nav aria-label="Mobile navigation" className="grid grid-cols-4 max-w-md mx-auto px-2 pt-1">
        <button
          type="button"
          onClick={() => setActiveTab("swap")}
          aria-current={activeTab === "swap" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "swap" ? "text-on-surface font-bold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "swap"} />
          <ArrowRightLeft className={`w-5 h-5 ${activeTab === "swap" ? "text-secondary" : ""}`} />
          <span className="text-[11px] font-medium">Swap</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          aria-current={activeTab === "activity" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "activity" ? "text-on-surface font-bold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "activity"} />
          <Activity className={`w-5 h-5 ${activeTab === "activity" ? "text-secondary" : ""}`} />
          <span className="text-[11px] font-medium">Activity</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("partner")}
          aria-current={activeTab === "partner" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "partner" ? "text-on-surface font-bold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "partner"} />
          <Terminal className={`w-5 h-5 ${activeTab === "partner" ? "text-secondary" : ""}`} />
          <span className="text-[11px] font-medium">Partner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("account")}
          aria-current={activeTab === "account" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "account" ? "text-on-surface font-bold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "account"} />
          <User className={`w-5 h-5 ${activeTab === "account" ? "text-secondary" : ""}`} />
          <span className="text-[11px] font-medium">Account</span>
        </button>
      </nav>
    </div>
  );
}
