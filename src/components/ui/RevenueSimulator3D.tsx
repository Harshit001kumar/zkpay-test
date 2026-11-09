"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, ShieldCheck } from "lucide-react";

export function RevenueSimulator3D() {
  const [volume, setVolume] = useState(250000); // $250k monthly default

  // 1% custom fee = 100 bps; 50% split = 50 bps (0.5%)
  const monthlyShare = volume * 0.005;
  const annualShare = monthlyShare * 12;

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-secondary/25 shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-outline-variant p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-secondary" />
            <h3 className="text-xs font-semibold text-on-surface">
              50/50 Partner revenue engine
            </h3>
          </div>
          <span className="text-[11px] text-secondary bg-secondary/10 px-2.5 py-1 rounded-full border border-secondary/20">
            Auto-credited in USD
          </span>
        </div>

        {/* Volume Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="volume-slider" className="text-xs text-on-surface-variant font-medium">
              Projected monthly app swap volume
            </label>
            <span className="text-base font-bold text-on-surface">
              ${volume.toLocaleString()} <span className="text-xs text-on-surface-variant font-normal">USD</span>
            </span>
          </div>

          <input
            id="volume-slider"
            type="range"
            min={10000}
            max={2000000}
            step={10000}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full h-2 bg-surface-container rounded-lg appearance-none cursor-pointer accent-secondary"
          />

          <div className="flex justify-between text-[11px] font-mono text-on-surface-variant">
            <span>$10k/mo</span>
            <span>$500k/mo</span>
            <span>$1M/mo</span>
            <span>$2M/mo</span>
          </div>
        </div>

        {/* Payout Projection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 space-y-1">
            <span className="text-xs text-on-surface-variant block">Your monthly payout</span>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-secondary tracking-tight">
              ${monthlyShare.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-on-surface-variant">50% of 100 bps custom fee</span>
          </div>

          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 space-y-1">
            <span className="text-xs text-on-surface-variant block">Annualized run rate</span>
            <div className="font-mono text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">
              ${annualShare.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-on-surface-variant">Withdrawable anytime in USDC</span>
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
            <span>Zero lockups · No minimum fee wallet balance needed</span>
          </div>

          <Link
            href="/partner"
            className="w-full sm:w-auto h-11 px-5 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-transform cursor-pointer whitespace-nowrap"
          >
            <span>Activate partner key</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
