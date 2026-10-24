"use client";

import React, { SVGProps } from "react";
import Dock, { DockItemData } from "./Dock";

export type BottomNavTab = "home" | "earn" | "cards" | "profile";

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const items: DockItemData[] = [
    {
      label: "Home",
      active: activeTab === "home",
      onClick: () => onTabChange("home"),
      icon: <HomeIcon isActive={activeTab === "home"} />,
    },
    {
      label: "Earn",
      active: activeTab === "earn",
      onClick: () => onTabChange("earn"),
      icon: <EarnIcon isActive={activeTab === "earn"} />,
    },
    {
      label: "Cards",
      active: activeTab === "cards",
      onClick: () => onTabChange("cards"),
      icon: <CardsIcon isActive={activeTab === "cards"} />,
    },
    {
      label: "Profile",
      active: activeTab === "profile",
      onClick: () => onTabChange("profile"),
      icon: <ProfileIcon isActive={activeTab === "profile"} />,
    },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none h-20 flex justify-center items-end pb-[env(safe-area-inset-bottom,0px)]"
    >
      <Dock
        items={items}
        position="bottom"
        theme="dark"
        baseItemSize={48}
        magnification={64}
        panelHeight={62}
        gap={12}
        roundness={0.65}
        spring={{ mass: 0.1, stiffness: 160, damping: 14 }}
        bounce={true}
        showIndicators={true}
        showLabels={true}
        accentColor="#c0c6de"
        className="pointer-events-auto"
      />
    </nav>
  );
}

interface NavIconProps extends SVGProps<SVGSVGElement> {
  isActive?: boolean;
}

function HomeIcon({ isActive, ...props }: NavIconProps) {
  return (
    <svg
      width="1.15em"
      height="1.15em"
      viewBox="0 0 24 24"
      fill={isActive ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={isActive ? "2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-colors duration-200 ${isActive ? "text-[#c0c6de]" : "text-[#909097]"}`}
      {...props}
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function EarnIcon({ isActive, ...props }: NavIconProps) {
  return (
    <svg
      width="1.15em"
      height="1.15em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={isActive ? "2.2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-colors duration-200 ${isActive ? "text-[#c0c6de]" : "text-[#909097]"}`}
      {...props}
    >
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function CardsIcon({ isActive, ...props }: NavIconProps) {
  return (
    <svg
      width="1.15em"
      height="1.15em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={isActive ? "2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-colors duration-200 ${isActive ? "text-[#c0c6de]" : "text-[#909097]"}`}
      {...props}
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function ProfileIcon({ isActive, ...props }: NavIconProps) {
  return (
    <svg
      width="1.15em"
      height="1.15em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={isActive ? "2" : "1.8"}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-colors duration-200 ${isActive ? "text-[#c0c6de]" : "text-[#909097]"}`}
      {...props}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
