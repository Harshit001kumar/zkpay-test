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
  Layers,
  Code2,
  Terminal,
  Coins,
  Zap,
  Bot,
  Copy,
  Check,
} from "lucide-react";
import { SpatialCanvas3D } from "@/components/ui/SpatialCanvas3D";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import SwapWidget from "@/components/SwapWidget";

interface LandingPageProps {
  login?: () => void;
}

const SWAP_METRICS = [
  { value: "9", label: "Blockchains Supported", detail: "BTC, ETH, SOL, Base, Polygon, Arb, BSC, Tron, LTC" },
  { value: "50/50", label: "Partner Fee Split", detail: "Live USD credit on every settled swap" },
  { value: "$1.00", label: "Minimum Withdrawal", detail: "Payout in USDC, USDT, SOL, or LTC" },
  { value: "17+", label: "Curated Native Assets", detail: "Non-custodial solver execution" },
];

const DEVELOPER_STEPS = [
  {
    step: "01 / Generate API Key",
    railTag: "50/50 Revenue Split",
    title: "Authenticate with X-API-Key",
    description:
      "Generate a live Partner API key from the Partner Console. No per-chain fee wallet configuration required — your 50% fee share is tracked automatically across all 9 blockchains.",
    icon: Code2,
    offsetClass: "lg:translate-y-0 lg:-rotate-1",
  },
  {
    step: "02 / Single-Transfer Deposit",
    railTag: "POST /api/v1/swap/create",
    title: "One deposit address per swap",
    description:
      "Request a quote and generate a single-use deposit address for your user or bot. Users send 100% of their deposit in one transfer — zero native gas required for stablecoin swaps.",
    icon: Bot,
    offsetClass: "lg:translate-y-8 lg:rotate-1",
  },
  {
    step: "03 / Instant USD Settlement Credit",
    railTag: "Partner Portal Payouts",
    title: "Earn 50% in USD on settlement",
    description:
      "As soon as the solver delivers destination tokens to your user, 50% of the custom fee (20–450 bps) is converted to USD at live market rates and credited to your Partner balance.",
    icon: Coins,
    offsetClass: "lg:translate-y-16 lg:-rotate-1",
  },
];

const SUPPORTED_CHAINS = [
  { code: "SOL", name: "Solana", detail: "SOL, USDC, USDT · 50/50 Fee Share" },
  { code: "BASE", name: "Base L2", detail: "ETH, USDC, USDT · Gasless ERC-20" },
  { code: "POL", name: "Polygon", detail: "POL, USDT, USDC · Gasless ERC-20" },
  { code: "ARB", name: "Arbitrum", detail: "ETH, USDC · 50/50 Fee Share" },
  { code: "BSC", name: "BNB Chain", detail: "BNB, USDT · 50/50 Fee Share" },
  { code: "LTC", name: "Litecoin", detail: "Native LTC · 50/50 Fee Share" },
  { code: "BTC", name: "Bitcoin", detail: "Native BTC · 0% Direct Solver Route" },
  { code: "ETH", name: "Ethereum", detail: "ETH, USDC, USDT · 0% Direct Route" },
  { code: "TRON", name: "Tron TRC20", detail: "TRX, USDT · 0% Direct Solver Route" },
];

const CODE_SNIPPETS: Record<"curl" | "js" | "python" | "telegram", string> = {
  curl: `curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fromAsset": "SOL",
    "chain": "sol",
    "toAsset": "USDC",
    "destinationChain": "base",
    "amount": "1000000000",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "refundTo": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "totalFeeBps": 100
  }'`,
  js: `const res = await fetch("https://zkpay.top/api/v1/swap/create", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.ZKPAY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fromAsset: "SOL",
    chain: "sol",
    toAsset: "USDC",
    destinationChain: "base",
    amount: "1000000000", // 1 SOL in lamports
    recipient: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    refundTo: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    totalFeeBps: 100, // 1.00% split 50/50 with your Partner account
  }),
});
const { order } = await res.json();
console.log("Send deposit to:", order.deposit.address);`,
  python: `import requests

res = requests.post(
    "https://zkpay.top/api/v1/swap/create",
    headers={"X-API-Key": "zkpay_live_your_api_key"},
    json={
        "fromAsset": "SOL",
        "chain": "sol",
        "toAsset": "USDC",
        "destinationChain": "base",
        "amount": "1000000000",
        "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        "refundTo": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "totalFeeBps": 100,
    },
)
order = res.json()["order"]
print("Deposit address:", order["deposit"]["address"])`,
  telegram: `bot.command("swap", async (ctx) => {
  // /swap 1 SOL USDC 0x742d...
  const [amountSol, fromAsset, toAsset, recipient] = ctx.payload.split(" ");
  const atomicAmount = String(Math.round(Number(amountSol) * 1e9));

  const res = await fetch("https://zkpay.top/api/v1/swap/create", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.ZKPAY_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fromAsset, chain: "sol", toAsset, destinationChain: "base",
      amount: atomicAmount, recipient, totalFeeBps: 100,
    }),
  });
  const { order } = await res.json();
  await ctx.reply(
    \`Send \${amountSol} \${fromAsset} to:\\n\` +
    \`\\\`\${order.deposit.address}\\\`\\n\` +
    \`Est. Output: \${order.quote.amountOut} \${toAsset}\`,
    { parse_mode: "Markdown" }
  );
});`,
};

export default function LandingPage({ login: loginProp }: LandingPageProps = {}) {
  const { login: activeLogin } = useActiveAccount();
  const login = loginProp ?? activeLogin;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<"curl" | "js" | "python" | "telegram">("js");
  const [copiedCode, setCopiedCode] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll();
  const smoothScroll = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    restDelta: 0.001,
  });

  const conduitPhotonTop = useTransform(smoothScroll, [0, 1], ["4%", "96%"]);
  const heroParallaxY = useTransform(smoothScroll, [0, 0.25], [0, -24]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[selectedLang]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <main className="min-h-[100dvh] w-full bg-surface-container-lowest text-on-surface relative overflow-x-clip selection:bg-primary/25 selection:text-on-surface">
      {/* ─── 00. Continuous Full-Page 3D Spatial Globe & Orbital Canvas ─── */}
      <SpatialCanvas3D scrollProgress={smoothScroll} />

      {/* ─── Fixed Pointer-Events-None Coordinate Hairlines ─── */}
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

      {/* ─── 01. Fluid Island Navigation ─── */}
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 flex items-center justify-between bg-surface/90 backdrop-blur-xl border border-primary/20 rounded-full px-4 sm:px-6 pointer-events-auto shadow-elevated transition-colors duration-300">
          <Link href="/" className="flex items-center gap-2.5 group whitespace-nowrap">
            <div className="w-8 h-8 rounded-full bg-surface-container border border-primary/25 flex items-center justify-center text-primary group-hover:border-primary/50 transition-colors">
              <Globe2 className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <span className="font-display font-semibold text-base sm:text-lg tracking-tight text-on-surface">
              ZkPay
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-on-surface-variant">
            <a href="#swap" className="hover:text-on-surface transition-colors">
              Web Swap
            </a>
            <a href="#developers" className="hover:text-on-surface transition-colors">
              Developer API
            </a>
            <a href="#chains" className="hover:text-on-surface transition-colors">
              Supported Chains
            </a>
            <Link href="/partner" className="text-primary hover:opacity-80 transition-opacity font-semibold">
              Partner Portal
            </Link>
            <Link href="/docs" className="hover:text-on-surface transition-colors">
              API Docs
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={login}
              className="rounded-full pl-4 pr-1.5 py-1.5 bg-secondary text-on-secondary font-semibold text-xs hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-card group flex items-center gap-2.5 whitespace-nowrap"
            >
              <span>Sign In</span>
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
                { label: "Web Swap", href: "#swap" },
                { label: "Developer API", href: "#developers" },
                { label: "Supported Chains", href: "#chains" },
                { label: "Partner Portal (50% Rev Share)", href: "/partner" },
                { label: "API Documentation", href: "/docs" },
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
        {/* ─── SECTION 1: Hero with Live Interactive Cross-Chain Swap Widget ─── */}
        <section id="swap" className="min-h-[100dvh] pt-24 lg:pt-28 pb-12 flex items-center">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Column (7 cols): Hero Stack */}
            <motion.div
              style={shouldReduceMotion ? undefined : { y: heroParallaxY }}
              className="lg:col-span-7 flex flex-col items-start text-left gap-6"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-xs font-medium text-primary">
                <Zap className="w-3.5 h-3.5" />
                <span>Instant Cross-Chain Swap Engine &amp; B2B Developer API</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-semibold tracking-tight text-on-surface leading-[1.08] max-w-2xl">
                Swap across 9 chains or embed our API in minutes.
              </h1>

              <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed max-w-[56ch]">
                Swap BTC, ETH, SOL, Base, Polygon, Arbitrum, BSC, Tron, and Litecoin instantly — or integrate ZkPay&apos;s REST API into your Telegram bot, wallet, or DApp and earn a 50/50 USD revenue share on every trade.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-1">
                <Link
                  href="/partner"
                  className="rounded-full pl-6 pr-2 py-2.5 bg-secondary text-on-secondary font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-elevated group flex items-center justify-between sm:justify-start gap-4 whitespace-nowrap"
                >
                  <span>Get API Key — 50% Rev Share</span>
                  <span className="w-9 h-9 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
                  </span>
                </Link>

                <Link
                  href="/docs"
                  className="rounded-full px-6 py-3.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-xs sm:text-sm font-medium text-on-surface transition-colors duration-200 text-center whitespace-nowrap"
                >
                  Read Swap API Docs
                </Link>
              </div>

              {/* Quick Trust Pills */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10 w-full max-w-lg">
                <div>
                  <p className="font-mono text-lg sm:text-xl font-bold text-on-surface">9 Chains</p>
                  <p className="text-[11px] text-outline">Non-custodial routing</p>
                </div>
                <div>
                  <p className="font-mono text-lg sm:text-xl font-bold text-primary">50 / 50</p>
                  <p className="text-[11px] text-outline">USD partner split</p>
                </div>
                <div>
                  <p className="font-mono text-lg sm:text-xl font-bold text-success">$1.00 Min</p>
                  <p className="text-[11px] text-outline">Instant crypto payouts</p>
                </div>
              </div>
            </motion.div>

            {/* Right Column (5 cols): Live Interactive Swap Widget */}
            <div className="lg:col-span-5 w-full">
              <SwapWidget />
            </div>
          </div>
        </section>

        {/* ─── SECTION 2: 4-Metric Architectural Ledger ─── */}
        <section className="py-16 sm:py-24 flex flex-col gap-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SWAP_METRICS.map((m, idx) => (
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

        {/* ─── SECTION 3: Developer API & 50/50 Revenue Share Sandbox ─── */}
        <section id="developers" className="py-20 sm:py-28 flex flex-col gap-12">
          <ScrollReveal>
            <div className="flex flex-col gap-3 max-w-2xl">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Built for Bots, Wallets &amp; DApps
              </span>
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                Monetize every swap with 4 REST endpoints.
              </h2>
              <p className="text-sm sm:text-base text-outline leading-relaxed max-w-[62ch]">
                Whether you run a Telegram trading bot, a Discord community bot, or a multi-chain DeFi interface, ZkPay handles deposit address generation, gasless token sweeping, cross-chain solver execution, and live 50/50 USD revenue sharing.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left (7 cols): Interactive Code Box */}
            <ScrollReveal className="lg:col-span-7">
              <div className="h-full rounded-3xl bg-surface-container-low/90 border border-primary/20 p-5 sm:p-7 flex flex-col justify-between shadow-elevated">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-primary" />
                      <span className="text-xs font-mono text-on-surface font-semibold">
                        POST /api/v1/swap/create
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(["js", "python", "telegram", "curl"] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setSelectedLang(lang)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            selectedLang === lang
                              ? "bg-primary text-on-primary font-semibold"
                              : "bg-white/5 text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {lang === "js"
                            ? "Node.js"
                            : lang === "python"
                            ? "Python"
                            : lang === "telegram"
                            ? "Telegram Bot"
                            : "cURL"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative rounded-2xl bg-surface-container-lowest border border-white/10 p-4 font-mono text-xs text-primary overflow-x-auto">
                    <button
                      onClick={handleCopyCode}
                      className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-on-surface-variant flex items-center gap-1.5 transition-colors"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                    <pre className="leading-relaxed pr-16">{CODE_SNIPPETS[selectedLang]}</pre>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-xs text-on-surface-variant">
                    Need context for Cursor, Claude, or ChatGPT? Copy our one-click AI Agent Master Prompt in Docs.
                  </div>
                  <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline shrink-0"
                  >
                    <span>Explore Full API Reference</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </ScrollReveal>

            {/* Right (5 cols): Partner Revenue Ledger Highlights */}
            <ScrollReveal delay={0.08} className="lg:col-span-5">
              <div className="h-full rounded-3xl bg-gradient-to-br from-primary/10 via-surface-container-low to-surface-container-lowest border border-primary/25 p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-elevated">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/15 border border-success/30 text-success text-xs font-semibold">
                    <span>v2 Automated Partner Ledger</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-display font-semibold text-on-surface tracking-tight">
                    Zero Per-Chain Wallet Headaches.
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    You never have to manage separate Solana, Litecoin, or EVM fee wallets. Pass your <code className="text-primary">X-API-Key</code> header and ZkPay automatically sweeps fees on-chain and credits 50% to your Partner Portal in USD.
                  </p>

                  <div className="space-y-3 pt-2">
                    {[
                      { title: "Customizable Partner Fee", desc: "Set totalFeeBps from 20 to 450 bps (0.20% – 4.50%)" },
                      { title: "Background Settlement Daemon", desc: "Credits your USD balance even if the user closes their browser" },
                      { title: "Flexible Crypto Withdrawals", desc: "Withdraw starting at $1.00 USD in Base USDC, Polygon USDT, SOL, or LTC" },
                    ].map((item) => (
                      <div key={item.title} className="p-3.5 rounded-2xl bg-surface/60 border border-white/10">
                        <p className="text-xs font-semibold text-on-surface">{item.title}</p>
                        <p className="text-[11px] text-outline mt-0.5">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Link
                    href="/partner"
                    className="flex-1 py-3 px-4 rounded-xl bg-primary text-on-primary font-semibold text-xs text-center hover:brightness-110 transition-all"
                  >
                    Open Partner Console
                  </Link>
                  <button
                    onClick={login}
                    className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-on-surface font-semibold text-xs transition-colors"
                  >
                    Create API Key
                  </button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ─── SECTION 4: 3-Step Integration Cascade ─── */}
        <section className="py-20 sm:py-28 flex flex-col gap-14 relative">
          <ScrollReveal>
            <div className="flex flex-col gap-3 max-w-2xl">
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                How ZkPay Swap Infrastructure works.
              </h2>
              <p className="text-sm sm:text-base text-outline leading-relaxed max-w-[60ch]">
                Non-custodial single-transfer deposit routing paired with decentralized cross-chain intent solvers.
              </p>
            </div>
          </ScrollReveal>

          <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 pb-0 lg:pb-16">
            <div
              aria-hidden="true"
              className="hidden lg:block absolute top-1/2 left-12 right-12 h-px bg-gradient-to-r from-primary/15 via-success/40 to-primary/15 pointer-events-none"
            />

            {DEVELOPER_STEPS.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <ScrollReveal key={item.step} delay={idx * 0.08} className={item.offsetClass}>
                  <Tilt3DMonolith
                    maxTilt={9}
                    className="h-full"
                    innerClassName="p-6 sm:p-7 flex flex-col justify-between gap-8 min-h-[280px]"
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

        {/* ─── SECTION 5: Supported Blockchains Matrix ─── */}
        <section id="chains" className="py-20 sm:py-28 flex flex-col gap-10">
          <ScrollReveal>
            <div className="flex flex-col items-start gap-3 max-w-2xl">
              <h2 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight text-on-surface">
                9 Supported Blockchains.
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[60ch]">
                Deep cross-chain liquidity across EVM L2s, Solana, Bitcoin, Litecoin, and Tron — with automatic gas sponsorship on Base and Polygon stablecoin deposits.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SUPPORTED_CHAINS.map((chain) => (
              <div
                key={chain.code}
                className="p-5 rounded-2xl bg-surface-container-low border border-primary/15 flex flex-col justify-between gap-2 hover:border-primary/35 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-on-surface font-mono">{chain.code}</span>
                  <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
                </div>
                <span className="text-base font-display font-semibold text-on-surface">{chain.name}</span>
                <span className="font-mono text-xs text-secondary">{chain.detail}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─── SECTION 6: Footer CTA ─── */}
        <section className="pt-12 pb-28 sm:pb-24">
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
                  Start swapping or start building today.
                </h2>
                <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[54ch]">
                  Use our web swap above or generate a Partner API key in 30 seconds to earn 50% of swap fees from your app or bot.
                </p>
              </DepthLayer>

              <DepthLayer z={36} className="pt-2 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/partner"
                  className="rounded-full pl-7 pr-2 py-2.5 bg-secondary text-on-secondary font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-transform duration-200 shadow-elevated group flex items-center gap-4 whitespace-nowrap"
                >
                  <span>Open Partner Portal</span>
                  <span className="w-9 h-9 rounded-full bg-surface text-secondary flex items-center justify-center transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-0.5">
                    <ArrowUpRight className="w-4 h-4 text-secondary" strokeWidth={1.75} />
                  </span>
                </Link>
                <Link
                  href="/docs"
                  className="rounded-full px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/15 text-sm font-medium text-on-surface transition-colors"
                >
                  View API Documentation
                </Link>
              </DepthLayer>
            </Tilt3DMonolith>
          </ScrollReveal>

          <footer className="mt-16 pt-8 border-t border-primary/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-on-surface-variant">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-surface-container border border-primary/20 flex items-center justify-center text-primary">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
              </div>
              <span className="font-display font-semibold text-on-surface">ZkPay</span>
              <span>Instant Cross-Chain Swap Engine &amp; Developer API</span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <Link href="/partner" className="hover:text-on-surface transition-colors">
                Partner Portal
              </Link>
              <Link href="/docs" className="hover:text-on-surface transition-colors">
                API Docs
              </Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors">
                Terms of Service
              </Link>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
