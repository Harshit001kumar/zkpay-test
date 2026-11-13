"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { getTransactions, TransactionRecord } from "@/lib/history";
import type { PopularPair } from "@/lib/chainVisuals";
import SwapWidget from "@/components/SwapWidget";
import { SwapCommandBar } from "@/components/inapp/SwapCommandBar";
import { CommandPaletteModal } from "@/components/inapp/CommandPaletteModal";
import type { NavTab } from "@/components/AppShell";
import { ArrowRight } from "lucide-react";

interface DashboardProps {
  onSelectTab?: (tab: NavTab) => void;
}

export default function Dashboard({ onSelectTab }: DashboardProps) {
  const { address } = useActiveAccount();
  const [activePair, setActivePair] = useState<PopularPair | null>(null);
  const [activeTx, setActiveTx] = useState<TransactionRecord | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  // Sync local in-flight transactions for the compact status pill and Track badge
  useEffect(() => {
    const syncTxs = () => {
      const txs = getTransactions();
      const pending = txs.filter(
        (t) => t.status !== "settled" && t.status !== "failed"
      );
      setPendingCount(pending.length);
      setActiveTx(pending[0] || null);
    };

    syncTxs();
    const interval = setInterval(syncTxs, 4000);
    return () => clearInterval(interval);
  }, []);

  // Global Cmd+K / Ctrl+K shortcut for quick commands & route switching
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="max-w-[480px] mx-auto w-full space-y-3 animate-fade-in">
      <SwapCommandBar
        address={address}
        activeTx={activeTx}
        pendingCount={pendingCount}
        onOpenCommand={() => setPaletteOpen(true)}
        onOpenTrack={() => onSelectTab?.("activity")}
      />

      <SwapWidget pair={activePair} />

      <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-on-surface-variant">
        <span>Non-custodial cross-chain settlement</span>
        <div className="flex items-center gap-3">
          {onSelectTab && (
            <button
              type="button"
              onClick={() => onSelectTab("activity")}
              className="hover:text-on-surface transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <span>History</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          <Link href="/docs" className="hover:text-on-surface transition-colors">
            Docs
          </Link>
        </div>
      </div>

      <CommandPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        address={address}
        onSelectPair={(pair) => {
          setActivePair({ ...pair });
          setPaletteOpen(false);
        }}
        onSelectTab={(tab) => {
          onSelectTab?.(tab);
          setPaletteOpen(false);
        }}
      />
    </div>
  );
}
