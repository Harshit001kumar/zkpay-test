"use client";

import { useState } from "react";
import { CHAIN } from "@/lib/constants";

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
                Crypto to UPI <span className="text-[#c6c6cd]/50 font-extralight">Developer Gateway</span>
              </h1>
              <p className="text-sm md:text-base text-[#c6c6cd] max-w-2xl font-body-lg mb-8">
                Accept crypto payments with instant Indian Rupee (UPI) settlement. Generate shareable Pay Links, create 30-minute dynamic deposit addresses for bots, and receive real-time HMAC signed webhooks.
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
                  <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold">CORS SUPPORT</span>
                  <span className="font-body-md font-medium text-[#c0c6de]">Enabled (* global)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column API Explorer */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Endpoints Navigation */}
          <div className="lg:col-span-4 space-y-3">
            <span className="font-label-caps text-[9px] text-[#c6c6cd] tracking-[0.25em] font-bold block mb-2 px-1">
              AVAILABLE ENDPOINTS
            </span>

            {ENDPOINTS.map((ep, idx) => (
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
                  <span className="text-xs font-mono text-[#e5e2e3] truncate">{ep.path}</span>
                </div>
                <p className="text-xs font-medium text-[#e5e2e3] truncate">{ep.title}</p>
              </button>
            ))}

            {/* Quick Pay Links Card */}
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
        <footer className="mt-16 pt-8 border-t border-white/10 text-center">
          <p className="font-label-caps text-[9px] text-[#909097] tracking-[0.25em]">
            ZKPAY DEVELOPER PLATFORM • OBSIDIAN GLASS LUXURY FINANCIAL EDITORIAL
          </p>
        </footer>
      </div>
    </div>
  );
}
