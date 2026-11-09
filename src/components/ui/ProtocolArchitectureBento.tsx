"use client";

import React from "react";
import { ShieldCheck, Split, Layers, DollarSign } from "lucide-react";

export function ProtocolArchitectureBento() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      {/* Bento Item 1: Single-Use Deposit Model (Span 7) */}
      <div className="lg:col-span-7 rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="h-full rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Single-use deposit addresses. Zero wallet approvals.
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Never sign infinite smart contract token approvals or expose your wallet keys. Every swap generates an isolated deposit address. Once your funds hit the address, the solver routes the trade and marks the deposit address complete.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant">Deposit address</span>
            <span className="text-secondary font-semibold">Single-use · Isolated risk</span>
          </div>
        </div>
      </div>

      {/* Bento Item 2: Universal FLEX_INPUT (Span 5) */}
      <div className="lg:col-span-5 rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="h-full rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/25 flex items-center justify-center text-secondary">
              <Split className="w-5 h-5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Universal FLEX_INPUT
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Eliminate swap failures caused by exchange withdrawal fees or wallet rounding. Send any amount above the solver minimum, and the engine settles dynamically at current market pricing.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant">Input flexibility</span>
            <span className="text-primary font-semibold">100% deposit capture</span>
          </div>
        </div>
      </div>

      {/* Bento Item 3: Direct Native Topology (Span 5) */}
      <div className="lg:col-span-5 rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="h-full rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Zero bridge wrapping
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              No wrapped IOUs, synthetic tokens, or central bridge contracts. Receive native Bitcoin, Solana, Ethereum, Base USDC, or Tron USDT directly in your recipient wallet.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant">Asset integrity</span>
            <span className="text-on-surface font-semibold">100% native assets</span>
          </div>
        </div>
      </div>

      {/* Bento Item 4: Automated 50/50 Revenue Split (Span 7) */}
      <div className="lg:col-span-7 rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
        <div className="h-full rounded-[calc(2rem-0.375rem)] bg-surface-container-low p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/25 flex items-center justify-center text-secondary">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Automated 50/50 developer monetization
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Embed cross-chain swaps into your application, bot, or mobile app. Customize your fee from 10 to 300 basis points. 50% of the custom fee is automatically attributed and credited in USD upon settlement.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/60 flex items-center justify-between text-xs">
            <span className="text-on-surface-variant">Revenue split</span>
            <span className="text-secondary font-semibold">50/50 instant USDC</span>
          </div>
        </div>
      </div>
    </div>
  );
}
