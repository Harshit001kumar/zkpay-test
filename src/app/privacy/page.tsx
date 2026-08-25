import Link from "next/link";
import { ArrowLeft, Shield, Lock, EyeOff, Server, FileText, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | ZkPay",
  description: "Privacy Policy for ZkPay - Non-custodial, Zero-Knowledge Crypto-to-Fiat Payment Interface.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-sans selection:bg-[#c0c6de]/20 selection:text-white">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#c0c6de]/5 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-[#8a92a6]/5 rounded-full blur-[140px]" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-[#131315]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#909097] hover:text-[#e5e2e3] transition-colors font-mono"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO ZKPAY</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-[#909097] uppercase tracking-widest">
              EFFECTIVE: MARCH 2026
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20 space-y-12">
        {/* Title Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[#c0c6de] text-xs font-mono tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            <span>ZERO-KNOWLEDGE PRIVACY STANDARD</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Privacy Policy
          </h1>
          <p className="text-lg text-[#909097] leading-relaxed max-w-2xl">
            ZkPay is engineered from the ground up as a non-custodial, privacy-preserving interface.
            We do not store your private keys, sell your data, or maintain centralized databases of your
            financial transactions.
          </p>
        </div>

        {/* Highlights Bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de]">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Client-Side ECIES Encryption</h3>
            <p className="text-xs text-[#909097] leading-relaxed">
              Payout addresses (UPI IDs, bank details) are encrypted directly in your browser using the merchant’s public key. Only the matched counterparty can decrypt your payout destination.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de]">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">No Identity Data Collection</h3>
            <p className="text-xs text-[#909097] leading-relaxed">
              Standard scan-and-pay transactions operate within the protocol’s no-KYC tier ($100 USDC baseline floor). We never ask for government IDs, photos, or personal identity documents.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-md space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#c0c6de]/10 flex items-center justify-center text-[#c0c6de]">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Self-Custodial Architecture</h3>
            <p className="text-xs text-[#909097] leading-relaxed">
              Funds are managed directly in your self-custody wallet (or embedded Privy wallet). ZkPay never takes custody of your USDC or cryptocurrency at any point.
            </p>
          </div>
        </div>

        {/* Policy Detailed Sections */}
        <div className="space-y-10 text-[#c6c6cd] text-sm md:text-base leading-relaxed border-t border-white/5 pt-10">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">01.</span>
              Information We Do NOT Collect
            </h2>
            <p>
              Unlike traditional payment processors or centralized exchanges, ZkPay does not collect or store:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs md:text-sm font-mono text-[#909097] pt-2">
              <li className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#c0c6de]" />
                <span>No Names or Physical Addresses</span>
              </li>
              <li className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#c0c6de]" />
                <span>No Passports or National ID Proofs</span>
              </li>
              <li className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#c0c6de]" />
                <span>No Private Keys or Seed Phrases</span>
              </li>
              <li className="flex items-center gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <CheckCircle2 className="w-4 h-4 text-[#c0c6de]" />
                <span>No Bank Account Logins or Passwords</span>
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">02.</span>
              Information Processed During Payments
            </h2>
            <p>
              When you initiate an offramp payment or cashout, the following data is processed transiently to execute the peer-to-peer settlement:
            </p>
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-sm">Public Blockchain Data</h4>
                <p className="text-xs text-[#909097]">
                  Public wallet addresses, token transfer amounts, and transaction hashes recorded immutably on the Base network (Layer 2 Ethereum). This data is public by the inherent nature of decentralized blockchains.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-sm">Encrypted Payout Destination</h4>
                <p className="text-xs text-[#909097]">
                  When scanning a UPI QR code or entering a payout address, your browser encrypts the destination string with the matched merchant&apos;s cryptographic public key via Elliptic Curve Integrated Encryption Scheme (ECIES). The plaintext is never stored on our servers.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-sm">Local Device Cache</h4>
                <p className="text-xs text-[#909097]">
                  Your browser&apos;s local storage (`localStorage`) maintains pending transaction IDs and the ephemeral relay keypair so you can safely refresh the tab while waiting for peer-to-peer settlement without losing order context. You can clear this cache at any time in your browser settings.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">03.</span>
              Third-Party Protocols & Infrastructure
            </h2>
            <p>
              ZkPay interfaces with decentralized smart contracts and privacy-focused infrastructure providers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs md:text-sm text-[#909097] pl-2">
              <li>
                <strong className="text-white">Base Mainnet (Coinbase L2):</strong> Decentralized Ethereum execution environment where smart contracts settle token approvals and offramp orders.
              </li>
              <li>
                <strong className="text-white">P2P.me Protocol:</strong> On-chain decentralized Diamond contract architecture facilitating merchant order routing and escrow matching.
              </li>
              <li>
                <strong className="text-white">Privy Auth:</strong> Non-custodial embedded wallet authentication enabling secure social and email logins using secure multi-party computation (MPC).
              </li>
              <li>
                <strong className="text-white">SideShift AI:</strong> Automated cross-chain liquidity converter used strictly for deposit routing (e.g., swapping BTC/ETH/SOL to Base USDC).
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">04.</span>
              Cookies and Analytics
            </h2>
            <p>
              ZkPay does not deploy invasive tracking cookies, third-party advertising pixels, or cross-site tracking scripts. We believe financial privacy is a fundamental human right.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">05.</span>
              Security & Self-Custody Best Practices
            </h2>
            <p>
              Because you control your own wallet keys, you are responsible for maintaining the confidentiality of your credentials. Never share your recovery phrases or private keys with anyone claiming to represent ZkPay. ZkPay team members will never ask for your private keys.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-mono text-sm text-[#c0c6de]">06.</span>
              Contact & Compliance Inquiries
            </h2>
            <p>
              If you have any questions regarding this Privacy Policy or wish to report a security disclosure, please contact the team via our verified channels:
            </p>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 font-mono text-xs text-[#c0c6de]">
              Email: security@zkpay.top • Official Portal: https://zkpay.top
            </div>
          </section>
        </div>

        {/* Footer Note */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs font-mono text-[#909097] gap-4">
          <span>ZkPay Non-Custodial Protocol</span>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">
              TERMS OF SERVICE
            </Link>
            <Link href="/docs" className="hover:text-white transition-colors">
              API DOCUMENTATION
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
