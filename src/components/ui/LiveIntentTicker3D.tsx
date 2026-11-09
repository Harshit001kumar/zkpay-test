"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, Activity } from "lucide-react";

interface IntentEvent {
  id: string;
  from: string;
  to: string;
  fromChain: string;
  toChain: string;
  amountIn: string;
  amountOut: string;
  timeAgo: string;
  speed: string;
}

const INITIAL_EVENTS: IntentEvent[] = [
  { id: "swp_8f1a", from: "SOL", to: "USDC", fromChain: "Solana", toChain: "Base", amountIn: "4.5 SOL", amountOut: "648.20 USDC", timeAgo: "2s ago", speed: "0.4s" },
  { id: "swp_3b9c", from: "BTC", to: "USDT", fromChain: "Bitcoin", toChain: "Tron", amountIn: "0.08 BTC", amountOut: "7,720.50 USDT", timeAgo: "7s ago", speed: "10m" },
  { id: "swp_7d2e", from: "ETH", to: "SOL", fromChain: "Ethereum", toChain: "Solana", amountIn: "1.25 ETH", amountOut: "22.8 SOL", timeAgo: "14s ago", speed: "1.2s" },
  { id: "swp_1a4f", from: "LTC", to: "USDC", fromChain: "Litecoin", toChain: "Arbitrum", amountIn: "15 LTC", amountOut: "1,290.00 USDC", timeAgo: "22s ago", speed: "2.5m" },
  { id: "swp_9e6b", from: "POL", to: "ETH", fromChain: "Polygon", toChain: "Base", amountIn: "800 POL", amountOut: "0.14 ETH", timeAgo: "30s ago", speed: "1.8s" },
];

export function LiveIntentTicker3D() {
  const [events, setEvents] = useState<IntentEvent[]>(INITIAL_EVENTS);

  useEffect(() => {
    const timer = setInterval(() => {
      const candidates = [
        { from: "SOL", to: "USDC", fromChain: "Solana", toChain: "Base", amountIn: (Math.random() * 5 + 0.5).toFixed(2) + " SOL", amountOut: (Math.random() * 700 + 70).toFixed(2) + " USDC", speed: "0.4s" },
        { from: "BTC", to: "USDT", fromChain: "Bitcoin", toChain: "Tron", amountIn: (Math.random() * 0.1 + 0.01).toFixed(4) + " BTC", amountOut: (Math.random() * 9000 + 900).toFixed(2) + " USDT", speed: "9.8m" },
        { from: "ETH", to: "SOL", fromChain: "Ethereum", toChain: "Solana", amountIn: (Math.random() * 2 + 0.2).toFixed(2) + " ETH", amountOut: (Math.random() * 35 + 3.5).toFixed(2) + " SOL", speed: "1.1s" },
        { from: "BNB", to: "USDC", fromChain: "BNB Chain", toChain: "Base", amountIn: (Math.random() * 3 + 0.5).toFixed(2) + " BNB", amountOut: (Math.random() * 1800 + 300).toFixed(2) + " USDC", speed: "2.8s" },
      ];
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const newEvt: IntentEvent = {
        id: `swp_${Math.random().toString(36).slice(2, 6)}`,
        ...pick,
        timeAgo: "just now",
      };

      setEvents((prev) => [newEvt, ...prev.slice(0, 4)]);
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-primary/25 shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-outline-variant p-5 sm:p-8 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-semibold text-on-surface">
              Live solver intent stream
            </h3>
          </div>
          <span className="text-[11px] text-secondary bg-secondary/10 px-2.5 py-0.5 rounded-full border border-secondary/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span>9 chains streaming</span>
          </span>
        </div>

        {/* Live List */}
        <div className="space-y-2.5">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/60 flex items-center justify-between gap-3 text-xs transition-colors hover:border-primary/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-[11px] text-on-surface-variant shrink-0">#{evt.id}</span>
                <div className="min-w-0 truncate">
                  <span className="font-mono font-semibold text-on-surface">{evt.amountIn}</span>
                  <span className="text-[11px] text-on-surface-variant ml-1">({evt.fromChain})</span>
                  <ArrowRight className="inline-block w-3 h-3 text-secondary mx-1.5" />
                  <span className="font-mono font-semibold text-secondary">{evt.amountOut}</span>
                  <span className="text-[11px] text-on-surface-variant ml-1">({evt.toChain})</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-on-surface-variant hidden sm:inline">{evt.speed}</span>
                <span className="font-mono text-[10px] text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20 font-bold">
                  Settled
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
