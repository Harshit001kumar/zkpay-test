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
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-surface/95 border-t border-outline-variant/15 backdrop-blur-xl">
      <nav
        aria-label="Mobile navigation"
        className="grid grid-cols-4 gap-1 max-w-md mx-auto px-3 py-2"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl transition-colors duration-200 cursor-pointer active:scale-95 whitespace-nowrap ${
                isActive
                  ? "bg-secondary/15 text-secondary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-200 ${
                  isActive ? "scale-105 stroke-[2.3]" : "stroke-[1.8]"
                }`}
              />
              <span className="text-[11px] font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
