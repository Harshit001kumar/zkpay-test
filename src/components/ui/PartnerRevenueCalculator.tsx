"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, CheckCircle2 } from "lucide-react";

export function PartnerRevenueCalculator() {
  const [monthlyVolume, setMonthlyVolume] = useState<number>(250000);
  const [feeBps, setFeeBps] = useState<number>(100); // 1.00% default

  const totalFeeCollected = monthlyVolume * (feeBps / 10000);
  const partnerMonthlyShare = totalFeeCollected * 0.5;
  const partnerAnnualRunRate = partnerMonthlyShare * 12;

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-5 sm:p-8 space-y-8">
        {/* Header telemetry */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-secondary" />
            <span className="text-xs font-semibold text-on-surface">Interactive Partner Yield Model</span>
          </div>
          <span className="text-[11px] text-secondary px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20 font-medium">
            50% Net Partner Split
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Volume Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="volume-range" className="text-xs text-on-surface-variant font-medium">
                Monthly Swap Volume
              </label>
              <span className="text-sm font-mono font-bold text-on-surface">
                ${monthlyVolume.toLocaleString()} USD
              </span>
            </div>

            <input
              id="volume-range"
              type="range"
              min={10000}
              max={2000000}
              step={10000}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(Number(e.target.value))}
              className="w-full h-2 bg-surface-container rounded-lg appearance-none cursor-pointer accent-secondary focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
            />

            <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
              <span>$10k</span>
              <span>$500k</span>
              <span>$1M</span>
              <span>$2M</span>
            </div>
          </div>

          {/* Fee BPS Selector */}
          <div className="space-y-3">
            <span className="text-xs text-on-surface-variant font-medium block">
              Configured Custom Fee
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[50, 100, 150, 200].map((bps) => {
                const isSelected = feeBps === bps;
                return (
                  <button
                    key={bps}
                    type="button"
                    onClick={() => setFeeBps(bps)}
                    className={`h-10 rounded-xl text-xs font-semibold flex flex-col items-center justify-center border transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-secondary text-on-secondary border-secondary shadow-sm"
                        : "bg-surface-container text-on-surface border-outline-variant hover:border-outline hover:bg-surface-container-high"
                    }`}
                  >
                    <span className="font-mono">{(bps / 100).toFixed(2)}%</span>
                    <span className={`text-[9px] ${isSelected ? "text-on-secondary/80" : "text-on-surface-variant"}`}>
                      {bps} bps
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Projected Returns Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-surface-container border border-outline-variant space-y-1">
            <span className="text-xs text-on-surface-variant block">Your Monthly Take-Home (50%)</span>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-secondary tracking-tight">
              ${partnerMonthlyShare.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-on-surface-variant">Auto-credited directly in USD</span>
          </div>

          <div className="p-5 rounded-2xl bg-surface-container border border-outline-variant space-y-1">
            <span className="text-xs text-on-surface-variant block">Annualized Run Rate</span>
            <div className="font-mono text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              ${partnerAnnualRunRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-on-surface-variant">Withdrawable anytime in Base USDC</span>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
            <span>Zero liquidity reserves · Zero contract deployment required</span>
          </div>

          <Link
            href="/partner"
            className="h-11 px-5 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-transform cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
          >
            <span>Generate Partner Key</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
