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
        {/* Left Column: Editorial Spec & Double-Bezel Reservation Console */}
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c0c6de] font-bold">
              HARDWARE EDITION // OBSIDIAN TITANIUM
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter text-white leading-[1.03]">
            The{" "}
            <span className="bg-gradient-to-b from-white via-[#d8def8] to-[#8d90a1] bg-clip-text text-transparent">
              Obsidian
            </span>{" "}
            Card.
          </h1>

          <p className="text-sm sm:text-base text-[#8d90a1] max-w-xl leading-relaxed">
            Spend your non-custodial Base USDC at 100M+ global merchants in{" "}
            <span className="text-white font-semibold">{currencyMeta.code}</span> and 40+ local
            currencies. Zero pre-loading, zero FX markup, settled atomically at the point of sale.
          </p>

          {/* Reservation Console */}
          <div className="p-1.5 rounded-[28px] bg-white/[0.025] border border-white/[0.08] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] max-w-lg">
            <div className="rounded-[22px] bg-[#131315] border border-white/[0.07] p-6 sm:p-7">
              {!submitted ? (
                <form
                  onSubmit={(e: React.FormEvent) => {
                    e.preventDefault();
                    setSubmitted(true);
                  }}
                  className="space-y-5"
                >
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8d90a1] font-bold block mb-2.5">
                      PRIORITY HARDWARE RESERVATION
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full bg-[#09090b] border border-white/[0.08] focus:border-[#c0c6de] rounded-xl px-4 py-3.5 text-white placeholder-[#8d90a1]/50 focus:outline-none text-sm font-mono transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-b from-[#d8def8] to-[#a7add2] hover:from-white hover:to-white text-[#0e0e0f] font-mono text-xs font-bold uppercase tracking-[0.16em] py-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer shadow-[0_12px_30px_rgba(192,198,222,0.2)]"
                  >
                    <span>Reserve Obsidian Card</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </form>
              ) : (
                <div className="space-y-5 text-center py-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#34d399]/10 border border-[#34d399]/25 font-mono text-[10px] text-[#34d399] uppercase tracking-[0.14em] font-bold">
                    <Check className="w-3.5 h-3.5" />
                    <span>QUEUE POSITION LOCKED</span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8d90a1] block mb-1">
                      BATCH DISPATCH ALLOCATION
                    </span>
                    <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tighter tabular-nums">
                      #4,092
                    </span>
                  </div>
                  <div className="border-t border-white/[0.07] pt-5">
                    <p className="text-xs text-[#8d90a1] mb-4 font-mono">
                      Refer a vault holder to advance 250 spots in the hardware queue.
                    </p>
                    <button
                      type="button"
                      onClick={handleShareInvite}
                      className="w-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-white font-mono text-xs font-bold uppercase tracking-[0.14em] px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 cursor-pointer"
                    >
                      {copiedInvite ? (
                        <>
                          <Check className="w-4 h-4 text-[#34d399]" />
                          <span>INVITE LINK COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-[#c0c6de]" />
                          <span>SHARE PRIORITY INVITE</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive 3D Tilting Brushed-Metal Obsidian Card */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <Tilt3DMonolith
            maxTilt={14}
            className="w-full max-w-[460px] aspect-[1.586/1]"
            innerClassName="h-full p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[#1b1d24] via-[#121317] to-[#09090b]"
          >
            {/* Anodized Brushed Titanium Grain Overlay */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(115deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 6px)",
              }}
            />
            <div
              className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(192,198,222,0.18) 0%, transparent 70%)",
              }}
            />

            {/* Card Top Row: Brand & Contactless Telemetry */}
            <DepthLayer z={26} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#d8def8] to-[#9096ae] text-[#0e0e0f] flex items-center justify-center font-black text-xs shadow-md">
                  Z
                </div>
                <div>
                  <span className="font-bold text-sm tracking-tight text-white block leading-none">
                    ZKPAY OBSIDIAN
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#8d90a1]">
                    ZERO-KNOWLEDGE SETTLEMENT
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[#c0c6de]">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.1]">
                  BASE L2
                </span>
                <Wifi className="w-4 h-4 rotate-90 text-[#c0c6de]/80" />
              </div>
            </DepthLayer>

            {/* Card Middle Row: Machined EMV Contact Chip & Cryptographic Serial */}
            <DepthLayer z={34} className="flex items-center justify-between my-auto">
              <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-[#d8def8] via-[#9fa6c3] to-[#6e748d] p-1.5 border border-white/30 shadow-[0_6px_16px_rgba(0,0,0,0.6)] flex items-center justify-center">
                <Cpu className="w-6 h-6 text-[#0e0e0f]/80 stroke-[1.6]" />
              </div>
              <div className="text-right font-mono text-[10px] tracking-[0.22em] text-[#8d90a1] tabular-nums">
                4853 •••• •••• 8453
              </div>
            </DepthLayer>

            {/* Card Bottom Row: Vault Holder & Network Emblem */}
            <DepthLayer z={22} className="flex items-end justify-between pt-2 border-t border-white/[0.07]">
              <div>
                <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#8d90a1] block">
                  NON-CUSTODIAL SIGNER
                </span>
                <span className="font-mono text-xs text-white font-bold tracking-[0.14em] tabular-nums">
                  {shortAddr}
                </span>
              </div>
              <div className="text-right">
                <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#34d399] block">
                  0% FX SPREAD
                </span>
                <span className="font-extrabold text-sm tracking-widest text-[#c0c6de] italic">
                  VISA INFINITE
                </span>
              </div>
            </DepthLayer>
          </Tilt3DMonolith>

          {/* Hardware Spec Telemetry Strip */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[460px] mt-5">
            <div className="p-3.5 rounded-2xl bg-[#131315] border border-white/[0.07] text-center">
              <ShieldCheck className="w-4 h-4 text-[#c0c6de] mx-auto mb-1" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8d90a1] block">
                CUSTODY
              </span>
              <span className="text-xs font-bold text-white">Self-Custodial</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#131315] border border-white/[0.07] text-center">
              <Sparkles className="w-4 h-4 text-[#34d399] mx-auto mb-1" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8d90a1] block">
                REWARDS
              </span>
              <span className="text-xs font-bold text-white">2% USDC Back</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#131315] border border-white/[0.07] text-center">
              <Cpu className="w-4 h-4 text-[#c0c6de] mx-auto mb-1" />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8d90a1] block">
                MATERIAL
              </span>
              <span className="text-xs font-bold text-white">22g Anodized</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
