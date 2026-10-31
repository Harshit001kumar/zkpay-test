"use client";

import React, { useState } from "react";
import { ArrowRight, Check, Copy, Cpu, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { useCurrency } from "@/context/CurrencyContext";

export default function CardsWaitlist() {
  const { address } = useActiveAccount();
  const { currencyMeta } = useCurrency();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const shortAddr = address
    ? `${address.slice(0, 6).toUpperCase()}...${address.slice(-4).toUpperCase()}`
    : "ZKPAY VAULT HOLDER";

  const handleShareInvite = async () => {
    const inviteUrl = typeof window !== "undefined" ? window.location.origin : "https://zkpay.top";
    const text = `Reserve the ZkPay Obsidian Card for zero-knowledge Base USDC spending across 180+ countries: ${inviteUrl}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "ZkPay Obsidian Card", text });
        return;
      } catch {}
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  };

  return (
    <div className="w-full py-4 sm:py-8 space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        {/* Left Column: Editorial Spec & Reservation Console */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low border border-primary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span className="text-xs font-semibold text-primary">
              Hardware edition · Obsidian titanium
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter text-on-surface leading-[1.03]">
            The{" "}
            <span className="text-secondary">
              Obsidian
            </span>{" "}
            Card.
          </h1>

          <p className="text-sm sm:text-base text-on-surface-variant max-w-xl leading-relaxed">
            Spend your non-custodial Base USDC at 100M+ global merchants in{" "}
            <span className="text-on-surface font-semibold">{currencyMeta.code}</span> and 40+ local
            currencies. Zero pre-loading, zero FX markup, settled atomically at the point of sale.
          </p>

          {/* Reservation Console */}
          <div className="rounded-2xl bg-surface-container-low border border-primary/25 shadow-elevated p-6 sm:p-7 max-w-lg">
            {!submitted ? (
              <form
                data-endpoint="/api/waitlist"
                onSubmit={(e: React.FormEvent) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
                className="space-y-5"
              >
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-2.5">
                    Priority hardware reservation
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full bg-surface-container border border-primary/25 focus:border-secondary rounded-xl px-4 py-3.5 text-on-surface placeholder-on-surface-variant/50 focus:outline-none text-sm transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-secondary hover:brightness-110 text-on-secondary text-xs font-bold py-4 rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer shadow-card whitespace-nowrap"
                >
                  <span>Reserve Obsidian Card</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </form>
            ) : (
              <div className="space-y-5 text-center py-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/30 text-xs text-secondary font-semibold">
                  <Check className="w-3.5 h-3.5" />
                  <span>Queue position locked</span>
                </div>
                <div>
                  <span className="text-xs font-medium text-on-surface-variant block mb-1">
                    Batch dispatch allocation
                  </span>
                  <span className="font-mono text-4xl sm:text-5xl font-extrabold text-on-surface tracking-tighter tabular-nums">
                    #4,092
                  </span>
                </div>
                <div className="border-t border-primary/15 pt-5">
                  <p className="text-xs text-on-surface-variant mb-4">
                    Refer a vault holder to advance 250 spots in the hardware queue.
                  </p>
                  <button
                    type="button"
                    onClick={handleShareInvite}
                    className="w-full bg-surface-container hover:bg-surface-container-high border border-primary/30 text-on-surface text-xs font-bold px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 cursor-pointer whitespace-nowrap"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-4 h-4 text-secondary" />
                        <span>Invite link copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-primary" />
                        <span>Share priority invite</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Interactive 3D Tilting Brushed-Metal Obsidian Card */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <Tilt3DMonolith
            maxTilt={14}
            className="w-full max-w-[460px] aspect-[1.586/1]"
            innerClassName="h-full p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-surface-container via-surface-container-low to-surface"
          >
            {/* Card Top Row: Brand & Contactless Telemetry */}
            <DepthLayer z={26} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-black text-xs shadow-dock-badge">
                  Z
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-on-surface block leading-none">
                    ZkPay Obsidian
                  </span>
                  <span className="text-[11px] font-medium text-on-surface-variant">
                    Zero-knowledge settlement
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-primary">
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/35">
                  Base L2
                </span>
                <Wifi className="w-4 h-4 rotate-90 text-secondary" />
              </div>
            </DepthLayer>

            {/* Card Middle Row: Machined EMV Contact Chip & Cryptographic Serial */}
            <DepthLayer z={34} className="flex items-center justify-between my-auto">
              <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-secondary to-primary p-1.5 border border-on-surface/30 shadow-dock-label flex items-center justify-center">
                <Cpu className="w-6 h-6 text-on-secondary stroke-[1.8]" />
              </div>
              <div className="text-right font-mono text-xs text-on-surface-variant tabular-nums">
                4853 •••• •••• 8453
              </div>
            </DepthLayer>

            {/* Card Bottom Row: Vault Holder & Network Emblem */}
            <DepthLayer z={22} className="flex items-end justify-between pt-2 border-t border-primary/15">
              <div>
                <span className="text-[11px] font-medium text-on-surface-variant block">
                  Non-custodial signer
                </span>
                <span className="font-mono text-xs text-on-surface font-bold tabular-nums">
                  {shortAddr}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-medium text-secondary block">
                  0% FX spread
                </span>
                <span className="font-extrabold text-sm text-primary italic">
                  VISA INFINITE
                </span>
              </div>
            </DepthLayer>
          </Tilt3DMonolith>

          {/* Hardware Spec Telemetry Strip */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[460px] mt-5">
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-primary/20 text-center">
              <ShieldCheck className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="text-[11px] font-medium text-on-surface-variant block">
                Custody
              </span>
              <span className="text-xs font-bold text-on-surface">Self-Custodial</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-primary/20 text-center">
              <Sparkles className="w-4 h-4 text-secondary mx-auto mb-1" />
              <span className="text-[11px] font-medium text-on-surface-variant block">
                Rewards
              </span>
              <span className="text-xs font-bold text-on-surface">2% USDC Back</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-surface-container-low border border-primary/20 text-center">
              <Cpu className="w-4 h-4 text-primary mx-auto mb-1" />
              <span className="text-[11px] font-medium text-on-surface-variant block">
                Material
              </span>
              <span className="text-xs font-bold text-on-surface">22g Anodized</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
