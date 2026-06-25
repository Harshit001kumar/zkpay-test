"use client";

import { usePrivy } from "@privy-io/react-auth";
import { LogOut } from "lucide-react";

export default function WalletConnect() {
  const { login, logout, authenticated, user, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse"></div>
    );
  }

  if (authenticated && user) {
    const address = user.wallet?.address;
    const shortAddress = address
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : "Connected";

    return (
      <div className="flex items-center gap-1.5">
        <div className="bg-gray-100 px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
          {shortAddress}
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-black"
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
      className="bg-black text-white text-xs font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
    >
      Connect
    </button>
  );
}
