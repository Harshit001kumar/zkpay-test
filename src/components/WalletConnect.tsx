"use client";

import { usePrivy } from "@privy-io/react-auth";
import { LogOut } from "lucide-react";

export default function WalletConnect() {
  const { login, logout, authenticated, user, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="h-9 w-24 bg-white/5 rounded-xl animate-pulse"></div>
    );
  }

  if (authenticated && user) {
    const address = user.wallet?.address;
    const shortAddress = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Connected";

    return (
      <div className="flex items-center gap-1.5">
        <div className="glass-card-static px-3 py-2 flex items-center gap-2 text-xs font-semibold text-[#c6c6cd]">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
          {shortAddress}
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-xl hover:bg-white/5 transition-colors text-[#909097] hover:text-[#e5e2e3]"
          aria-label="Disconnect wallet"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="btn-primary text-xs px-4 py-2.5 rounded-xl"
    >
      Connect
    </button>
  );
}
