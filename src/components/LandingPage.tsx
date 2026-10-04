"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { 
  motion, 
  useMotionValue, 
  useTransform, 
  useSpring 
} from "framer-motion";
import { 
  QrCode, 
  ShieldCheck, 
  TrendingUp, 
  ArrowRightLeft, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  ExternalLink,
  CreditCard,
  Lock,
  Zap,
  Layers,
  ChevronRight
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { DecryptedText } from "@/components/ui/DecryptedText";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SettlementSimulator } from "@/components/SettlementSimulator";

interface LandingPageProps {
  login: () => void;
}

export default function LandingPage({ login }: LandingPageProps) {
  const [waitlistJoined, setWaitlistJoined] = useState<boolean>(false);
  const [waitlistCount, setWaitlistCount] = useState<number>(1250);

  // 3D Card Tilt with Framer Motion (GPU-accelerated, zero React re-renders)
  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 200 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothMouseY, [-0.5, 0.5], [12, -12]);
  const rotateY = useTransform(smoothMouseX, [-0.5, 0.5], [-14, 14]);

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleCardPointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const handleJoinWaitlist = () => {
    if (!waitlistJoined) {
      setWaitlistJoined(true);
      setWaitlistCount((prev) => prev + 1);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0e0e10] text-[#e5e2e3] flex flex-col items-center selection:bg-[#c0c6de]/25 selection:text-white relative overflow-x-hidden font-sans">
      {/* ─── Ambient Glow Mesh ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full bg-gradient-to-b from-[#c0c6de]/10 via-[#909097]/5 to-transparent blur-[140px]" />
        <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#c0c6de]/5 to-transparent blur-[120px]" />
        <div className="absolute bottom-[5%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[#909097]/5 to-transparent blur-[120px]" />
      </div>

      {/* ─── 01. Fluid Island Navigation (Floating Glass Pill) ─── */}
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto flex items-center justify-between bg-[#131315]/85 backdrop-blur-3xl border border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.6)] rounded-full px-4 sm:px-6 py-2.5 sm:py-3 pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-[#c0c6de] group-hover:border-[#c0c6de]/40 transition-colors shadow-sm">
              <ShieldCheck className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
            </div>
            <span className="font-bold text-base sm:text-lg tracking-tight text-white">ZkPay</span>
          </Link>

          {/* Navigation Links & Action */}
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/docs"
              className="text-xs sm:text-sm font-medium text-[#c6c6cd] hover:text-white transition-colors"
            >
              Docs
            </Link>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-[#c0c6de]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Base Mainnet</span>
            </div>

            <button
              onClick={login}
              className="text-xs sm:text-sm font-semibold text-[#131315] bg-[#e5e2e3] hover:bg-white active:scale-95 transition-all rounded-full px-4 sm:px-5 py-2 shadow-[0_0_20px_rgba(229,226,227,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
            >
              Launch App
            </button>
          </div>
        </div>
      </header>

      {/* ─── Page Container (Macro-Spacing) ─── */}
      <div className="w-full max-w-6xl relative z-10 px-4 sm:px-6 lg:px-8 pt-32 sm:pt-40 pb-28 flex flex-col gap-32 sm:gap-40">
        
        {/* ─── 02. Attention: Cinematic Hero & Asymmetric Reticle ─── */}
        <section className="min-h-[calc(100dvh-160px)] flex items-center py-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center w-full">
            {/* Left Column: 2-Line H1, Microcopy, and Button-in-Button CTA (7 cols) */}
            <div className="lg:col-span-7 flex flex-col items-start gap-6 text-left">
              {/* Single Eyebrow Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/15 text-[11px] font-mono text-[#c0c6de]">
                <Sparkles className="w-3.5 h-3.5 text-[#c0c6de]" strokeWidth={1.5} />
                <DecryptedText text="ZERO KYC UNDER $100 • 2-STEP ESCROW" speed={30} />
              </div>

              {/* Display Headline constrained to 2-3 lines max */}
              <h1 className="max-w-xl md:max-w-2xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08]">
                Pay any UPI merchant with{" "}
                <span className="bg-gradient-to-r from-white via-[#c0c6de] to-[#909097] bg-clip-text text-transparent">
                  crypto in seconds.
                </span>
              </h1>

              {/* Subtext under 20 words */}
              <p className="text-base sm:text-lg text-[#909097] max-w-xl leading-relaxed">
                Scan any UPI QR code. Pay instantly in USDC settled natively on Base with zero KYC friction.
              </p>

              {/* Button-in-Button Nested Icon CTA Architecture */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
                <button
                  onClick={login}
                  className="rounded-full pl-7 pr-2.5 py-2.5 bg-[#e5e2e3] text-[#131315] font-bold text-xs uppercase tracking-wider hover:bg-white transition-all duration-300 shadow-[0_10px_30px_rgba(229,226,227,0.18)] active:scale-[0.98] group flex items-center justify-between sm:justify-start gap-4"
                >
                  <span>LAUNCH APP &amp; SCAN QR</span>
                  <div className="w-9 h-9 rounded-full bg-[#131315] text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5 shadow-sm">
                    <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                  </div>
                </button>

                <Link
                  href="/docs"
                  className="px-6 py-3.5 rounded-full border border-white/15 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/25 active:scale-95 transition-all text-xs font-semibold text-[#e5e2e3] flex items-center justify-center gap-2"
                >
                  <span>Explore Documentation</span>
                  <ArrowRight className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                </Link>
              </div>

              {/* Assurance Metric Strip */}
              <div className="grid grid-cols-3 gap-4 pt-6 sm:pt-8 border-t border-white/10 w-full max-w-lg">
                <div className="flex flex-col">
                  <span className="text-white font-mono text-sm sm:text-base font-bold">~0.5s</span>
                  <span className="text-[11px] text-[#909097]">Settlement speed</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-mono text-sm sm:text-base font-bold">$0.00</span>
                  <span className="text-[11px] text-[#909097]">KYC under $100</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-mono text-sm sm:text-base font-bold">&lt; $0.01</span>
                  <span className="text-[11px] text-[#909097]">Base L2 gas fee</span>
                </div>
              </div>
            </div>

            {/* Right Column: Mobile Scanner Display (imagegen-frontend-mobile) */}
            <div className="lg:col-span-5 w-full flex justify-center">
              {/* Outer Shell: Double-Bezel Hardware Tray */}
              <div className="w-full max-w-[380px] p-2 sm:p-2.5 rounded-[2.5rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_rgba(0,0,0,0.85)] group">
                {/* Inner Core: Machined dark container with inset highlight */}
                <div className="rounded-[calc(2.5rem-0.625rem)] bg-[#0e0e10] p-2.5 sm:p-3 relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col gap-3">
                  {/* Phone Mockup Image Container */}
                  <div className="relative w-full rounded-2xl overflow-hidden aspect-[9/16] bg-black flex items-center justify-center border border-white/10 shadow-2xl">
                    <img
                      src="/scanner-mockup.jpg"
                      alt="ZkPay Live Mobile Scanner HUD"
                      className="w-full h-full object-cover object-top transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
                    />

                    {/* Ambient Obsidian Rim Sheen */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e10]/60 via-transparent to-transparent pointer-events-none opacity-40 group-hover:opacity-20 transition-opacity" />
                  </div>

                  {/* Reticle Test Action */}
                  <button
                    onClick={login}
                    className="w-full py-3 rounded-xl font-bold tracking-wider text-xs font-mono uppercase bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                    Test Live Scanner Reticle
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 03. Protocol Trust & Security Strip ─── */}
        <ScrollReveal>
          <div className="w-full py-8 px-6 sm:px-8 rounded-3xl bg-white/[0.02] border border-white/[0.08] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
            <span className="text-xs font-mono uppercase tracking-widest text-[#909097] text-center md:text-left shrink-0">
              Secured by &amp; built upon
            </span>
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-6 sm:gap-10 text-[#c6c6cd]/75 text-xs sm:text-sm font-mono">
              <span className="flex items-center gap-2 hover:text-white transition-colors">
                <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
                Base
              </span>
              <span className="flex items-center gap-2 hover:text-white transition-colors">
                <ShieldCheck className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                P2PKit
              </span>
              <span className="flex items-center gap-2 hover:text-white transition-colors">
                <Lock className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                Privy Auth
              </span>
              <span className="flex items-center gap-2 hover:text-white transition-colors">
                <TrendingUp className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                Morpho Vaults
              </span>
              <span className="flex items-center gap-2 hover:text-white transition-colors">
                <Zap className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                Coinbase Pay
              </span>
            </div>
          </div>
        </ScrollReveal>

        {/* ─── 04. Interest: 2-Step Precision Timeline ─── */}
        <ScrollReveal>
          <div className="flex flex-col gap-10 max-w-4xl mx-auto w-full">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                How ZkPay Settles in 2 Steps
              </h2>
              <p className="text-sm sm:text-base text-[#909097] max-w-xl">
                Strictly self-custodial on Base Mainnet. No intermediary bank account lockups.
              </p>
            </div>

            <div className="divide-y divide-white/10 border-y border-white/10">
              {/* Step 01 */}
              <div className="py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-4 flex items-center gap-4">
                  <span className="font-mono text-3xl font-extralight text-[#c0c6de]/60">01</span>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-white">Approve &amp; Escrow</span>
                    <span className="text-[11px] font-mono text-[#c0c6de] mt-0.5">1% Protocol Fee</span>
                  </div>
                </div>
                <div className="md:col-span-8 flex flex-col gap-2 text-sm text-[#909097] leading-relaxed">
                  <p>
                    Authorize your USDC on Base with your non-custodial wallet. Funds are committed into an immutable smart contract escrow on Base Mainnet.
                  </p>
                  <p className="text-xs text-[#c6c6cd]">
                    The transparent 1% protocol fee is routed directly to the on-chain treasury without hidden spreads or foreign exchange markup.
                  </p>
                </div>
              </div>

              {/* Step 02 */}
              <div className="py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-4 flex items-center gap-4">
                  <span className="font-mono text-3xl font-extralight text-[#c0c6de]/60">02</span>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-white">Instant Merchant Credit</span>
                    <span className="text-[11px] font-mono text-emerald-400 mt-0.5">Direct UPI Dispatch</span>
                  </div>
                </div>
                <div className="md:col-span-8 flex flex-col gap-2 text-sm text-[#909097] leading-relaxed">
                  <p>
                    P2P decentralized liquidity rails verify and dispatch the precise INR payment directly to the merchant UPI handle via standard banking rails.
                  </p>
                  <p className="text-xs text-[#c6c6cd]">
                    The merchant receives standard INR immediately on their phone with audio confirmation from Paytm or PhonePe soundboxes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ─── 05. Interest: Gapless Bento Grid (Doppelrand Enclosures) ─── */}
        <ScrollReveal>
          <div className="flex flex-col gap-8 w-full">
            <div className="flex flex-col gap-2">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                Engineered for Everyday Utility
              </h2>
              <p className="text-sm sm:text-base text-[#909097] max-w-xl">
                Every component is verified against live mainnet contracts and payment rails.
              </p>
            </div>

            {/* Gapless Grid with grid-flow-dense */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 grid-flow-dense">
              {/* Feature 1 (Wide: 7 cols) */}
              <div className="md:col-span-7">
                <div className="p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                  <SpotlightCard className="p-7 rounded-[calc(2rem-0.5rem)] border-white/10 bg-[#0e0e10] flex flex-col justify-between h-full min-h-[260px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <QrCode className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div className="flex flex-col gap-2 mt-8">
                      <h3 className="text-xl font-bold text-white">Universal UPI Scanner</h3>
                      <p className="text-sm text-[#909097] leading-relaxed">
                        Point and scan any QR code across India - Google Pay, PhonePe, Paytm, BHIM, Cred, and merchant soundboxes. Decodes UPI payloads with 100% standard compliance.
                      </p>
                    </div>
                  </SpotlightCard>
                </div>
              </div>

              {/* Feature 2 (5 cols) */}
              <div className="md:col-span-5">
                <div className="p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                  <SpotlightCard className="p-7 rounded-[calc(2rem-0.5rem)] border-white/10 bg-[#0e0e10] flex flex-col justify-between h-full min-h-[260px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <ShieldCheck className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div className="flex flex-col gap-2 mt-8">
                      <h3 className="text-xl font-bold text-white">Zero KYC Under $100</h3>
                      <p className="text-sm text-[#909097] leading-relaxed">
                        Pay small daily merchant tabs instantly. No passport scans, no document uploads, no waiting for verification queues.
                      </p>
                    </div>
                  </SpotlightCard>
                </div>
              </div>

              {/* Feature 3 (5 cols) */}
              <div className="md:col-span-5">
                <div className="p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                  <SpotlightCard className="p-7 rounded-[calc(2rem-0.5rem)] border-white/10 bg-[#0e0e10] flex flex-col justify-between h-full min-h-[260px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                        <TrendingUp className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        5.51% APY
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 mt-8">
                      <h3 className="text-xl font-bold text-white">Morpho Vault Yield</h3>
                      <p className="text-sm text-[#909097] leading-relaxed">
                        Idle USDC in your account continuously compounds via Steakhouse Prime Morpho vaults on Base. Earn passive return until you tap to pay.
                      </p>
                    </div>
                  </SpotlightCard>
                </div>
              </div>

              {/* Feature 4 (Wide: 7 cols) */}
              <div className="md:col-span-7">
                <div className="p-2 rounded-[2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                  <SpotlightCard className="p-7 rounded-[calc(2rem-0.5rem)] border-white/10 bg-[#0e0e10] flex flex-col justify-between h-full min-h-[260px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <ArrowRightLeft className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div className="flex flex-col gap-2 mt-8">
                      <h3 className="text-xl font-bold text-white">Instant P2P Cashout</h3>
                      <p className="text-sm text-[#909097] leading-relaxed">
                        Need cash in your own bank account? Off-ramp USDC directly to your personal UPI VPA with zero platform lock-in. Settlements process in under 60 seconds.
                      </p>
                    </div>
                  </SpotlightCard>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ─── 06. Desire: Interactive Real-Time Settlement Simulator (ReactBits Inspired) ─── */}
        <ScrollReveal>
          <SettlementSimulator onLaunchApp={login} />
        </ScrollReveal>

        {/* ─── 07. Desire: The Obsidian 3D Titanium Card Showcase ─── */}
        <ScrollReveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center max-w-5xl mx-auto w-full">
            {/* Left: 3D Interactive Card (6 cols) */}
            <div 
              ref={cardRef}
              onPointerMove={handleCardPointerMove}
              onPointerLeave={handleCardPointerLeave}
              style={{ perspective: "1000px" }}
              className="lg:col-span-6 flex justify-center py-4 cursor-grab active:cursor-grabbing"
            >
              <motion.div 
                style={{
                  rotateX,
                  rotateY,
                  transformStyle: "preserve-3d",
                }}
                className="w-full max-w-[380px] aspect-[1.586] rounded-3xl bg-gradient-to-tr from-[#161618] via-[#1f1f22] to-[#121213] border border-white/20 p-6 flex flex-col justify-between relative shadow-[0_30px_70px_rgba(0,0,0,0.95)] overflow-hidden"
              >
                {/* Titanium Sheen Layer */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.12] via-transparent to-black/50 pointer-events-none" />

                {/* Card Top */}
                <div className="flex justify-between items-center relative z-10">
                  <span className="font-extrabold text-base tracking-wider text-[#e5e2e3]">ZkPay</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/25" />
                    <CreditCard className="w-5 h-5 text-[#c0c6de]" strokeWidth={1.5} />
                  </div>
                </div>

                {/* Card EMV Microchip */}
                <div className="relative z-10">
                  <div className="w-12 h-9 rounded-md bg-gradient-to-tr from-[#8f96a3] via-[#c0c6de] to-[#7a8190] border border-white/40 p-1 flex flex-col justify-between opacity-90 shadow-sm">
                    <div className="w-full h-px bg-black/40" />
                    <div className="w-full h-px bg-black/40" />
                    <div className="w-full h-px bg-black/40" />
                  </div>
                </div>

                {/* Card Bottom */}
                <div className="flex justify-between items-end relative z-10 font-mono">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#909097] tracking-widest uppercase">Base Obsidian</span>
                    <span className="text-sm tracking-widest text-[#e5e2e3]">•••• 4892</span>
                  </div>
                  <span className="text-[11px] text-[#c0c6de] tracking-widest uppercase font-semibold">
                    P2P Escrow
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Right: Waitlist CTA & Details (6 cols) */}
            <div className="lg:col-span-6 flex flex-col gap-6 text-left">
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                  The Obsidian Card
                </h2>
                <p className="text-sm sm:text-base text-[#909097] leading-relaxed">
                  Matte black titanium physical card linked to your Base USDC balance. Tap anywhere Visa and RuPay NFC contactless terminals are accepted.
                </p>
              </div>

              <div className="flex flex-col gap-3 text-xs sm:text-sm text-[#c6c6cd]">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                  <span>Direct debit from Base USDC with zero FX spread</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                  <span>Instant freeze and unlock via smart contract</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                  <span>Priority access to elevated monthly cashbacks</span>
                </div>
              </div>

              {/* Waitlist Box */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Priority Waitlist</span>
                  <span className="text-xs font-mono text-[#909097] mt-0.5">
                    {waitlistJoined ? (
                      <span className="text-emerald-400 font-semibold">You are on the list! #{waitlistCount}</span>
                    ) : (
                      <span>{waitlistCount.toLocaleString()}+ members in queue</span>
                    )}
                  </span>
                </div>

                <button
                  onClick={handleJoinWaitlist}
                  disabled={waitlistJoined}
                  className={`px-5 py-2.5 rounded-full text-xs font-bold font-mono transition-all shrink-0 ${
                    waitlistJoined
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-white text-[#131315] hover:bg-[#e5e2e3] active:scale-95 shadow-sm"
                  }`}
                >
                  {waitlistJoined ? "JOINED" : "JOIN NOW"}
                </button>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ─── 08. Action: Minimalist 2-Column Footer ─── */}
        <footer className="pt-12 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 text-xs text-[#909097]">
          {/* Left Column: Brand & Description */}
          <div className="flex flex-col gap-2 max-w-sm">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <ShieldCheck className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
              <span>ZkPay</span>
            </div>
            <p className="text-xs text-[#909097] leading-relaxed">
              Decentralized crypto-to-fiat payment protocol on Base. Non-custodial interface with full cryptographic self-custody.
            </p>
            <span className="text-[11px] text-[#909097]/80 mt-1">
              &copy; 2026 ZkPay. All rights reserved.
            </span>
          </div>

          {/* Right Column: Navigation & Legal Links */}
          <div className="flex flex-wrap items-center gap-6 sm:gap-8 font-medium">
            <Link href="/docs" className="hover:text-white transition-colors">
              Documentation
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <a
              href="https://basescan.org/address/0xe904128f11816e8ea3ffb783457a87679313b293"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-white transition-colors text-[#c0c6de]"
            >
              <span>Base Contract</span>
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
            </a>
          </div>
        </footer>
      </div>

      {/* ─── Sticky Mobile Action Bar (Thumb-Accessible, Hidden on Desktop) ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#131315]/95 backdrop-blur-[40px] border-t border-white/[0.08] p-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="max-w-md mx-auto">
          <button
            onClick={login}
            className="w-full rounded-full pl-6 pr-2 py-2 bg-[#e5e2e3] text-[#131315] font-bold text-xs uppercase tracking-wider hover:bg-white active:scale-[0.98] transition-all flex items-center justify-between shadow-md"
          >
            <span>LAUNCH APP &amp; SCAN QR</span>
            <div className="w-8 h-8 rounded-full bg-[#131315] text-white flex items-center justify-center">
              <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
