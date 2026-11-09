"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Copy, Check, Menu, X } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { useActiveAccount } from "@/hooks/useActiveAccount";
import SwapWidget from "@/components/SwapWidget";

interface LandingPageProps {
  login?: () => void;
}

const DEVELOPER_STEPS = [
  {
    n: "1",
    title: "Get an API key",
    description: "Create a key in the Partner Portal. No per-chain fee wallets to configure.",
  },
  {
    n: "2",
    title: "Create a swap",
    description: "POST /api/v1/swap/create returns a single-use deposit address for your user.",
  },
  {
    n: "3",
    title: "Earn on settlement",
    description: "50% of your fee is credited in USD the moment the swap settles.",
  },
];

const SUPPORTED_CHAINS = [
  "Bitcoin",
  "Ethereum",
  "Solana",
  "Base",
  "Arbitrum",
  "Polygon",
  "BNB Chain",
  "Tron",
  "Litecoin",
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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[selectedLang]);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const navLinks = [
    { label: "Swap", href: "#swap" },
    { label: "Developers", href: "#developers" },
    { label: "Partner", href: "/partner" },
    { label: "Docs", href: "/docs" },
  ];

  return (
    <main className="min-h-[100dvh] w-full bg-surface text-on-surface overflow-x-clip">
      {/* â”€â”€â”€ Navigation â”€â”€â”€ */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/85 backdrop-blur-xl border-b border-outline-variant">
        <div className="max-w-6xl mx-auto h-14 sm:h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 h-10">
            <span className="w-7 h-7 rounded-lg bg-on-surface text-surface flex items-center justify-center font-bold text-sm">
              Z
            </span>
            <span className="font-semibold text-base tracking-tight">ZkPay</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="h-9 px-3.5 rounded-lg inline-flex items-center text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={login}
              className="h-10 px-4 rounded-xl bg-on-surface text-surface text-sm font-semibold hover:bg-white active:scale-[0.98] transition-colors cursor-pointer"
            >
              Sign in
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="md:hidden overflow-hidden border-t border-outline-variant bg-surface"
            >
              <div className="px-2 py-2">
                {navLinks.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="h-12 px-3 rounded-xl flex items-center justify-between text-base text-on-surface hover:bg-surface-container"
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

      <div className="w-full max-w-6xl mx-auto px-3 sm:px-6">
        {/* â”€â”€â”€ Hero: headline + live swap (widget visible above the fold on mobile) â”€â”€â”€ */}
        <section id="swap" className="pt-20 sm:pt-24 lg:pt-28 pb-12 lg:pb-20 scroll-mt-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
            <div className="lg:col-span-6 px-1 space-y-4 lg:space-y-6">
              <h1 className="text-[28px] leading-[1.15] sm:text-5xl lg:text-6xl font-semibold tracking-tight text-on-surface max-w-xl">
                Swap any coin across 9 chains.
              </h1>
              <p className="text-sm sm:text-lg text-on-surface-variant leading-relaxed max-w-[44ch]">
                Send on one network, receive on another with zero custody or bridges.
              </p>
              <div className="hidden lg:flex items-center gap-3 pt-2">
                <Link
                  href="/partner"
                  className="h-12 px-5 rounded-xl bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-colors"
                >
                  <span>Get an API key</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-5 rounded-xl border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center hover:border-outline transition-colors"
                >
                  Read the docs
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 w-full max-w-xl mx-auto lg:max-w-none">
              <SwapWidget />
            </div>
          </div>
        </section>

        {/* â”€â”€â”€ Supported chains strip â”€â”€â”€ */}
        <section className="py-8 border-y border-outline-variant">
          <ul className="flex flex-wrap justify-center gap-2 px-1">
            {SUPPORTED_CHAINS.map((c) => (
              <li
                key={c}
                className="h-9 px-3.5 rounded-full border border-outline-variant text-sm text-on-surface-variant inline-flex items-center"
              >
                {c}
              </li>
            ))}
          </ul>
        </section>

        {/* â”€â”€â”€ Developers â”€â”€â”€ */}
        <section id="developers" className="py-16 sm:py-24 scroll-mt-16 space-y-10">
          <ScrollReveal>
            <div className="px-1 space-y-3 max-w-2xl">
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-on-surface">
                Add swaps to your app. Keep half the fee.
              </h2>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed max-w-[60ch]">
                One REST call creates a deposit address. We handle routing, settlement, and pay you 50% of your fee in USD.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Code */}
            <ScrollReveal className="lg:col-span-7 min-w-0">
              <div className="rounded-2xl bg-surface-container border border-outline-variant overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2 sm:px-3 h-12 border-b border-outline-variant">
                  <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                    {(["js", "python", "telegram", "curl"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLang(lang)}
                        className={`h-9 px-3 rounded-lg text-sm whitespace-nowrap transition-colors cursor-pointer ${
                          selectedLang === lang
                            ? "bg-surface-container-high text-on-surface font-medium"
                            : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {lang === "js" ? "Node.js" : lang === "python" ? "Python" : lang === "telegram" ? "Telegram" : "cURL"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    aria-label="Copy code"
                    className="h-9 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer shrink-0"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                    <span className="hidden sm:inline">{copiedCode ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-4 font-mono text-xs leading-relaxed text-on-surface overflow-x-auto max-h-[420px]">
                  {CODE_SNIPPETS[selectedLang]}
                </pre>
              </div>
            </ScrollReveal>

            {/* Steps */}
            <ScrollReveal delay={0.06} className="lg:col-span-5">
              <ol className="space-y-6 px-1 lg:pt-2">
                {DEVELOPER_STEPS.map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="w-8 h-8 shrink-0 rounded-full border border-outline-variant font-mono text-sm text-on-surface flex items-center justify-center">
                      {s.n}
                    </span>
                    <div className="space-y-1 pt-1">
                      <h3 className="text-base font-semibold text-on-surface">{s.title}</h3>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{s.description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <dl className="grid grid-cols-3 gap-px mt-8 rounded-xl overflow-hidden bg-outline-variant border border-outline-variant">
                {[
                  { k: "Partner fee", v: "0.2â€“4.5%" },
                  { k: "Your share", v: "50%" },
                  { k: "Min payout", v: "$1" },
                ].map((m) => (
                  <div key={m.k} className="bg-surface-container p-3">
                    <dt className="text-[11px] text-on-surface-variant">{m.k}</dt>
                    <dd className="font-mono text-sm font-semibold text-on-surface mt-0.5">{m.v}</dd>
                  </div>
                ))}
              </dl>
            </ScrollReveal>
          </div>
        </section>

        {/* â”€â”€â”€ Closing CTA â”€â”€â”€ */}
        <section className="pb-16 sm:pb-24">
          <ScrollReveal>
            <div className="rounded-2xl border border-outline-variant bg-surface-container p-6 sm:p-12 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-lg">
                <h2 className="text-xl sm:text-3xl font-semibold tracking-tight text-on-surface">
                  Ready to integrate?
                </h2>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Create a Partner API key in under a minute and start earning on every swap.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
                <Link
                  href="/partner"
                  className="h-12 px-5 rounded-xl bg-secondary text-on-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-colors"
                >
                  <span>Get an API key</span>
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/docs"
                  className="h-12 px-5 rounded-xl border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center justify-center hover:border-outline transition-colors"
                >
                  Read the docs
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <footer className="mt-12 pt-6 border-t border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm text-on-surface-variant px-1 pb-safe">
            <span>
              <span className="font-semibold text-on-surface">ZkPay</span> Â· Cross-chain swaps &amp; API
            </span>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/partner" className="hover:text-on-surface transition-colors">Partner</Link>
              <Link href="/docs" className="hover:text-on-surface transition-colors">Docs</Link>
              <Link href="/privacy" className="hover:text-on-surface transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-on-surface transition-colors">Terms</Link>
            </nav>
          </footer>
        </section>
      </div>
    </main>
  );
}
