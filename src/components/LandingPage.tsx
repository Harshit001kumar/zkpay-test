"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  Copy,
  Check,
  Menu,
  X,
  Code2,
  TrendingUp,
  Globe2,
} from "lucide-react";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import SwapWidget from "@/components/SwapWidget";
import { QuantumMesh3D } from "@/components/ui/QuantumMesh3D";
import { Tilt3DMonolith, DepthLayer } from "@/components/ui/Tilt3DMonolith";
import { CrossChainMatrix3D } from "@/components/ui/CrossChainMatrix3D";
import { RevenueSimulator3D } from "@/components/ui/RevenueSimulator3D";
import { LiveIntentTicker3D } from "@/components/ui/LiveIntentTicker3D";

interface LandingPageProps {
  login?: () => void;
}

const DEVELOPER_STEPS = [
  {
    n: "01",
    title: "Generate API Key",
    description: "Create your partner key in the dashboard. Zero fee wallets or gas reserves required.",
  },
  {
    n: "02",
    title: "Call /swap/create",
    description: "Generates a single-use deposit address supporting flexible input amounts.",
  },
  {
    n: "03",
    title: "Earn 50% on Settlement",
    description: "50% of your fee is automatically credited in USD upon block confirmation.",
  },
];

const CODE_SNIPPETS: Record<"curl" | "js" | "python" | "telegram", string> = {
  curl: `curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_your_partner_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fromAsset": "SOL",
    "chain": "sol",
    "toAsset": "USDC",
    "destinationChain": "base",
    "amount": "1000000000",
    "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "swapType": "FLEX_INPUT",
    "totalFeeBps": 100
  }'`,
  js: `// Create cross-chain swap with automatic 50/50 revenue attribution
const res = await fetch("https://zkpay.top/api/v1/swap/create", {
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
    amount: "1000000000", // 1.0 SOL in lamports
    recipient: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    swapType: "FLEX_INPUT", // Flexible deposit amount supported
    totalFeeBps: 100,       // 1.00% split 50/50 with partner
  }),
});

const { order } = await res.json();
console.log("Deposit address:", order.deposit.address);`,
  python: `import requests

# Create cross-chain swap with automatic 50/50 revenue attribution
response = requests.post(
    "https://zkpay.top/api/v1/swap/create",
    headers={"X-API-Key": "zkpay_live_your_partner_key"},
    json={
        "fromAsset": "BTC",
        "chain": "btc",
        "toAsset": "USDT",
        "destinationChain": "tron",
        "amount": "5000000",  # 0.05 BTC in satoshis
        "recipient": "TXYZopUR9qZnbM7qNkS5fQyH56d78a9b",
        "swapType": "FLEX_INPUT",
        "totalFeeBps": 100,
    },
)

order = response.json()["order"]
print("Deposit address:", order["deposit"]["address"])`,
  telegram: `bot.command("swap", async (ctx) => {
  // Usage: /swap 1.5 SOL USDC 0x742d...
  const [amount, fromAsset, toAsset, recipient] = ctx.payload.split(" ");
  const atomic = String(Math.round(Number(amount) * 1e9));

  const res = await fetch("https://zkpay.top/api/v1/swap/create", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.ZKPAY_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fromAsset, chain: "sol",
      toAsset, destinationChain: "base",
      amount: atomic,
      recipient,
      swapType: "FLEX_INPUT",
      totalFeeBps: 100,
    }),
  });

  const { order } = await res.json();
  await ctx.reply(
    \`ZkPay Cross-Chain Swap\\n\\n\` +
    \`Send \${amount} \${fromAsset} to:\\n\` +
    \`\`\${order.deposit.address}\`\`\\n\\n\` +
    \`Output: \${order.settlement.estimatedAmountOut} \${toAsset}\`,
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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[selectedLang]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const navLinks = [
    { label: "Swap", href: "#swap" },
    { label: "9-Chain Mesh", href: "#matrix" },
    { label: "Revenue Engine", href: "#revenue" },
    { label: "Developer API", href: "#developers" },
    { label: "Partner Portal", href: "/partner" },
    { label: "Docs", href: "/docs" },
  ];

  return (
    <main className="relative min-h-[100dvh] w-full bg-surface text-on-surface selection:bg-secondary selection:text-on-secondary overflow-x-clip">
      {/* ─── 3D Quantum Multi-Chain Canvas Background ─── */}
      <QuantumMesh3D />

      {/* ─── Floating Island Glass Header ─── */}
      <header className="fixed top-3 sm:top-5 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-5xl mx-auto h-14 sm:h-16 px-4 sm:px-6 rounded-full bg-surface-container-low/85 backdrop-blur-2xl border border-outline-variant shadow-elevated flex items-center justify-between gap-3 pointer-events-auto">
          <Link href="/" className="flex items-center gap-2.5 h-10 active:scale-95 transition-transform">
            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-extrabold text-sm">
              Z
            </span>
            <span className="font-bold text-base tracking-tight text-on-surface">ZkPay</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/10 border border-secondary/30 text-[10px] text-secondary font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span>9 chains</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 text-xs">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="h-8 px-3 rounded-full inline-flex items-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Action Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={login}
              className="h-9 px-4 rounded-full bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-transform cursor-pointer whitespace-nowrap"
            >
              <span>Connect Wallet</span>
            </button>

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Reveal */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="md:hidden mt-2 max-w-sm mx-auto rounded-2xl bg-surface-container-low/95 backdrop-blur-2xl border border-outline-variant p-3 shadow-card pointer-events-auto"
            >
              <div className="space-y-1 text-xs">
                {navLinks.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="h-10 px-3 rounded-xl flex items-center justify-between text-on-surface hover:bg-surface-container transition-colors"
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

      {/* ─── Main Content Container ─── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 space-y-24 sm:space-y-36">
        {/* ─── HERO: 3D Holographic Stage & Live Swap Monolith ─── */}
        <section id="swap" className="scroll-mt-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Hero Left Column: Vision & Telemetry */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span>Cross-chain intent settlement</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-on-surface leading-[1.12]">
                Instant swaps across 9 blockchains.
              </h1>

              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[50ch]">
                Send native crypto across Bitcoin, Solana, Base, Ethereum, Tron, or Litecoin.
              </p>

              {/* Hardware HUD Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs">
                  <span className="text-[10px] text-on-surface-variant block">Network mode</span>
                  <span className="font-bold text-secondary">FLEX_INPUT</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs">
                  <span className="text-[10px] text-on-surface-variant block">Custody</span>
                  <span className="font-bold text-primary">Non-custodial</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low/80 border border-outline-variant text-xs col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-on-surface-variant block">Partner share</span>
                  <span className="font-bold text-on-surface">50/50 revenue</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/partner"
                  className="h-12 px-6 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-2 hover:brightness-110 active:scale-95 transition-transform"
                >
                  <span>Build with Developer API</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center hover:border-outline transition-colors"
                >
                  Read REST API docs
                </Link>
              </div>
            </div>

            {/* Hero Right Column: 3D Holographic Swap Monolith */}
            <div className="lg:col-span-6 w-full max-w-lg mx-auto lg:max-w-none">
              <Tilt3DMonolith maxTilt={8} className="w-full">
                {/* 3D Telemetry HUD Top Strip */}
                <DepthLayer z={30} className="px-3 pt-3 pb-2 flex items-center justify-between border-b border-outline-variant text-[10px] text-on-surface-variant">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                    <span className="text-on-surface font-bold">Solver network online</span>
                  </div>
                  <span className="text-primary">Single-use deposit active</span>
                </DepthLayer>

                {/* Swap Widget */}
                <DepthLayer z={16} className="p-1 sm:p-2">
                  <SwapWidget />
                </DepthLayer>
              </Tilt3DMonolith>
            </div>
          </div>
        </section>

        {/* ─── SECTION 2: 3D Interactive Cross-Chain Lattice ─── */}
        <section id="matrix" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
              <Globe2 className="w-3.5 h-3.5" />
              <span>9 Blockchains interconnected</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Direct routing without bridges or wrapped tokens.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Select any blockchain pair below to inspect solver settlement speeds, sponsored relayer gas, and guaranteed routing.
            </p>
          </div>

          <CrossChainMatrix3D />
        </section>

        {/* ─── SECTION 3: 50/50 Revenue Engine Simulator ─── */}
        <section id="revenue" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-secondary/30 text-secondary text-xs">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Partner monetization</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Monetize swaps inside your app or bot.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Embed cross-chain swaps in your Telegram bot, mobile wallet, or web app. You receive 50% of every custom fee directly in USD.
            </p>
          </div>

          <RevenueSimulator3D />
        </section>

        {/* ─── SECTION 4: Live Intent Flow Stream ─── */}
        <section className="space-y-6">
          <div className="space-y-2 max-w-xl">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              Protocol telemetry stream
            </h3>
            <p className="text-xs sm:text-sm text-on-surface-variant">
              Live updates of non-custodial solver settlements executing across origin and destination networks.
            </p>
          </div>

          <LiveIntentTicker3D />
        </section>

        {/* ─── SECTION 5: B2B Developer Terminal ─── */}
        <section id="developers" className="scroll-mt-28 space-y-8">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-primary/30 text-primary text-xs">
              <Code2 className="w-3.5 h-3.5" />
              <span>Developer API</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
              Four simple endpoints for cross-chain swaps.
            </h2>
            <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
              Generate single-use deposit addresses on any chain. No node maintenance, no liquidity pools, and no contract deployments.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Terminal Code Sandbox */}
            <div className="lg:col-span-7 rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-primary/25 shadow-elevated">
              <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-outline-variant overflow-hidden">
                <div className="flex items-center justify-between px-4 h-12 border-b border-outline-variant bg-surface-container">
                  <div className="flex items-center gap-1 text-xs">
                    {(["js", "python", "telegram", "curl"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLang(lang)}
                        className={`h-8 px-3 rounded-lg font-semibold transition-colors cursor-pointer ${
                          selectedLang === lang
                            ? "bg-primary text-on-primary"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {lang === "js" ? "Node.js" : lang === "python" ? "Python" : lang === "telegram" ? "Telegram Bot" : "cURL"}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <pre className="p-5 font-mono text-xs leading-relaxed text-on-surface overflow-x-auto max-h-[440px] bg-surface-dim">
                  {CODE_SNIPPETS[selectedLang]}
                </pre>
              </div>
            </div>

            {/* 3-Step Integration Flow */}
            <div className="lg:col-span-5 space-y-6 lg:pt-2">
              <div className="space-y-4">
                {DEVELOPER_STEPS.map((s) => (
                  <div
                    key={s.n}
                    className="p-4 rounded-2xl bg-surface-container-low/80 border border-outline-variant flex gap-4 items-start"
                  >
                    <span className="w-9 h-9 rounded-xl bg-surface-container border border-primary/30 font-mono text-xs font-bold text-secondary flex items-center justify-center shrink-0">
                      {s.n}
                    </span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-on-surface">{s.title}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-surface-container border border-secondary/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-on-surface block">Ready to integrate?</span>
                  <span className="text-[11px] text-on-surface-variant">Get production API keys in your dashboard</span>
                </div>
                <Link
                  href="/partner"
                  className="h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-transform"
                >
                  <span>Portal</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 6: High-End Hardware Closing CTA & Footer ─── */}
        <section className="pb-16 sm:pb-24 space-y-12">
          <div className="rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-primary/30 shadow-elevated">
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
                  className="h-12 px-6 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-transform"
                >
                  <span>Generate partner key</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-6 rounded-xl bg-surface-container-high border border-outline-variant text-xs font-semibold text-on-surface inline-flex items-center justify-center hover:border-outline transition-colors"
                >
                  View documentation
                </Link>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="pt-8 border-t border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-on-surface-variant pb-safe">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary" />
              <span className="text-on-surface font-bold">ZkPay Protocol</span>
              <span>· 9-Chain non-custodial cross-chain swap engine</span>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/partner" className="hover:text-on-surface transition-colors">Partner Portal</Link>
              <Link href="/docs" className="hover:text-on-surface transition-colors">API Docs</Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors">Terms of Service</Link>
            </nav>
          </footer>
        </section>
      </div>
    </main>
  );
}
