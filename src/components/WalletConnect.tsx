"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { LogOut, ChevronDown } from "lucide-react";
import WalletModal from "@/components/WalletModal";

export default function WalletConnect({ onOpenDeposit }: { onOpenDeposit?: () => void }) {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!ready) {
    return (
      <div className="h-9 w-28 bg-white/10 rounded-full animate-pulse" />
    );
  }

  if (authenticated && user) {
    const address = user.wallet?.address;
    const shortAddress = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Connected";

    return (
      <>
        <div className="flex items-center gap-2">
          {/* Clickable Address Pill to Open Base USDC Deposit & Transfer Modal */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="group px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 hover:border-[#c0c6de] flex items-center gap-2 text-xs font-mono font-medium text-white transition-all active:scale-95 shadow-sm cursor-pointer"
            title="Click to view Base address & deposit/send USDC"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="tracking-tight">{shortAddress}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#c6c6cd] group-hover:text-white transition-transform group-hover:translate-y-0.5" />
          </button>

          {/* Direct Logout Button */}
          <button
            onClick={logout}
            className="p-2 rounded-full hover:bg-white/10 border border-transparent hover:border-white/15 transition-colors text-[#c6c6cd] hover:text-[#ffb4ab]"
            aria-label="Disconnect wallet"
            title="Disconnect wallet"
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Interactive Base USDC Deposit & Transfer Modal */}
        <WalletModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onOpenDeposit={onOpenDeposit}
        />
      </>
    );
  }

  return (
    <button
      onClick={login}
      className="btn-primary text-xs px-5 py-2 rounded-full flex items-center gap-1.5 shadow-lg shadow-white/10 font-bold"
    >
      <span>Connect</span>
    </button>
  );
}
