"use client";

import { useState } from "react";
import { CHAIN } from "@/lib/constants";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  category: "payments" | "swap";
  rateLimit?: string;
  body?: Record<string, any>;
  response: Record<string, any>;
}

const ENDPOINTS: Endpoint[] = [
  // ── Payments API ──
  {
    method: "GET",
    path: "/api/v1/rates",
    title: "Live Exchange Rates",
    category: "payments",
    description: "Returns live on-chain exchange rates for all supported fiat currencies (INR, USD, EUR, GBP) queried directly from Base Mainnet.",
    response: {
      success: true,
      rates: {
        USDC_INR: { sell: 87.5, buy: 88.2, spread: 0.7, lastUpdated: 1755500000 },
        USDC_USD: { sell: 1.0, buy: 1.01, spread: 0.01, lastUpdated: 1755500000 },
      },
      network: "Base Mainnet",
      chainId: 8453,
    },
  },
  {
    method: "POST",
    path: "/api/v1/quotes",
    title: "Fee & Payout Calculator",
    category: "payments",
    description: "Computes exact USDC principal, 1% ZkPay fee, total required, and validates 100 USDC no-KYC tier limits.",
    body: {
      amount: 1000,
      currency: "INR",
    },
    response: {
      success: true,
      fiatAmount: "₹ 1,000.00",
      usdcPrincipal: "11.43",
      feeUsdc: "0.11",
      totalUsdc: "11.54",
      rate: "87.50",
      feeBps: 100,
      currency: "INR",
      withinNoKycLimit: true,
      expiresAt: 1755500300,
    },
  },
  {
    method: "POST",
    path: "/api/v1/paylinks",
    title: "Create Shareable Pay Link",
    category: "payments",
    description: "Generates a hosted payment URL with 1-click wallet connect and QR view.",
    body: {
      title: "Invoice #104 - Freelance Work",
      amountINR: 2500,
      recipientUpi: "merchant@okaxis",
      type: "one_time",
      webhookUrl: "https://mysite.com/api/zkpay-webhook",
    },
    response: {
      success: true,
      linkId: "pl_live_9a8f2c",
      payUrl: "https://zkpay.top/pay/pl_live_9a8f2c",
      amountINR: "₹ 2,500.00",
      estimatedUsdc: "28.57 USDC",
      status: "ACTIVE",
      qrCodeUrl: "https://api.qrserver.com/...",
    },
  },
  {
    method: "POST",
    path: "/api/v1/payin-sessions",
    title: "Dynamic Deposit Session (Bots)",
    category: "payments",
    description: "Generates a 30-minute unique Base deposit address for Telegram/Discord bots with automated on-chain listener.",
    body: {
      recipientUpi: "merchant@okaxis",
      amountINR: 500,
      webhookUrl: "https://my-bot.com/webhook",
    },
    response: {
      success: true,
      sessionId: "ses_live_8f7a2c9b1d",
      status: "AWAITING_PAYMENT",
      payinAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      network: "Base Mainnet",
      expectedAmountUsdc: "5.76",
      fiatAmount: "₹ 500.00",
      recipientUpi: "merchant@okaxis",
      expiresInSeconds: 1800,
      qrCodeUrl: "https://api.qrserver.com/...",
    },
  },
  {
    method: "GET",
    path: "/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d",
    title: "Check Session Status",
    category: "payments",
    description: "Actively checks on-chain USDC balance on Base Mainnet and updates session state upon deposit detection.",
    response: {
      success: true,
      sessionId: "ses_live_8f7a2c9b1d",
      status: "SETTLED",
      recipientUpi: "merchant@okaxis",
      fiatAmount: "₹ 500.00",
      receivedUsdc: "5.76 USDC",
      payinAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    },
  },
  // ── Swap API ──
  {
    method: "GET",
    path: "/api/v1/swap/tokens",
    title: "Supported Swap Tokens",
    category: "swap",
    rateLimit: "60 req/min (IP) · 300 req/min (API Key)",
    description: "Returns all supported input tokens across 8 blockchains (BTC, ETH, SOL, USDT, BNB, LTC, USDC variants). Filter by ?chain=base|sol|eth|btc|tron|arb|bsc.",
    response: {
      success: true,
      count: 10,
      tokens: [
        { assetId: "nep141:btc.omft.near", symbol: "BTC", name: "Bitcoin", blockchain: "btc", decimals: 8 },
        { assetId: "nep141:eth.omft.near", symbol: "ETH", name: "Ethereum", blockchain: "eth", decimals: 18 },
        { assetId: "nep141:sol.omft.near", symbol: "SOL", name: "Solana", blockchain: "sol", decimals: 9 },
      ],
    },
  },
  {
    method: "GET",
    path: "/api/v1/swap/quote?fromAsset=SOL&amount=1000000000",
    title: "Get Swap Quote (Dry Run)",
    category: "swap",
    rateLimit: "30 req/min (IP) · 120 req/min (API Key)",
    description: "Preview real-time swap pricing with transparent 50/50 fee breakdown. Supports GET query params or POST body. Add feeRecipient to enable partner revenue split.",
    response: {
      success: true,
      quote: {
        quoteId: "q_1727382000000",
        originAsset: "nep141:sol.omft.near",
        destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
        amountOutFormatted: "142.10",
        minAmountOut: "140680000",
        feeBreakdown: {
          nearIntentsProtocolFeeBps: 25,
          totalCustomFeeBps: 100,
          split: { zkpayFeeBps: 50, partnerFeeBps: 50, partnerFeeRecipient: "0xPartner..." },
          totalDeductionsBps: 125,
        },
        timeEstimateSeconds: 45,
      },
    },
  },
  {
    method: "POST",
    path: "/api/v1/swap/create",
    title: "Create Swap Order",
    category: "swap",
    rateLimit: "10 req/min (IP) · 60 req/min (API Key)",
    description: "Commits a cross-chain swap and generates a single-use deposit address. Fees are split 50/50 between ZkPay Treasury and your feeRecipient, settled atomically on-chain.",
    body: {
      fromAsset: "SOL",
      amount: "1000000000",
      recipient: "0xUserBaseAddress",
      feeRecipient: "0xPartnerPayoutAddress",
      totalFeeBps: 100,
    },
    response: {
      success: true,
      order: {
        swapId: "swp_1727382000000",
        status: "PENDING_DEPOSIT",
        deposit: {
          address: "6vN24xV8...SolanaDepositAddress",
          memo: null,
          amount: "1.0",
          deadline: "2026-09-27T00:15:00.000Z",
        },
        settlement: {
          recipient: "0xUserBaseAddress",
          estimatedAmountOut: "142.10",
          minAmountOut: "140.68",
          timeEstimateSeconds: 60,
        },
        feeSplit: {
          totalCustomFeeBps: 100,
          zkpayFeeBps: 50,
          partnerFeeBps: 50,
          partnerFeeRecipient: "0xPartnerPayoutAddress",
          nearIntentsProtocolFeeBps: 25,
          totalDeductionsBps: 125,
        },
      },
    },
  },
  {
    method: "GET",
    path: "/api/v1/swap/status?depositAddress=6vN24xV8...",
    title: "Track Swap Status",
    category: "swap",
    rateLimit: "60 req/min (IP) · 240 req/min (API Key)",
    description: "Polls real-time swap execution across source and destination chains. Returns mapped status: pending → processing → settled / failed / refunded.",
    response: {
      success: true,
      depositAddress: "6vN24xV8...SolanaDepositAddress",
      status: "settled",
      rawStatus: "SUCCESS",
      depositedAmount: "1.0 SOL",
      settledAmount: "142.12 USDC",
      destinationTxHash: "0x89c1...baseTxHash",
      destinationExplorerUrl: "https://basescan.org/tx/0x89c1...",
      updatedAt: "2026-09-27T00:02:15.000Z",
    },
  },
];

type ApiCategory = "payments" | "swap";

export default function DocsPage() {
  const [selectedLang, setSelectedLang] = useState<"curl" | "js" | "python" | "telegram">("curl");
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ApiCategory>("swap");

  const endpoint = ENDPOINTS[activeTab];

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getCodeSnippet = (ep: Endpoint, lang: "curl" | "js" | "python" | "telegram") => {
    const url = `https://zkpay.top${ep.path}`;

    if (lang === "curl") {
      if (ep.method === "GET") {
        return `curl -X GET "${url}" \\
  -H "Accept: application/json"`;
      }
      return `curl -X POST "${url}" \\
  -H "X-API-Key: YOUR_ZKPAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(ep.body, null, 2)}'`;
    }

    if (lang === "js") {
      if (ep.method === "GET") {
        return `const res = await fetch("${url}");
const data = await res.json();
console.log(data);`;
      }
      return `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  },
  body: JSON.stringify(${JSON.stringify(ep.body, null, 4)})
});
const data = await res.json();
console.log(data);`;
    }

    if (lang === "python") {
      if (ep.method === "GET") {
        return `import requests

res = requests.get("${url}")
print(res.json())`;
      }
      return `import requests

payload = ${JSON.stringify(ep.body, null, 4).replace(/true/g, "True").replace(/false/g, "False")}

headers = {
    "X-API-Key": "YOUR_ZKPAY_API_KEY",
    "Content-Type": "application/json"
}
res = requests.post("${url}", json=payload, headers=headers)
print(res.json())`;
    }

    if (lang === "telegram") {
      return `// Node.js Telegram Bot Example (telegraf)
bot.command('pay', async (ctx) => {
  const [amount, upiId] = ctx.message.text.split(' ').slice(1);
  
  const res = await fetch('https://zkpay.top/api/v1/payin-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientUpi: upiId,
      amountINR: Number(amount),
      webhookUrl: 'https://my-bot.com/zkpay-webhook'
    })
  });
  const data = await res.json();
  
  await ctx.replyWithPhoto(data.qrCodeUrl, {
    caption: \`💳 Send \${data.expectedAmountUsdc} USDC on Base to:\\n\` +
             \`\\\`\${data.payinAddress}\\\`\\n\\n\` +
             \`Settles ₹\${amount} to \${upiId} in under 3 mins.\`,
    parse_mode: 'Markdown'
  });
});`;
    }

    return "";
  };

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e2e3] font-sans selection:bg-[#c0c6de] selection:text-[#131315]">
      <div className="max-w-[1440px] mx-auto px-5 md:px-8 py-10 md:py-16">
        {/* Global Nav Bar */}
        <div className="flex items-center justify-between pb-8 mb-12 border-b border-white/10">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xl font-bold tracking-tight text-[#e5e2e3] hover:opacity-90">
              <span className="text-[#c0c6de]">Zk</span>Pay
            </a>
            <div className="h-4 w-px bg-white/15" />
            <span className="font-label-caps text-[10px] text-[#c0c6de] tracking-[0.25em] font-bold">
              DEVELOPER PLATFORM
            </span>
          </div>

          <a
            href="/"
            className="flex items-center gap-2 text-xs font-label-caps text-[#c6c6cd] hover:text-[#e5e2e3] tracking-[0.2em] transition-colors"
          >
            <span>DASHBOARD</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        </div>

        {/* Hero Section */}
        <section className="mb-12">
          <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-8 md:p-12 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                  API SPECIFICATION V1.0
                </span>
                <div className="h-px w-8 bg-white/20" />
              </div>

              <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-[#e5e2e3] mb-4">
                Crypto Payments <span className="text-[#c6c6cd]/50 font-extralight">&amp; Swap API</span>
              </h1>
              <p className="text-sm md:text-base text-[#c6c6cd] max-w-2xl font-body-lg mb-8">
                Accept crypto payments with instant fiat settlement, or embed our multi-chain Swap API to earn revenue on every trade. Route swaps across BTC, ETH, SOL, and 8+ blockchains with a built-in 50/50 fee split — you set the fee, we handle settlement.
              </p>

              {/* Status Chips */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-12 pt-6 border-t border-white/10">
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">NETWORK</span>
                  <span className="font-body-md font-medium text-[#e5e2e3]">{CHAIN.name} (8453)</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">SETTLEMENT ASSET</span>
                  <span className="font-body-md font-medium text-[#e5e2e3]">Native Base USDC</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">SWAP CHAINS</span>
                  <span className="font-body-md font-medium text-[#c0c6de]">BTC · ETH · SOL · Tron · BSC · Arb · Base</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">FEE SPLIT</span>
                  <span className="font-body-md font-medium text-[#c0c6de]">50/50 Partner + ZkPay Treasury</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Authentication Section */}
        <section className="mb-12">
          <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                AUTHENTICATION
              </span>
              <div className="h-px w-8 bg-white/20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-[#e5e2e3] mb-4">
              Getting Your API Key
            </h2>
            <p className="text-sm text-[#c6c6cd] max-w-2xl mb-6">
              All write endpoints (<code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">POST</code>, <code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">PATCH</code>) require an API key. Pass it via the <code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">x-api-key</code> header or <code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">Authorization: Bearer</code> header.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de] text-sm font-bold">1</div>
                <p className="font-medium text-sm text-[#e5e2e3]">Connect Wallet</p>
                <p className="text-xs text-[#909097]">Log in to ZkPay with your wallet at <a href="/" className="text-[#c0c6de] hover:underline">zkpay.top</a></p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de] text-sm font-bold">2</div>
                <p className="font-medium text-sm text-[#e5e2e3]">Open API Keys</p>
                <p className="text-xs text-[#909097]">Go to <strong className="text-white">Profile → Merchant & Bot API Keys</strong></p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#c0c6de]/10 border border-[#c0c6de]/30 flex items-center justify-center text-[#c0c6de] text-sm font-bold">3</div>
                <p className="font-medium text-sm text-[#e5e2e3]">Generate & Copy</p>
                <p className="text-xs text-[#909097]">Create a key with a label and copy the secret (shown only once).</p>
              </div>
            </div>

            <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-xs text-[#c0c6de] overflow-x-auto">
              <pre>{`curl -X POST "https://zkpay.top/api/v1/paylinks" \\
  -H "x-api-key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{"amountINR": 500, "recipientUpi": "merchant@okaxis"}'`}</pre>
            </div>
          </div>
        </section>

        {/* Swap API Fee Split Section */}
        <section className="mb-12">
          <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-8 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-[#c0c6de] text-[10px] tracking-[0.25em] font-bold">
                SWAP API — 50/50 FEE SPLIT
              </span>
              <div className="h-px w-8 bg-white/20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-[#e5e2e3] mb-4">
              Earn Revenue on Every Swap
            </h2>
            <p className="text-sm text-[#c6c6cd] max-w-3xl mb-8 leading-relaxed">
              Embed multi-chain token swaps (BTC, ETH, SOL, USDT, BNB → Base USDC) into your app or bot.
              You provide your payout address (<code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">feeRecipient</code>)
              and set the fee (<code className="text-[#c0c6de] bg-white/5 px-1.5 py-0.5 rounded">totalFeeBps</code>).
              The fee is split <strong className="text-[#e5e2e3]">50% to you</strong> and <strong className="text-[#e5e2e3]">50% to ZkPay</strong>,
              settled atomically on-chain by the NEAR Intents solver network.
            </p>

            {/* Fee Breakdown Table */}
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/15">
                    <th className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.2em] pb-3 pr-4">COMPONENT</th>
                    <th className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.2em] pb-3 pr-4">BPS</th>
                    <th className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.2em] pb-3 pr-4">% RATE</th>
                    <th className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.2em] pb-3 pr-4">ON $1,000</th>
                    <th className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.2em] pb-3">DESTINATION</th>
                  </tr>
                </thead>
                <tbody className="text-[#e5e2e3]">
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[#909097]">NEAR Intents Protocol</td>
                    <td className="py-3 pr-4 font-mono">25</td>
                    <td className="py-3 pr-4">0.25%</td>
                    <td className="py-3 pr-4 font-mono">$2.50</td>
                    <td className="py-3 text-[#909097]">Protocol Solvers</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[#c0c6de] font-medium">Your Partner Share</td>
                    <td className="py-3 pr-4 font-mono text-[#c0c6de]">50</td>
                    <td className="py-3 pr-4 text-[#c0c6de]">0.50%</td>
                    <td className="py-3 pr-4 font-mono text-[#c0c6de]">$5.00</td>
                    <td className="py-3 text-[#c0c6de]">Your feeRecipient wallet</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4">ZkPay Treasury Share</td>
                    <td className="py-3 pr-4 font-mono">50</td>
                    <td className="py-3 pr-4">0.50%</td>
                    <td className="py-3 pr-4 font-mono">$5.00</td>
                    <td className="py-3 text-[#909097]">ZkPay Treasury</td>
                  </tr>
                  <tr className="bg-white/5">
                    <td className="py-3 pr-4 font-medium">Net User Receives</td>
                    <td className="py-3 pr-4 font-mono">—</td>
                    <td className="py-3 pr-4">98.75%</td>
                    <td className="py-3 pr-4 font-mono font-medium">$987.50</td>
                    <td className="py-3">User Recipient Wallet</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.2em] font-bold">MIN FEE</span>
                <p className="text-sm font-medium text-[#e5e2e3]">20 bps (0.20%)</p>
                <p className="text-xs text-[#909097]">Minimum custom fee per swap</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.2em] font-bold">MAX FEE</span>
                <p className="text-sm font-medium text-[#e5e2e3]">450 bps (4.50%)</p>
                <p className="text-xs text-[#909097]">Stays within NEAR Intents 500 bps cap</p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.2em] font-bold">NO PARTNER</span>
                <p className="text-sm font-medium text-[#e5e2e3]">100% → ZkPay</p>
                <p className="text-xs text-[#909097]">If no feeRecipient, entire fee goes to treasury</p>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column API Explorer */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Endpoints Navigation */}
          <div className="lg:col-span-4 space-y-3">
            {/* Category Toggle */}
            <div className="flex items-center gap-2 mb-3">
              {(["swap", "payments"] as ApiCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    const firstIdx = ENDPOINTS.findIndex((e) => e.category === cat);
                    if (firstIdx >= 0) setActiveTab(firstIdx);
                  }}
                  className={`text-[10px] font-label-caps tracking-[0.2em] px-4 py-2 rounded-lg transition-all border ${
                    activeCategory === cat
                      ? "bg-[#c0c6de] text-[#131315] border-[#c0c6de] font-bold"
                      : "bg-white/5 text-[#c6c6cd] border-white/10 hover:bg-white/[0.08]"
                  }`}
                >
                  {cat === "swap" ? "⚡ SWAP API" : "💳 PAYMENTS"}
                </button>
              ))}
            </div>

            <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2 px-1">
              {activeCategory === "swap" ? "SWAP ENDPOINTS" : "PAYMENT ENDPOINTS"}
            </span>

            {ENDPOINTS.filter((ep) => ep.category === activeCategory).map((ep) => {
              const idx = ENDPOINTS.indexOf(ep);
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTab(idx)}
                  className={`w-full text-left p-4 rounded-xl transition-all border ${
                    activeTab === idx
                      ? "bg-white/10 border-[#c0c6de]/50 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                      : "bg-white/5 border-white/10 hover:bg-white/[0.08] text-[#c6c6cd]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-[9px] font-label-caps font-bold px-2 py-0.5 rounded ${
                        ep.method === "GET"
                          ? "bg-white/10 text-[#c0c6de] border border-[#c0c6de]/30"
                          : "bg-[#c0c6de] text-[#131315] font-bold"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="text-xs font-mono text-[#e5e2e3] truncate">{ep.path.split("?")[0]}</span>
                  </div>
                  <p className="text-xs font-medium text-[#e5e2e3] truncate">{ep.title}</p>
                  {ep.rateLimit && (
                    <p className="text-[9px] text-[#909097] mt-1 font-mono">{ep.rateLimit}</p>
                  )}
                </button>
              );
            })}

            {/* Contextual Info Cards */}
            {activeCategory === "swap" && (
              <div className="mt-8 p-5 rounded-xl bg-white/5 border border-white/15">
                <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.25em] font-bold block mb-2">
                  INTEGRATION FLOW
                </span>
                <div className="text-xs text-[#c6c6cd] leading-relaxed space-y-2 mb-4">
                  <p><strong className="text-[#e5e2e3]">1.</strong> Call <code className="text-[#c0c6de] bg-white/5 px-1 rounded">/swap/tokens</code> to list supported assets</p>
                  <p><strong className="text-[#e5e2e3]">2.</strong> Call <code className="text-[#c0c6de] bg-white/5 px-1 rounded">/swap/quote</code> to preview rate &amp; fees</p>
                  <p><strong className="text-[#e5e2e3]">3.</strong> Call <code className="text-[#c0c6de] bg-white/5 px-1 rounded">/swap/create</code> to get deposit address</p>
                  <p><strong className="text-[#e5e2e3]">4.</strong> User deposits on source chain</p>
                  <p><strong className="text-[#e5e2e3]">5.</strong> Poll <code className="text-[#c0c6de] bg-white/5 px-1 rounded">/swap/status</code> until settled</p>
                </div>
              </div>
            )}

            {activeCategory === "payments" && (
              <div className="mt-8 p-5 rounded-xl bg-white/5 border border-white/15">
                <span className="font-label-caps text-[9px] text-[#c0c6de] tracking-[0.25em] font-bold block mb-2">
                  HOSTED PAY LINKS
                </span>
                <p className="text-xs text-[#c6c6cd] leading-relaxed mb-4">
                  Need a ready-made checkout invoice? Generate a Pay Link from your dashboard and share via WhatsApp.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 text-xs font-label-caps text-[#e5e2e3] hover:text-[#c0c6de] tracking-[0.2em] font-bold transition-colors"
                >
                  <span>OPEN DASHBOARD</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </a>
              </div>
            )}
          </div>

          {/* Right Column: Interactive Code & Response Viewer */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
              {/* Endpoint Header */}
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`text-[10px] font-label-caps font-bold px-2.5 py-1 rounded ${
                    endpoint.method === "GET"
                      ? "bg-white/10 text-[#c0c6de] border border-[#c0c6de]/30"
                      : "bg-[#c0c6de] text-[#131315] font-bold"
                  }`}
                >
                  {endpoint.method}
                </span>
                <span className="text-sm md:text-base font-mono text-[#e5e2e3] font-semibold truncate">
                  https://zkpay.top{endpoint.path}
                </span>
              </div>

              <h2 className="text-2xl font-medium tracking-tight text-[#e5e2e3] mb-2">
                {endpoint.title}
              </h2>
              {endpoint.rateLimit && (
                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <span className="material-symbols-outlined text-[#c0c6de] text-sm">speed</span>
                  <span className="text-[10px] font-label-caps text-[#c6c6cd] tracking-[0.15em]">
                    RATE LIMIT: {endpoint.rateLimit}
                  </span>
                </div>
              )}
              <p className="text-xs md:text-sm text-[#c6c6cd] mb-8 leading-relaxed font-body-md">
                {endpoint.description}
              </p>

              {/* Language Selector Bar */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  {(["curl", "js", "python", "telegram"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`text-[10px] font-label-caps tracking-[0.15em] px-3 py-1.5 rounded-lg transition-all ${
                        selectedLang === lang
                          ? "bg-[#e5e2e3] text-[#131315] font-bold"
                          : "bg-white/5 text-[#c6c6cd] hover:text-white"
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
                  className="flex items-center gap-1.5 text-xs font-label-caps text-[#c6c6cd] hover:text-[#e5e2e3] tracking-[0.15em] transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    {copied === `code-${activeTab}` ? "check" : "content_copy"}
                  </span>
                  <span>{copied === `code-${activeTab}` ? "COPIED" : "COPY"}</span>
                </button>
              </div>

              {/* Request Code Box */}
              <div className="rounded-xl bg-[#0e0e0f] border border-white/10 p-5 font-mono text-xs text-[#c0c6de] overflow-x-auto mb-8">
                <pre>{getCodeSnippet(endpoint, selectedLang)}</pre>
              </div>

              {/* Response Code Box */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">
                    SAMPLE RESPONSE (200 OK)
                  </span>
                  <button
                    onClick={() =>
                      copyCode(JSON.stringify(endpoint.response, null, 2), `res-${activeTab}`)
                    }
                    className="flex items-center gap-1.5 text-xs font-label-caps text-[#909097] hover:text-[#e5e2e3] tracking-[0.15em] transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copied === `res-${activeTab}` ? "check" : "content_copy"}
                    </span>
                    <span>{copied === `res-${activeTab}` ? "COPIED" : "COPY"}</span>
                  </button>
                </div>
                <div className="rounded-xl bg-[#0e0e0f] border border-white/10 p-5 font-mono text-xs text-[#e5e2e3] overflow-x-auto">
                  <pre>{JSON.stringify(endpoint.response, null, 2)}</pre>
                </div>
              </div>
            </div>

            {/* Webhook HMAC Security Section */}
            <div className="bg-white/5 backdrop-blur-[40px] border border-white/15 rounded-xl p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-2 text-[#e5e2e3] font-semibold text-base mb-2">
                <span className="material-symbols-outlined text-[#c0c6de]">security</span>
                <span className="font-label-caps text-[10px] text-[#c0c6de] tracking-[0.25em] font-bold">
                  WEBHOOK SECURITY & HMAC VERIFICATION
                </span>
              </div>
              <p className="text-xs text-[#c6c6cd] leading-relaxed mb-4 font-body-md">
                Every webhook event includes an <code className="text-[#c0c6de] font-mono">X-ZkPay-Signature</code> header formatted as <code className="text-[#c0c6de] font-mono">t=timestamp,v1=signature</code>. Verify the HMAC SHA-256 hash using your secret key to prevent replay and spoofing attacks.
              </p>
              <div className="rounded-xl bg-[#0e0e0f] border border-white/10 p-4 font-mono text-xs text-[#c6c6cd]">
                <code>
                  {"const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');"}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-[#909097]">
          <p className="font-label-caps text-[9px] tracking-[0.25em]">
            ZKPAY DEVELOPER PLATFORM • BASE MAINNET
          </p>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-white transition-colors">
              PRIVACY POLICY
            </a>
            <a href="/terms" className="hover:text-white transition-colors">
              TERMS OF SERVICE
            </a>
            <a href="https://basescan.org/address/0x4cad6eC90e65baBec9335cAd728DDC610c316368" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              DIAMOND CONTRACT
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
