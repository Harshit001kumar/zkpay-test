import Link from "next/link";
import { ArrowLeft, Scale, AlertTriangle, Coins, RefreshCw, CheckCircle2, ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Terms of Service | ZkPay",
  description: "Terms of Service for ZkPay - Decentralized, Non-Custodial Crypto-to-Fiat Payment Interface.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans selection:bg-primary/20 selection:text-white">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-xl" />
        <div className="absolute bottom-10 -left-40 w-96 h-96 bg-secondary/5 rounded-full blur-xl" />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-surface/80  border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-outline hover:text-on-surface transition-colors font-sans tabular-nums"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>BACK TO ZKPAY</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-sans tabular-nums text-outline  tracking-normal">
              LAST UPDATED: MARCH 2026
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20 space-y-12">
        {/* Title Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-primary text-xs font-sans tabular-nums tracking-normal">
            <Scale className="w-3.5 h-3.5" />
            <span>DECENTRALIZED PROTOCOL AGREEMENT</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Terms of Service
          </h1>
          <p className="text-lg text-outline leading-relaxed max-w-2xl">
            Please review these Terms carefully before accessing or using the ZkPay decentralized interface,
            smart contracts, Pay Link APIs, or associated services.
          </p>
        </div>

        {/* Key Highlights Bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5  space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Coins className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">1% Transparent Fee</h3>
            <p className="text-xs text-outline leading-relaxed">
              ZkPay assesses a clear 100 basis point (1%) convenience fee on settled transaction volume. Zero hidden spreads or markup fees.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5  space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">P2P Settlement Routing</h3>
            <p className="text-xs text-outline leading-relaxed">
              Offramp orders are matched with independent liquidity merchants on the P2P.me decentralized Diamond protocol on Base.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5  space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">Blockchain Finality</h3>
            <p className="text-xs text-outline leading-relaxed">
              Transactions executed on the blockchain are irreversible once confirmed. Users are strictly responsible for verifying recipient UPI details.
            </p>
          </div>
        </div>

        {/* Terms Detailed Content */}
        <div className="space-y-10 text-on-surface-variant text-sm md:text-base leading-relaxed border-t border-white/5 pt-10">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">01.</span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing, browsing, connecting a Web3 wallet, scanning QR codes, or creating Pay Links via ZkPay (the &ldquo;Interface&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, you must immediately discontinue use of the Interface.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">02.</span>
              Nature of the Service & Non-Custodial Architecture
            </h2>
            <p>
              ZkPay operates solely as a software interface connecting users to open-source, decentralized smart contracts deployed on the Base network (Ethereum Layer 2) and peer-to-peer liquidity networks:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs md:text-sm text-outline pl-2">
              <li>
                <strong className="text-white">Not a Bank or Custodian:</strong> ZkPay is not a depository bank, money services business (MSB), or custodial escrow agent. We never hold, transmit, or custody your crypto or fiat assets.
              </li>
              <li>
                <strong className="text-white">Peer-to-Peer Counterparty Model:</strong> When executing a scan-and-pay order, your USDC is locked into the protocol escrow contract, and an independent third-party merchant sends local fiat (UPI / IMPS / Bank Transfer) directly to the recipient.
              </li>
              <li>
                <strong className="text-white">Encrypted Messaging:</strong> Payout destination details are encrypted end-to-end via ECIES so only the matched merchant can decrypt the payout destination.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">03.</span>
              Transaction Limits & Slippage Protection
            </h2>
            <p>
              To ensure system integrity and decentralized compliance:
            </p>
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-sm">Baseline Non-KYC Floor</h4>
                <p className="text-xs text-outline">
                  Unverified wallets operate under the protocol&apos;s standard per-transaction limit floor ($100 USDC baseline for India / INR). Transactions exceeding this limit require zkKYC reputation credentials.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <h4 className="font-bold text-white text-sm">Slippage Guard Math</h4>
                <p className="text-xs text-outline">
                  Every offramp order includes a mandatory on-chain slippage limit (`fiatAmountLimit = (usdcAmount * sellPrice) / 1e6`). If on-chain market prices shift before contract inclusion, the transaction reverts to prevent underselling.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">04.</span>
              Platform Fees & Gas Costs
            </h2>
            <p>
              By using ZkPay, you acknowledge the following fee schedule:
            </p>
            <ul className="list-disc list-inside space-y-2 text-xs md:text-sm text-outline pl-2">
              <li>
                <strong className="text-white">ZkPay Platform Fee:</strong> A 1% convenience fee (100 basis points) is assessed on the principal USDC amount and automatically routed to the ZkPay Treasury contract (`0xb856...fbe2`).
              </li>
              <li>
                <strong className="text-white">Network Gas Fees:</strong> Transactions on Base require negligible gas (typically &lt;$0.01 in ETH). Users are responsible for maintaining sufficient gas balance for EOA interactions unless using sponsored paymaster flows.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3 min-w-0 break-words" style={{ overflowWrap: "break-word", minWidth: 0 }}>
              <span className="font-sans tabular-nums text-sm text-primary">05.</span>
              User Duties &amp; Prohibited Uses
            </h2>
            <p>
              You represent and warrant that:
            </p>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2 text-xs md:text-sm text-outline">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>You will provide accurate, valid recipient UPI IDs and verify merchant destination details prior to signing.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>You will not use ZkPay for illegal gambling, sanctions evasion, money laundering, ransomware payments, or fraudulent activities.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>You are not located in, or a citizen of, any jurisdiction subject to comprehensive international sanctions (e.g., OFAC restricted territories).</span>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">06.</span>
              Disclaimer of Warranties & Limitation of Liability
            </h2>
            <div className="p-5 rounded-2xl bg-error-container/20 border border-error/20 space-y-3">
              <div className="flex items-center gap-2 text-error">
                <ShieldAlert className="w-5 h-5" />
                <span className="font-bold text-xs font-sans tabular-nums  tracking-normal">IMPORTANT RISK NOTICE</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                THE INTERFACE AND PROTOCOL ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND. ZKPAY DISCLAIMS ALL LIABILITY FOR BLOCKCHAIN REORGANIZATIONS, THIRD-PARTY LIQUIDITY MERCHANT DELAYS, BANK NETWORK DOWNTIME (SUCH AS NPCI / UPI OUTAGES), INCORRECTLY ENTERED DESTINATION ADDRESSES, OR LOSS OF WALLET CREDENTIALS. IN NO EVENT SHALL ZKPAY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL LOSSES.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3">
              <span className="font-sans tabular-nums text-sm text-primary">07.</span>
              Modifications to Terms
            </h2>
            <p>
              We reserve the right to update these Terms at any time. Any changes will be posted directly to this page with an updated timestamp. Continued use of the Interface after revisions constitutes acceptance of the modified Terms.
            </p>
          </section>
        </div>

        {/* Footer Note */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs font-sans tabular-nums text-outline gap-4">
          <span>ZkPay Protocol • Base Mainnet</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">
              PRIVACY POLICY
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
