"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useScroll, useSpring, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ArrowRight, Menu, X, Check } from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import { SpatialMultiChain3D } from "@/components/ui/SpatialMultiChain3D";
import { SwapHeroStage } from "@/components/ui/SwapHeroStage";
import { ChainOrbit3D } from "@/components/ui/ChainOrbit3D";
import { LiveRouteTicker } from "@/components/ui/LiveRouteTicker";
import { HowItWorks3D } from "@/components/ui/HowItWorks3D";
import { ProtocolArchitectureBento } from "@/components/ui/ProtocolArchitectureBento";
import { PartnerRevenueCalculator } from "@/components/ui/PartnerRevenueCalculator";
import { DeveloperCodeSandbox } from "@/components/ui/DeveloperCodeSandbox";
import { CHAIN_VISUALS, POPULAR_PAIRS, type PopularPair } from "@/lib/chainVisuals";

interface LandingPageProps {
  login?: () => void;
}

const NAV_LINKS = [
  { label: "Swap", href: "#swap" },
  { label: "How it works", href: "#how" },
  { label: "Network", href: "#network" },
  { label: "Developers", href: "#developers" },
  { label: "Docs", href: "/docs" },
];

const HERO_STATS = [
  { value: "9", label: "native chains" },
  { value: "0", label: "token approvals" },
  { value: "50%", label: "fee share for partners" },
];

const DEVELOPER_STEPS = [
  { title: "Create an API key", desc: "Generate a partner key in the portal. No gas reserves or liquidity needed." },
  { title: "Call /swap/create", desc: "Get a single-use deposit address and locked quote for any supported route." },
  { title: "Earn on every swap", desc: "50% of your custom fee is credited in USD the moment a swap settles." },
];

const ease = [0.16, 1, 0.3, 1] as const;

function SectionHeading({
  eyebrow,
  title,
  desc,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  align?: "left" | "center";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease }}
      className={`space-y-3 max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      {eyebrow && <span className="text-sm font-medium text-secondary">{eyebrow}</span>}
      <h2 className="text-[1.75rem] leading-[1.12] sm:text-4xl lg:text-5xl font-semibold tracking-tight text-on-surface">
        {title}
      </h2>
      {desc && <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed">{desc}</p>}
    </motion.div>
  );
}

export default function LandingPage({ login: loginProp }: LandingPageProps = {}) {
  const { login: activeLogin } = useActiveAccount();
  const login = loginProp ?? activeLogin;
  const reduce = useReducedMotion();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pair, setPair] = useState<PopularPair | null>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  const pickPair = (p: PopularPair) => {
    // New object each click so re-selecting the same route re-applies it
    setPair({ ...p });
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document.getElementById("swap-stage")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <main className="relative min-h-[100dvh] w-full bg-surface text-on-surface selection:bg-secondary selection:text-on-secondary overflow-x-clip">
      {/* 3D multi-chain spatial canvas (fixed, scroll + pointer reactive) */}
      <SpatialMultiChain3D scrollProgress={scrollYProgress} />

      {/* Scroll progress hairline */}
      <motion.div
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 h-[2px] z-[60] origin-left bg-gradient-to-r from-primary via-primary to-secondary"
        style={{ scaleX: progress }}
      />

      {/* ─── Floating glass header ─── */}
      <header className="fixed top-3 sm:top-5 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-6xl mx-auto h-14 sm:h-16 pl-3 pr-2 sm:px-5 rounded-full bg-surface-container-low/80 backdrop-blur-2xl border border-outline-variant shadow-elevated flex items-center justify-between gap-3 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-2.5 h-10 rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label="ZkPay home"
          >
            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold text-sm">
              Z
            </span>
            <span className="font-semibold text-base tracking-tight text-on-surface">ZkPay</span>
          </Link>

          <nav aria-label="Main" className="hidden md:flex items-center gap-1 text-sm">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="h-9 px-3.5 rounded-full inline-flex items-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <Link
              href="/partner"
              className="hidden lg:inline-flex h-10 px-4 rounded-full items-center text-sm text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              Partner portal
            </Link>
            <button
              type="button"
              onClick={login}
              className="group h-10 pl-4 pr-1.5 rounded-full bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition cursor-pointer whitespace-nowrap focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
            >
              <span>Launch app</span>
              <span className="w-7 h-7 rounded-full bg-on-secondary/10 flex items-center justify-center transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              aria-label="Mobile"
              className="md:hidden mt-2 rounded-3xl bg-surface-container-low/95 backdrop-blur-2xl border border-outline-variant p-2 shadow-elevated pointer-events-auto"
            >
              {[...NAV_LINKS, { label: "Partner portal", href: "/partner" }].map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-12 px-4 rounded-2xl flex items-center justify-between text-base text-on-surface hover:bg-surface-container transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <span>{l.label}</span>
                  <ArrowRight className="w-4 h-4 text-on-surface-variant" />
                </Link>
              ))}
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <div className="relative z-10">
        {/* ─── 1. HERO: copy + floating 3D swap stage ─── */}
        <section id="swap" className="scroll-mt-24 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 lg:pt-36 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease }}
              className="lg:col-span-6 space-y-6 sm:space-y-7"
            >
              <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-surface-container-low/80 backdrop-blur border border-outline-variant text-xs text-on-surface-variant">
                <span className="flex -space-x-1">
                  {CHAIN_VISUALS.slice(0, 5).map((c) => (
                    <span
                      key={c.id}
                      className="w-3.5 h-3.5 rounded-full border-2 border-surface"
                      style={{ backgroundColor: c.color }}
                    />
                  ))}
                </span>
                <span>Bitcoin, Solana, Ethereum and 6 more</span>
              </span>

              <h1 className="text-[2.5rem] leading-[1.04] sm:text-6xl lg:text-[4.25rem] font-semibold tracking-[-0.03em] text-on-surface">
                Swap anything,
                <br />
                <span className="bg-gradient-to-r from-primary via-[#6E9BFF] to-secondary bg-clip-text text-transparent">
                  across any chain.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-[46ch]">
                Send native BTC, SOL, ETH or USDT and receive the real asset on another chain in seconds. No bridges, no wrapped tokens, no wallet approvals.
              </p>

              {/* Quick routes: prefill the widget */}
              <div className="space-y-2.5">
                <span className="text-xs text-on-surface-variant">Try a popular route</span>
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                  {POPULAR_PAIRS.slice(0, 4).map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => pickPair(p)}
                      className="h-10 px-4 rounded-full bg-surface-container-low/80 backdrop-blur border border-outline-variant text-sm text-on-surface whitespace-nowrap hover:border-secondary/50 hover:text-secondary active:scale-[0.98] transition cursor-pointer focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-3 pt-2 max-w-md">
                {HERO_STATS.map((s) => (
                  <div key={s.label} className="space-y-0.5">
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="font-mono text-2xl sm:text-3xl font-semibold text-on-surface tabular-nums">{s.value}</dd>
                    <dd className="text-xs text-on-surface-variant leading-snug">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            <div id="swap-stage" className="lg:col-span-6 w-full scroll-mt-20">
              <SwapHeroStage pair={pair} satellites />
            </div>
          </div>
        </section>

        {/* ─── 2. ROUTE TICKER ─── */}
        <section aria-label="Supported routes" className="pb-20 sm:pb-28">
          <LiveRouteTicker />
        </section>

        {/* ─── 3. HOW IT WORKS ─── */}
        <section id="how" className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-36 space-y-10 sm:space-y-14">
          <SectionHeading
            eyebrow="How it works"
            title="Three steps. No wallet connection needed."
            desc="ZkPay turns a cross-chain swap into a simple transfer. You send, solvers route, you receive."
          />
          <HowItWorks3D />
        </section>

        {/* ─── 4. NETWORK: 3D chain orbit ─── */}
        <section id="network" className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-36">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-5 space-y-8 order-2 lg:order-1">
              <SectionHeading
                title="One engine, nine native chains."
                desc="Every pair routes directly through a competitive solver network. Assets settle natively on the destination chain."
              />
              <ul className="grid grid-cols-3 gap-2">
                {CHAIN_VISUALS.map((c) => (
                  <li
                    key={c.id}
                    className="h-11 px-3 rounded-xl bg-surface-container-low/80 backdrop-blur border border-outline-variant flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-xs font-medium text-on-surface truncate">{c.code}</span>
                    </span>
                    <span className="font-mono text-[10px] text-on-surface-variant">{c.finality}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-7 order-1 lg:order-2">
              <ChainOrbit3D />
            </div>
          </div>
        </section>

        {/* ─── 5. SECURITY BENTO ─── */}
        <section id="security" className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-36 space-y-10 sm:space-y-14">
          <SectionHeading
            title="Built so your funds never sit with us."
            desc="No vault contracts, no bridge honeypots, no infinite approvals. Each swap uses its own isolated deposit address."
          />
          <ProtocolArchitectureBento />
        </section>

        {/* ─── 6. DEVELOPERS ─── */}
        <section id="developers" className="scroll-mt-28 w-full max-w-6xl mx-auto px-4 sm:px-6 pb-24 sm:pb-36 space-y-10 sm:space-y-14">
          <SectionHeading
            eyebrow="For developers"
            title="Add cross-chain swaps to your product. Keep half the fees."
            desc="Wallets, Telegram bots and dApps integrate four REST endpoints and earn 50% of every custom fee, paid in USD."
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 min-w-0">
              <DeveloperCodeSandbox />
            </div>
            <div className="lg:col-span-5 space-y-3">
              {DEVELOPER_STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="p-4 sm:p-5 rounded-2xl bg-surface-container-low/80 backdrop-blur border border-outline-variant flex gap-4 items-start"
                >
                  <span className="w-8 h-8 rounded-full bg-secondary/10 border border-secondary/30 text-secondary flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </span>
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-sm font-semibold text-on-surface">
                      <span className="font-mono text-on-surface-variant mr-2">0{i + 1}</span>
                      {s.title}
                    </h3>
                    <p className="text-sm text-on-surface-variant leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Link
                  href="/partner"
                  className="h-12 px-5 rounded-full bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                >
                  <span>Get an API key</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-5 rounded-full bg-surface-container border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center justify-center hover:border-outline transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </div>

          <PartnerRevenueCalculator />
        </section>

        {/* ─── 7. CLOSING CTA + FOOTER ─── */}
        <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-10 space-y-12">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 32, scale: 0.98 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, ease }}
            className="relative overflow-hidden rounded-[2rem] border border-outline-variant bg-surface-container-low/90 backdrop-blur-xl px-6 py-14 sm:px-14 sm:py-20 text-center"
          >
            <div aria-hidden="true" className="absolute inset-0 grid-backdrop opacity-80" />
            <div aria-hidden="true" className="absolute -top-24 left-1/2 -translate-x-1/2 w-[560px] h-[280px] rounded-full bg-primary/25 blur-3xl" />
            <div className="relative space-y-6 max-w-xl mx-auto">
              <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-on-surface leading-[1.08]">
                Your first swap takes under a minute.
              </h2>
              <p className="text-base text-on-surface-variant">
                No sign-up needed to swap. Log in to track your history and manage partner keys.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="#swap"
                  className="h-12 px-6 rounded-full bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                >
                  Start a swap
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={login}
                  className="h-12 px-6 rounded-full bg-surface-container-high border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center justify-center hover:border-outline transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  Launch app
                </button>
              </div>
            </div>
          </motion.div>

          <footer className="pt-8 border-t border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-6 text-sm text-on-surface-variant pb-safe">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-xs">Z</span>
              <span className="text-on-surface font-medium">ZkPay</span>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
                All systems normal
              </span>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
              <Link href="/partner" className="hover:text-on-surface transition-colors">Partner portal</Link>
              <Link href="/docs" className="hover:text-on-surface transition-colors">API docs</Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors">Terms</Link>
            </nav>
          </footer>
        </section>
      </div>
    </main>
  );
}
