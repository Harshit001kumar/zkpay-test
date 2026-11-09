"use client";

import React from "react";
import Link from "next/link";
import { NavTab } from "./AppShell";
import { ArrowRightLeft, Terminal, Code2, User } from "lucide-react";

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

const itemBase =
  "flex flex-col items-center justify-center gap-1 min-h-[52px] rounded-xl transition-colors cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

function Indicator({ active }: { active: boolean }) {
  return (
    <span
      className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full transition-opacity ${
        active ? "bg-secondary opacity-100" : "opacity-0"
      }`}
    />
  );
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-surface/90 border-t border-outline-variant backdrop-blur-xl pb-safe">
      <nav aria-label="Mobile navigation" className="grid grid-cols-4 max-w-md mx-auto px-2 pt-1">
        <button
          type="button"
          onClick={() => setActiveTab("swap")}
          aria-current={activeTab === "swap" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "swap" ? "text-on-surface font-semibold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "swap"} />
          <ArrowRightLeft className="w-5 h-5" />
          <span className="text-[11px] font-medium">Swap</span>
        </button>

        <Link href="/partner" className={`relative ${itemBase} text-on-surface-variant hover:text-on-surface`}>
          <Indicator active={false} />
          <Terminal className="w-5 h-5" />
          <span className="text-[11px] font-medium">Partner</span>
        </Link>

        <Link href="/docs" className={`relative ${itemBase} text-on-surface-variant hover:text-on-surface`}>
          <Indicator active={false} />
          <Code2 className="w-5 h-5" />
          <span className="text-[11px] font-medium">Docs</span>
        </Link>

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          aria-current={activeTab === "profile" ? "page" : undefined}
          className={`relative ${itemBase} ${activeTab === "profile" ? "text-on-surface font-semibold" : "text-on-surface-variant"}`}
        >
          <Indicator active={activeTab === "profile"} />
          <User className="w-5 h-5" />
          <span className="text-[11px] font-medium">Account</span>
        </button>
      </nav>
    </div>
  );
}
