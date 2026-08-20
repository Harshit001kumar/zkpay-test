"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Code,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Bot,
  Link as LinkIcon,
  Shield,
  ArrowRight,
  Terminal,
  Activity,
} from "lucide-react";

interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  body?: Record<string, any>;
  response: Record<string, any>;
}

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v1/rates",
    title: "Live Exchange Rates",
    description: "Returns live on-chain exchange rates for all supported fiat currencies (INR, USD, EUR, GBP).",
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
    description: "Computes exact USDC principal, 1% ZkPay fee, total required, and validates limits.",
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
    description: "Generates a 30-minute unique Base deposit address for Telegram/Discord bots.",
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
    description: "Actively checks on-chain USDC balance on Base and updates session state.",
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
];

export default function DocsPage() {
  const [selectedLang, setSelectedLang] = useState<"curl" | "js" | "python" | "telegram">("curl");
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

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
  headers: { "Content-Type": "application/json" },
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

res = requests.post("${url}", json=payload)
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
    <div className="min-h-screen bg-[#060609] text-gray-200 font-sans selection:bg-purple-500/30">
      {/* Background radial highlights */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 md:py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-xs font-mono uppercase tracking-widest text-purple-400">
              ZkPay Developer Platform
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-4">
            API Documentation & Developer Gateway
          </h1>
          <p className="text-base md:text-lg text-gray-400 max-w-2xl">
            Accept crypto-to-UPI payments, generate shareable Pay Links, and automate offramp cashouts via REST API & Webhooks.
          </p>

          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-gray-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> Base Mainnet (8453)
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-gray-300">
              <Shield className="w-3.5 h-3.5 text-purple-400" /> Global CORS Enabled
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-gray-300">
              <Bot className="w-3.5 h-3.5 text-blue-400" /> 30-Min Dynamic Deposit Engine
            </div>
          </div>
        </div>

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Sidebar: Endpoints List */}
          <div className="lg:col-span-4 space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3 px-2">
              Endpoints
            </h2>
            {ENDPOINTS.map((ep, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`w-full text-left p-3.5 rounded-2xl transition-all border ${
                  activeTab === idx
                    ? "bg-purple-950/30 border-purple-500/40 text-white shadow-lg shadow-purple-950/40"
                    : "bg-white/[0.02] border-white/5 text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      ep.method === "GET"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-xs font-mono text-gray-300 truncate">{ep.path}</span>
                </div>
                <p className="text-xs font-medium truncate">{ep.title}</p>
              </button>
            ))}

            {/* Pay Links Promo Card */}
            <div className="mt-6 p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 to-blue-950/30 border border-purple-500/20">
              <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold mb-1">
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Hosted Pay Links</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Need a ready-made payment page? Create a pay link and share via WhatsApp or client invoices.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
              >
                Open Dashboard <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Right Area: Interactive Documentation & Code Snippet */}
          <div className="lg:col-span-8 space-y-6">
            {/* Endpoint Overview Card */}
            <div className="rounded-3xl bg-white/[0.03] border border-white/10 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                    endpoint.method === "GET"
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {endpoint.method}
                </span>
                <span className="text-sm md:text-base font-mono text-white font-semibold">
                  https://zkpay.top{endpoint.path}
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{endpoint.title}</h3>
              <p className="text-sm text-gray-400 mb-6">{endpoint.description}</p>

              {/* Language Selector */}
              <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-1.5">
                  {(["curl", "js", "python", "telegram"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`text-xs font-mono px-3 py-1 rounded-lg transition-all ${
                        selectedLang === lang
                          ? "bg-purple-600 text-white font-semibold shadow-sm"
                          : "bg-white/[0.04] text-gray-400 hover:text-white"
                      }`}
                    >
                      {lang === "curl"
                        ? "cURL"
                        : lang === "js"
                        ? "JavaScript"
                        : lang === "python"
                        ? "Python"
                        : "🤖 Telegram Bot"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() =>
                    copyCode(getCodeSnippet(endpoint, selectedLang), `code-${activeTab}`)
                  }
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {copied === `code-${activeTab}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code Snippet Box */}
              <div className="rounded-2xl bg-black/60 border border-white/10 p-4 font-mono text-xs text-purple-200 overflow-x-auto mb-6">
                <pre>{getCodeSnippet(endpoint, selectedLang)}</pre>
              </div>

              {/* Example Response */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-gray-500">
                    Example Response (200 OK)
                  </span>
                  <button
                    onClick={() =>
                      copyCode(JSON.stringify(endpoint.response, null, 2), `res-${activeTab}`)
                    }
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    {copied === `res-${activeTab}` ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <div className="rounded-2xl bg-black/40 border border-white/5 p-4 font-mono text-xs text-emerald-300 overflow-x-auto">
                  <pre>{JSON.stringify(endpoint.response, null, 2)}</pre>
                </div>
              </div>
            </div>

            {/* Webhook HMAC Verification Section */}
            <div className="rounded-3xl bg-white/[0.02] border border-white/5 p-6">
              <div className="flex items-center gap-2 text-white font-semibold text-base mb-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <span>Webhook Security & HMAC Verification</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                Every webhook event includes an <code className="text-purple-300">X-ZkPay-Signature</code> header in the format <code className="text-purple-300">t=timestamp,v1=signature</code>. Verify the HMAC SHA-256 hash using your webhook secret to guarantee payloads cannot be spoofed.
              </p>
              <div className="rounded-xl bg-black/40 border border-white/5 p-3 font-mono text-xs text-gray-400">
                <code>
                  const hmac = crypto.createHmac(&apos;sha256&apos;, secret).update(`${"$"}{timestamp}.${"$"}{rawBody}`).digest(&apos;hex&apos;);
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
