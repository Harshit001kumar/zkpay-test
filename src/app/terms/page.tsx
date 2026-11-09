import Link from "next/link";
import { ArrowLeft, Scale, AlertTriangle, Coins, RefreshCw, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Terms of Service | ZkPay",
  description: "Terms of Service for ZkPay - Decentralized, Non-Custodial Cross-Chain Swap & B2B API Interface.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans selection:bg-secondary/20 selection:text-white">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-surface/85 border-b border-outline-variant px-6 py-4 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to ZkPay</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-xs text-on-surface-variant">
              Last Updated: November 2026
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16 space-y-12">
        {/* Title Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-outline-variant text-secondary text-xs font-medium">
            <Scale className="w-3.5 h-3.5" />
            <span>Decentralized Protocol Agreement</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-on-surface">
            Terms of Service
          </h1>
          <p className="text-base text-on-surface-variant leading-relaxed max-w-2xl">
            Please review these Terms carefully before accessing or using the ZkPay decentralized swap interface,
            developer REST APIs, or associated cross-chain services.
          </p>
        </div>

        {/* Key Highlights Bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <Coins className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Transparent Fees</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              ZkPay assesses a clear 100 basis point (1.00%) fee on supported L2 and alt-chain swaps with a 50/50 developer revenue split. Zero hidden markups.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Solver-Based Routing</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Cross-chain orders are settled via NEAR Intents 1Click solver networks across 9 blockchains using competitive market-maker quotes.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Blockchain Finality</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Cryptocurrency transactions on public blockchains are irreversible once confirmed. Users are responsible for providing correct recipient addresses.
            </p>
          </div>
        </div>

        {/* Terms Detailed Content */}
        <div className="space-y-10 text-on-surface-variant text-sm md:text-base leading-relaxed border-t border-outline-variant pt-10">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">01.</span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, connecting a Web3 wallet, or using ZkPay swap endpoints or developer APIs (the &ldquo;Interface&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, you must immediately discontinue use of the Interface.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">02.</span>
              Non-Custodial Nature of the Service
            </h2>
            <p>
              ZkPay is a non-custodial software interface. We do not take custody of user funds, hold private keys, or act as an intermediary financial institution. All cross-chain swaps occur directly on-chain between users and decentralized solver networks.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">03.</span>
              Flexible Input Orders (FLEX_INPUT)
            </h2>
            <p>
              All swaps execute with <code className="text-secondary font-mono">swapType: &quot;FLEX_INPUT&quot;</code> by default. The solver fulfills trades proportionally based on the actual cryptocurrency deposit detected at the generated single-use address, provided it meets or exceeds the solver network minimum volume threshold.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">04.</span>
              Developer APIs &amp; Partner Revenue Share
            </h2>
            <p>
              Partners integrating ZkPay REST APIs (<code className="text-secondary font-mono">/api/v1/swap/quote</code> and <code className="text-secondary font-mono">/api/v1/swap/create</code>) receive automated 50/50 fee attribution on supported routes. Payouts can be requested via the Partner Portal at any time to supported crypto addresses without lockups or hidden deductions.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">05.</span>
              User Obligations &amp; Risks
            </h2>
            <p>
              You understand and accept the risks inherent in public blockchain interactions, including network congestion, gas fee volatility, smart contract risks, and token price fluctuations. You are solely responsible for ensuring the accuracy of recipient wallet addresses and networks.
            </p>
          </section>
        </div>

        {/* Footer Note */}
        <div className="pt-8 border-t border-outline-variant flex flex-col md:flex-row items-center justify-between text-xs text-on-surface-variant gap-4">
          <span>ZkPay Non-Custodial Cross-Chain Protocol</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-on-surface transition-colors">
              Privacy Policy
            </Link>
            <Link href="/docs" className="hover:text-on-surface transition-colors">
              Developer Documentation
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
