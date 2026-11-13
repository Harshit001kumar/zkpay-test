"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { POPULAR_PAIRS, type PopularPair } from "@/lib/chainVisuals";
import { CryptoIcon } from "@/components/ui/CryptoIcon";
import type { NavTab } from "@/components/AppShell";
import {
  Search,
  X,
  ArrowRight,
  Activity,
  Terminal,
  User,
  Wallet,
  BookOpen,
  ArrowUpRight,
} from "lucide-react";

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  address?: string | null;
  onSelectPair: (pair: PopularPair) => void;
  onSelectTab: (tab: NavTab) => void;
}

export function CommandPaletteModal({
  open,
  onClose,
  address,
  onSelectPair,
  onSelectTab,
}: CommandPaletteModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    if (window.matchMedia?.("(pointer: fine)").matches) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const cleanQuery = query.trim();
  const looksLikeAddressOrHash =
    cleanQuery.length >= 24 && !/\s/.test(cleanQuery);

  const filteredPairs = useMemo(() => {
    if (!cleanQuery) return POPULAR_PAIRS;
    const q = cleanQuery.toLowerCase();
    return POPULAR_PAIRS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.from.toLowerCase().includes(q) ||
        p.to.toLowerCase().includes(q)
    );
  }, [cleanQuery]);

  const destinations = useMemo(() => {
    const items = [
      {
        id: "track",
        label: "Track swaps",
        hint: "Live order history & explorer links",
        icon: Activity,
        action: () => onSelectTab("activity"),
      },
      {
        id: "wallet",
        label: "Base wallet",
        hint: "Deposit or send USDC on Base",
        icon: Wallet,
        action: () => {
          onClose();
          router.push(address ? `/wallet/${address}` : "/wallet");
        },
      },
      {
        id: "partner",
        label: "Partner API",
        hint: "API keys & 50/50 fee share",
        icon: Terminal,
        action: () => onSelectTab("partner"),
      },
      {
        id: "account",
        label: "Account & referrals",
        hint: "Security, rewards & preferences",
        icon: User,
        action: () => onSelectTab("account"),
      },
      {
        id: "docs",
        label: "API documentation",
        hint: "Endpoints & integration guide",
        icon: BookOpen,
        action: () => {
          onClose();
          router.push("/docs");
        },
      },
    ];

    if (!cleanQuery) return items;
    const q = cleanQuery.toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
    );
  }, [cleanQuery, address, onClose, onSelectTab, router]);

  if (!open || !mounted) return null;

  const shortLookup =
    cleanQuery.length > 16
      ? `${cleanQuery.slice(0, 8)}...${cleanQuery.slice(-6)}`
      : cleanQuery;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-end sm:items-start sm:pt-20 justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Quick command menu"
    >
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
      />

      <div className="relative z-10 w-full sm:max-w-md bg-surface-container-low border border-outline-variant rounded-t-3xl sm:rounded-2xl shadow-elevated overflow-hidden animate-sheet-up sm:animate-fade-in">
        {/* Search bar */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-outline-variant">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Load pair, paste tx hash, or jump..."
            aria-label="Filter commands or paste address to track"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command menu"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[65dvh] sm:max-h-[420px] overflow-y-auto p-2 space-y-3 pb-safe">
          {looksLikeAddressOrHash && (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/tx/${encodeURIComponent(cleanQuery)}`);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-secondary/12 hover:bg-secondary/20 border border-secondary/30 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <span className="text-xs font-semibold text-secondary block">
                  Track order or deposit address
                </span>
                <span className="font-mono text-xs text-on-surface truncate block">
                  {shortLookup}
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-secondary shrink-0" />
            </button>
          )}

          {filteredPairs.length > 0 && (
            <div className="space-y-1">
              <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                Quick swap pairs
              </span>
              {filteredPairs.map((pair) => {
                const [fromSym, fromChain] = pair.from.split(":");
                const [toSym, toChain] = pair.to.split(":");
                return (
                  <button
                    key={pair.label}
                    type="button"
                    onClick={() => onSelectPair(pair)}
                    className="w-full h-11 px-2.5 rounded-xl hover:bg-surface-container flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        <CryptoIcon symbol={fromSym} chain={fromChain} size="sm" />
                        <CryptoIcon symbol={toSym} chain={toChain} size="sm" />
                      </div>
                      <span className="text-sm font-medium text-on-surface truncate">
                        {fromSym} to {toSym}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-on-surface-variant shrink-0 flex items-center gap-1">
                      <span>{fromChain.toUpperCase()}</span>
                      <ArrowRight className="w-3 h-3 text-primary" />
                      <span>{toChain.toUpperCase()}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {destinations.length > 0 && (
            <div className="space-y-1">
              <span className="px-2.5 py-1 text-[11px] font-medium text-on-surface-variant block">
                Navigate
              </span>
              {destinations.map((dest) => {
                const Icon = dest.icon;
                return (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={dest.action}
                    className="w-full px-2.5 py-2 rounded-xl hover:bg-surface-container flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-on-surface block">
                          {dest.label}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block truncate">
                          {dest.hint}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {!looksLikeAddressOrHash && filteredPairs.length === 0 && destinations.length === 0 && (
            <p className="py-8 text-center text-xs text-on-surface-variant">
              No matching pairs or commands. Paste an address to track an order.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
