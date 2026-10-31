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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-max max-w-[94vw]">
      {/* Outer Bezel */}
      <div className="p-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.9)]">
        {/* Inner Machined Core */}
        <nav className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-full bg-[#131315]/95 border border-white/[0.07] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
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
                    ? "bg-gradient-to-b from-[#d8def8] to-[#a7add2] text-[#0e0e0f] shadow-[0_6px_20px_rgba(192,198,222,0.28),inset_0_1px_0_rgba(255,255,255,0.65)]"
                    : "text-[#8d90a1] hover:text-white hover:bg-white/[0.04]"
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
