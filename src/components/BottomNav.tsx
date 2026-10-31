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
      <nav className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-full bg-surface-container/95 border border-primary/25 backdrop-blur-xl shadow-elevated">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full transition-colors duration-200 cursor-pointer active:scale-95 whitespace-nowrap ${
                isActive
                  ? "bg-secondary text-on-secondary shadow-dock-label"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-200 ${
                  isActive ? "scale-105 stroke-[2.4]" : "stroke-[1.9]"
                }`}
              />
              <span className="text-xs font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
