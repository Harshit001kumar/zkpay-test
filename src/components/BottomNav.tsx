"use client";

import React from "react";
import { NavTab } from "./AppShell";
import { Home, TrendingUp, CreditCard, User } from "lucide-react";

interface BottomNavProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export default function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "home", label: "Vault", icon: Home },
    { id: "earn", label: "Earn", icon: TrendingUp },
    { id: "cards", label: "Card", icon: CreditCard },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-max max-w-[94vw]">
      {/* Outer Bezel */}
      <div className="p-1.5 rounded-full bg-[#0B0E14]/90 border border-[#2970FF]/25 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)]">
        {/* Inner Machined Core */}
        <nav className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-full bg-[#111622]/95 border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(41,112,255,0.18)]">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full transition-all duration-300 cursor-pointer active:scale-95 ${
                  isActive
                    ? "bg-[#CCFF00] text-[#050608] shadow-[0_6px_22px_rgba(204,255,0,0.32),inset_0_1px_0_rgba(255,255,255,0.65)]"
                    : "text-[#8A94A6] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-300 ${
                    isActive ? "scale-105 stroke-[2.4]" : "stroke-[1.9]"
                  }`}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] font-bold">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
