"use client";

import React from "react";
import Link from "next/link";
import { NavTab } from "./AppShell";
import { ArrowRightLeft, Terminal, Code2, User } from "lucide-react";

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-surface/95 border-t border-outline-variant/15 backdrop-blur-xl">
      <nav
        aria-label="Mobile navigation"
        className="grid grid-cols-4 gap-1 max-w-md mx-auto px-3 py-2"
      >
        <button
          type="button"
          onClick={() => setActiveTab("swap")}
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors cursor-pointer ${
            activeTab === "swap"
              ? "bg-secondary/15 text-secondary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span className="text-[11px] font-semibold">Swap</span>
        </button>

        <Link
          href="/partner"
          className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Terminal className="w-4 h-4" />
          <span className="text-[11px] font-semibold">Partner</span>
        </Link>

        <Link
          href="/docs"
          className="flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Code2 className="w-4 h-4" />
          <span className="text-[11px] font-semibold">API Docs</span>
        </Link>

        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors cursor-pointer ${
            activeTab === "profile"
              ? "bg-secondary/15 text-secondary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <User className="w-4 h-4" />
          <span className="text-[11px] font-semibold">Account</span>
        </button>
      </nav>
    </div>
  );
}
