"use client";

import { useRouter } from "next/navigation";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { LogOut, Wallet } from "lucide-react";

export default function WalletConnect() {
  const router = useRouter();
  const { login, logout, authenticated, ready, address } = useActiveAccount();

  if (!ready) {
    return (
      <div className="h-9 w-28 bg-surface-container rounded-xl animate-pulse" />
    );
  }

  if (authenticated && address) {
    const shortAddress = `${address.slice(0, 6)}…${address.slice(-4)}`;

    const handleNavigateToWallet = () => {
      if (address) {
        router.push(`/wallet/${address}`);
      } else {
        router.push("/wallet");
      }
    };

    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleNavigateToWallet}
          className="group h-9 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 hover:border-primary/40 flex items-center gap-2 text-xs font-medium text-on-surface transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
          title="Open Base USDC deposit & wallet page"
        >
          <span className="w-2 h-2 rounded-full bg-secondary shrink-0" />
          <Wallet className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary transition-colors hidden sm:block" />
          <span className="font-mono text-xs tabular-nums tracking-tight">
            {shortAddress}
          </span>
        </button>

        <button
          type="button"
          onClick={logout}
          className="h-9 w-9 rounded-xl bg-surface-container/60 hover:bg-error/15 border border-outline-variant/15 hover:border-error/30 flex items-center justify-center transition-colors text-on-surface-variant hover:text-error cursor-pointer"
          aria-label="Disconnect wallet"
          title="Disconnect wallet"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (authenticated && !address) {
    return (
      <div className="h-9 w-28 bg-surface-container rounded-xl animate-pulse flex items-center justify-center text-xs font-medium text-on-surface-variant">
        Syncing…
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={login}
      className="h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold flex items-center gap-1.5 transition-colors hover:bg-secondary-container cursor-pointer whitespace-nowrap"
    >
      <span>Sign in</span>
    </button>
  );
}
