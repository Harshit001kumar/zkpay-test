"use client";

import { useState } from "react";
import { ENDPOINTS, Endpoint } from "./endpointsData";

export default function DocsPage() {
  const [selectedLang, setSelectedLang] = useState<"curl" | "js" | "python" | "telegram">("curl");
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);

  const SWAP_API_PROMPT = `# ZkPay Swap API — Integration Context for AI Agents (v2 USD Partner Ledger)

You are helping a developer integrate or upgrade to ZkPay's cross-chain Swap API. This API enables non-custodial crypto-to-crypto swaps across 9 supported blockchains (Bitcoin, Ethereum, Base, Polygon, Solana, Arbitrum, BSC, Tron, Litecoin) with an automated 50/50 USD revenue share for partners.

Base URL: https://zkpay.top
Supported Chains: btc, eth, base, polygon, sol, arb, bsc, tron, ltc

## Authentication (REQUIRED for Partner Fee Share)
- Pass your API key via \`X-API-Key: zkpay_live_...\` header (or \`Authorization: Bearer zkpay_live_...\`) on \`/api/v1/swap/create\` and \`/api/v1/swap/quote\`.
- Get your key at https://zkpay.top/partner (or Profile → Merchant & Bot API Keys)
- Manage your swaps, USD fee credits, and crypto payouts at https://zkpay.top/partner

## KEY FEATURES FOR PARTNERS
1. **No \`feeRecipient\` Required**: You do not need to pass or manage per-chain \`feeRecipient\` addresses (e.g. separate Solana, Litecoin, and EVM wallets). Simply authenticate with your \`X-API-Key\` header and your 50% fee share is automatically attributed to your Partner account across all supported chains.
2. **Single-Transfer Deposit**: Users send 100% of their deposit to a single deposit address (\`order.deposit.address\`). On-chain, 100% of the platform fee is swept in a single transfer to the ZkPay Treasury and the net amount is forwarded to solvers.
3. **Live USD Fee Credit on Settlement**: As soon as the swap settles (\`status === "settled"\`), your 50% partner fee share is converted to USD at the live CoinGecko rate and credited to your Partner Portal balance. Background daemons track settlement automatically even if the client stops polling.
4. **Flexible Crypto Withdrawals ($1.00 Minimum)**: Withdraw your USD balance anytime (minimum $1.00 USD) from https://zkpay.top/partner in **USDC (Base)**, **USDT (Polygon)**, **SOL (Solana)**, or **LTC (Litecoin)**.

## Supported Chains for 50/50 Partner Fee Share
- **Fee-Share Enabled Chains**: Base ('base' - ETH, USDC, USDT), Polygon ('polygon' - POL, USDT, USDC), Solana ('sol' - Native SOL), Litecoin ('ltc' - Native LTC), Arbitrum ('arb' - ETH), and BSC ('bsc' - BNB).
  - Single-Transfer: Users send 100% of funds to ONE single deposit address (\`order.deposit.address\`).
  - Stablecoins (Base/Polygon USDC & USDT): All fees and transfers are settled strictly out of the deposited token balance with zero native gas required from the user.
- **0% Fee Direct Routes (High Gas Networks)**:
  - Ethereum Mainnet ('eth'), Bitcoin ('btc'), Tron ('tron'), and non-native SPL/ERC-20 tokens route directly to solvers with 0% platform fee (\`isDirectRoute: true\`) to protect users from high network transaction costs.

## Endpoints

### 1. GET /api/v1/swap/tokens?chain={chain}
Lists all supported tokens. Filter by chain: base, sol, eth, btc, tron, arb, bsc, ltc, polygon.
Rate limit: 60 req/min (IP) · 300 req/min (API Key)

Response:
{
  "success": true,
  "count": 17,
  "tokens": [
    { "assetId": "nep141:sol.omft.near", "symbol": "SOL", "name": "Solana", "blockchain": "sol", "decimals": 9 },
    { "assetId": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", "symbol": "USDC", "name": "USDC (Base)", "blockchain": "base", "decimals": 6 },
    { "assetId": "nep141:btc.omft.near", "symbol": "BTC", "name": "Bitcoin", "blockchain": "btc", "decimals": 8 }
  ]
}

### 2. GET /api/v1/swap/quote?fromAsset={}&toAsset={}&amount={}&chain={}&destinationChain={}
Preview swap pricing, 50/50 partner fee breakdown, and execution plan. Dry run — no funds committed.
Pass \`X-API-Key\` header so the quote reflects your 50/50 partner split.
Rate limit: 30 req/min (IP) · 120 req/min (API Key)

Query params:
- fromAsset (required): Token symbol like "SOL", "ETH", "LTC", "USDC"
- toAsset (optional): Destination token symbol like "USDC", "SOL". Defaults to Base USDC if omitted.
- amount (required): Integer string in ATOMIC UNITS (see conversion table below)
- chain (optional): Source chain e.g. "sol", "base", "polygon", "ltc", "arb", "bsc", "eth", "btc"
- destinationChain (optional): Target chain e.g. "base", "sol", "polygon". Defaults to Base if omitted.
- totalFeeBps (optional): Total custom fee in bps (range: 20–450 bps, default 200 = 2.00%, split 50/50 between Partner and ZkPay).
- slippageBps (optional): Slippage tolerance in bps (range: 10–500 bps, default 100 = 1.00%).

### 3. POST /api/v1/swap/create
Generate a single-use deposit address and lock a quote for cross-chain execution.
Rate limit: 20 req/min (IP) · 100 req/min (API Key)

Request body:
{
  "fromAsset": "SOL",
  "chain": "sol",
  "toAsset": "USDC",
  "destinationChain": "base",
  "amount": "1000000000",
  "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "refundTo": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  "totalFeeBps": 200,
  "slippageBps": 100
}

### 4. GET /api/v1/swap/status?depositAddress={address}
Poll real-time swap execution status.
Rate limit: 60 req/min (IP) · 240 req/min (API Key)
Statuses: pending → processing → settled / failed / refunded

## CRITICAL: Atomic Units Conversion Table
ALL amounts MUST be integer strings in atomic/base units. NEVER pass decimals like "0.01".

| Asset | Chain            | Decimals | 1 Token (Atomic)     | ~$0.05 Minimum        |
|-------|------------------|----------|----------------------|-----------------------|
| SOL   | sol              | 9        | 1000000000           | 250000 (~0.00025 SOL) |
| USDC  | base/eth/sol/arb | 6        | 1000000              | 50000 ($0.05 USDC)    |
| USDT  | eth/sol/tron/pol | 6        | 1000000              | 50000 ($0.05 USDT)    |
| BTC   | btc              | 8        | 100000000            | 50 (~0.0000005 BTC)   |
| ETH   | eth/base/arb     | 18       | 1000000000000000000  | 20000000000000        |
| BNB   | bsc              | 18       | 1000000000000000000  | 80000000000000        |
| LTC   | ltc              | 8        | 100000000            | 50000 (~0.0005 LTC)   |
| TRX   | tron             | 6        | 1000000              | 300000 (~0.3 TRX)     |

## Webhook Events (Swap)
If you provided a webhookUrl, you'll receive these events with HMAC SHA-256 signatures:
- swap.deposit_detected — Deposit observed on origin chain
- swap.settled — Swap fulfilled, tokens delivered to recipient
- swap.failed — Swap could not be filled by solvers
- swap.refunded — Deposit refunded to refundTo address`;

  const copyPrompt = () => {
    navigator.clipboard.writeText(SWAP_API_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const endpoint = ENDPOINTS[activeTab] || ENDPOINTS[0];

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getCodeSnippet = (ep: Endpoint, lang: "curl" | "js" | "python" | "telegram") => {
    return ep.codeExamples[lang];
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans selection:bg-primary selection:text-surface">
      <div className="max-w-[1440px] mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Global Nav Bar */}
        <div className="flex items-center justify-between pb-8 mb-12 border-b border-white/10">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xl font-bold tracking-tight text-on-surface hover:opacity-90">
              <span className="text-primary">Zk</span>Pay
            </a>
            <div className="h-4 w-px bg-white/15" />
            <span className="font-label-caps text-[10px] text-primary tracking-normal font-bold">
              SWAP ENGINE &amp; DEVELOPER API
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/partner"
              className="flex items-center gap-1.5 text-xs font-label-caps text-primary hover:opacity-80 tracking-normal font-bold transition-opacity"
            >
              <span>PARTNER PORTAL</span>
            </a>
            <a
              href="/"
              className="flex items-center gap-2 text-xs font-label-caps text-on-surface-variant hover:text-on-surface tracking-normal transition-colors"
            >
              <span>WEB SWAP</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </a>
          </div>
        </div>

        {/* Hero Section */}
        <section className="mb-12">
          <div className="bg-white/5 border border-white/15 rounded-xl p-8 md:p-12 relative overflow-hidden shadow-elevated">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                  SWAP API SPECIFICATION V1.0
                </span>
                <div className="h-px w-8 bg-white/20" />
              </div>

              <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-on-surface mb-4">
                Cross-Chain <span className="text-primary">Swap API</span>
              </h1>
              <p className="text-sm md:text-base text-on-surface-variant max-w-2xl font-body-lg mb-8">
                Power instant non-custodial token swaps across 9 blockchains inside your Telegram bot, Discord bot, wallet, or DApp, and earn an automated 50/50 USD revenue split on every settled swap.
              </p>

              {/* Status Chips */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-12 pt-6 border-t border-white/10">
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">SUPPORTED CHAINS</span>
                  <span className="font-body-md font-medium text-primary">BTC, ETH, SOL, Base, Polygon, Arb, BSC, Tron, LTC</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">SUPPORTED ASSETS</span>
                  <span className="font-body-md font-medium text-on-surface">17 Curated Tokens</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">PARTNER FEE SHARE</span>
                  <span className="font-body-md font-medium text-success">50/50 Live USD Credit</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">MIN PAYOUT</span>
                  <span className="font-body-md font-medium text-on-surface">$1.00 USD (USDC / USDT / SOL / LTC)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication Section */}
        <section className="mb-12">
          <div className="bg-white/5 border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                AUTHENTICATION &amp; API KEYS
              </span>
              <div className="h-px w-8 bg-white/20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-on-surface mb-4">
              Getting Your Partner API Key
            </h2>
            <p className="text-sm text-on-surface-variant max-w-2xl mb-6">
              Pass your API key via the <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">X-API-Key</code> header or <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">Authorization: Bearer</code> header on <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">/api/v1/swap/quote</code> and <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">/api/v1/swap/create</code> to enable higher rate limits and automatic 50/50 partner revenue attribution.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">1</div>
                <p className="font-medium text-sm text-on-surface">Sign In</p>
                <p className="text-xs text-outline">Sign in at <a href="/partner" className="text-primary hover:underline">zkpay.top/partner</a> or via the Profile tab.</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">2</div>
                <p className="font-medium text-sm text-on-surface">Generate API Key</p>
                <p className="text-xs text-outline">Create a key in <strong className="text-white">Developer &amp; Bot API Keys</strong> with a custom label.</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">3</div>
                <p className="font-medium text-sm text-on-surface">Earn 50% Revenue Share</p>
                <p className="text-xs text-outline">Pass <code className="text-primary">X-API-Key</code> on swap requests and withdraw earnings in crypto anytime.</p>
              </div>
            </div>

            <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-sans tabular-nums text-xs text-primary overflow-x-auto">
              <pre>{`curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{"fromAsset":"SOL","chain":"sol","toAsset":"USDC","destinationChain":"base","amount":"1000000000","recipient":"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"}'`}</pre>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-success/10 border border-success/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-success">Track All Swap Orders &amp; USD Earnings Live</p>
                <p className="text-[11px] text-outline">Monitor settled swaps, live USD fee credits, and request instant crypto payouts from the Partner Portal.</p>
              </div>
              <a href="/partner" className="px-3 py-1.5 rounded-lg bg-success/20 hover:bg-success/30 text-success text-xs font-sans tabular-nums font-bold transition-colors shrink-0">
                Open Partner Console
              </a>
            </div>
          </div>
        </section>

        {/* AI Agent Prompt Section */}
        <section className="mb-12">
          <div className="bg-white/5 border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                AI AGENT CONTEXT
              </span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-[9px] font-label-caps text-outline tracking-normal bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                ONE-CLICK LLM CONTEXT
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-on-surface mb-3">
              Master Prompt for AI Coding Agents
            </h2>
            <p className="text-sm text-on-surface-variant max-w-3xl mb-8 leading-relaxed">
              Copy this context prompt and paste it into any AI coding assistant (ChatGPT, Claude, Cursor, Copilot, Windsurf) to give it complete knowledge of the ZkPay Cross-Chain Swap API, atomic unit conversions, 50/50 partner revenue share, and webhook verification.
            </p>

            <div className="bg-black/30 rounded-xl border border-white/10 p-6 space-y-5 hover:border-white/20 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-lg">swap_horiz</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-on-surface">Cross-Chain Swap API Master Prompt</h3>
                    <p className="text-[11px] text-outline font-sans tabular-nums">9 blockchains, 17 tokens, 50/50 USD partner ledger, atomic units reference</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPromptExpanded(!promptExpanded)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-label-caps text-on-surface-variant tracking-normal transition-colors"
                  >
                    {promptExpanded ? "HIDE PREVIEW" : "PREVIEW PROMPT"}
                  </button>
                  <button
                    onClick={copyPrompt}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-label-caps text-[10px] tracking-normal font-bold transition-colors duration-300 ${
                      promptCopied
                        ? "bg-success/20 text-success border border-success/30"
                        : "bg-primary text-surface hover:bg-accent-hi active:scale-[0.98]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {promptCopied ? "check_circle" : "content_copy"}
                    </span>
                    <span>{promptCopied ? "COPIED!" : "COPY SWAP API PROMPT"}</span>
                  </button>
                </div>
              </div>

              {promptExpanded && (
                <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-4 font-sans tabular-nums text-[10px] text-primary max-h-[360px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap leading-relaxed">{SWAP_API_PROMPT}</pre>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Swap API Fee Split Section */}
        <section className="mb-12">
          <div className="bg-white/5 border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                SWAP API: 50/50 USD PARTNER REVENUE SHARE
              </span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-[9px] font-label-caps text-success tracking-normal bg-success/10 px-2.5 py-1 rounded-md border border-success/20">
                V2 USD LEDGER
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-on-surface mb-4">
              Automated 50/50 USD Fee Share on Every Settled Swap
            </h2>
            <p className="text-sm text-on-surface-variant max-w-3xl mb-6 leading-relaxed">
              Embed multi-chain crypto-to-crypto token swaps (BTC, ETH, SOL, LTC, USDT, USDC across 9 blockchains) into your app or bot.
              Simply pass your <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">X-API-Key</code> header on <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">/api/v1/swap/quote</code> and <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">/api/v1/swap/create</code>.
              On-chain, 100% of the platform fee is swept in a single transfer to the ZkPay Treasury, and as soon as the swap settles, <strong className="text-primary">50% of the custom fee is converted to USD at the live CoinGecko rate</strong> and credited to your <a href="/partner" className="text-primary underline hover:opacity-80">Partner Portal</a> balance. Withdraw anytime (<strong className="text-success">$1.00 USD minimum</strong>) in <strong className="text-white">USDC (Base)</strong>, <strong className="text-white">USDT (Polygon)</strong>, <strong className="text-white">SOL</strong>, or <strong className="text-white">LTC</strong>.
            </p>

            {/* Fee Breakdown Table */}
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/15">
                    <th className="font-label-caps text-[9px] text-on-surface-variant tracking-normal pb-3 pr-4">ROUTE / COMPONENT</th>
                    <th className="font-label-caps text-[9px] text-on-surface-variant tracking-normal pb-3 pr-4">BPS</th>
                    <th className="font-label-caps text-[9px] text-on-surface-variant tracking-normal pb-3 pr-4">% RATE</th>
                    <th className="font-label-caps text-[9px] text-on-surface-variant tracking-normal pb-3 pr-4">ON $1,000</th>
                    <th className="font-label-caps text-[9px] text-on-surface-variant tracking-normal pb-3">SETTLEMENT &amp; RECIPIENT</th>
                  </tr>
                </thead>
                <tbody className="text-on-surface">
                  <tr className="bg-white/[0.03]">
                    <td colSpan={5} className="py-2.5 px-3 text-[10px] font-sans tabular-nums font-bold text-primary tracking-normal">
                      Fee-Share Enabled Crypto (Base, Polygon, Arbitrum, BSC, Solana SOL, Litecoin LTC)
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-primary font-medium pl-3">Your Partner Share (50%)</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-primary">50</td>
                    <td className="py-3 pr-4 text-primary">0.50%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-primary">$5.00</td>
                    <td className="py-3 text-primary">Credited in USD at live CoinGecko rate upon swap settlement ($1.00 min withdrawal)</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 pl-3">ZkPay Treasury Share (50%)</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">50</td>
                    <td className="py-3 pr-4">0.50%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">$5.00</td>
                    <td className="py-3 text-outline">Swept on-chain in origin token → ZkPay Treasury</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-outline pl-3">Network Protocol Fee</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">25</td>
                    <td className="py-3 pr-4">0.25%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">$2.50</td>
                    <td className="py-3 text-outline">Solvers</td>
                  </tr>
                  <tr className="bg-white/5 font-medium">
                    <td className="py-3 pr-4 pl-3">Net User Receives</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">N/A</td>
                    <td className="py-3 pr-4">98.75%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">$987.50</td>
                    <td className="py-3">User Destination Recipient Wallet</td>
                  </tr>
                  <tr className="bg-white/[0.03]">
                    <td colSpan={5} className="py-2.5 px-3 text-[10px] font-sans tabular-nums font-bold text-warning tracking-normal">
                      0% Fee Direct Routes (High Gas Networks: Ethereum Mainnet, Bitcoin &amp; Tron)
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-outline pl-3">Platform Fee (ETH/BTC/TRX)</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-success">0</td>
                    <td className="py-3 pr-4 text-success">0.00%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-success">$0.00</td>
                    <td className="py-3 text-success">0% fee: Routes directly to solvers to save user gas</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold">USD PARTNER LEDGER</span>
                <p className="text-sm font-medium text-on-surface">Live USD Conversion on Settlement</p>
                <p className="text-xs text-outline">50% fee share converted at live CoinGecko rate once settled</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-success tracking-normal font-bold">FLEXIBLE PAYOUTS</span>
                <p className="text-sm font-medium text-success">$1.00 Minimum Withdrawal</p>
                <p className="text-xs text-outline">Withdraw in USDC (Base), USDT (Polygon), SOL, or LTC</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold">CUSTOMIZABLE BPS</span>
                <p className="text-sm font-medium text-on-surface">20 to 450 bps (0.20% – 4.50%)</p>
                <p className="text-xs text-outline">Default 200 bps (2.00%), split 50/50 with partner</p>
              </div>
            </div>
          </div>

          {/* Atomic Units & Multi-Chain Disambiguation Guide */}
          <div className="mt-6 bg-warning/10 border border-warning/20 rounded-xl p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-warning text-lg">info</span>
              <h3 className="text-sm font-bold text-warning font-label-caps tracking-normal">
                CRITICAL INTEGRATION RULES: ATOMIC UNITS &amp; MULTI-CHAIN TOKENS
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-white">1. Atomic Units Required:</strong> All swap endpoints (<code className="text-warning font-sans tabular-nums">/swap/quote</code> and <code className="text-warning font-sans tabular-nums">/swap/create</code>) require <code className="text-warning font-sans tabular-nums">amount</code> in raw base/atomic integer units. Never pass human decimals (e.g. <code className="text-error">&quot;1.5&quot;</code> or <code className="text-error">&quot;0.5&quot;</code>).
            </p>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-white">2. Multi-Chain Disambiguation:</strong> Tokens like <code className="text-primary font-sans tabular-nums">USDC</code> and <code className="text-primary font-sans tabular-nums">USDT</code> exist across multiple blockchains. Pass both <code className="text-primary font-sans tabular-nums">chain</code> and <code className="text-primary font-sans tabular-nums">destinationChain</code> (e.g. <code className="text-white font-sans tabular-nums">chain: &quot;sol&quot;</code>, <code className="text-white font-sans tabular-nums">destinationChain: &quot;base&quot;</code>) to specify exact networks.
            </p>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-white">3. Flexible Inputs (FLEX_INPUT):</strong> All swaps execute with <code className="text-primary font-sans tabular-nums">swapType: &quot;FLEX_INPUT&quot;</code> by default. Users can send any amount equal to or greater than the solver minimum to the deposit address, and the solver fulfills the trade proportionally based on the amount actually received.
            </p>

            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left font-sans tabular-nums text-[11px] text-on-surface-variant border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-outline text-[10px] tracking-normal">
                    <th className="py-2 pr-4 font-bold">Asset</th>
                    <th className="py-2 pr-4 font-bold">Chain</th>
                    <th className="py-2 pr-4 font-bold">Decimals</th>
                    <th className="py-2 pr-4 font-bold">1 Token (Atomic Units)</th>
                    <th className="py-2 font-bold">Min Solver Trade (~$0.05 USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">SOL</td>
                    <td className="py-2 pr-4 text-primary">sol</td>
                    <td className="py-2 pr-4">9</td>
                    <td className="py-2 pr-4 text-warning">1000000000</td>
                    <td className="py-2">250000 (~0.00025 SOL)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">USDC</td>
                    <td className="py-2 pr-4 text-primary">base / eth / sol / arb / polygon</td>
                    <td className="py-2 pr-4">6</td>
                    <td className="py-2 pr-4 text-warning">1000000</td>
                    <td className="py-2">50000 ($0.05 USDC)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">USDT</td>
                    <td className="py-2 pr-4 text-primary">base / polygon / eth / sol / tron</td>
                    <td className="py-2 pr-4">6</td>
                    <td className="py-2 pr-4 text-warning">1000000</td>
                    <td className="py-2">50000 ($0.05 USDT)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">BTC</td>
                    <td className="py-2 pr-4 text-primary">btc</td>
                    <td className="py-2 pr-4">8</td>
                    <td className="py-2 pr-4 text-warning">100000000</td>
                    <td className="py-2">50 (~0.0000005 BTC)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">ETH</td>
                    <td className="py-2 pr-4 text-primary">eth / base / arb</td>
                    <td className="py-2 pr-4">18</td>
                    <td className="py-2 pr-4 text-warning">1000000000000000000</td>
                    <td className="py-2">20000000000000 (~0.00002 ETH)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">LTC</td>
                    <td className="py-2 pr-4 text-primary">ltc</td>
                    <td className="py-2 pr-4">8</td>
                    <td className="py-2 pr-4 text-warning">100000000</td>
                    <td className="py-2">50000 (~0.0005 LTC)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 2-Column API Explorer */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Endpoints Navigation */}
          <div className="lg:col-span-4 space-y-3">
            <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2 px-1">
              SWAP API ENDPOINTS (V1)
            </span>

            {ENDPOINTS.map((ep, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`w-full text-left p-4 rounded-xl transition-colors border ${
                  activeTab === idx
                    ? "bg-white/10 border-primary/50 shadow-card"
                    : "bg-white/5 border-white/10 hover:bg-white/[0.08] text-on-surface-variant"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[9px] font-label-caps font-bold px-2 py-0.5 rounded ${
                      ep.method === "GET"
                        ? "bg-white/10 text-primary border border-primary/30"
                        : "bg-primary text-surface font-bold"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-xs font-sans tabular-nums text-on-surface truncate">{ep.path.split("?")[0]}</span>
                </div>
                <p className="text-xs font-medium text-on-surface truncate">{ep.title}</p>
                {ep.rateLimit && (
                  <p className="text-[9px] text-outline mt-1 font-sans tabular-nums">{ep.rateLimit}</p>
                )}
              </button>
            ))}

            <div className="mt-8 p-5 rounded-xl bg-white/5 border border-white/15">
              <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2">
                5-STEP SWAP FLOW
              </span>
              <div className="text-xs text-on-surface-variant leading-relaxed space-y-2">
                <p><strong className="text-on-surface">1.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/tokens</code> to list supported assets</p>
                <p><strong className="text-on-surface">2.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/quote</code> to preview rate &amp; 50/50 split</p>
                <p><strong className="text-on-surface">3.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/create</code> to get deposit address</p>
                <p><strong className="text-on-surface">4.</strong> User deposits on source chain</p>
                <p><strong className="text-on-surface">5.</strong> Poll <code className="text-primary bg-white/5 px-1 rounded">/swap/status</code> until settled</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Code & Response Viewer */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5 border border-white/15 rounded-xl p-6 md:p-8 shadow-elevated">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`text-[10px] font-label-caps font-bold px-2.5 py-1 rounded ${
                    endpoint.method === "GET"
                      ? "bg-white/10 text-primary border border-primary/30"
                      : "bg-primary text-surface font-bold"
                  }`}
                >
                  {endpoint.method}
                </span>
                <span className="text-sm md:text-base font-sans tabular-nums text-on-surface font-semibold truncate">
                  https://zkpay.top{endpoint.path}
                </span>
              </div>

              <h2 className="text-2xl font-medium tracking-tight text-on-surface mb-2">
                {endpoint.title}
              </h2>
              {endpoint.rateLimit && (
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <span className="material-symbols-outlined text-primary text-sm">speed</span>
                  <span className="text-[10px] font-label-caps text-on-surface-variant tracking-normal">
                    RATE LIMIT: {endpoint.rateLimit}
                  </span>
                </div>
              )}
              <p className="text-xs md:text-sm text-on-surface-variant mb-6 leading-relaxed font-body-md">
                {endpoint.description}
              </p>

              {/* Request Parameters & Headers Reference */}
              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-label-caps text-[10px] text-primary tracking-normal font-bold">
                      REQUEST PARAMETERS &amp; HEADERS
                    </span>
                    <span className="text-[9px] font-sans tabular-nums text-outline bg-white/5 px-2 py-0.5 rounded border border-white/10">
                      {endpoint.parameters.length} parameters
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                    <table className="w-full text-left font-sans tabular-nums text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-outline text-[10px] tracking-normal bg-white/[0.02]">
                          <th className="py-2.5 px-4 font-bold">Parameter</th>
                          <th className="py-2.5 px-3 font-bold">Type</th>
                          <th className="py-2.5 px-3 font-bold">Location</th>
                          <th className="py-2.5 px-3 font-bold">Requirement</th>
                          <th className="py-2.5 px-4 font-bold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-on-surface-variant">
                        {endpoint.parameters.map((p) => (
                          <tr key={p.name} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-4 text-white font-bold">{p.name}</td>
                            <td className="py-2.5 px-3 text-primary text-[11px]">{p.type}</td>
                            <td className="py-2.5 px-3 text-[10px] tracking-normal text-outline">{p.location}</td>
                            <td className="py-2.5 px-3">
                              {p.required ? (
                                <span className="text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  REQUIRED
                                </span>
                              ) : (
                                <span className="text-outline bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[9px]">
                                  OPTIONAL
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs font-sans text-on-surface-variant leading-relaxed">
                              {p.description}
                              {p.example && (
                                <span className="block font-sans tabular-nums text-[10px] text-outline mt-0.5">
                                  Example: <code className="text-primary">{p.example}</code>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Language Selector Bar */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  {(["curl", "js", "python", "telegram"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`text-[10px] font-label-caps tracking-normal px-3 py-1.5 rounded-lg transition-colors ${
                        selectedLang === lang
                          ? "bg-on-surface text-surface font-bold"
                          : "bg-white/5 text-on-surface-variant hover:text-white"
                      }`}
                    >
                      {lang === "curl"
                        ? "cURL"
                        : lang === "js"
                        ? "JavaScript"
                        : lang === "python"
                        ? "Python"
                        : "Telegram Bot"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() =>
                    copyCode(getCodeSnippet(endpoint, selectedLang), `code-${activeTab}`)
                  }
                  className="flex items-center gap-1.5 text-xs font-label-caps text-on-surface-variant hover:text-on-surface tracking-normal transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    {copied === `code-${activeTab}` ? "check" : "content_copy"}
                  </span>
                  <span>{copied === `code-${activeTab}` ? "COPIED" : "COPY"}</span>
                </button>
              </div>

              {/* Request Code Box */}
              <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-5 font-sans tabular-nums text-xs text-primary overflow-x-auto mb-8">
                <pre>{getCodeSnippet(endpoint, selectedLang)}</pre>
              </div>

              {/* Response Code Box */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">
                    SAMPLE RESPONSE (200 OK)
                  </span>
                  <button
                    onClick={() =>
                      copyCode(JSON.stringify(endpoint.response, null, 2), `res-${activeTab}`)
                    }
                    className="flex items-center gap-1.5 text-xs font-label-caps text-outline hover:text-on-surface tracking-normal transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copied === `res-${activeTab}` ? "check" : "content_copy"}
                    </span>
                    <span>{copied === `res-${activeTab}` ? "COPIED" : "COPY"}</span>
                  </button>
                </div>
                <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-5 font-sans tabular-nums text-xs text-on-surface overflow-x-auto">
                  <pre>{JSON.stringify(endpoint.response, null, 2)}</pre>
                </div>
              </div>
            </div>

            {/* Webhook HMAC Security & Event Schema Section */}
            <div className="bg-white/5 border border-white/15 rounded-xl p-6 md:p-8 shadow-elevated space-y-6">
              <div>
                <div className="flex items-center gap-2 text-on-surface font-semibold text-base mb-2">
                  <span className="material-symbols-outlined text-primary">security</span>
                  <span className="font-label-caps text-[10px] text-primary tracking-normal font-bold">
                    WEBHOOK SECURITY &amp; HMAC SHA-256 VERIFICATION
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-3 font-body-md">
                  Every webhook event dispatched to your <code className="text-primary font-sans tabular-nums">webhookUrl</code> includes an <code className="text-primary font-sans tabular-nums">X-ZkPay-Signature</code> header formatted as <code className="text-primary font-sans tabular-nums">t=timestamp,v1=signature</code>.
                </p>
                <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-4 font-sans tabular-nums text-xs text-on-surface-variant overflow-x-auto">
                  <pre>{`// Verify X-ZkPay-Signature header in Node.js
const header = req.headers['x-zkpay-signature']; // "t=1727382000000,v1=abc123..."
const [tPart, vPart] = header.split(',');
const timestamp = tPart.split('=')[1];
const signature = vPart.split('=')[1];

const expected = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(\`\${timestamp}.\${rawBody}\`)
  .digest('hex');

const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));`}</pre>
                </div>
              </div>

              <div>
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2">
                  SWAP WEBHOOK EVENT TYPES
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans tabular-nums text-[11px] text-on-surface-variant border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-outline text-[10px] tracking-normal">
                        <th className="py-2 pr-4 font-bold">Event Name</th>
                        <th className="py-2 pr-4 font-bold">Category</th>
                        <th className="py-2 font-bold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <tr>
                        <td className="py-2 pr-4 text-primary font-bold">swap.deposit_detected</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Solver network observed deposit transaction on origin chain.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-success font-bold">swap.settled</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Swap fulfilled, destination tokens delivered to recipient, and 50% USD fee credited to Partner Portal.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-error font-bold">swap.failed</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Swap order could not be filled by solver network.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-warning font-bold">swap.refunded</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Incomplete or expired deposit refunded to origin chain refundTo address.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-sans tabular-nums text-outline">
          <p className="font-label-caps text-[9px] tracking-normal">
            ZKPAY SWAP ENGINE &amp; DEVELOPER PLATFORM • 9 BLOCKCHAINS
          </p>
          <div className="flex gap-6">
            <a href="/partner" className="hover:text-white transition-colors">
              PARTNER PORTAL
            </a>
            <a href="/privacy" className="hover:text-white transition-colors">
              PRIVACY POLICY
            </a>
            <a href="/terms" className="hover:text-white transition-colors">
              TERMS OF SERVICE
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
