"use client";

import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { LogOut, ChevronRight } from "lucide-react";

export default function WalletConnect() {
  const router = useRouter();
  const { login, logout, authenticated, ready, address, isSmartWallet } = useActiveAccount();

  if (!ready) {
    return (
      <div className="h-9 w-28 bg-white/10 rounded-full animate-pulse" />
    );
  }

  if (authenticated && address) {
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

    const handleNavigateToWallet = () => {
      if (address) {
        router.push(`/wallet/${address}`);
      } else {
        router.push("/wallet");
      }
    };

    return (
      <div className="flex items-center gap-2">
        {/* Clickable Address Pill to Navigate to /wallet/[address] */}
        <button
          onClick={handleNavigateToWallet}
          className="group px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 hover:border-[#c0c6de] flex items-center gap-2 text-xs font-mono font-medium text-white transition-all active:scale-95 shadow-sm cursor-pointer"
          title="Click to open Base USDC deposit & wallet page"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="tracking-tight">{shortAddress}</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#c6c6cd] group-hover:text-white transition-transform group-hover:translate-x-0.5" />
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
    );
  }

  if (authenticated && !address) {
    return (
      <div className="h-9 w-28 bg-white/10 rounded-full animate-pulse flex items-center justify-center text-[11px] font-medium text-[#909097]">
        Syncing...
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="btn-primary text-xs px-5 py-2 rounded-full flex items-center gap-1.5 shadow-lg shadow-white/10 font-bold"
    >
      <span>Sign In</span>
    </button>
  );
}
