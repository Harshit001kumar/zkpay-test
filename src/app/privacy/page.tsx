import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Shield, Lock, EyeOff, Server, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | ZkPay",
  description: "Privacy Policy for ZkPay - Non-custodial, Zero-Knowledge Cross-Chain Swap & B2B API Interface.",
};

export default function PrivacyPolicyPage() {
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
              Effective: November 2026
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16 space-y-12">
        {/* Title Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-outline-variant text-secondary text-xs font-medium">
            <Shield className="w-3.5 h-3.5" />
            <span>Non-Custodial Privacy Standard</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-on-surface">
            Privacy Policy
          </h1>
          <p className="text-base text-on-surface-variant leading-relaxed max-w-2xl">
            ZkPay is engineered from the ground up as a non-custodial, privacy-preserving cross-chain swap interface.
            We do not store your private keys, sell your data, or maintain centralized databases of your
            financial transactions.
          </p>
        </div>

        {/* Highlights Bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Direct Blockchain Settlement</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Swaps execute directly between solver networks and your self-custodial destination address. ZkPay never holds custody of your crypto assets.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Zero Identity Data Collection</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Standard cross-chain swaps operate without KYC or personal identity collection. We never ask for government IDs, photos, or personal contact documents.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant space-y-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-secondary">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface text-base">Single-Use Ephemeral Addresses</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Each swap order generates a unique, single-use deposit address that expires once settled or refunded, preventing transaction linking.
            </p>
          </div>
        </div>

        {/* Policy Detailed Sections */}
        <div className="space-y-10 text-on-surface-variant text-sm md:text-base leading-relaxed border-t border-outline-variant pt-10">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">01.</span>
              Information We Do Not Collect
            </h2>
            <p>
              Unlike traditional financial processors or centralized exchanges, ZkPay does not collect or store:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm text-on-surface-variant pt-2">
              <li className="flex items-center gap-2 bg-surface-container p-3 rounded-xl border border-outline-variant">
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                <span>No Names or Physical Addresses</span>
              </li>
              <li className="flex items-center gap-2 bg-surface-container p-3 rounded-xl border border-outline-variant">
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                <span>No Passports or National ID Proofs</span>
              </li>
              <li className="flex items-center gap-2 bg-surface-container p-3 rounded-xl border border-outline-variant">
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                <span>No Private Keys or Seed Phrases</span>
              </li>
              <li className="flex items-center gap-2 bg-surface-container p-3 rounded-xl border border-outline-variant">
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                <span>No Bank Account Logins or Credentials</span>
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">02.</span>
              Information Processed During Swaps
            </h2>
            <p>
              When you initiate a cross-chain swap, the following data is processed transiently to execute the order:
            </p>
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-surface-container border border-outline-variant space-y-1">
                <h4 className="font-bold text-on-surface text-sm">Public Blockchain Transactions</h4>
                <p className="text-xs text-on-surface-variant">
                  Public wallet addresses, transfer amounts, and transaction hashes recorded immutably on origin and destination blockchains (e.g. Bitcoin, Solana, Base, Ethereum, Litecoin, Polygon, Arbitrum, BSC, Tron).
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface-container border border-outline-variant space-y-1">
                <h4 className="font-bold text-on-surface text-sm">Flexible Input Quoting</h4>
                <p className="text-xs text-on-surface-variant">
                  Swap orders utilize flexible input routing (<code className="text-secondary font-mono">FLEX_INPUT</code>), enabling market solvers to settle trades accurately based on the actual deposit received at the generated address.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-surface-container border border-outline-variant space-y-1">
                <h4 className="font-bold text-on-surface text-sm">Local Device Cache</h4>
                <p className="text-xs text-on-surface-variant">
                  Your browser&apos;s local storage keeps track of active order IDs and status checkpoints so you can refresh the page without losing your active swap session.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">03.</span>
              Third-Party Networks &amp; Solvers
            </h2>
            <p>
              ZkPay routes cross-chain liquidity across independent solver networks and blockchain protocols:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs md:text-sm text-on-surface-variant pl-2">
              <li>
                <strong className="text-on-surface">NEAR Intents 1Click Solver Network:</strong> Decentralized cross-chain settlement network matching user swaps against competing professional solvers.
              </li>
              <li>
                <strong className="text-on-surface">Supported Blockchains:</strong> Bitcoin (BTC), Ethereum (ETH), Base, Arbitrum, Polygon, BNB Chain, Solana (SOL), Tron (TRX), and Litecoin (LTC).
              </li>
              <li>
                <strong className="text-on-surface">Privy Authentication:</strong> Non-custodial embedded wallet authentication providing optional MPC-secured logins for developers and partners.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">04.</span>
              Security &amp; Self-Custody
            </h2>
            <p>
              Because you control your own wallet keys, you are responsible for safeguarding your recovery phrases. ZkPay will never ask for your private keys, seed phrases, or sensitive wallet passwords.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-on-surface flex items-center gap-3">
              <span className="text-sm text-secondary font-mono">05.</span>
              Contact &amp; Security Inquiries
            </h2>
            <p>
              For security disclosures or integration inquiries, contact the team via verified channels:
            </p>
            <div className="p-4 rounded-xl bg-surface-container border border-outline-variant text-xs text-secondary font-mono">
              Email: security@zkpay.top · Official Portal: https://zkpay.top
            </div>
          </section>
        </div>

        {/* Footer Note */}
        <div className="pt-8 border-t border-outline-variant flex flex-col md:flex-row items-center justify-between text-xs text-on-surface-variant gap-4">
          <span>ZkPay Non-Custodial Cross-Chain Protocol</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-on-surface transition-colors">
              Terms of Service
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
