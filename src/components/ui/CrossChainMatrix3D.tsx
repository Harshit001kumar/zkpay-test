"use client";

import React, { useState } from "react";
import { Zap } from "lucide-react";

interface ChainNode {
  id: string;
  name: string;
  symbol: string;
  speed: string;
  color: string;
  badge: string;
}

const CHAINS: ChainNode[] = [
  { id: "btc", name: "Bitcoin", symbol: "BTC", speed: "~10m", color: "#F7931A", badge: "L1" },
  { id: "sol", name: "Solana", symbol: "SOL", speed: "~0.4s", color: "#14F195", badge: "SPL" },
  { id: "base", name: "Base", symbol: "BASE", speed: "~1.2s", color: "#2970FF", badge: "L2" },
  { id: "eth", name: "Ethereum", symbol: "ETH", speed: "~12s", color: "#627EEA", badge: "Mainnet" },
  { id: "arb", name: "Arbitrum", symbol: "ARB", speed: "~0.8s", color: "#28A0F0", badge: "L2" },
  { id: "polygon", name: "Polygon", symbol: "POL", speed: "~2s", color: "#8247E5", badge: "POS" },
  { id: "bsc", name: "BNB Chain", symbol: "BNB", speed: "~3s", color: "#F3BA2F", badge: "BSC" },
  { id: "tron", name: "Tron", symbol: "TRX", speed: "~2.5s", color: "#FF0013", badge: "TRC20" },
  { id: "ltc", name: "Litecoin", symbol: "LTC", speed: "~2.5m", color: "#345D9D", badge: "UTXO" },
];

export function CrossChainMatrix3D() {
  const [originId, setOriginId] = useState("sol");
  const [destId, setDestId] = useState("base");

  const origin = CHAINS.find((c) => c.id === originId) || CHAINS[1];
  const dest = CHAINS.find((c) => c.id === destId) || CHAINS[2];

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-primary/25 shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-outline-variant p-5 sm:p-8 space-y-6">
        {/* Header telemetry HUD */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-xs font-semibold text-on-surface">
              Interactive 9-chain mesh routing
            </span>
          </div>
          <span className="text-[11px] text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full border border-outline-variant">
            Solver status: active · zero-custody
          </span>
        </div>

        {/* Chain selector pills */}
        <div className="space-y-3">
          <div>
            <span className="text-xs text-on-surface-variant block mb-2 font-medium">
              Select source blockchain
            </span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {CHAINS.map((c) => (
                <button
                  key={`src-${c.id}`}
                  type="button"
                  onClick={() => setOriginId(c.id)}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors duration-200 cursor-pointer ${
                    originId === c.id
                      ? "bg-primary text-on-primary scale-105"
                      : "bg-surface-container text-on-surface-variant border border-outline-variant hover:text-on-surface hover:border-outline"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span>{c.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-on-surface-variant block mb-2 font-medium">
              Select destination blockchain
            </span>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {CHAINS.map((c) => (
                <button
                  key={`dst-${c.id}`}
                  type="button"
                  onClick={() => setDestId(c.id)}
                  className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors duration-200 cursor-pointer ${
                    destId === c.id
                      ? "bg-secondary text-on-secondary scale-105"
                      : "bg-surface-container text-on-surface-variant border border-outline-variant hover:text-on-surface hover:border-outline"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span>{c.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live Route HUD Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface-container border border-primary/20 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-surface-dim border border-outline-variant flex items-center justify-center font-bold text-sm text-on-surface">
                {origin.symbol}
              </div>
              <div>
                <span className="text-xs text-on-surface-variant block">Source asset</span>
                <span className="font-semibold text-sm text-on-surface">{origin.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-center text-center">
              <div className="h-0.5 w-10 sm:w-16 bg-primary hidden sm:block" />
              <div className="px-3 py-1.5 rounded-full bg-surface-dim border border-secondary/30 text-xs text-secondary flex items-center gap-1.5 font-medium">
                <Zap className="w-3.5 h-3.5" />
                <span>Intent solver route</span>
              </div>
              <div className="h-0.5 w-10 sm:w-16 bg-secondary hidden sm:block" />
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-surface-dim border border-outline-variant flex items-center justify-center font-bold text-sm text-on-surface">
                {dest.symbol}
              </div>
              <div>
                <span className="text-xs text-on-surface-variant block">Destination asset</span>
                <span className="font-semibold text-sm text-on-surface">{dest.name}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-outline-variant/60 text-xs">
            <div>
              <span className="text-on-surface-variant block">Est. settlement</span>
              <span className="font-semibold text-secondary font-mono">{origin.speed}</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Input mode</span>
              <span className="font-semibold text-primary font-mono">FLEX_INPUT</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Relayer gas</span>
              <span className="font-semibold text-on-surface">Sponsored</span>
            </div>
            <div>
              <span className="text-on-surface-variant block">Partner attribution</span>
              <span className="font-semibold text-secondary">50% USD split</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
