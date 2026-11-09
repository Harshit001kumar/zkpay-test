"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll } from "framer-motion";
import {
  ArrowUpRight,
  Menu,
  X,
  Code2,
  TrendingUp,
  Globe2,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { SpatialMultiChain3D } from "@/components/ui/SpatialMultiChain3D";
import { SpatialConduitSpine } from "@/components/ui/SpatialConduitSpine";
import { SwapHeroStage } from "@/components/ui/SwapHeroStage";
import { InteractiveRouteMatrix } from "@/components/ui/InteractiveRouteMatrix";
import { ProtocolArchitectureBento } from "@/components/ui/ProtocolArchitectureBento";
import { PartnerRevenueCalculator } from "@/components/ui/PartnerRevenueCalculator";
import { DeveloperCodeSandbox } from "@/components/ui/DeveloperCodeSandbox";

interface LandingPageProps {
  login?: () => void;
}

const DEVELOPER_STEPS = [
  {
    step: "01",
    title: "Generate API Key",
    desc: "Create an isolated partner key in the dashboard. Zero fee wallets or gas reserves required.",
  },
  {
    step: "02",
    title: "Request Deposit Address",
    desc: "Call POST /api/v1/swap/create with your desired parameters and FLEX_INPUT mode.",
  },
  {
    step: "03",
    title: "Earn 50% Net Yield",
    desc: "Solvers settle the trade and credit 50% of the custom fee immediately in USD.",
  },
];

export default function LandingPage({ login: loginProp }: LandingPageProps = {}) {
  const { login: activeLogin } = useActiveAccount();
  const login = loginProp ?? activeLogin;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();

  const navLinks = [
    { label: "Swap", href: "#swap" },
    { label: "9-Chain Matrix", href: "#matrix" },
    { label: "Architecture", href: "#architecture" },
    { label: "Revenue Split", href: "#revenue" },
    { label: "Developer API", href: "#developers" },
    { label: "Partner Portal", href: "/partner" },
    { label: "Docs", href: "/docs" },
  ];

  return (
    <main className="relative min-h-[100dvh] w-full bg-surface text-on-surface selection:bg-secondary selection:text-on-secondary overflow-x-clip">
      {/* ─── 3D Multi-Chain Spatial Canvas Engine ─── */}
      <SpatialMultiChain3D scrollProgress={scrollYProgress} />

      {/* ─── Luminous Scroll Conduit Spine ─── */}
      <SpatialConduitSpine scrollProgress={scrollYProgress} />

      {/* ─── Floating Island Glass Header ─── */}
      <header className="fixed top-3 sm:top-5 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 px-4 sm:px-6 rounded-full bg-surface-container-low/85 backdrop-blur-2xl border border-outline-variant shadow-elevated flex items-center justify-between gap-3 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-2.5 h-10 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-lg"
          >
            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-extrabold text-sm">
              Z
            </span>
            <span className="font-bold text-base tracking-tight text-on-surface">ZkPay</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/10 border border-secondary/30 text-[10px] text-secondary font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
              <span>9 chains</span>
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-1 text-xs">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="h-8 px-3 rounded-full inline-flex items-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Top Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={login}
              className="h-9 px-4 rounded-full bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-transform cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Connect Wallet</span>
            </button>

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              aria-label="Mobile Navigation"
              className="md:hidden mt-2 max-w-sm mx-auto rounded-2xl bg-surface-container-low/95 backdrop-blur-2xl border border-outline-variant p-3 shadow-card pointer-events-auto"
            >
              <div className="space-y-1 text-xs">
                {navLinks.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="h-10 px-3 rounded-xl flex items-center justify-between text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  >
                    <span>{l.label}</span>
                    <ArrowUpRight className="w-4 h-4 text-on-surface-variant" />
                  </Link>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* ─── Main Content Canvas ─── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-36 space-y-24 sm:space-y-36">
        {/* ─── 1. HERO SECTION: 3D Holographic Stage & Live Swap Monolith ─── */}
        <section id="swap" className="scroll-mt-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Hero Left Column: Editorial Value Proposition */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
                <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-pulse" />
                <span className="flex items-center gap-1.5">
                  <span>Non-custodial</span>
                  <span className="w-1 h-1 rounded-full bg-primary/40" />
                  <span>9 Blockchains</span>
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-on-surface leading-[1.12]">
                Native crypto swaps.
                <span className="block text-primary">Zero bridges.</span>
              </h1>

              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[50ch]">
                Send native Bitcoin, Solana, Ethereum, Base, Tron, or Litecoin. Our solver network settles on your destination chain in seconds.
              </p>

              {/* Protocol Spec Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs">
                  <span className="text-[10px] text-on-surface-variant block">Deposit Engine</span>
                  <span className="font-bold text-secondary">FLEX_INPUT</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs">
                  <span className="text-[10px] text-on-surface-variant block">Security</span>
                  <span className="font-bold text-primary">Non-custodial</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-on-surface-variant block">Partner Share</span>
                  <span className="font-bold text-on-surface">50/50 net split</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/partner"
                  className="h-12 px-6 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-2 hover:brightness-110 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                >
                  <span>Build with Developer API</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center hover:border-outline transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <span>Read REST API docs</span>
                </Link>
              </div>
            </div>

            {/* Hero Right Column: Floating 3D Swap Stage */}
            <div className="lg:col-span-6 w-full max-w-lg mx-auto lg:max-w-none">
              <SwapHeroStage />
            </div>
          </div>
        </section>

        {/* ─── 2. INTERACTIVE ROUTE MATRIX ─── */}
        <section id="matrix" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
              <Globe2 className="w-3.5 h-3.5" />
              <span>Multi-Chain Topology</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Direct routing without bridges or wrapped tokens.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Explore solver settlement speeds, sponsored relayer gas, and native routing between any pair across the 9 supported blockchains.
            </p>
          </div>

          <InteractiveRouteMatrix />
        </section>

        {/* ─── 3. PROTOCOL ARCHITECTURE BENTO ─── */}
        <section id="architecture" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-secondary/30 text-secondary text-xs">
              <Layers className="w-3.5 h-3.5" />
              <span>System Design</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Engineered for absolute fund safety.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              No central smart contract vaults, no bridge honeypots, and no infinite token approvals. Funds flow directly through single-use deposit addresses.
            </p>
          </div>

          <ProtocolArchitectureBento />
        </section>

        {/* ─── 4. REVENUE ENGINE SIMULATOR ─── */}
        <section id="revenue" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-secondary/30 text-secondary text-xs">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Partner Monetization</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Monetize cross-chain swaps in your product.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Integrate cross-chain swaps into your Telegram bot, wallet, or web app. You receive 50% of every custom fee directly in USD upon settlement.
            </p>
          </div>

          <PartnerRevenueCalculator />
        </section>

        {/* ─── 5. DEVELOPER API SANDBOX ─── */}
        <section id="developers" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
              <Code2 className="w-3.5 h-3.5" />
              <span>Developer API</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Four simple endpoints. Zero node infrastructure.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Generate single-use deposit addresses on any chain. No node maintenance, no liquidity pools, and no contract deployments.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Terminal Code Sandbox */}
            <div className="lg:col-span-7">
              <DeveloperCodeSandbox />
            </div>

            {/* 3-Step Integration Flow */}
            <div className="lg:col-span-5 space-y-4 lg:pt-2">
              {DEVELOPER_STEPS.map((s) => (
                <div
                  key={s.step}
                  className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant flex gap-4 items-start"
                >
                  <span className="w-9 h-9 rounded-xl bg-surface-container border border-primary/30 font-mono text-xs font-bold text-secondary flex items-center justify-center shrink-0">
                    {s.step}
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-on-surface">{s.title}</h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}

              <div className="p-4 rounded-2xl bg-surface-container border border-secondary/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface block">Ready to integrate?</span>
                  <span className="text-[11px] text-on-surface-variant">Get production API keys in your dashboard</span>
                </div>
                <Link
                  href="/partner"
                  className="h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                >
                  <span>Portal</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 6. CLOSING CTA & FOOTER ─── */}
        <section className="pb-16 sm:pb-24 space-y-12">
          <div className="rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
            <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container border border-outline-variant p-8 sm:p-14 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden">
              <div className="space-y-3 max-w-lg relative z-10">
                <h3 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
                  Start swapping across 9 blockchains today.
                </h3>
                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                  Non-custodial, high-liquidity, and built for mobile. Crypto swaps with automated 50/50 developer revenue sharing.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 shrink-0 relative z-10">
                <Link
                  href="/partner"
                  className="h-12 px-6 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                >
                  <span>Generate partner key</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-6 rounded-xl bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center hover:border-outline transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  View documentation
                </Link>
              </div>
            </div>
          </div>

          {/* Minimalist Footer */}
          <footer className="pt-8 border-t border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-on-surface-variant pb-safe">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span className="text-on-surface font-bold">ZkPay Protocol</span>
              <span className="text-on-surface-variant">9-Chain non-custodial cross-chain swap engine</span>
            </div>
            <nav aria-label="Footer Navigation" className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/partner" className="hover:text-on-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded">Partner Portal</Link>
              <Link href="/docs" className="hover:text-on-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded">API Docs</Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded">Terms of Service</Link>
            </nav>
          </footer>
        </section>
      </div>
    </main>
  );
}
