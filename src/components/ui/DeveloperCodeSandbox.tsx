"use client";

import React, { useState } from "react";
import { Copy, Check, Terminal } from "lucide-react";

const CODE_EXAMPLES: Record<"node" | "python" | "telegram" | "curl", { label: string; code: string }> = {
  node: {
    label: "Node.js",
    code: `import fetch from "node-fetch";

// Create non-custodial cross-chain swap with automatic 50/50 revenue split
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
    swapType: "FLEX_INPUT", // Send any amount over minimum
    totalFeeBps: 100,       // 1.00% fee (50/50 split with partner)
  }),
});

const { order } = await res.json();
console.log("Deposit Address:", order.deposit.address);
console.log("Estimated Out:", order.settlement.estimatedAmountOut);`,
  },
  python: {
    label: "Python",
    code: `import os
import requests

# Create non-custodial cross-chain swap with 50/50 revenue attribution
response = requests.post(
    "https://zkpay.top/api/v1/swap/create",
    headers={
        "X-API-Key": os.getenv("ZKPAY_API_KEY"),
        "Content-Type": "application/json",
    },
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
print(f"Deposit Address: {order['deposit']['address']}")`,
  },
  telegram: {
    label: "Telegram Bot",
    code: `bot.command("swap", async (ctx) => {
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
    \`*ZkPay Cross-Chain Swap*\\n\\n\` +
    \`Send \${amount} \${fromAsset} to:\\n\` +
    \`\\\`\${order.deposit.address}\\\`\\n\\n\` +
    \`Output: \${order.settlement.estimatedAmountOut} \${toAsset}\`,
    { parse_mode: "Markdown" }
  );
});`,
  },
  curl: {
    label: "cURL",
    code: `curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_partner_key" \\
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
  },
};

export function DeveloperCodeSandbox() {
  const [activeTab, setActiveTab] = useState<"node" | "python" | "telegram" | "curl">("node");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_EXAMPLES[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full rounded-[2rem] p-1.5 sm:p-2 bg-surface-container-low/90 border border-outline-variant shadow-elevated">
      <div className="rounded-[calc(2rem-0.375rem)] bg-surface-container-low border border-outline-variant overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-outline-variant bg-surface-container">
          <div className="flex items-center gap-1.5 text-xs">
            <Terminal className="w-4 h-4 text-on-surface-variant mr-1" />
            {(["node", "python", "telegram", "curl"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-8 px-3 rounded-lg font-semibold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeTab === tab
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                {CODE_EXAMPLES[tab].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Copy code sample"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>

        {/* Code Body */}
        <pre className="p-5 font-mono text-xs leading-relaxed text-on-surface overflow-x-auto max-h-[440px] bg-surface-dim">
          {CODE_EXAMPLES[activeTab].code}
        </pre>
      </div>
    </div>
  );
}
