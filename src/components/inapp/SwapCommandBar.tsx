"use client";

import React from "react";
import Link from "next/link";
import { TransactionRecord } from "@/lib/history";
import {
  Search,
  Command,
  Activity,
  Wallet,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";

interface SwapCommandBarProps {
  address?: string | null;
  activeTx: TransactionRecord | null;
  pendingCount: number;
  onOpenCommand: () => void;
  onOpenTrack: () => void;
}

export function SwapCommandBar({
  address,
  activeTx,
  pendingCount,
  onOpenCommand,
  onOpenTrack,
}: SwapCommandBarProps) {
  const walletHref = address ? `/wallet/${address}` : "/wallet";
  const txTarget = activeTx ? encodeURIComponent(activeTx.depositAddress || activeTx.hash) : "";

  return (
    <div
      className="h-11 px-2 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between gap-2"
      role="region"
      aria-label="Quick command actions"
    >
      {/* Left slot: active order status pill or command search trigger */}
      {activeTx ? (
        <Link
          href={`/tx/${txTarget}`}
          className="h-7 px-2.5 rounded-lg bg-secondary/12 hover:bg-secondary/20 border border-secondary/30 text-secondary text-xs font-semibold inline-flex items-center gap-2 min-w-0 transition-colors active:scale-[0.98]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-secondary motion-safe:animate-pulse shrink-0" />
          <span className="truncate font-mono inline-flex items-center gap-1">
            <span>{activeTx.fromAsset || "SWAP"}</span>
            <ArrowRight className="w-3 h-3 shrink-0" />
            <span>{activeTx.toAsset || "OUT"}</span>
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpenCommand}
          className="flex-1 min-w-0 h-8 px-2 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">Quick route or track address...</span>
          </span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant font-mono text-[10px] text-on-surface-variant shrink-0">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </kbd>
        </button>
      )}

      {/* Right slot: compact utility triggers */}
      <div className="flex items-center gap-1 shrink-0">
        {activeTx && (
          <button
            type="button"
            onClick={onOpenCommand}
            aria-label="Open quick command menu"
            title="Quick command menu"
            className="h-8 w-8 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenTrack}
          className="h-8 px-2.5 rounded-lg hover:bg-surface-container text-xs font-medium text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span>Track</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-secondary text-on-secondary font-mono text-[10px] font-bold leading-none">
              {pendingCount}
            </span>
          )}
        </button>

        <Link
          href={walletHref}
          className="h-8 px-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant text-xs font-medium text-on-surface inline-flex items-center gap-1.5 transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Wallet className="w-3.5 h-3.5 text-secondary" />
          <span>Wallet</span>
        </Link>
      </div>
    </div>
  );
}
