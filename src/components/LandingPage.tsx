"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  AnimatePresence,
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
  ChevronDown,
  Layers,
  Coins,
  Globe2,
  RefreshCw,
  Sliders,
  Flame,
  Check,
  Copy,
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
  const [waitlistCount, setWaitlistCount] = useState<number>(1420);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // 3D Scanner Perspective Physics (GPU-accelerated useMotionValue, zero React re-renders)
  const phoneRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 24, stiffness: 220 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothMouseY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(smoothMouseX, [-0.5, 0.5], [-12, 12]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!phoneRef.current) return;
    const rect = phoneRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handlePointerLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // 3D Card Showcase Physics
  const cardRef = useRef<HTMLDivElement>(null);
  const cardMouseX = useMotionValue(0);
  const cardMouseY = useMotionValue(0);
  const smoothCardX = useSpring(cardMouseX, springConfig);
  const smoothCardY = useSpring(cardMouseY, springConfig);
  const cardRotateX = useTransform(smoothCardY, [-0.5, 0.5], [12, -12]);
  const cardRotateY = useTransform(smoothCardX, [-0.5, 0.5], [-14, 14]);

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    cardMouseX.set(x);
    cardMouseY.set(y);
  };

  const handleCardPointerLeave = () => {
    cardMouseX.set(0);
    cardMouseY.set(0);
  };

  const handleJoinWaitlist = () => {
    if (!waitlistJoined) {
      setWaitlistJoined(true);
      setWaitlistCount((prev) => prev + 1);
    }
  };

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const faqs = [
    {
      q: "How does ZkPay pay a UPI merchant without KYC?",
      a: "For transactions under $100 equivalent (~₹8,500), ZkPay utilizes decentralized P2P liquidity rails. You commit USDC on Base into a smart contract escrow, and a network solver transfers the local INR fiat directly to the merchant's UPI handle in seconds.",
    },
    {
      q: "Does the merchant need a crypto wallet or app?",
      a: "No. The merchant receives standard Indian Rupees (INR) directly into their linked bank account via their regular QR code (Paytm, PhonePe, Google Pay, BHIM). Their store soundbox announces the payment in INR just like any normal customer payment.",
    },
    {
      q: "How does multi-chain deposit work from Solana, Bitcoin, or Tron?",
      a: "ZkPay integrates with decentralized solver networks (NEAR 1Click protocol). You can deposit SOL, BTC, TRX, LTC, or EVM assets directly into a single-use deposit address. Funds are swapped on-chain into Base USDC with zero custody lockup.",
    },
    {
      q: "What are the protocol fees?",
      a: "ZkPay charges a flat, transparent 1% protocol fee with no hidden foreign exchange markups. Gas on Base Mainnet is sponsored via Pimlico Account Abstraction paymasters, meaning you do not even need ETH for gas.",
    },
    {
      q: "How does the Morpho yield vault work?",
      a: "Any idle USDC held in your ZkPay smart account automatically earns ~5.51% benchmark APY through the Steakhouse Prime instant USDC vault on Morpho Blue. Your yield continuously compounds until the exact millisecond you scan a QR to pay.",
    },
  ];

  const solverChains = [
    { symbol: "BASE", name: "Base Mainnet", speed: "0.5s", tag: "Native Settlement" },
    { symbol: "SOL", name: "Solana", speed: "1.2s", tag: "Direct Origin Rail" },
    { symbol: "BTC", name: "Bitcoin", speed: "Instant", tag: "Solver Escrow" },
    { symbol: "ETH", name: "Ethereum", speed: "1.0s", tag: "EVM Cross-Chain" },
    { symbol: "TRON", name: "Tron (TRC20)", speed: "1.5s", tag: "Zero Spread" },
    { symbol: "ARB", name: "Arbitrum", speed: "0.8s", tag: "L2 Liquidity" },
    { symbol: "BSC", name: "BNB Chain", speed: "1.0s", tag: "Cross-Chain Swap" },
  ];

  return (
    <main className="min-h-[100dvh] w-full max-w-full bg-[#0a0a0c] text-[#e5e2e3] flex flex-col items-center selection:bg-[#c0c6de]/25 selection:text-white relative overflow-x-hidden font-sans">
      {/* ─── Ambient Cinematic Mesh Gradients ─── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-gradient-to-b from-[#c0c6de]/12 via-[#4f5875]/6 to-transparent blur-[160px]" />
        <div className="absolute top-[35%] right-[-15%] w-[650px] h-[650px] rounded-full bg-gradient-to-br from-[#0052FF]/8 via-transparent to-transparent blur-[140px]" />
        <div className="absolute top-[65%] left-[-15%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-[#10b981]/6 via-transparent to-transparent blur-[140px]" />
        {/* Subtle subtle scanline/grain overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      </div>

      {/* ─── 01. Fluid Island Navigation (Floating Glass Pill) ─── */}
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto flex items-center justify-between bg-[#121215]/80 backdrop-blur-2xl border border-white/10 ring-1 ring-white/5 shadow-[0_20px_45px_rgba(0,0,0,0.7)] rounded-full px-4 sm:px-6 py-2.5 sm:py-3 pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-[#c0c6de] group-hover:border-[#c0c6de]/50 group-hover:bg-white/[0.1] transition-all shadow-sm">
              <ShieldCheck className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">ZkPay</span>
              <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">v1.0</span>
            </div>
          </Link>

          {/* Center Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-[#909097]">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#simulator" className="hover:text-white transition-colors">Simulator</a>
            <a href="#solvers" className="hover:text-white transition-colors">Solvers</a>
            <a href="#card" className="hover:text-white transition-colors">Obsidian Card</a>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-[11px] font-mono text-[#c0c6de]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Base Mainnet</span>
            </div>

            <button
              onClick={login}
              className="text-xs sm:text-sm font-semibold text-[#101014] bg-[#e5e2e3] hover:bg-white active:scale-95 transition-all rounded-full px-4 sm:px-5 py-2 shadow-[0_0_20px_rgba(229,226,227,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] flex items-center gap-2 group"
            >
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Macro Container (Spaced Section Spine) ─── */}
      <div className="w-full max-w-6xl relative z-10 px-4 sm:px-6 lg:px-8 pt-32 sm:pt-44 pb-32 flex flex-col gap-32 sm:gap-44">
        
        {/* ─── 02. Attention: Cinematic Center Hero & 3D Interactive HUD ─── */}
        <section className="min-h-[calc(100dvh-180px)] flex flex-col items-center justify-center text-center gap-10 sm:gap-14 pt-4">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/15 text-[11px] font-mono tracking-wider text-[#c0c6de] shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-[#c0c6de]" strokeWidth={1.5} />
            <DecryptedText text="ZERO KYC UNDER $100 • DECENTRALIZED P2P ESCROW" speed={28} />
          </div>

          {/* 2-Line Iron Rule Headline */}
          <h1 className="max-w-4xl lg:max-w-5xl text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.06]">
            Pay any UPI merchant with{" "}
            <span className="bg-gradient-to-r from-white via-[#c0c6de] to-[#8f96a3] bg-clip-text text-transparent">
              crypto in seconds.
            </span>
          </h1>

          {/* Clean Subtext under 22 words */}
          <p className="text-base sm:text-xl text-[#909097] max-w-2xl leading-relaxed">
            Scan standard Indian QR codes. Pay instantly with USDC settled natively on Base with zero KYC friction, zero custody lockup, and sponsored gas.
          </p>

          {/* Nested Button-in-Button CTA Architecture */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto pt-2">
            <button
              onClick={login}
              className="rounded-full pl-8 pr-2.5 py-2.5 bg-[#e5e2e3] text-[#0e0e12] font-bold text-xs uppercase tracking-wider hover:bg-white transition-all duration-300 shadow-[0_12px_35px_rgba(229,226,227,0.22)] active:scale-[0.98] group flex items-center justify-between gap-5 w-full sm:w-auto"
            >
              <span>LAUNCH APP &amp; SCAN QR</span>
              <div className="w-9 h-9 rounded-full bg-[#131317] text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5 shadow-sm">
                <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.75} />
              </div>
            </button>

            <a
              href="#simulator"
              className="px-6 py-3.5 rounded-full border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/30 active:scale-95 transition-all text-xs font-semibold text-[#e5e2e3] flex items-center justify-center gap-2.5 w-full sm:w-auto"
            >
              <span>Test Live Simulator</span>
              <Sliders className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
            </a>
          </div>

          {/* Live Micro-Metrics Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 pt-8 sm:pt-12 border-t border-white/10 w-full max-w-3xl">
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <span className="text-white font-mono text-xl sm:text-2xl font-bold tracking-tight">~0.5s</span>
              <span className="text-[11px] font-mono text-[#909097] uppercase tracking-wider mt-0.5">Settlement Speed</span>
            </div>
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <span className="text-emerald-400 font-mono text-xl sm:text-2xl font-bold tracking-tight">$0.00</span>
              <span className="text-[11px] font-mono text-[#909097] uppercase tracking-wider mt-0.5">KYC Under $100</span>
            </div>
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <span className="text-white font-mono text-xl sm:text-2xl font-bold tracking-tight">&lt; $0.01</span>
              <span className="text-[11px] font-mono text-[#909097] uppercase tracking-wider mt-0.5">Base Gas Fee</span>
            </div>
            <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
              <span className="text-white font-mono text-xl sm:text-2xl font-bold tracking-tight">1.0%</span>
              <span className="text-[11px] font-mono text-[#909097] uppercase tracking-wider mt-0.5">Flat Protocol Fee</span>
            </div>
          </div>

          {/* ─── Hero Showcase: Double-Bezel Interactive Phone Reticle Display ─── */}
          <div
            ref={phoneRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={{ perspective: "1200px" }}
            className="w-full max-w-md sm:max-w-lg mt-6 cursor-grab active:cursor-grabbing"
          >
            <motion.div
              style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
              }}
              className="p-3 sm:p-4 rounded-[2.8rem] bg-white/[0.04] border border-white/12 ring-1 ring-white/5 shadow-[0_30px_90px_rgba(0,0,0,0.9)] group"
            >
              {/* Inner Core: Machined Obsidian Bezel */}
              <div className="rounded-[calc(2.8rem-0.75rem)] bg-[#0d0d10] p-2 sm:p-2.5 relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)] flex flex-col gap-3">
                {/* Visual Viewport with Generated Photorealistic Asset */}
                <div className="relative w-full rounded-2xl overflow-hidden aspect-[9/16] bg-black flex items-center justify-center border border-white/10 shadow-2xl">
                  <img
                    src="/zkpay_scanner_phone.jpg"
                    alt="ZkPay Mobile UPI Scanner HUD"
                    className="w-full h-full object-cover object-top transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]"
                  />
                  {/* Subtle edge sheen overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Interactive Reticle Test Bar */}
                <button
                  onClick={login}
                  className="w-full py-3 rounded-xl font-bold tracking-wider text-xs font-mono uppercase bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm"
                >
                  <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
                  <span>Test Live Scanner Reticle</span>
                </button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ─── 03. Interest: Multi-Chain Instant Solver Marquee (Cross-Chain Rails) ─── */}
        <section id="solvers" className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-[#909097]">Cross-Chain Solver Rails</span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
                Deposit from any chain. Spend on UPI instantly.
              </h2>
            </div>
            <p className="text-xs text-[#909097] max-w-sm">
              Single-use solver deposit addresses. Fees carve directly on the origin chain with $0 threshold and instant execution.
            </p>
          </div>

          {/* Solver Rail Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {solverChains.map((c) => (
              <div
                key={c.symbol}
                className="p-1 rounded-2xl bg-white/[0.03] border border-white/10 ring-1 ring-white/5 hover:border-white/25 transition-all group"
              >
                <div className="p-3.5 rounded-[calc(1rem-0.25rem)] bg-[#0e0e12] flex flex-col justify-between h-full min-h-[105px]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-white">{c.symbol}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                  </div>
                  <div>
                    <span className="text-[11px] text-[#909097] block leading-tight">{c.name}</span>
                    <span className="text-[10px] font-mono text-[#c0c6de] mt-1 block">{c.speed}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 04. Interest: 2-Step Precision Timeline ─── */}
        <section className="flex flex-col gap-10 max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#909097]">Precision Architecture</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              How ZkPay Settles in 2 Steps
            </h2>
            <p className="text-sm sm:text-base text-[#909097] max-w-xl">
              Strictly non-custodial smart escrow on Base Mainnet. No intermediary centralized exchange lockups.
            </p>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {/* Step 01 */}
            <div className="py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-4 flex items-center gap-4">
                <span className="font-mono text-4xl font-extralight text-[#c0c6de]/50">01</span>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-white">Approve &amp; Escrow</span>
                  <span className="text-[11px] font-mono text-[#c0c6de] mt-0.5">1% Protocol Fee • Zero Gas</span>
                </div>
              </div>
              <div className="md:col-span-8 flex flex-col gap-2 text-sm text-[#909097] leading-relaxed">
                <p>
                  Authorize your USDC on Base with your non-custodial wallet. Funds are held in an immutable Diamond escrow contract until the payment completes.
                </p>
                <p className="text-xs text-[#c6c6cd]">
                  Pimlico account abstraction pays the gas fees so you never have to hold native ETH on Base to spend your USDC balance.
                </p>
              </div>
            </div>

            {/* Step 02 */}
            <div className="py-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-4 flex items-center gap-4">
                <span className="font-mono text-4xl font-extralight text-[#c0c6de]/50">02</span>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-white">Instant Merchant Credit</span>
                  <span className="text-[11px] font-mono text-emerald-400 mt-0.5">Direct UPI Banking Dispatch</span>
                </div>
              </div>
              <div className="md:col-span-8 flex flex-col gap-2 text-sm text-[#909097] leading-relaxed">
                <p>
                  Decentralized P2P liquidity solver rails verify and dispatch the precise INR fiat payment directly to the merchant's UPI handle in seconds.
                </p>
                <p className="text-xs text-[#c6c6cd]">
                  The merchant receives native INR instantly in their regular bank account with soundbox audio confirmation from Paytm, PhonePe, or Google Pay.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 05. Interest: Gapless Bento Grid (Doppelrand Enclosures) ─── */}
        <section id="features" className="flex flex-col gap-8 w-full">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#909097]">System Capabilities</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Engineered for Everyday Utility
            </h2>
            <p className="text-sm sm:text-base text-[#909097] max-w-xl">
              Every component is verified against live mainnet contracts, P2P Diamond facets, and national banking rails.
            </p>
          </div>

          {/* Gapless Grid with grid-flow-dense */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 grid-flow-dense">
            {/* Feature 1 (Wide: 7 cols) */}
            <div className="md:col-span-7">
              <div className="p-2 rounded-[2.2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                <SpotlightCard className="p-7 sm:p-8 rounded-[calc(2.2rem-0.5rem)] border-white/10 bg-[#0e0e12] flex flex-col justify-between h-full min-h-[280px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <QrCode className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-mono text-[#c0c6de] bg-white/[0.04] px-3 py-1 rounded-full border border-white/10">
                      50M+ MERCHANTS
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mt-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Universal UPI Scanner</h3>
                    <p className="text-sm text-[#909097] leading-relaxed">
                      Point and scan any QR code across India - Google Pay, PhonePe, Paytm, BHIM, Cred, and merchant soundboxes. Decodes UPI payloads with 100% standard compliance and instant camera reticle focus.
                    </p>
                  </div>
                </SpotlightCard>
              </div>
            </div>

            {/* Feature 2 (5 cols) */}
            <div className="md:col-span-5">
              <div className="p-2 rounded-[2.2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                <SpotlightCard className="p-7 sm:p-8 rounded-[calc(2.2rem-0.5rem)] border-white/10 bg-[#0e0e12] flex flex-col justify-between h-full min-h-[280px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <ShieldCheck className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                      NO PASSPORT
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mt-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Zero KYC Under $100</h3>
                    <p className="text-sm text-[#909097] leading-relaxed">
                      Pay small daily merchant tabs instantly. No document uploads, no facial selfies, no waiting for approval queues. Just connect your wallet and pay.
                    </p>
                  </div>
                </SpotlightCard>
              </div>
            </div>

            {/* Feature 3 (5 cols) */}
            <div className="md:col-span-5">
              <div className="p-2 rounded-[2.2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                <SpotlightCard className="p-7 sm:p-8 rounded-[calc(2.2rem-0.5rem)] border-white/10 bg-[#0e0e12] flex flex-col justify-between h-full min-h-[280px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <TrendingUp className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      5.51% APY
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mt-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Morpho Vault Yield</h3>
                    <p className="text-sm text-[#909097] leading-relaxed">
                      Idle USDC in your account automatically compounds via Steakhouse Prime Morpho vaults on Base. Earn passive return until the exact moment you tap to pay.
                    </p>
                  </div>
                </SpotlightCard>
              </div>
            </div>

            {/* Feature 4 (Wide: 7 cols) */}
            <div className="md:col-span-7">
              <div className="p-2 rounded-[2.2rem] bg-white/[0.03] border border-white/10 ring-1 ring-white/5 h-full">
                <SpotlightCard className="p-7 sm:p-8 rounded-[calc(2.2rem-0.5rem)] border-white/10 bg-[#0e0e12] flex flex-col justify-between h-full min-h-[280px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#c0c6de]">
                      <ArrowRightLeft className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-mono text-[#c0c6de] bg-white/[0.04] px-3 py-1 rounded-full border border-white/10">
                      &lt; 60 SECONDS
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mt-8">
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Instant Personal Cashout</h3>
                    <p className="text-sm text-[#909097] leading-relaxed">
                      Need funds directly in your personal bank account? Off-ramp USDC straight to your personal UPI VPA with zero platform lock-in. Settlements process natively in under 60 seconds.
                    </p>
                  </div>
                </SpotlightCard>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 06. Desire: Interactive Real-Time Settlement Simulator ─── */}
        <section id="simulator">
          <ScrollReveal>
            <SettlementSimulator onLaunchApp={login} />
          </ScrollReveal>
        </section>

        {/* ─── 07. Desire: The Obsidian 3D Titanium Card Showcase ─── */}
        <section id="card">
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
                    rotateX: cardRotateX,
                    rotateY: cardRotateY,
                    transformStyle: "preserve-3d",
                  }}
                  className="w-full max-w-[420px] aspect-[1.586] rounded-3xl p-2 bg-white/[0.04] border border-white/15 shadow-[0_30px_90px_rgba(0,0,0,0.95)] overflow-hidden group"
                >
                  <div className="w-full h-full rounded-[calc(1.5rem-0.25rem)] overflow-hidden relative">
                    <img
                      src="/zkpay_obsidian_card.jpg"
                      alt="ZkPay Obsidian Titanium Physical Card"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  </div>
                </motion.div>
              </div>

              {/* Right: Waitlist CTA & Details (6 cols) */}
              <div className="lg:col-span-6 flex flex-col gap-6 text-left">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#909097]">Physical Extension</span>
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                    The Obsidian Card
                  </h2>
                  <p className="text-sm sm:text-base text-[#909097] leading-relaxed">
                    Matte black titanium physical card linked directly to your Base USDC balance. Tap anywhere Visa and RuPay NFC contactless terminals are accepted worldwide.
                  </p>
                </div>

                <div className="flex flex-col gap-3 text-xs sm:text-sm text-[#c6c6cd]">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                    <span>Direct debit from Base USDC with zero FX currency spread</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                    <span>Instant freeze and unlock via non-custodial smart contract</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={1.5} />
                    <span>Priority tier for monthly cashback pool rewards</span>
                  </div>
                </div>

                {/* Waitlist Box */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Priority Card Waitlist</span>
                    <span className="text-xs font-mono text-[#909097] mt-0.5">
                      {waitlistJoined ? (
                        <span className="text-emerald-400 font-semibold">You are queued! #{waitlistCount}</span>
                      ) : (
                        <span>{waitlistCount.toLocaleString()}+ members registered</span>
                      )}
                    </span>
                  </div>

                  <button
                    onClick={handleJoinWaitlist}
                    disabled={waitlistJoined}
                    className={`px-5 py-2.5 rounded-full text-xs font-bold font-mono transition-all shrink-0 ${
                      waitlistJoined
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-white text-[#101014] hover:bg-[#e5e2e3] active:scale-95 shadow-sm"
                    }`}
                  >
                    {waitlistJoined ? "RESERVED" : "JOIN QUEUE"}
                  </button>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ─── 08. Protocol Architecture & Security Accordion ─── */}
        <section className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#909097]">Transparency &amp; Auditability</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-[#909097]">
              Technical and operational answers for merchants, users, and developers.
            </p>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {faqs.map((faq, i) => (
              <div key={i} className="py-5">
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between text-left font-semibold text-base sm:text-lg text-white hover:text-[#c0c6de] transition-colors gap-4"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#909097] shrink-0 transition-transform duration-300 ${
                      activeFaq === i ? "rotate-180 text-white" : ""
                    }`}
                    strokeWidth={1.5}
                  />
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pt-3 text-sm text-[#909097] leading-relaxed">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 09. High-Contrast Final Call To Action ─── */}
        <section>
          <ScrollReveal>
            <div className="p-2 rounded-[2.5rem] bg-white/[0.04] border border-white/12 ring-1 ring-white/5">
              <div className="p-8 sm:p-14 rounded-[calc(2.5rem-0.5rem)] bg-gradient-to-b from-[#131317] to-[#0c0c0e] border border-white/10 flex flex-col items-center text-center gap-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-[#c0c6de]">
                  <Flame className="w-6 h-6 text-[#c0c6de]" strokeWidth={1.5} />
                </div>
                
                <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-xl">
                  Ready to spend crypto at any merchant?
                </h2>
                
                <p className="text-sm sm:text-base text-[#909097] max-w-md">
                  No account registration fees. No mandatory passport upload under $100. Start scanning in under 30 seconds.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <button
                    onClick={login}
                    className="rounded-full pl-8 pr-2.5 py-2.5 bg-[#e5e2e3] text-[#0e0e12] font-bold text-xs uppercase tracking-wider hover:bg-white transition-all duration-300 shadow-[0_12px_35px_rgba(229,226,227,0.22)] active:scale-[0.98] group flex items-center justify-between gap-5"
                  >
                    <span>LAUNCH APP &amp; SCAN QR</span>
                    <div className="w-9 h-9 rounded-full bg-[#131317] text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-0.5 shadow-sm">
                      <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.75} />
                    </div>
                  </button>

                  <Link
                    href="/docs"
                    className="px-6 py-3.5 rounded-full border border-white/15 bg-white/[0.02] hover:bg-white/[0.06] active:scale-95 transition-all text-xs font-semibold text-[#e5e2e3]"
                  >
                    Read Developer Documentation
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* ─── 10. Minimalist 2-Column Footer ─── */}
        <footer className="pt-12 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 text-xs text-[#909097]">
          {/* Left Column: Brand & Description */}
          <div className="flex flex-col gap-2 max-w-sm">
            <div className="flex items-center gap-2.5 text-white font-bold text-base">
              <ShieldCheck className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.5} />
              <span>ZkPay</span>
            </div>
            <p className="text-xs text-[#909097] leading-relaxed">
              Decentralized crypto-to-fiat payment protocol on Base. Non-custodial smart escrow with instant banking rails.
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
              href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-white transition-colors text-[#c0c6de]"
            >
              <span>Base Diamond</span>
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
            </a>
          </div>
        </footer>
      </div>

      {/* ─── Sticky Mobile Action Bar (Thumb-Accessible, Hidden on Desktop) ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#121215]/95 backdrop-blur-2xl border-t border-white/[0.08] p-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="max-w-md mx-auto">
          <button
            onClick={login}
            className="w-full rounded-full pl-6 pr-2 py-2 bg-[#e5e2e3] text-[#101014] font-bold text-xs uppercase tracking-wider hover:bg-white active:scale-[0.98] transition-all flex items-center justify-between shadow-md"
          >
            <span>LAUNCH APP &amp; SCAN QR</span>
            <div className="w-8 h-8 rounded-full bg-[#131317] text-white flex items-center justify-center">
              <QrCode className="w-4 h-4 text-[#c0c6de]" strokeWidth={1.75} />
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
