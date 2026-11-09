"use client";

import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

interface ChainInfo {
  id: string;
  name: string;
  symbol: string;
  color: string;
  type: string;
  speed: string;
  sampleAsset: string;
}

const SUPPORTED_CHAINS: ChainInfo[] = [
  { id: "btc", name: "Bitcoin", symbol: "BTC", color: "#F7931A", type: "UTXO", speed: "~10m", sampleAsset: "BTC" },
  { id: "sol", name: "Solana", symbol: "SOL", color: "#14F195", type: "SVM", speed: "~400ms", sampleAsset: "SOL" },
  { id: "base", name: "Base", symbol: "BASE", color: "#2970FF", type: "EVM", speed: "~1.2s", sampleAsset: "USDC" },
  { id: "eth", name: "Ethereum", symbol: "ETH", color: "#627EEA", type: "EVM", speed: "~12s", sampleAsset: "ETH" },
  { id: "arb", name: "Arbitrum", symbol: "ARB", color: "#28A0F0", type: "EVM", speed: "~800ms", sampleAsset: "USDC" },
  { id: "polygon", name: "Polygon", symbol: "POL", color: "#8247E5", type: "EVM", speed: "~2s", sampleAsset: "POL" },
  { id: "bsc", name: "BNB Chain", symbol: "BNB", color: "#F3BA2F", type: "EVM", speed: "~3s", sampleAsset: "BNB" },
  { id: "tron", name: "Tron", symbol: "TRX", color: "#FF0013", type: "TRC20", speed: "~2.5s", sampleAsset: "USDT" },
  { id: "ltc", name: "Litecoin", symbol: "LTC", color: "#345D9D", type: "UTXO", speed: "~2.5m", sampleAsset: "LTC" },
];

export function InteractiveRouteMatrix() {
  const [sourceId, setSourceId] = useState("sol");
  const [targetId, setTargetId] = useState("base");

  const source = SUPPORTED_CHAINS.find((c) => c.id === sourceId) || SUPPORTED_CHAINS[1];
  const target = SUPPORTED_CHAINS.find((c) => c.id === targetId) || SUPPORTED_CHAINS[2];

  const handleSwapSelection = () => {
    setSourceId(targetId);
    setTargetId(sourceId);
  };

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-8 space-y-8">
        {/* Source & Destination Chain Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Source Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">1. Deposit Blockchain (Source)</span>
              <span className="text-[11px] text-on-surface-variant font-medium">{source.type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((c) => {
                const isSelected = c.id === sourceId;
                return (
                  <button
                    key={`src-${c.id}`}
                    type="button"
                    onClick={() => setSourceId(c.id)}
                    className={`h-11 px-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-primary text-on-primary border-primary shadow-sm"
                        : "bg-surface-container text-on-surface border-outline-variant hover:border-outline hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span>{c.symbol}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${isSelected ? "text-on-primary/80" : "text-on-surface-variant"}`}>
                      {c.speed}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destination Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">2. Settlement Blockchain (Destination)</span>
              <span className="text-[11px] text-on-surface-variant font-medium">{target.type}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_CHAINS.map((c) => {
                const isSelected = c.id === targetId;
                return (
                  <button
                    key={`dst-${c.id}`}
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={`h-11 px-3 rounded-xl text-xs font-semibold flex items-center justify-between border transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-secondary text-on-secondary border-secondary shadow-sm"
                        : "bg-surface-container text-on-surface border-outline-variant hover:border-outline hover:bg-surface-container-high"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span>{c.symbol}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${isSelected ? "text-on-secondary/80" : "text-on-surface-variant"}`}>
                      {c.speed}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Route Architecture Summary */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-high border border-outline-variant">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: source.color }} />
                <span className="font-bold text-sm text-on-surface">{source.name}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-secondary shrink-0" />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-container-high border border-outline-variant">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: target.color }} />
                <span className="font-bold text-sm text-on-surface">{target.name}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSwapSelection}
              className="text-xs font-medium text-secondary hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Invert route direction
            </button>
          </div>

          {/* Technical Route Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant space-y-1">
              <span className="text-[11px] text-on-surface-variant block">Settlement Finality</span>
              <span className="font-bold text-on-surface">{target.speed} average</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant space-y-1">
              <span className="text-[11px] text-on-surface-variant block">Destination Gas</span>
              <span className="font-bold text-secondary">Zero gas required</span>
            </div>

            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant space-y-1">
              <span className="text-[11px] text-on-surface-variant block">Deposit Flexibility</span>
              <span className="font-bold text-primary">FLEX_INPUT active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
