"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  Globe2,
  ShieldCheck,
  ArrowUpRight,
  QrCode,
  Layers,
  Lock,
  Sparkles,
  CheckCircle2,
  Wallet,
  Building2,
} from "lucide-react";
import { SpatialCanvas3D } from "@/components/ui/SpatialCanvas3D";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import {
  HeroSpatialStage3D,
  GlobalCorridorStream3D,
  BentoAutoSortingCorridors,
  BentoYieldCompounding3D,
} from "@/components/ui/Connected3DScenes";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useActiveAccount } from "@/hooks/useActiveAccount";

interface LandingPageProps {
  login?: () => void;
}

const GLOBAL_METRICS = [
  { value: "180+", label: "Countries Supported", detail: "Global domestic bank & QR rails" },
  { value: "40+", label: "Local Fiat Currencies", detail: "USD, EUR, GBP, INR, BRL, JPY & more" },
  { value: "0.4s", label: "Median Settlement", detail: "Direct real-time clearing" },
  { value: "0.0%", label: "FX Spread Markup", detail: "Flat 1.0% protocol fee only" },
];

const SPATIAL_STEPS = [
  {
    step: "01 / Self-Custody",
    railTag: "Base / ETH / SOL / BTC",
    title: "Authorize from your own wallet",
    description:
      "Keep full custody of your USDC, ETH, SOL, or BTC until the moment you pay. Zero centralized exchange deposits or pre-funded lockups.",
    icon: Wallet,
    offsetClass: "lg:translate-y-0 lg:-rotate-1",
  },
  {
    step: "02 / Optical Router",
    railTag: "Pix / UPI / SEPA / FedNow",
    title: "Point at any local QR or bank rail",
    description:
      "Our optical router automatically detects EPC QR in Europe, Pix in Brazil, UPI in India, PayNow in Singapore, or domestic IBAN and ACH details.",
    icon: QrCode,
    offsetClass: "lg:translate-y-8 lg:rotate-1",
  },
  {
    step: "03 / Atomic Clearing",
    railTag: "Verified on-chain escrow",
    title: "Recipient gets native fiat in seconds",
    description:
      "Decentralized liquidity solvers dispatch local currency straight to the merchant bank account while your smart escrow settles atomically on Base.",
    icon: Building2,
    offsetClass: "lg:translate-y-16 lg:-rotate-1",
  },
];

const ORIGIN_CHAINS = [
  { code: "BASE", name: "Base L2", finality: "0.4s" },
  { code: "ETH", name: "Ethereum", finality: "1.0s" },
  { code: "SOL", name: "Solana", finality: "0.8s" },
  { code: "BTC", name: "Bitcoin", finality: "Instant Solver" },
  { code: "ARB", name: "Arbitrum", finality: "0.6s" },
  { code: "TRON", name: "Tron TRC20", finality: "1.1s" },
  { code: "POL", name: "Polygon", finality: "0.7s" },
  { code: "BSC", name: "BNB Chain", finality: "0.9s" },
];

export default function LandingPage({ login: loginProp }: LandingPageProps = {}) {
  const { login: activeLogin } = useActiveAccount();
  const login = loginProp ?? activeLogin;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Master page scroll progress connecting the 3D WebGL/Canvas globe and the vertical conduit spine
  const { scrollYProgress } = useScroll();
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });

  const conduitPhotonTop = useTransform(smoothScroll, [0, 1], ["4%", "96%"]);
  const heroParallaxY = useTransform(smoothScroll, [0, 0.25], [0, -36]);

  return (
    <main className="min-h-[100dvh] w-full bg-surface-container-lowest text-on-surface relative overflow-x-clip selection:bg-primary/25 selection:text-on-surface">
      {/* ─── 00. Continuous Full-Page 3D Spatial Globe & Orbital Canvas ─── */}
      <SpatialCanvas3D scrollProgress={smoothScroll} />

      {/* ─── Fixed Pointer-Events-None Coordinate Hairlines (GPU-Safe) ─── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-0 flex justify-between max-w-7xl mx-auto px-4 sm:px-8 opacity-25"
      >
        <div className="w-px h-full bg-white/[0.04]" />
        <div className="hidden md:block w-px h-full bg-white/[0.03]" />
        <div className="w-px h-full bg-white/[0.04]" />
      </div>

      {/* ─── Interconnected Scroll-Scrubbed 3D Conduit Spine ─── */}
      <div
        aria-hidden="true"
        className="fixed top-0 bottom-0 left-1/2 -translate-x-1/2 w-px pointer-events-none z-0 hidden lg:block"
      >
        <div className="w-px h-full bg-white/[0.04]" />
        <motion.div
          style={{ scaleY: smoothScroll, transformOrigin: "top" }}
          className="absolute inset-0 w-px bg-gradient-to-b from-primary/60 via-success/50 to-primary/60"
        />
        {!shouldReduceMotion && (
          <motion.div
            style={{ top: conduitPhotonTop }}
            className="absolute -left-[3px] w-[7px] h-10 rounded-full bg-gradient-to-b from-transparent via-success to-transparent opacity-80"
          />
        )}
      </div>

      {/* ─── 01. Fluid Island Navigation (Single-Line 64px Cap) ─── */}
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 flex items-center justify-between bg-surface/90 backdrop-blur-xl border border-primary/20 rounded-full px-4 sm:px-6 pointer-events-auto shadow-elevated transition-colors duration-300">
          {/* Brand Monogram */}
          <Link href="/" className="flex items-center gap-2.5 group whitespace-nowrap">
            <div className="w-8 h-8 rounded-full bg-surface-container border border-primary/25 flex items-center justify-center text-primary group-hover:border-primary/50 transition-colors">
              <Globe2 className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <span className="font-display font-semibold text-base sm:text-lg tracking-tight text-on-surface">
              ZkPay
            </span>
          </Link>

          {/* Single-Line Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-on-surface-variant">
            <a href="#corridors" className="hover:text-on-surface transition-colors">
              Global Rails
            </a>
            <a href="#flow" className="hover:text-on-surface transition-colors">
              How It Works
            </a>
            <a href="#architecture" className="hover:text-on-surface transition-colors">
              Architecture
            </a>
            <a href="#obsidian-card" className="hover:text-on-surface transition-colors">
              Obsidian Card
            </a>
            <Link href="/docs" className="hover:text-on-surface transition-colors">
              Docs
            </Link>
          </nav>

          {/* Right CTA & Mobile Hamburger Morph */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={login}
              className="rounded-full pl-4 pr-1.5 py-1.5 bg-secondary text-on-secondary font-semibold text-xs hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-card group flex items-center gap-2.5 whitespace-nowrap"
            >
              <span>Launch App</span>
              <span className="w-6 h-6 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-secondary" strokeWidth={1.75} />
              </span>
            </button>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-9 h-9 rounded-full bg-surface-container border border-primary/20 flex flex-col items-center justify-center gap-1.5 relative whitespace-nowrap"
            >
              <span
                className={`w-4 h-px bg-on-surface transition-transform duration-300 ${
                  mobileMenuOpen ? "rotate-45 translate-y-[3.5px]" : ""
                }`}
              />
              <span
                className={`w-4 h-px bg-on-surface transition-transform duration-300 ${
                  mobileMenuOpen ? "-rotate-45 -translate-y-[3.5px]" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Mobile Staggered Reveal Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="md:hidden mt-2 max-w-md mx-auto rounded-3xl bg-surface/95 backdrop-blur-xl border border-primary/20 p-5 pointer-events-auto shadow-elevated flex flex-col gap-3"
            >
              {[
                { label: "Global Rails", href: "#corridors" },
                { label: "How It Works", href: "#flow" },
                { label: "Architecture", href: "#architecture" },
                { label: "Obsidian Card", href: "#obsidian-card" },
                { label: "Documentation", href: "/docs" },
              ].map((item, idx) => (
                <motion.a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="text-sm font-medium text-on-surface py-2 border-b border-primary/15 last:border-none flex items-center justify-between"
                >
                  <span>{item.label}</span>
                  <ArrowUpRight className="w-4 h-4 text-on-surface-variant" strokeWidth={1.5} />
                </motion.a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── Macro Spatial Container ─── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── SECTION 1: Asymmetric 7/5 3D Split Hero (Fits 100dvh, pt-24 cap) ─── */}
        <section className="min-h-[100dvh] pt-20 lg:pt-24 pb-12 flex items-center">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Column (7 cols): Hero Stack */}
            <motion.div
              style={shouldReduceMotion ? undefined : { y: heroParallaxY }}
              className="lg:col-span-7 flex flex-col items-start text-left gap-6"
            >
              {/* Display Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-semibold tracking-tight text-on-surface leading-[1.08] max-w-2xl">
                Spend crypto in 40+ currencies globally.
              </h1>

              {/* Subtext (11 words) */}
              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-[54ch]">
                Scan any local merchant QR or settle to domestic banks instantly.
              </p>

              {/* Primary CTA + Secondary Anchor */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-1">
                <button
                  onClick={login}
                  className="rounded-full pl-6 pr-2 py-2.5 bg-secondary text-on-secondary font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-elevated group flex items-center justify-between sm:justify-start gap-4 whitespace-nowrap"
                >
                  <span>Launch App</span>
                  <span className="w-9 h-9 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
                  </span>
                </button>

                <a
                  href="#corridors"
                  className="rounded-full px-6 py-3.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-xs sm:text-sm font-medium text-on-surface transition-colors duration-200 text-center whitespace-nowrap"
                >
                  Explore Global Rails
                </a>
              </div>
            </motion.div>

            {/* Right Column (5 cols): Interactive 3D Spatial Viewport */}
            <div className="lg:col-span-5 w-full">
              <HeroSpatialStage3D />
            </div>
          </div>
        </section>

        {/* ─── SECTION 2: Worldwide Multi-Currency Orbital Ledger (No Eyebrow) ─── */}
        <section id="corridors" className="py-20 sm:py-28 flex flex-col gap-10">
          <ScrollReveal>
            <div className="flex flex-col gap-3 max-w-2xl">
              <h2 className="text-2xl sm:text-4xl font-display font-semibold tracking-tight text-on-surface">
                One liquidity layer for every domestic rail.
              </h2>
              <p className="text-sm sm:text-base text-outline leading-relaxed max-w-[60ch]">
                Your wallet holds crypto on Base, Solana, Ethereum, or Bitcoin. Merchants and recipients receive their own local currency over national instant banking networks.
              </p>
            </div>
          </ScrollReveal>

          {/* 3D Corridor Stream Marquee */}
          <GlobalCorridorStream3D />

          {/* 4-Metric Architectural Ledger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GLOBAL_METRICS.map((m, idx) => (
              <ScrollReveal key={m.label} delay={idx * 0.06}>
                <Tilt3DMonolith maxTilt={6} innerClassName="p-6 flex flex-col justify-between gap-4">
                  <DepthLayer z={22}>
                    <span className="font-mono text-3xl sm:text-4xl font-semibold text-on-surface tracking-tight tabular-nums">
                      {m.value}
                    </span>
                  </DepthLayer>
                  <DepthLayer z={12} className="flex flex-col gap-1 border-t border-white/[0.07] pt-3">
                    <span className="text-sm font-medium text-on-surface">{m.label}</span>
                    <span className="text-xs text-outline">{m.detail}</span>
                  </DepthLayer>
                </Tilt3DMonolith>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ─── SECTION 3: Connected 3-Step Z-Axis Spatial Cascade (No Eyebrow) ─── */}
        <section id="flow" className="py-24 sm:py-32 flex flex-col gap-14 relative">
          <ScrollReveal>
            <div className="flex flex-col gap-3 max-w-2xl">
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                Engineered for instant borderless settlement.
              </h2>
              <p className="text-sm sm:text-base text-outline leading-relaxed max-w-[60ch]">
                Every transaction routes through verifiable non-custodial smart escrows and decentralized local liquidity solvers in under a second.
              </p>
            </div>
          </ScrollReveal>

          {/* Horizontal 3D Connecting Beam on Desktop */}
          <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 pb-0 lg:pb-16">
            <div
              aria-hidden="true"
              className="hidden lg:block absolute top-1/2 left-12 right-12 h-px bg-gradient-to-r from-primary/15 via-success/40 to-primary/15 pointer-events-none"
            />

            {SPATIAL_STEPS.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <ScrollReveal key={item.step} delay={idx * 0.08} className={item.offsetClass}>
                  <Tilt3DMonolith
                    maxTilt={9}
                    className="h-full"
                    innerClassName="p-6 sm:p-7 flex flex-col justify-between gap-8 min-h-[290px]"
                  >
                    <DepthLayer z={28} className="flex items-center justify-between gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-surface-container border border-primary/20 flex items-center justify-center text-primary">
                        <IconComp className="w-5 h-5" strokeWidth={1.5} />
                      </div>
                      <span className="text-xs font-medium text-primary px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25">
                        {item.railTag}
                      </span>
                    </DepthLayer>

                    <DepthLayer z={18} className="flex flex-col gap-2.5">
                      <span className="text-xs font-semibold text-secondary">{item.step}</span>
                      <h3 className="text-xl sm:text-2xl font-display font-semibold text-on-surface tracking-tight">
                        {item.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant leading-relaxed max-w-[55ch]">
                        {item.description}
                      </p>
                    </DepthLayer>
                  </Tilt3DMonolith>
                </ScrollReveal>
              );
            })}
          </div>
        </section>

        {/* ─── SECTION 4: Asymmetric 3D Bento 2.0 Monoliths ─── */}
        <section id="architecture" className="py-24 sm:py-32 flex flex-col gap-12">
          <ScrollReveal>
            <div className="flex flex-col items-start gap-3 max-w-2xl">
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                Built like precision hardware.
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[60ch]">
                Four interconnected protocol pillars combining universal QR decoding, zero-KYC micro-corridors, continuous Morpho yield, and multi-chain routing.
              </p>
            </div>
          </ScrollReveal>

          {/* 4-Cell Asymmetric Grid (7/5 + 5/7) with Surface Diversity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cell 1 (7 cols): Universal Global QR & Rail Engine with Live Auto-Sorting Stack */}
            <ScrollReveal className="lg:col-span-7">
              <Tilt3DMonolith
                maxTilt={7}
                className="h-full"
                innerClassName="p-6 sm:p-8 flex flex-col justify-between gap-8"
              >
                <DepthLayer z={26} className="w-full">
                  <BentoAutoSortingCorridors />
                </DepthLayer>

                <DepthLayer z={16} className="flex flex-col gap-2 pt-2 border-t border-primary/15">
                  <h3 className="text-xl sm:text-2xl font-display font-semibold text-on-surface tracking-tight">
                    Universal QR &amp; Domestic Rail Decoder
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed max-w-[60ch]">
                    Point your camera at any merchant code in São Paulo, Tokyo, London, Mumbai, or Lisbon. ZkPay parses local banking payloads and locks the mid-market oracle rate in milliseconds.
                  </p>
                </DepthLayer>
              </Tilt3DMonolith>
            </ScrollReveal>

            {/* Cell 2 (5 cols): Zero KYC Corridor */}
            <ScrollReveal delay={0.06} className="lg:col-span-5">
              <Tilt3DMonolith
                maxTilt={8}
                className="h-full"
                innerClassName="p-6 sm:p-8 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-surface-container-lowest flex flex-col justify-between gap-8"
              >
                <DepthLayer z={34} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                      <Lock className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-semibold text-secondary px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/25">
                      Instant access
                    </span>
                  </div>
                  <div className="pt-4">
                    <span className="font-mono text-5xl sm:text-6xl font-semibold text-on-surface tracking-tighter">
                      $100
                    </span>
                    <span className="block text-xs font-medium text-primary mt-1">
                      No-KYC global daily threshold
                    </span>
                  </div>
                </DepthLayer>

                <DepthLayer z={16} className="flex flex-col gap-2 pt-2 border-t border-primary/15">
                  <h3 className="text-xl sm:text-2xl font-display font-semibold text-on-surface tracking-tight">
                    Zero KYC Under $100 Equivalent
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Pay everyday cafe tabs, transit tickets, and grocery runs across 180+ countries without uploading passports or waiting in verification queues.
                  </p>
                </DepthLayer>
              </Tilt3DMonolith>
            </ScrollReveal>

            {/* Cell 3 (5 cols): Morpho Yield */}
            <ScrollReveal delay={0.08} className="lg:col-span-5">
              <Tilt3DMonolith
                maxTilt={8}
                className="h-full"
                innerClassName="p-6 sm:p-8 flex flex-col justify-between gap-8"
              >
                <DepthLayer z={28} className="w-full">
                  <BentoYieldCompounding3D />
                </DepthLayer>

                <DepthLayer z={16} className="flex flex-col gap-2 pt-2 border-t border-primary/15">
                  <h3 className="text-xl sm:text-2xl font-display font-semibold text-on-surface tracking-tight">
                    Continuous 5.51% APY Treasury Yield
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Idle USDC in your account automatically compounds through Steakhouse Prime vaults on Morpho Blue until the exact second you scan to spend.
                  </p>
                </DepthLayer>
              </Tilt3DMonolith>
            </ScrollReveal>

            {/* Cell 4 (7 cols): Multi-Chain Solver Matrix Surface */}
            <ScrollReveal delay={0.12} className="lg:col-span-7">
              <Tilt3DMonolith
                maxTilt={7}
                className="h-full"
                innerClassName="p-6 sm:p-8 flex flex-col justify-between gap-8"
              >
                <DepthLayer z={24} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {ORIGIN_CHAINS.map((chain) => (
                    <div
                      key={chain.code}
                      className="p-3 rounded-xl bg-surface-container border border-primary/15 flex flex-col justify-between gap-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-on-surface">
                          {chain.code}
                        </span>
                        <Layers className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                      </div>
                      <span className="text-[11px] text-on-surface-variant">{chain.name}</span>
                      <span className="font-mono text-[10px] text-secondary">{chain.finality}</span>
                    </div>
                  ))}
                </DepthLayer>

                <DepthLayer z={16} className="flex flex-col gap-2 pt-2 border-t border-primary/15">
                  <h3 className="text-xl sm:text-2xl font-display font-semibold text-on-surface tracking-tight">
                    Cross-Chain Solver Routing
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed max-w-[60ch]">
                    Fund your global spending directly from Bitcoin, Solana, Ethereum, Arbitrum, or Tron via decentralized NEAR 1Click solver intents with zero bridge custody risk.
                  </p>
                </DepthLayer>
              </Tilt3DMonolith>
            </ScrollReveal>
          </div>
        </section>

        {/* ─── SECTION 5: Interactive 360° 3D Titanium Obsidian Card Showcase (No Eyebrow) ─── */}
        <section id="obsidian-card" className="py-24 sm:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left (6 cols): 3D Perspective Titanium Card */}
            <ScrollReveal className="lg:col-span-6">
              <Tilt3DMonolith
                maxTilt={14}
                className="w-full max-w-[460px] mx-auto"
                innerClassName="p-3 sm:p-4 bg-gradient-to-tr from-surface-container-lowest via-surface to-surface-container-low"
              >
                <div
                  style={shouldReduceMotion ? undefined : { transformStyle: "preserve-3d" }}
                  className="relative aspect-[1.586] w-full rounded-2xl overflow-hidden border border-primary/25"
                >
                  <img
                    src="/zkpay_obsidian_card.jpg"
                    alt="ZkPay CNC Titanium Obsidian Physical Card"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent pointer-events-none" />

                  <DepthLayer
                    z={36}
                    className="absolute bottom-4 left-4 right-4 flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface/90 backdrop-blur-md border border-primary/25"
                  >
                    <span className="text-xs font-medium text-on-surface">
                      Grade-5 titanium / NFC worldwide
                    </span>
                    <span className="text-xs font-semibold text-secondary">0% FX spread</span>
                  </DepthLayer>
                </div>
              </Tilt3DMonolith>
            </ScrollReveal>

            {/* Right (6 cols): Hardware Narrative */}
            <ScrollReveal delay={0.08} className="lg:col-span-6 flex flex-col items-start gap-6">
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                The Titanium Obsidian Card.
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[58ch]">
                When a merchant terminal only accepts physical contactless tap, the CNC-machined Obsidian Card debits your non-custodial Base USDC balance in real time across 180+ countries.
              </p>

              <div className="flex flex-col gap-3.5 w-full pt-1">
                {[
                  "Tap at 90M+ contactless Visa and Mastercard NFC terminals worldwide",
                  "Direct on-chain USDC settlement with zero foreign exchange markups",
                  "Instant cryptographic freeze and spending caps from your wallet",
                ].map((point) => (
                  <div key={point} className="flex items-center gap-3 text-sm text-on-surface-variant">
                    <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" strokeWidth={1.5} />
                    <span>{point}</span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  onClick={login}
                  className="rounded-full pl-6 pr-2 py-2.5 bg-secondary text-on-secondary font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-elevated group flex items-center gap-4 whitespace-nowrap"
                >
                  <span>Launch App</span>
                  <span className="w-9 h-9 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
                  </span>
                </button>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ─── SECTION 6: Monumental 3D Horizon Convergence & Footer (No Eyebrow) ─── */}
        <section className="pt-16 pb-28 sm:pb-24">
          <ScrollReveal>
            <Tilt3DMonolith
              maxTilt={6}
              innerClassName="p-8 sm:p-14 lg:p-16 bg-gradient-to-b from-surface-container-low/80 via-surface-container-lowest to-surface-container-lowest flex flex-col items-center text-center gap-6"
            >
              <DepthLayer
                z={32}
                className="w-12 h-12 rounded-2xl bg-surface-container border border-primary/25 flex items-center justify-center text-primary"
              >
                <Globe2 className="w-6 h-6" strokeWidth={1.5} />
              </DepthLayer>

              <DepthLayer z={24} className="flex flex-col items-center gap-3 max-w-2xl">
                <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                  The world is now your local currency.
                </h2>
                <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[54ch]">
                  Connect your wallet and settle in 40+ local currencies across 180+ countries in under a second.
                </p>
              </DepthLayer>

              <DepthLayer z={36} className="pt-2">
                <button
                  onClick={login}
                  className="rounded-full pl-7 pr-2 py-2.5 bg-secondary text-on-secondary font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-elevated group flex items-center gap-4 whitespace-nowrap"
                >
                  <span>Launch App</span>
                  <span className="w-9 h-9 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
                  </span>
                </button>
              </DepthLayer>
            </Tilt3DMonolith>
          </ScrollReveal>

          {/* Minimalist Architectural Footer */}
          <footer className="mt-16 pt-8 border-t border-primary/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-on-surface-variant">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-surface-container border border-primary/20 flex items-center justify-center text-primary">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
              </div>
              <span className="font-display font-semibold text-on-surface">ZkPay</span>
              <span>Global Non-Custodial Settlement Protocol</span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <Link href="/docs" className="hover:text-on-surface transition-colors">
                Documentation
              </Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors">
                Terms of Service
              </Link>
              <a
                href="https://sepolia.basescan.org/address/0x5610D5f587F9cEEBb11C2920D15aC54175b40b2f#code"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-primary hover:text-on-surface transition-colors flex items-center gap-1"
              >
                <span>0x5610…0b2f</span>
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </a>
            </div>
          </footer>
        </section>
      </div>

      {/* ─── Sticky Mobile Thumb Bar (< 1024px) ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-surface/90 backdrop-blur-xl border-t border-primary/20 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          <button
            onClick={login}
            className="w-full rounded-full pl-6 pr-2 py-2 bg-secondary text-on-secondary font-semibold text-xs active:scale-[0.98] transition-transform flex items-center justify-between shadow-card whitespace-nowrap"
          >
            <span>Launch App</span>
            <span className="w-8 h-8 rounded-full bg-surface text-secondary flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
