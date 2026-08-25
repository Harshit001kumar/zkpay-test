"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { LogOut, ArrowDownLeft, ChevronDown } from "lucide-react";
import WalletModal from "@/components/WalletModal";

export default function WalletConnect({ onOpenDeposit }: { onOpenDeposit?: () => void }) {
  const { login, logout, authenticated, user, ready } = usePrivy();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!ready) {
    return (
      <div className="h-9 w-28 bg-white/5 rounded-xl animate-pulse" />
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
          {/* Clickable Address Badge to Open Base USDC Deposit Modal */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="group px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#c0c6de]/40 flex items-center gap-2 text-xs font-mono font-semibold text-[#c6c6cd] hover:text-white transition-all active:scale-95 shadow-sm"
            title="Click to view Base address & deposit/send USDC"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{shortAddress}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#909097] group-hover:text-[#c0c6de] transition-transform group-hover:translate-y-0.5" />
          </button>

          {/* Direct Logout Button */}
          <button
            onClick={logout}
            className="p-2 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors text-[#909097] hover:text-[#ffb4ab]"
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
      className="btn-primary text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-white/5"
    >
      <span>Connect</span>
    </button>
  );
}
