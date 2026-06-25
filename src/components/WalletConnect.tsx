"use client";

import { usePrivy } from "@privy-io/react-auth";
import { LogOut } from "lucide-react";

export default function WalletConnect() {
  const { login, logout, authenticated, user, ready } = usePrivy();

  if (!ready) {
    return <button className="btn-secondary opacity-50 cursor-not-allowed">Loading...</button>;
  }

  if (authenticated && user) {
    const address = user.wallet?.address;
    const shortAddress = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Connected";

    return (
      <div className="flex items-center gap-2">
        <div className="glass-card-static px-4 py-2 flex items-center gap-2 text-sm font-medium">
          <div className="w-2 h-2 rounded-full bg-black"></div>
          {shortAddress}
        </div>
        <button
          onClick={logout}
          className="p-2 glass-card-static hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Disconnect wallet"
        >
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={login} className="btn-primary w-full sm:w-auto">
      Connect Wallet
    </button>
  );
}
