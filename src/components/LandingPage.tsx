"use client";

import React, { useState, useRef, MouseEvent } from "react";
import { 
  QrCode, 
  ShieldCheck, 
  TrendingUp, 
  ArrowRightLeft, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  ExternalLink,
  ChevronRight,
  CreditCard,
  Lock,
  Layers
} from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { ShimmerButton } from "@/components/ui/ShimmerButton";
import { ShinyText } from "@/components/ui/ShinyText";
import { CountUp } from "@/components/ui/CountUp";
import { DecryptedText } from "@/components/ui/DecryptedText";

interface LandingPageProps {
  login: () => void;
}

const PRESET_AMOUNTS = [
  { inr: 100, label: "₹100", usdc: 1.15 },
  { inr: 500, label: "₹500", usdc: 5.73 },
  { inr: 1000, label: "₹1,000", usdc: 11.45 },
  { inr: 2500, label: "₹2,500", usdc: 28.63 },
];

export default function LandingPage({ login }: LandingPageProps) {
  const [selectedInr, setSelectedInr] = useState<number>(500);
  const [waitlistJoined, setWaitlistJoined] = useState<boolean>(false);
  const [waitlistCount, setWaitlistCount] = useState<number>(42109);

  // 3D Card Tilt State
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardTilt, setCardTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleCardMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setCardTilt({
      x: -(y / (rect.height / 2)) * 14,
      y: (x / (rect.width / 2)) * 14,
    });
  };

  const handleCardMouseLeave = () => {
    setCardTilt({ x: 0, y: 0 });
  };

  const handleJoinWaitlist = () => {
    if (!waitlistJoined) {
      setWaitlistJoined(true);
      setWaitlistCount((prev) => prev + 1);
    }
  };

  const usdcRate = 87.5;
  const usdcEquivalent = Number((selectedInr / usdcRate).toFixed(2));
  const feeEquivalent = Number((usdcEquivalent * 0.01).toFixed(2));
  const totalDebit = Number((usdcEquivalent + feeEquivalent).toFixed(2));

  return (
    <div className="min-h-screen bg-[#0e0e0f] text-[#e5e2e3] flex flex-col items-center selection:bg-[#c0c6de]/20 relative overflow-x-hidden font-sans">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[390px] h-[390px] rounded-full bg-gradient-to-b from-[#c0c6de]/10 to-transparent blur-[120px]" />
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full bg-gradient-to-t from-[#c0c6de]/5 to-transparent blur-[100px]" />
      </div>

      {/* Main Mobile Frame (390px - 430px Responsive Shell) */}
      <div className="w-full max-w-[430px] relative z-10 flex flex-col pb-28 px-4">
        {/* ─── Top App Bar ─── */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#131315]/85 backdrop-blur-[40px] border-b border-white/[0.08]">
          <div className="max-w-[430px] mx-auto h-16 px-4 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/15 flex items-center justify-center text-[#c0c6de]">
                <ShieldCheck className="w-4 h-4 text-[#c0c6de]" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white">ZkPay</span>
            </div>

            {/* Network Pill & Launch Action */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-[#c0c6de]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Base Mainnet</span>
              </div>
              <button
                onClick={login}
                className="text-xs font-semibold text-[#131315] bg-[#e5e2e3] hover:bg-white active:scale-95 transition-all rounded-lg px-3 py-1.5 shadow-sm"
              >
                Launch
              </button>
            </div>
          </div>
        </header>

        {/* ─── Main Content Body ─── */}
        <main className="pt-20 flex flex-col gap-6 w-full">
          {/* ─── Hero Section ─── */}
          <section className="flex flex-col gap-4 text-center mt-2">
            {/* Security Pill */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/10 text-[11px] font-mono text-[#c0c6de]">
                <Sparkles className="w-3 h-3 text-[#c0c6de]" />
                <DecryptedText text="ZERO KYC UNDER $100 • 2-STEP ESCROW" speed={30} />
              </div>
            </div>

            {/* Asymmetrical Editorial Headline */}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
              Scan Any UPI QR. <br />
              <ShinyText text="Pay with USDC." className="text-3xl sm:text-4xl font-extrabold" />
            </h1>

            <p className="text-xs sm:text-sm text-[#909097] max-w-[340px] mx-auto leading-relaxed">
              Pay Chai Point, auto rickshaws, and merchants across India instantly using USDC on Base Mainnet.
            </p>

            {/* ─── Mobile HUD Scanner Preview Card ─── */}
            <div className="mt-2">
              <SpotlightCard className="p-4 border-white/15 bg-[#131315]/90 rounded-2xl relative overflow-hidden">
                {/* Visual Viewport Reticle */}
                <div className="relative aspect-square w-full rounded-xl bg-[#0e0e10] border border-white/10 flex items-center justify-center overflow-hidden">
                  {/* Razor Corner Reticle Brackets */}
                  <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-[#c0c6de] rounded-tl-sm pointer-events-none" />
                  <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-[#c0c6de] rounded-tr-sm pointer-events-none" />
                  <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-[#c0c6de] rounded-bl-sm pointer-events-none" />
                  <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-[#c0c6de] rounded-br-sm pointer-events-none" />

                  {/* Scanning Laser Beam */}
                  <div className="scanner-laser" />

                  {/* Vector QR Matrix Mockup */}
                  <div className="opacity-25 flex flex-col items-center gap-2 pointer-events-none">
                    <QrCode className="w-32 h-32 text-[#c0c6de]" strokeWidth={1.5} />
                    <span className="font-mono text-[10px] text-[#c0c6de] tracking-widest uppercase">
                      UPI // RETICLE_ACTIVE
                    </span>
                  </div>

                  {/* Live Transaction Readout Overlay */}
                  <div className="absolute bottom-3 left-3 right-3 bg-[#131315]/90 backdrop-blur-xl border border-white/20 rounded-xl p-3 text-left shadow-2xl">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="font-semibold text-xs text-white">Chai Point, Indiranagar</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-[#c0c6de]">₹150.00</span>
                    </div>

                    <div className="w-full h-px bg-white/10 my-2" />

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#909097] font-mono">Settling on Base</span>
                      <span className="text-white font-mono font-bold">≈ 1.71 USDC</span>
                    </div>
                  </div>
                </div>

                {/* Primary Scan Action */}
                <div className="mt-4">
                  <ShimmerButton
                    onClick={login}
                    className="w-full py-3.5 rounded-xl font-bold tracking-wider text-xs"
                  >
                    <QrCode className="w-4 h-4 mr-1.5 inline-block" />
                    SCAN UPI QR NOW
                  </ShimmerButton>
                </div>
              </SpotlightCard>
            </div>
          </section>

          {/* ─── Quick Conversion Calculator Strip ─── */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-mono text-[#909097] uppercase tracking-wider">
                Live Exchange (1% Protocol Fee)
              </span>
              <span className="text-[11px] font-mono text-[#c0c6de]">1 USDC = ₹87.50</span>
            </div>

            {/* Amount Selection Chips */}
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((item) => (
                <button
                  key={item.inr}
                  onClick={() => setSelectedInr(item.inr)}
                  className={`py-2.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all border ${
                    selectedInr === item.inr
                      ? "bg-white/[0.08] border-[#c0c6de] text-white shadow-sm scale-[1.02]"
                      : "bg-white/[0.02] border-white/10 text-[#909097] hover:border-white/20"
                  }`}
                >
                  <span className="font-mono text-xs font-bold">{item.label}</span>
                  <span className="font-mono text-[10px] text-[#c0c6de] mt-0.5">{item.usdc} $</span>
                </button>
              ))}
            </div>

            {/* Calculated Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-[#909097] text-[11px]">Merchant receives</span>
                <span className="text-white font-bold text-sm">₹{selectedInr.toLocaleString()}</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex flex-col gap-0.5 items-end">
                <span className="text-[#909097] text-[11px]">You pay (USDC + 1% fee)</span>
                <div className="text-[#c0c6de] font-bold text-sm flex items-center gap-1">
                  <CountUp to={totalDebit} decimals={2} />
                  <span className="text-[11px] text-[#909097] font-normal">USDC</span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── 2-Step Transparent Settlement Flow ─── */}
          <section className="flex flex-col gap-3">
            <div className="px-1">
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#c0c6de]" />
                How ZkPay Settles in 2 Steps
              </h2>
              <p className="text-[11px] text-[#909097] mt-0.5">
                Strictly self-custodial on Base Mainnet. No intermediary bank account lockups.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Step 1 */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/20 flex items-center justify-center font-mono text-xs font-bold text-[#c0c6de] shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Approve Transfer & 1% Fee</span>
                    <span className="text-[10px] font-mono text-[#c0c6de] bg-white/[0.05] px-2 py-0.5 rounded">
                      Treasury Fee
                    </span>
                  </div>
                  <p className="text-[11px] text-[#909097] leading-relaxed">
                    A transparent 1% protocol fee is routed directly to the ZkPay Treasury on Base.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/20 flex items-center justify-center font-mono text-xs font-bold text-[#c0c6de] shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">P2PKit Escrow Settlement</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      Instant INR
                    </span>
                  </div>
                  <p className="text-[11px] text-[#909097] leading-relaxed">
                    Funds are deposited into decentralized escrow until the UPI merchant receives the INR transfer.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ─── 4 Core ZkPay Features (Strictly Real Capabilities) ─── */}
          <section className="flex flex-col gap-3">
            <div className="px-1">
              <h2 className="text-sm font-bold text-white tracking-tight">Built for Everyday Crypto Spending</h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Feature 1: Universal UPI */}
              <SpotlightCard className="p-3.5 rounded-xl border-white/10 bg-white/[0.02] flex flex-col justify-between aspect-square">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                  <QrCode className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-white leading-tight">Universal<br />UPI Scan</span>
                  <span className="text-[10px] text-[#909097] leading-tight">
                    Google Pay, PhonePe, Paytm, BHIM.
                  </span>
                </div>
              </SpotlightCard>

              {/* Feature 2: Zero KYC */}
              <SpotlightCard className="p-3.5 rounded-xl border-white/10 bg-white/[0.02] flex flex-col justify-between aspect-square">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-white leading-tight">Zero KYC<br />Under $100</span>
                  <span className="text-[10px] text-[#909097] leading-tight">
                    Instant micro-settlement, no passport needed.
                  </span>
                </div>
              </SpotlightCard>

              {/* Feature 3: Moonwell Earn */}
              <SpotlightCard className="p-3.5 rounded-xl border-white/10 bg-white/[0.02] flex flex-col justify-between aspect-square">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white leading-tight">Earn Yield</span>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                      7.56%
                    </span>
                  </div>
                  <span className="text-[10px] text-[#909097] leading-tight">
                    Moonwell Flagship USDC vault on Base.
                  </span>
                </div>
              </SpotlightCard>

              {/* Feature 4: Instant Cashout */}
              <SpotlightCard className="p-3.5 rounded-xl border-white/10 bg-white/[0.02] flex flex-col justify-between aspect-square">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-white leading-tight">Instant<br />Cashout</span>
                  <span className="text-[10px] text-[#909097] leading-tight">
                    Off-ramp USDC directly to your personal UPI ID.
                  </span>
                </div>
              </SpotlightCard>
            </div>
          </section>

          {/* ─── Obsidian Card 3D Waitlist Section ─── */}
          <section className="flex flex-col gap-3 mt-2">
            <div className="px-1 text-center">
              <h2 className="text-lg font-bold text-white tracking-tight">The Obsidian Card</h2>
              <p className="text-[11px] text-[#909097] mt-0.5">
                Matte black titanium physical card linked to your Base USDC balance.
              </p>
            </div>

            {/* 3D Interactive Card Showcase */}
            <div 
              ref={cardRef}
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
              style={{ perspective: "1000px" }}
              className="w-full flex justify-center py-2"
            >
              <div 
                style={{
                  transform: `rotateX(${cardTilt.x}deg) rotateY(${cardTilt.y}deg)`,
                  transition: "transform 0.15s ease-out",
                  transformStyle: "preserve-3d"
                }}
                className="w-full max-w-[340px] aspect-[1.586] rounded-2xl bg-gradient-to-tr from-[#161618] via-[#1f1f22] to-[#121213] border border-white/20 p-5 flex flex-col justify-between relative shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden"
              >
                {/* Subtle Titanium Sheen */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-black/40 pointer-events-none" />

                {/* Top of Card */}
                <div className="flex justify-between items-center relative z-10">
                  <span className="font-extrabold text-sm tracking-wider text-[#e5e2e3]">ZkPay</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                    <CreditCard className="w-4 h-4 text-[#c0c6de]" />
                  </div>
                </div>

                {/* EMV Microchip Detail */}
                <div className="relative z-10">
                  <div className="w-10 h-8 rounded bg-gradient-to-tr from-[#8f96a3] via-[#c0c6de] to-[#7a8190] border border-white/40 p-1 flex flex-col justify-between opacity-90 shadow-sm">
                    <div className="w-full h-px bg-black/40" />
                    <div className="w-full h-px bg-black/40" />
                    <div className="w-full h-px bg-black/40" />
                  </div>
                </div>

                {/* Bottom of Card */}
                <div className="flex justify-between items-end relative z-10 font-mono">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-[#909097] tracking-widest uppercase">Base Obsidian</span>
                    <span className="text-xs tracking-widest text-[#e5e2e3]">•••• 4892</span>
                  </div>
                  <span className="text-[10px] text-[#c0c6de] tracking-widest uppercase">P2P Escrow</span>
                </div>
              </div>
            </div>

            {/* Waitlist Callout */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Priority Waitlist</span>
                <span className="text-[11px] font-mono text-[#909097] mt-0.5">
                  {waitlistJoined ? (
                    <span className="text-emerald-400 font-semibold">You're on the list! #{waitlistCount}</span>
                  ) : (
                    <span>{waitlistCount.toLocaleString()} ahead of you</span>
                  )}
                </span>
              </div>

              <button
                onClick={handleJoinWaitlist}
                disabled={waitlistJoined}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                  waitlistJoined
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-white text-[#131315] hover:bg-[#e5e2e3] active:scale-95 shadow-sm"
                }`}
              >
                {waitlistJoined ? "JOINED" : "JOIN NOW"}
              </button>
            </div>
          </section>

          {/* ─── Minimal Trust Footer ─── */}
          <footer className="mt-4 pt-4 border-t border-white/10 flex flex-col items-center gap-2 text-center text-[11px] text-[#909097]">
            <div className="flex items-center gap-4 text-[#c0c6de]">
              <span>Base Mainnet</span>
              <span>•</span>
              <span>P2PKit Protocol</span>
              <span>•</span>
              <span>Privy Auth</span>
            </div>
            <p className="max-w-[280px]">
              ZkPay is a non-custodial interface. You retain full cryptographic control of your funds.
            </p>
          </footer>
        </main>
      </div>

      {/* ─── Sticky Thumb-Accessible Bottom Bar (Mobile First) ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#131315]/95 backdrop-blur-[40px] border-t border-white/[0.08] p-3 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <div className="max-w-[430px] mx-auto">
          <ShimmerButton
            onClick={login}
            className="w-full py-3.5 rounded-xl text-xs font-bold tracking-wider"
          >
            <QrCode className="w-4 h-4 mr-2 inline-block" />
            LAUNCH APP & SCAN QR
          </ShimmerButton>
        </div>
      </div>
    </div>
  );
}
