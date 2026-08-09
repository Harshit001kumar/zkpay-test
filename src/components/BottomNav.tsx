import { SVGProps } from "react";

export type BottomNavTab = "home" | "earn" | "cards" | "profile";

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#131315]/90 backdrop-blur-glass border-t border-[#46464c] px-6 py-4 flex justify-between items-center z-50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <NavItem 
        id="home" 
        label="Home" 
        isActive={activeTab === "home"} 
        onClick={() => onTabChange("home")}
        icon={<HomeIcon />}
      />
      <NavItem 
        id="earn" 
        label="Earn" 
        isActive={activeTab === "earn"} 
        onClick={() => onTabChange("earn")}
        icon={<EarnIcon />}
      />
      <NavItem 
        id="cards" 
        label="Cards" 
        isActive={activeTab === "cards"} 
        onClick={() => onTabChange("cards")}
        icon={<CardsIcon />}
      />
      <NavItem 
        id="profile" 
        label="Profile" 
        isActive={activeTab === "profile"} 
        onClick={() => onTabChange("profile")}
        icon={<ProfileIcon />}
      />
    </nav>
  );
}

function NavItem({ id, label, isActive, onClick, icon }: { id: string; label: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 min-w-[64px] transition-colors ${
        isActive ? 'text-[#c0c6de]' : 'text-[#909097] hover:text-[#c6c6cd]'
      }`}
    >
      <div className={`w-6 h-6 flex items-center justify-center ${isActive ? 'fill-current stroke-current' : 'fill-none stroke-current'}`}>
        {icon}
      </div>
      <span className={`text-[10px] font-semibold ${isActive ? 'font-bold' : ''}`}>{label}</span>
    </button>
  );
}

// Minimalist SVGs
function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  );
}

function EarnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="2" x2="12" y2="22"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  );
}

function CardsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
      <line x1="1" y1="10" x2="23" y2="10"></line>
    </svg>
  );
}

function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  );
}
