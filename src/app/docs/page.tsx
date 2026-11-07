"use client";

import { useState } from "react";
import { CHAIN } from "@/lib/constants";

import { ENDPOINTS, Endpoint } from "./endpointsData";

type ApiCategory = "payments" | "swap";

export default function DocsPage() {
  const [selectedLang, setSelectedLang] = useState<"curl" | "js" | "python" | "telegram">("curl");
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ApiCategory>("swap");
  const [promptCopied, setPromptCopied] = useState<"swap" | "payments" | null>(null);
  const [promptExpanded, setPromptExpanded] = useState<"swap" | "payments" | null>(null);

  const SWAP_API_PROMPT = `# ZkPay Swap API — Integration Context for AI Agents (v2 USD Partner Ledger)

You are helping a developer integrate or upgrade to ZkPay's cross-chain Swap API. This API enables non-custodial crypto-to-crypto swaps across 9 supported blockchains (Bitcoin, Ethereum, Base, Polygon, Solana, Arbitrum, BSC, Tron, Litecoin) with an automated 50/50 USD revenue share for partners.

Base URL: https://zkpay.top
Supported Chains: btc, eth, base, polygon, sol, arb, bsc, tron, ltc

## Authentication (REQUIRED for Partner Fee Share)
- Pass your API key via \`X-API-Key: zkpay_live_...\` header (or \`Authorization: Bearer zkpay_live_...\`) on \`/api/v1/swap/create\` and \`/api/v1/swap/quote\`.
- Get your key at https://zkpay.top/profile → Merchant & Bot API Keys
- Manage your swaps, USD fee credits, and crypto payouts at https://zkpay.top/partner

## WHAT CHANGED FOR PARTNERS (v2 Upgrade Guide)
1. **No \`feeRecipient\` Required**: You no longer need to pass or manage per-chain \`feeRecipient\` addresses (e.g. separate Solana, Litecoin, and EVM wallets). Simply authenticate with your \`X-API-Key\` header and your 50% fee share is automatically attributed to your Partner account across all supported chains. (Passing \`feeRecipient\` is still accepted for backward compatibility and will never throw cross-chain address errors.)
2. **100% On-Chain Treasury Sweep**: Users send 100% of their deposit to a single deposit address (\`order.deposit.address\`). On-chain, 100% of the platform fee is swept in a single transfer to the ZkPay Treasury and the net amount is forwarded to solvers.
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
- totalFeeBps (optional): Total custom fee in bps (range: 20–450 bps, default 100 = 1.00%, split 50/50 between Partner and ZkPay).
- slippageBps (optional): Slippage tolerance in bps (range: 10–500 bps, default 100 = 1.00%).

Response:
{
  "success": true,
  "quote": {
    "quoteId": "q_1727382000000",
    "originAsset": "nep141:sol.omft.near",
    "destinationAsset": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    "totalAmountIn": "1000000000",
    "netSwapAmount": "988800000",
    "feeAmount": "11200000",
    "partnerFeeAmount": "5000000",
    "zkpayFeeAmount": "6200000",
    "amountIn": "988800000",
    "amountInFormatted": "0.9888",
    "amountOut": "102500000",
    "amountOutFormatted": "102.50",
    "minAmountOut": "101475000",
    "minAmountOutFormatted": "101.47",
    "executionPlan": {
      "isDirectRoute": false,
      "type": "UPFRONT_FEE_SPLIT",
      "totalAmountIn": "1000000000",
      "netSwapAmount": "988800000",
      "feeAmount": "11200000",
      "partnerFeeAmount": "5000000",
      "zkpayFeeAmount": "6200000",
      "feeAsset": "nep141:sol.omft.near",
      "treasuryAddress": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
      "partnerFeeRecipient": null,
      "depositAddress": "solver_deposit_address...",
      "transfers": [
        { "purpose": "PLATFORM_FEE", "recipient": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf", "amount": "11200000" },
        { "purpose": "SWAP_DEPOSIT", "recipient": "solver_deposit_address...", "amount": "988800000" }
      ]
    },
    "feeBreakdown": {
      "isDirectRoute": false,
      "networkProtocolFeeBps": 25,
      "totalCustomFeeBps": 100,
      "feeAmount": "11200000",
      "partnerFeeAmount": "5000000",
      "zkpayFeeAmount": "6200000",
      "split": { "zkpayFeeBps": 50, "partnerFeeBps": 50, "partnerFeeRecipient": null, "treasuryAddress": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf" },
      "totalDeductionsBps": 125,
      "feeSettlementNote": "100% of fees are swept to ZkPay Treasury on-chain (sol). Partner's 50% fee share is converted to USD at live market rates and credited to the Partner Portal upon swap settlement."
    },
    "timeEstimateSeconds": 45,
    "expiresAt": "2026-10-01T15:00:00.000Z"
  }
}

### 3. POST /api/v1/swap/create
Creates a live swap order. Returns a single-use deposit address on the source chain and the executionPlan.
Rate limit: 10 req/min (IP) · 60 req/min (API Key)

Headers:
- \`X-API-Key: zkpay_live_your_secret_key\` (Required for partner attribution & 50/50 fee share)

Request body:
{
  "fromAsset": "SOL",
  "chain": "sol",
  "toAsset": "USDC",
  "destinationChain": "base",
  "amount": "1000000000",
  "recipient": "0xUserBaseRecipientAddress",
  "refundTo": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
  "totalFeeBps": 100
}

- recipient: User's destination-chain wallet address
- refundTo: User's origin-chain wallet address (for automatic refund on failure/expiry)
- totalFeeBps: Your desired fee in basis points (range: 20–450 bps, 0 on ETH/BTC L1)
- feeRecipient (optional/legacy): Not needed when authenticating with \`X-API-Key\`.

Response:
{
  "success": true,
  "order": {
    "swapId": "swp_1727382000000",
    "status": "PENDING_DEPOSIT",
    "totalAmountIn": "1000000000",
    "netSwapAmount": "988800000",
    "feeAmount": "11200000",
    "partnerFeeAmount": "5000000",
    "zkpayFeeAmount": "6200000",
    "deposit": {
      "address": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
      "amount": "1",
      "deadline": "2026-10-01T15:15:00.000Z"
    },
    "settlement": {
      "recipient": "0xUserBaseRecipientAddress",
      "estimatedAmountOut": "102.50",
      "minAmountOut": "101.47",
      "timeEstimateSeconds": 60
    },
    "executionPlan": {
      "isDirectRoute": false,
      "type": "UPFRONT_FEE_SPLIT",
      "totalAmountIn": "1000000000",
      "netSwapAmount": "988800000",
      "feeAmount": "11200000",
      "partnerFeeAmount": "5000000",
      "zkpayFeeAmount": "6200000",
      "transfers": [
        { "purpose": "PLATFORM_FEE", "recipient": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf", "amount": "11200000" },
        { "purpose": "SWAP_DEPOSIT", "recipient": "solver_deposit_address...", "amount": "988800000" }
      ]
    },
    "feeSplit": {
      "isDirectRoute": false,
      "totalCustomFeeBps": 100,
      "feeAmount": "11200000",
      "partnerFeeAmount": "5000000",
      "zkpayFeeAmount": "6200000",
      "zkpayFeeBps": 50,
      "partnerFeeBps": 50,
      "partnerFeeRecipient": null,
      "treasuryAddress": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
      "feeSettlementNote": "100% of fees are swept to ZkPay Treasury on-chain (sol). Partner's 50% fee share is converted to USD at live market rates and credited to the Partner Portal upon swap settlement."
    }
  }
}

### 4. GET /api/v1/swap/status?depositAddress={address}
Poll real-time swap execution status.
Rate limit: 60 req/min (IP) · 240 req/min (API Key)

Statuses: pending → processing → settled / failed / refunded

Response:
{
  "success": true,
  "status": "settled",
  "depositedAmount": "1 SOL",
  "settledAmount": "102.50 USDC",
  "destinationTxHash": "0x89c1...baseTxHash",
  "destinationExplorerUrl": "https://basescan.org/tx/0x89c1..."
}

## Integration Flow
1. Call /swap/tokens to discover supported assets
2. Call /swap/quote with \`X-API-Key\` to preview rate & 50/50 partner fee split
3. Call /swap/create with \`X-API-Key\` to get deposit address and execution plan
4. User sends \`order.deposit.amount\` to \`order.deposit.address\` on source chain
5. Poll /swap/status until status is "settled", "failed", or "refunded"
6. Upon settlement, your 50% fee share is automatically converted to USD at the live CoinGecko rate and credited to your Partner Portal balance (\`https://zkpay.top/partner\`).

## Fee Structure (50/50 USD Partner Ledger & $1.00 Minimum Withdrawal)
- **Fee-Share Enabled Chains**: Base, Polygon, Arbitrum, BSC, Solana (SOL), and Litecoin (LTC).
  - Network Protocol Fee: 25 bps (0.25%) — deducted by solvers
  - Customizable Fee (\`totalFeeBps\`): 20 to 450 bps (0.20% – 4.50%, default 100 bps = 1.00%)
  - Your Partner Share: 50% of \`totalFeeBps\` → automatically credited in **USD** at live CoinGecko rate when the swap settles
  - ZkPay Treasury Share: 50% of \`totalFeeBps\` + fixed gas recovery fee → swept on-chain to ZkPay Treasury
  - Withdrawals: Request payouts anytime ($1.00 USD minimum) from \`https://zkpay.top/partner\` in **USDC (Base)**, **USDT (Polygon)**, **SOL**, or **LTC**.
- **0% Fee Direct Routes**:
  - High transaction cost networks like Ethereum Mainnet ('eth') and Bitcoin ('btc') route directly to solvers with 0% platform fee to protect users from high network gas fees.

## CRITICAL: Atomic Units Conversion Table
ALL amounts MUST be integer strings in atomic/base units. NEVER pass decimals like "0.01".

| Asset | Chain          | Decimals | 1 Token (Atomic)     | ~$0.05 Minimum       |
|-------|----------------|----------|----------------------|-----------------------|
| SOL   | sol            | 9        | 1000000000           | 250000 (~0.00025 SOL) |
| USDC  | base/eth/sol/arb| 6       | 1000000              | 50000 ($0.05 USDC)    |
| USDT  | eth/sol/tron   | 6        | 1000000              | 50000 ($0.05 USDT)    |
| BTC   | btc            | 8        | 100000000            | 50 (~0.0000005 BTC)   |
| ETH   | eth/base/arb   | 18       | 1000000000000000000  | 20000000000000        |
| BNB   | bsc            | 18       | 1000000000000000000  | 80000000000000        |
| LTC   | ltc            | 8        | 100000000            | 50000 (~0.0005 LTC)   |
| TRX   | tron           | 6        | 1000000              | 300000 (~0.3 TRX)     |

## Multi-Chain Token Disambiguation
Tokens like USDC and USDT exist on multiple chains. Always pass the "chain" / "destinationChain" parameter (e.g. "sol", "arb", "base") or use the full assetId from /swap/tokens to avoid chain mismatch errors.

## Webhook Events (Swap)
If you provided a webhookUrl, you'll receive these events with HMAC SHA-256 signatures:
- swap.deposit_detected — Deposit observed on origin chain
- swap.settled — Swap fulfilled, tokens delivered to recipient
- swap.failed — Swap could not be filled by solvers
- swap.refunded — Deposit refunded to refundTo address

## Error Codes
- AMOUNT_BELOW_MINIMUM (400) — Amount is below ~$0.05 USD solver threshold or passed as float
- INVALID_AMOUNT (400) — Amount is not a valid positive integer string
- INVALID_RECIPIENT (400) — Missing or invalid destination recipient address
- SOLVER_NETWORK_BUSY (503) — Upstream solver network temporary unavailability, safe to retry
- RATE_LIMITED (429) — Too many requests, back off`;

  const PAYMENTS_API_PROMPT = `# ZkPay Payments API — Integration Context for AI Agents

You are helping a developer integrate ZkPay's Payments API. This API enables crypto-to-fiat payments — accept USDC on Base chain and settle instantly to merchant bank accounts via UPI, SEPA, or Faster Payments.

Base URL: https://zkpay.top
Settlement Network: Base Mainnet (Chain ID 8453)
Settlement Asset: Native USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)

## Authentication
- GET endpoints (rates): No auth required
- POST endpoints: Pass API key via \`X-API-Key: zkpay_live_...\` header or \`Authorization: Bearer zkpay_live_...\`
- Get your key at zkpay.top → Profile → Merchant & Bot API Keys

## Endpoints

### 1. GET /api/v1/rates
Returns live on-chain USDC-to-fiat exchange rates for all supported currencies.

Response:
{
  "success": true,
  "rates": {
    "USDC_INR": { "sell": 87.5, "buy": 88.2, "spread": 0.7, "lastUpdated": 1755500000 },
    "USDC_USD": { "sell": 1.0, "buy": 1.01, "spread": 0.01, "lastUpdated": 1755500000 }
  },
  "network": "Base Mainnet",
  "chainId": 8453
}

Supported fiat currencies:
- INR 🇮🇳 (UPI)
- USD 🇺🇸 (Bank Transfer)
- EUR 🇪🇺 (SEPA)
- GBP 🇬🇧 (Faster Payments)

### 2. POST /api/v1/quotes
Calculate exact USDC breakdown: principal, 1% ZkPay fee, total required, and no-KYC tier validation.

Request body:
{ "amount": 1000, "currency": "INR" }

Response:
{
  "success": true,
  "fiatAmount": "₹ 1,000.00",
  "usdcPrincipal": "11.43",
  "feeUsdc": "0.11",
  "totalUsdc": "11.54",
  "rate": "87.50",
  "feeBps": 100,
  "currency": "INR",
  "withinNoKycLimit": true,
  "expiresAt": 1755500300
}

### 3. POST /api/v1/paylinks
Generate a hosted payment URL with 1-click wallet connect and QR view. Ideal for invoices and e-commerce.

Request body:
{
  "title": "Invoice #104 - Freelance Work",
  "amountINR": 2500,
  "recipientUpi": "merchant@okaxis",
  "type": "one_time",
  "webhookUrl": "https://mysite.com/api/zkpay-webhook"
}

Response:
{
  "success": true,
  "linkId": "pl_live_9a8f2c",
  "payUrl": "https://zkpay.top/pay/pl_live_9a8f2c",
  "amountINR": "₹ 2,500.00",
  "estimatedUsdc": "28.57 USDC",
  "status": "ACTIVE",
  "qrCodeUrl": "https://api.qrserver.com/..."
}

### 4. POST /api/v1/payin-sessions
Generate a 30-minute unique Base deposit address for Telegram/Discord bots with automated on-chain listener. Best for bot-driven payment flows.

Request body:
{
  "recipientUpi": "merchant@okaxis",
  "amountINR": 500,
  "refundAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // optional: refund destination if underpaid or cancelled
  "tipUsdc": 0.50, // optional: provider tip swept to ZkPay Treasury
  "webhookUrl": "https://my-bot.com/webhook" // optional
}

Response:
{
  "success": true,
  "sessionId": "ses_live_8f7a2c9b1d",
  "status": "AWAITING_PAYMENT",
  "clientSecret": "sec_8f7a2c9b1d",
  "statusUrl": "/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d&token=sec_8f7a2c9b1d",
  "payinAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "network": "Base Mainnet (Chain ID: 8453)",
  "expectedAmountUsdc": "6.26",
  "usdcPrincipal": "5.60",
  "feeUsdc": "0.06",
  "protocolFeeUsdc": "0.10",
  "tipUsdc": "0.50",
  "refundAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "fiatAmount": "₹ 500.00",
  "recipientUpi": "merchant@okaxis",
  "expiresInSeconds": 1800,
  "qrCodeUrl": "https://api.qrserver.com/..."
}

### 5. GET /api/v1/payin-sessions?id={sessionId}&token={clientSecret}
Check on-chain deposit status. Returns updated state once USDC is detected, and verified payment proof upon completion.

Provide either:
- ?token= (clientSecret from creation) for full unmasked details, OR
- X-API-Key header for merchant access

Response (settled):
{
  "success": true,
  "sessionId": "ses_live_8f7a2c9b1d",
  "status": "SETTLED",
  "recipientUpi": "merchant@okaxis",
  "fiatAmount": "₹ 500.00",
  "expectedAmountUsdc": "6.26 USDC",
  "receivedUsdc": "6.26",
  "payinAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "p2pOrderId": "4210",
  "proof": {
    "verification": "P2P.me Protocol Escrow Verified",
    "p2pOrderId": "4210",
    "actualFiatAmount": "₹ 500.00",
    "actualUsdcAmount": "5.60",
    "recipientUpi": "merchant@okaxis",
    "txHash": "0x3e17b889a74c76b97adce206256f17e3be992c6b45a0b5a1532050efb064bb19",
    "basescanUrl": "https://basescan.org/tx/0x3e17b889a74c76b97adce206256f17e3be992c6b45a0b5a1532050efb064bb19",
    "settledAt": 1727382180000
  },
  "settledAt": 1727382180000
}

## Integration Flows

### Flow A: Hosted Pay Links (E-commerce / Invoices)
1. POST /api/v1/paylinks → get payUrl
2. Redirect user to payUrl or share link via WhatsApp/email
3. User connects wallet, pays with USDC
4. Receive webhook notification on settlement

### Flow B: Deposit Sessions (Telegram/Discord Bots)
1. POST /api/v1/payin-sessions → get payinAddress + QR code
2. Show deposit address + QR to user in chat
3. User sends USDC on Base to the deposit address
4. Poll GET /api/v1/payin-sessions?id=...&token=... until status is "SETTLED"
5. Or receive webhook notification

### Example: Telegram Bot (Node.js / Telegraf)
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
    caption: \`Send \${data.expectedAmountUsdc} USDC on Base to:\\n\\\`\${data.payinAddress}\\\`\\nSettles ₹\${amount} to \${upiId} in under 3 mins.\`,
    parse_mode: 'Markdown'
  });
});

## Fee Structure
- Platform fee: 1% (100 bps) on every transaction
- Gas fee sponsorship: Transactions are executed directly from the ZkPay Relayer wallet. Users/deposit addresses never need to hold ETH.
- Gas on failure: If a payment order fails or is cancelled, the network gas fee ($0.05 USDC) is paid in USDC directly from the deposit, and the remaining USDC balance is refunded to the user's refund address.
- No-KYC offramp limit: 100 USDC per transaction (INR)
- Settlement time: Typically under 3 minutes

## Webhook Security (HMAC SHA-256)
Every webhook includes an X-ZkPay-Signature header: "t=timestamp,v1=signature"
Verify with:
  expected = HMAC-SHA256(WEBHOOK_SECRET, "{timestamp}.{rawBody}")
  isValid = timingSafeEqual(signature, expected)

## Webhook Events (Payments)
- payin.detected — USDC transfer detected on Base deposit address
- payin.settled — Fiat successfully disbursed to merchant UPI/bank
- payin.failed — Session expired or banking transaction failed

## Error Handling
- All errors return { "success": false, "error": "ERROR_CODE", "message": "..." }
- Always check withinNoKycLimit in /quotes response before proceeding
- Deposit sessions expire after 30 minutes (1800 seconds)
- Pay links default to "one_time" type`;

  const copyPrompt = (type: "swap" | "payments") => {
    const text = type === "swap" ? SWAP_API_PROMPT : PAYMENTS_API_PROMPT;
    navigator.clipboard.writeText(text);
    setPromptCopied(type);
    setTimeout(() => setPromptCopied(null), 3000);
  };

  const endpoint = ENDPOINTS[activeTab];

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
              DEVELOPER PLATFORM
            </span>
          </div>

          <a
            href="/"
            className="flex items-center gap-2 text-xs font-label-caps text-on-surface-variant hover:text-on-surface tracking-normal transition-colors"
          >
            <span>DASHBOARD</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </a>
        </div>

        {/* Hero Section */}
        <section className="mb-12">
          <div className="bg-white/5  border border-white/15 rounded-xl p-8 md:p-12 relative overflow-hidden shadow-elevated">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                  API SPECIFICATION V1.0
                </span>
                <div className="h-px w-8 bg-white/20" />
              </div>

              <h1 className="text-4xl md:text-6xl font-medium tracking-tight text-on-surface mb-4">
                Crypto Payments <span className="text-on-surface-variant/50 font-extralight">&amp; Swap API</span>
              </h1>
              <p className="text-sm md:text-base text-on-surface-variant max-w-2xl font-body-lg mb-8">
                Accept crypto payments with instant fiat settlement and 50/50 partner revenue.
              </p>

              {/* Status Chips */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-12 pt-6 border-t border-white/10">
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">NETWORK</span>
                  <span className="font-body-md font-medium text-on-surface">{CHAIN.name} (8453)</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">SETTLEMENT ASSET</span>
                  <span className="font-body-md font-medium text-on-surface">Native Base USDC</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">SWAP CHAINS</span>
                  <span className="font-body-md font-medium text-primary">BTC, ETH, SOL, Tron, BSC, Arb, Base</span>
                </div>
                <div className="hidden sm:block w-px h-8 bg-white/10" />
                <div className="flex flex-col gap-1">
                  <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold">FEE SPLIT</span>
                  <span className="font-body-md font-medium text-primary">50/50 Partner + ZkPay Treasury</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Authentication Section */}
        <section className="mb-12">
          <div className="bg-white/5  border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                AUTHENTICATION
              </span>
              <div className="h-px w-8 bg-white/20" />
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-on-surface mb-4">
              Getting Your API Key
            </h2>
            <p className="text-sm text-on-surface-variant max-w-2xl mb-6">
              All write endpoints (<code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">POST</code>, <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">PATCH</code>) require an API key. Pass it via the <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">x-api-key</code> header or <code className="text-primary bg-white/5 px-1.5 py-0.5 rounded">Authorization: Bearer</code> header.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">1</div>
                <p className="font-medium text-sm text-on-surface">Connect Wallet</p>
                <p className="text-xs text-outline">Log in to ZkPay with your wallet at <a href="/" className="text-primary hover:underline">zkpay.top</a></p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">2</div>
                <p className="font-medium text-sm text-on-surface">Open API Keys</p>
                <p className="text-xs text-outline">Go to <strong className="text-white">Profile → Merchant & Bot API Keys</strong></p>
              </div>
              <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">3</div>
                <p className="font-medium text-sm text-on-surface">Generate & Copy</p>
                <p className="text-xs text-outline">Create a key with a label and copy the secret (shown only once).</p>
              </div>
            </div>

            <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-sans tabular-nums text-xs text-primary overflow-x-auto">
              <pre>{`curl -X POST "https://zkpay.top/api/v1/paylinks" \\
  -H "x-api-key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{"amountINR": 500, "recipientUpi": "merchant@okaxis"}'`}</pre>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-success/10 border border-success/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-success">Track All API Transactions Live</p>
                <p className="text-[11px] text-outline">Monitor swaps, pay-ins, and view estimated partner earnings in real-time on your dashboard.</p>
              </div>
              <a href="/partner" className="px-3 py-1.5 rounded-lg bg-success/20 hover:bg-success/30 text-success text-xs font-sans tabular-nums font-bold transition-colors shrink-0">
                Open Partner Console
              </a>
            </div>
          </div>
        </section>

        {/* AI Agent Prompts Section */}
        <section className="mb-12">
          <div className="bg-white/5  border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated relative overflow-hidden">
            {/* Subtle gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                AI AGENT CONTEXT
              </span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-[9px] font-label-caps text-outline tracking-normal bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                NEW
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-on-surface mb-3">
              Master Prompts for AI Agents
            </h2>
            <p className="text-sm text-on-surface-variant max-w-3xl mb-8 leading-relaxed">
              Copy a context prompt and paste it into any AI coding assistant (ChatGPT, Claude, Cursor, Copilot, etc.) to give it instant understanding of the ZkPay API: endpoints, auth, request/response schemas, fees, webhooks, and integration gotchas.
            </p>

            {/* Two Prompt Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Swap API Prompt Card */}
              <div className="bg-black/30 rounded-xl border border-white/10 p-6 space-y-5 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-lg">swap_horiz</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-on-surface">Swap API Prompt</h3>
                    <p className="text-[10px] text-outline font-sans tabular-nums">Cross-chain swaps, 8+ chains, 50/50 revenue</p>
                  </div>
                </div>

                {/* What's included */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: "route", text: "4 endpoints" },
                    { icon: "calculate", text: "Atomic units table" },
                    { icon: "payments", text: "Fee split details" },
                    { icon: "webhook", text: "Webhook events" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary/60 text-xs">{item.icon}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>

                {/* Copy Button */}
                <button
                  onClick={() => copyPrompt("swap")}
                  className={`w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-label-caps text-[10px] tracking-normal font-bold transition-colors duration-300 ${
                    promptCopied === "swap"
                      ? "bg-success/20 text-success border border-success/30"
                      : "bg-primary text-surface hover:bg-accent-hi active:scale-[0.98]"
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {promptCopied === "swap" ? "check_circle" : "content_copy"}
                  </span>
                  <span>{promptCopied === "swap" ? "COPIED!" : "COPY SWAP PROMPT"}</span>
                </button>

                {/* Preview Toggle */}
                <button
                  onClick={() => setPromptExpanded(promptExpanded === "swap" ? null : "swap")}
                  className="flex items-center gap-2 text-[10px] font-label-caps text-outline hover:text-on-surface-variant tracking-normal transition-colors"
                >
                  <span className="material-symbols-outlined text-xs" style={{ transform: promptExpanded === "swap" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                    chevron_right
                  </span>
                  <span>{promptExpanded === "swap" ? "HIDE PREVIEW" : "PREVIEW"}</span>
                </button>

                {promptExpanded === "swap" && (
                  <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-4 font-sans tabular-nums text-[10px] text-primary max-h-[360px] overflow-y-auto relative">
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => copyPrompt("swap")}
                        className="flex items-center gap-1 text-[9px] font-label-caps text-outline hover:text-on-surface tracking-normal transition-colors bg-white/5 px-2 py-1 rounded-lg border border-white/10"
                      >
                        <span className="material-symbols-outlined text-[10px]">
                          {promptCopied === "swap" ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap leading-relaxed pr-8">{SWAP_API_PROMPT}</pre>
                  </div>
                )}
              </div>

              {/* Payments API Prompt Card */}
              <div className="bg-black/30 rounded-xl border border-white/10 p-6 space-y-5 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/25 flex items-center justify-center">
                    <span className="material-symbols-outlined text-success text-lg">account_balance</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-on-surface">Payments API Prompt</h3>
                    <p className="text-[10px] text-outline font-sans tabular-nums">USDC to Fiat, Pay links, Bot sessions</p>
                  </div>
                </div>

                {/* What's included */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: "route", text: "5 endpoints" },
                    { icon: "link", text: "Pay links + sessions" },
                    { icon: "smart_toy", text: "Telegram bot example" },
                    { icon: "webhook", text: "Webhook + HMAC" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary/60 text-xs">{item.icon}</span>
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>

                {/* Copy Button */}
                <button
                  onClick={() => copyPrompt("payments")}
                  className={`w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-label-caps text-[10px] tracking-normal font-bold transition-colors duration-300 ${
                    promptCopied === "payments"
                      ? "bg-success/20 text-success border border-success/30"
                      : "bg-primary text-surface hover:bg-accent-hi active:scale-[0.98]"
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {promptCopied === "payments" ? "check_circle" : "content_copy"}
                  </span>
                  <span>{promptCopied === "payments" ? "COPIED!" : "COPY PAYMENTS PROMPT"}</span>
                </button>

                {/* Preview Toggle */}
                <button
                  onClick={() => setPromptExpanded(promptExpanded === "payments" ? null : "payments")}
                  className="flex items-center gap-2 text-[10px] font-label-caps text-outline hover:text-on-surface-variant tracking-normal transition-colors"
                >
                  <span className="material-symbols-outlined text-xs" style={{ transform: promptExpanded === "payments" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                    chevron_right
                  </span>
                  <span>{promptExpanded === "payments" ? "HIDE PREVIEW" : "PREVIEW"}</span>
                </button>

                {promptExpanded === "payments" && (
                  <div className="rounded-xl bg-surface-container-lowest border border-white/10 p-4 font-sans tabular-nums text-[10px] text-primary max-h-[360px] overflow-y-auto relative">
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => copyPrompt("payments")}
                        className="flex items-center gap-1 text-[9px] font-label-caps text-outline hover:text-on-surface tracking-normal transition-colors bg-white/5 px-2 py-1 rounded-lg border border-white/10"
                      >
                        <span className="material-symbols-outlined text-[10px]">
                          {promptCopied === "payments" ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap leading-relaxed pr-8">{PAYMENTS_API_PROMPT}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Swap API Fee Split Section */}
        <section className="mb-12">
          <div className="bg-white/5  border border-white/15 rounded-xl p-8 md:p-10 shadow-elevated">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                SWAP API — 50/50 USD PARTNER REVENUE &amp; MIGRATION GUIDE
              </span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-[9px] font-label-caps text-success tracking-normal bg-success/10 px-2.5 py-1 rounded-md border border-success/20">
                V2 UPGRADE
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

            {/* Migration Callout for Existing Partners */}
            <div className="mb-8 rounded-xl bg-primary/10 border border-primary/25 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">upgrade</span>
                <h3 className="text-xs font-bold text-primary font-label-caps tracking-normal">
                  HOW TO UPDATE YOUR APP FOR THE NEW API (PARTNER MIGRATION CHECKLIST)
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-on-surface-variant leading-relaxed">
                <div className="bg-black/30 rounded-lg p-3.5 border border-white/10">
                  <strong className="text-white block mb-1">1. Pass X-API-Key Header</strong>
                  Include <code className="text-primary">X-API-Key: zkpay_live_...</code> on <code className="text-primary">/swap/quote</code> and <code className="text-primary">/swap/create</code>. Every swap created with your key automatically activates the 50/50 partner fee split.
                </div>
                <div className="bg-black/30 rounded-lg p-3.5 border border-white/10">
                  <strong className="text-white block mb-1">2. Remove Per-Chain feeRecipient</strong>
                  You no longer need to pass or validate origin-chain <code className="text-primary">feeRecipient</code> wallets (e.g. separate SOL, LTC, or EVM addresses). You can safely omit <code className="text-primary">feeRecipient</code> from all requests.
                </div>
                <div className="bg-black/30 rounded-lg p-3.5 border border-white/10">
                  <strong className="text-white block mb-1">3. Withdraw in Any Supported Crypto</strong>
                  Settled swap fees accrue in USD on <a href="/partner" className="text-primary underline">/partner</a> (tracked automatically in the background even if users close your app) and can be withdrawn starting at $1.00 USD.
                </div>
              </div>
            </div>

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
                  {/* High Transaction Cost Routes Header */}
                  <tr className="bg-white/[0.03]">
                    <td colSpan={5} className="py-2.5 px-3 text-[10px] font-sans tabular-nums font-bold text-warning  tracking-normal">
                      Routes Without Fee Share (High Transaction Cost: Ethereum Mainnet, Bitcoin &amp; Tron)
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-outline pl-3">Platform Fee (ETH/BTC/TRX)</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-success">0</td>
                    <td className="py-3 pr-4 text-success">0.00%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums text-success">$0.00</td>
                    <td className="py-3 text-success">0% fee — Routes directly to solvers to save user gas</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-3 pr-4 text-outline pl-3">Network Protocol Fee</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">25</td>
                    <td className="py-3 pr-4">0.25%</td>
                    <td className="py-3 pr-4 font-sans tabular-nums">$2.50</td>
                    <td className="py-3 text-outline">Solvers</td>
                  </tr>

                  {/* Supported Crypto Header */}
                  <tr className="bg-white/[0.03]">
                    <td colSpan={5} className="py-2.5 px-3 text-[10px] font-sans tabular-nums font-bold text-primary  tracking-normal">
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
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
                <p className="text-xs text-outline">Default 100 bps (1.00%), split 50/50 with partner</p>
              </div>
            </div>

            {/* Partner Integration & Refund Protection Guide */}
            <div className="border-t border-white/10 pt-8 mt-4 space-y-6">
              <div className="flex items-center gap-3">
                <span className="font-label-caps text-primary text-[10px] tracking-normal font-bold">
                  PARTNER INTEGRATION &amp; SETTLEMENT RULES
                </span>
                <div className="h-px w-8 bg-white/20" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-success text-base">payments</span>
                    <h4 className="text-xs font-bold text-white  tracking-normal font-sans tabular-nums">1. Single-Transfer Treasury Sweep &amp; USD Credit</h4>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Users send 100% of their deposit in a single transfer to <code className="text-primary font-sans tabular-nums">order.deposit.address</code>. On-chain, 100% of the platform fee is swept to the ZkPay Treasury and the net amount is forwarded to solvers. When the swap settles, your 50% partner fee share is converted to USD at the live CoinGecko rate and credited to your Partner Portal balance.
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-warning text-base">local_gas_station</span>
                    <h4 className="text-xs font-bold text-white  tracking-normal font-sans tabular-nums">2. High Transaction Cost Routes</h4>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    High transaction cost chains (such as Ethereum Mainnet and Bitcoin) route directly to solvers with 0% platform fee (<code className="text-success font-sans tabular-nums">isDirectRoute: true</code>) to protect users from paying double transaction fees.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">security</span>
                    <h4 className="text-xs font-bold text-white  tracking-normal font-sans tabular-nums">3. User Refund Protection</h4>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Always include <code className="text-primary font-sans tabular-nums">refundTo</code> with the user&apos;s origin-chain address (e.g. their Ethereum address when depositing ETH, Solana address for SOL).
                    If a trade exceeds slippage or the deposit deadline passes, 100% of the user deposit is automatically refunded back to <code className="text-primary font-sans tabular-nums">refundTo</code> on the origin chain.
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-5 border border-white/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">sync_alt</span>
                    <h4 className="text-xs font-bold text-white  tracking-normal font-sans tabular-nums">4. Background Settlement Tracking</h4>
                  </div>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Even if a user closes your app right after depositing, ZkPay&apos;s background settlement daemon monitors the solver network every 12 seconds and automatically credits your USD partner balance as soon as the swap settles.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Atomic Units & Multi-Chain Disambiguation Guide */}
          <div className="mt-6 bg-warning/15/20 border border-warning/20 rounded-xl p-5 md:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-warning text-lg">info</span>
              <h3 className="text-sm font-bold text-warning font-label-caps tracking-normal">
                CRITICAL INTEGRATION RULES: ATOMIC UNITS & MULTI-CHAIN TOKENS
              </h3>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-white">1. Atomic Units Required:</strong> All swap endpoints (<code className="text-warning font-sans tabular-nums">/swap/quote</code> and <code className="text-warning font-sans tabular-nums">/swap/create</code>) require <code className="text-warning font-sans tabular-nums">amount</code> in raw base/atomic integer units. Never pass human decimals (e.g. <code className="text-error">"1.5"</code> or <code className="text-error">"0.5"</code>). If an amount is below the solver volume threshold (~$0.05 USD), the API returns <code className="text-warning font-sans tabular-nums">AMOUNT_BELOW_MINIMUM</code> (HTTP 400).
            </p>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-white">2. Multi-Chain Disambiguation:</strong> Tokens like <code className="text-primary font-sans tabular-nums">USDC</code> and <code className="text-primary font-sans tabular-nums">USDT</code> exist across 8+ blockchains. Pass the optional <code className="text-primary font-sans tabular-nums">chain</code> parameter (e.g. <code className="text-white font-sans tabular-nums">chain: "sol"</code>, <code className="text-white font-sans tabular-nums">chain: "arb"</code>, <code className="text-white font-sans tabular-nums">chain: "base"</code>) or specify the full <code className="text-primary font-sans tabular-nums">assetId</code> to prevent chain mismatch.
            </p>

            {/* Quick Reference Table */}
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left font-sans tabular-nums text-[11px] text-on-surface-variant border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-outline text-[10px]  tracking-normal">
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
                    <td className="py-2 pr-4 text-primary">sol / base / arb</td>
                    <td className="py-2 pr-4">6</td>
                    <td className="py-2 pr-4 text-warning">1000000</td>
                    <td className="py-2">50000 ($0.05 USDC)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white font-bold">USDT</td>
                    <td className="py-2 pr-4 text-primary">tron / sol / bsc</td>
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
                    <td className="py-2 pr-4 text-primary">eth / base</td>
                    <td className="py-2 pr-4">18</td>
                    <td className="py-2 pr-4 text-warning">1000000000000000000</td>
                    <td className="py-2">20000000000000 (~0.00002 ETH)</td>
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
                  className={`text-[10px] font-label-caps tracking-normal px-4 py-2 rounded-lg transition-colors border ${
                    activeCategory === cat
                      ? "bg-primary text-surface border-primary font-bold"
                      : "bg-white/5 text-on-surface-variant border-white/10 hover:bg-white/[0.08]"
                  }`}
                >
                  {cat === "swap" ? "SWAP API" : "PAYMENTS"}
                </button>
              ))}
            </div>

            <span className="font-label-caps text-[9px] text-on-surface-variant tracking-normal font-bold block mb-2 px-1">
              {activeCategory === "swap" ? "SWAP ENDPOINTS" : "PAYMENT ENDPOINTS"}
            </span>

            {ENDPOINTS.filter((ep) => ep.category === activeCategory).map((ep) => {
              const idx = ENDPOINTS.indexOf(ep);
              return (
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
              );
            })}

            {/* Contextual Info Cards */}
            {activeCategory === "swap" && (
              <div className="mt-8 p-5 rounded-xl bg-white/5 border border-white/15">
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2">
                  INTEGRATION FLOW
                </span>
                <div className="text-xs text-on-surface-variant leading-relaxed space-y-2 mb-4">
                  <p><strong className="text-on-surface">1.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/tokens</code> to list supported assets</p>
                  <p><strong className="text-on-surface">2.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/quote</code> to preview rate &amp; fees</p>
                  <p><strong className="text-on-surface">3.</strong> Call <code className="text-primary bg-white/5 px-1 rounded">/swap/create</code> to get deposit address</p>
                  <p><strong className="text-on-surface">4.</strong> User deposits on source chain</p>
                  <p><strong className="text-on-surface">5.</strong> Poll <code className="text-primary bg-white/5 px-1 rounded">/swap/status</code> until settled</p>
                </div>
              </div>
            )}

            {activeCategory === "payments" && (
              <div className="mt-8 p-5 rounded-xl bg-white/5 border border-white/15">
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2">
                  HOSTED PAY LINKS
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-4">
                  Need a ready-made checkout invoice? Generate a Pay Link from your dashboard and share via WhatsApp.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 text-xs font-label-caps text-on-surface hover:text-primary tracking-normal font-bold transition-colors"
                >
                  <span>OPEN DASHBOARD</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </a>
              </div>
            )}
          </div>

          {/* Right Column: Interactive Code & Response Viewer */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white/5  border border-white/15 rounded-xl p-6 md:p-8 shadow-elevated">
              {/* Endpoint Header */}
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
                        <tr className="border-b border-white/10 text-outline text-[10px]  tracking-normal bg-white/[0.02]">
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
                            <td className="py-2.5 px-3 text-[10px]  tracking-normal text-outline">{p.location}</td>
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
            <div className="bg-white/5  border border-white/15 rounded-xl p-6 md:p-8 shadow-elevated space-y-6">
              <div>
                <div className="flex items-center gap-2 text-on-surface font-semibold text-base mb-2">
                  <span className="material-symbols-outlined text-primary">security</span>
                  <span className="font-label-caps text-[10px] text-primary tracking-normal font-bold">
                    WEBHOOK SECURITY & HMAC SHA-256 VERIFICATION
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed mb-3 font-body-md">
                  Every webhook event dispatched to your <code className="text-primary font-sans tabular-nums">webhookUrl</code> includes an <code className="text-primary font-sans tabular-nums">X-ZkPay-Signature</code> header formatted as <code className="text-primary font-sans tabular-nums">t=timestamp,v1=signature</code>. Always verify this signature against your webhook secret before fulfilling orders.
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

              {/* Webhook Events Reference Table */}
              <div>
                <span className="font-label-caps text-[9px] text-primary tracking-normal font-bold block mb-2">
                  SUPPORTED WEBHOOK EVENT TYPES
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans tabular-nums text-[11px] text-on-surface-variant border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-outline text-[10px]  tracking-normal">
                        <th className="py-2 pr-4 font-bold">Event Name</th>
                        <th className="py-2 pr-4 font-bold">Category</th>
                        <th className="py-2 font-bold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <tr>
                        <td className="py-2 pr-4 text-success font-bold">payin.detected</td>
                        <td className="py-2 pr-4 text-outline">Fiat Payin</td>
                        <td className="py-2">Incoming USDC transfer detected on Base deposit address.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-success font-bold">payin.settled</td>
                        <td className="py-2 pr-4 text-outline">Fiat Payin</td>
                        <td className="py-2">P2P order matched and fiat successfully disbursed to merchant UPI.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-error font-bold">payin.failed</td>
                        <td className="py-2 pr-4 text-outline">Fiat Payin</td>
                        <td className="py-2">Deposit session expired or banking transaction failed.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-primary font-bold">swap.deposit_detected</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Solver network observed deposit transaction on origin chain.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-primary font-bold">swap.settled</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Swap fulfilled and destination tokens delivered to recipient.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-error font-bold">swap.failed</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Swap order could not be filled by solver network.</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-warning font-bold">swap.refunded</td>
                        <td className="py-2 pr-4 text-outline">Cross-Chain Swap</td>
                        <td className="py-2">Incomplete deposit refunded to origin chain refund address.</td>
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
