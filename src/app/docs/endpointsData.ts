export interface EndpointParameter {
  name: string;
  type: string;
  required: boolean;
  location: "query" | "body" | "header";
  description: string;
  example?: string;
}

export interface EndpointCodeExamples {
  curl: string;
  js: string;
  python: string;
  telegram: string;
}

export interface Endpoint {
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  category: "swap";
  rateLimit?: string;
  parameters: EndpointParameter[];
  body?: Record<string, any>;
  response: Record<string, any>;
  codeExamples: EndpointCodeExamples;
}

export const ENDPOINTS: Endpoint[] = [
  // ─── 01. SWAP:Supported Swap Tokens ───
  {
    method: "GET",
    path: "/api/v1/swap/tokens?chain=sol",
    title: "Supported Swap Tokens",
    category: "swap",
    rateLimit: "60 req/min (IP) · 300 req/min (API Key)",
    description:
      "Returns all supported tokens across 9 blockchains. Tokens can be used as either origin (fromAsset) or destination (toAsset). Filter by ?chain=base|sol|eth|btc|tron|arb|bsc|ltc|polygon.",
    parameters: [
      {
        name: "chain",
        type: "string",
        location: "query",
        required: false,
        description:
          "Filter tokens by blockchain. Supported values: 'base', 'sol', 'eth', 'btc', 'tron', 'arb', 'bsc', 'ltc', 'polygon'. If omitted, returns tokens across all chains.",
        example: "sol",
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "API Key (optional, raises rate limit from 60 req/min to 300 req/min).",
        example: "zkpay_live_secret_key",
      },
    ],
    response: {
      success: true,
      count: 17,
      tokens: [
        { assetId: "nep141:sol.omft.near", symbol: "SOL", name: "Solana", blockchain: "sol", decimals: 9 },
        {
          assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
          symbol: "USDC",
          name: "USDC (Base)",
          blockchain: "base",
          decimals: 6,
        },
        { assetId: "nep141:btc.omft.near", symbol: "BTC", name: "Bitcoin", blockchain: "btc", decimals: 8 },
        { assetId: "nep141:eth.omft.near", symbol: "ETH", name: "Ethereum", blockchain: "eth", decimals: 18 },
        { assetId: "nep141:ltc.omft.near", symbol: "LTC", name: "Litecoin", blockchain: "ltc", decimals: 8 },
      ],
    },
    codeExamples: {
      curl: `# Filter supported swap tokens by blockchain (base, sol, eth, btc, tron, arb, bsc, ltc, polygon)
curl -X GET "https://zkpay.top/api/v1/swap/tokens?chain=sol" \\
  -H "Accept: application/json"

# Or query all supported cross-chain tokens with API Key:
curl -X GET "https://zkpay.top/api/v1/swap/tokens" \\
  -H "X-API-Key: zkpay_live_your_secret_key"`,
      js: `// Query supported swap tokens (filter by chain: sol, base, eth, btc, tron, arb, bsc, ltc, polygon)
const chain = "sol";
const res = await fetch(\`https://zkpay.top/api/v1/swap/tokens?chain=\${chain}\`, {
  headers: { "X-API-Key": "YOUR_ZKPAY_API_KEY" }
});
const { tokens } = await res.json();
tokens.forEach(t => console.log(\`\${t.symbol} on \${t.blockchain} (\${t.decimals} decimals) -> \${t.assetId}\`));`,
      python: `import requests

params = {"chain": "sol"}  # "base", "sol", "eth", "btc", "tron", "arb", "bsc", "ltc", "polygon"
headers = {"X-API-Key": "YOUR_ZKPAY_API_KEY"}

response = requests.get("https://zkpay.top/api/v1/swap/tokens", params=params, headers=headers)
data = response.json()
for token in data.get("tokens", []):
    print(f"{token['symbol']} ({token['blockchain']}) - Decimals: {token['decimals']}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - List Swap Tokens
bot.command('tokens', async (ctx) => {
  const chain = (ctx.message.text.split(' ')[1] || '').toLowerCase();
  const url = chain ? \`https://zkpay.top/api/v1/swap/tokens?chain=\${chain}\` : 'https://zkpay.top/api/v1/swap/tokens';

  const res = await fetch(url);
  const data = await res.json();

  if (!data.success || !data.tokens?.length) {
    return ctx.reply('❌ No tokens found. Supported chains: base, sol, eth, btc, tron, arb, bsc, ltc, polygon');
  }

  const list = data.tokens.slice(0, 8).map(t =>
    \`• *\${t.symbol}* (\${t.name}) — \\\`\${t.blockchain}\\\` [\${t.decimals} dec]\`
  ).join('\\n');

  await ctx.reply(
    \`🪙 *Supported Swap Tokens (\${chain ? chain.toUpperCase() : 'All Chains'})*\\n\\n\${list}\\n\\n\` +
    \`_Total assets available: \${data.count}_\`,
    { parse_mode: 'Markdown' }
  );
});`,
    },
  },

  // ─── 02. SWAP: Get Swap Quote (Dry Run) ───
  {
    method: "GET",
    path: "/api/v1/swap/quote?fromAsset=SOL&chain=sol&toAsset=USDC&destinationChain=base&amount=1000000000&totalFeeBps=100&slippageBps=100",
    title: "Get Swap Quote (Dry Run)",
    category: "swap",
    rateLimit: "30 req/min (IP) · 120 req/min (API Key)",
    description:
      "Preview real-time crypto-to-crypto pricing with transparent 50/50 partner fee breakdown and execution plan. Pass your X-API-Key header to preview your exact 50% partner fee share. On fee-share chains (Base, Polygon, Arbitrum, BSC, Solana SOL, Litecoin LTC), 100% of fees are swept to ZkPay Treasury on-chain and your 50% share is credited in USD at the live CoinGecko rate upon settlement. High-gas L1 routes (Ethereum Mainnet and Bitcoin) route directly with 0% platform fee to save user gas.",
    parameters: [
      {
        name: "fromAsset",
        type: "string",
        location: "query",
        required: true,
        description: "Source token symbol (e.g. 'SOL', 'ETH', 'LTC', 'BTC') or full assetId.",
        example: "SOL",
      },
      {
        name: "amount",
        type: "string",
        location: "query",
        required: true,
        description:
          "Amount to swap as an integer string in raw base/atomic units (e.g. 1000000000 for 1 SOL, 10000000000000000 for 0.01 ETH). Never pass human decimals.",
        example: "1000000000",
      },
      {
        name: "chain",
        type: "string",
        location: "query",
        required: false,
        description: "Source blockchain: 'sol', 'base', 'polygon', 'ltc', 'arb', 'bsc', 'eth', 'btc', 'tron'.",
        example: "sol",
      },
      {
        name: "toAsset",
        type: "string",
        location: "query",
        required: false,
        description: "Destination token symbol (e.g. 'USDC', 'SOL'). Defaults to Base USDC if omitted.",
        example: "USDC",
      },
      {
        name: "destinationChain",
        type: "string",
        location: "query",
        required: false,
        description:
          "Destination blockchain (e.g. 'sol', 'base', 'polygon', 'ltc', 'arb', 'bsc', 'eth', 'btc', 'tron'). Defaults to Base if omitted.",
        example: "base",
      },
      {
        name: "totalFeeBps",
        type: "number",
        location: "query",
        required: false,
        description:
          "Custom partner fee in basis points (range: 20 to 450 bps, default 100 for 1.00%). Split 50/50 between Partner (credited in USD on settlement) and ZkPay Treasury.",
        example: "100",
      },
      {
        name: "slippageBps",
        type: "number",
        location: "query",
        required: false,
        description: "Slippage tolerance in basis points (range: 10 to 500 bps, default 100 for 1.00%).",
        example: "100",
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description:
          "Partner API key (recommended so the quote preview reflects your 50/50 partner fee split and higher rate limits).",
        example: "zkpay_live_secret_key",
      },
    ],
    response: {
      success: true,
      quote: {
        quoteId: "q_1727382000000",
        originAsset: "nep141:sol.omft.near",
        destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
        totalAmountIn: "1000000000",
        netSwapAmount: "988800000",
        feeAmount: "11200000",
        partnerFeeAmount: "5000000",
        zkpayFeeAmount: "6200000",
        amountIn: "988800000",
        amountInFormatted: "0.9888",
        amountOut: "102500000",
        amountOutFormatted: "102.50",
        minAmountOut: "101475000",
        minAmountOutFormatted: "101.47",
        timeEstimateSeconds: 45,
        expiresAt: "2026-10-01T15:00:00.000Z",
      },
    },
    codeExamples: {
      curl: `# GET request for Solana to Base USDC swap with 50/50 partner fee share:
curl -X GET "https://zkpay.top/api/v1/swap/quote?fromAsset=SOL&chain=sol&toAsset=USDC&destinationChain=base&amount=1000000000&totalFeeBps=100&slippageBps=100" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Accept: application/json"`,
      js: `// Calculate swap quote with 50/50 partner fee split and atomic units
const query = new URLSearchParams({
  fromAsset: "SOL",
  chain: "sol",
  toAsset: "USDC",
  destinationChain: "base",
  amount: "1000000000", // 1 SOL in lamports
  totalFeeBps: "100",   // 1.00% total fee (50% credited in USD to Partner, 50% to ZkPay)
  slippageBps: "100"
});

const res = await fetch(\`https://zkpay.top/api/v1/swap/quote?\${query}\`, {
  headers: {
    "Accept": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  }
});
const { quote } = await res.json();
console.log(\`Estimated: \${quote.amountOutFormatted} USDC (Min: \${quote.minAmountOutFormatted} USDC)\`);`,
      python: `import requests

params = {
    "fromAsset": "SOL",
    "chain": "sol",
    "toAsset": "USDC",
    "destinationChain": "base",
    "amount": "1000000000",  # Atomic units integer string
    "totalFeeBps": 100,
    "slippageBps": 100
}
headers = {"X-API-Key": "YOUR_ZKPAY_API_KEY"}
response = requests.get("https://zkpay.top/api/v1/swap/quote", params=params, headers=headers)
data = response.json()
q = data["quote"]
print(f"Est Output: {q['amountOutFormatted']} USDC (Est Time: {q['timeEstimateSeconds']}s)")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Cross-Chain Swap Quote Preview
bot.command('swapquote', async (ctx) => {
  const [from, to, amountHuman] = ctx.message.text.split(' ').slice(1);
  if (!from || !to || !amountHuman) {
    return ctx.reply('Usage: /swapquote <fromAsset> <toAsset> <amount>\\nExample: /swapquote SOL USDC 1.0');
  }

  const atomic = (BigInt(Math.round(Number(amountHuman) * 1e6)) * BigInt(1e3)).toString();
  const query = new URLSearchParams({
    fromAsset: from.toUpperCase(),
    chain: from.toLowerCase(),
    toAsset: to.toUpperCase(),
    destinationChain: 'base',
    amount: atomic,
    totalFeeBps: '100',
    slippageBps: '100'
  });

  const res = await fetch(\`https://zkpay.top/api/v1/swap/quote?\${query}\`, {
    headers: { 'X-API-Key': process.env.ZKPAY_API_KEY }
  });
  const data = await res.json();
  if (!data.success) return ctx.reply(\`❌ \${data.message || data.error}\`);

  const q = data.quote;
  await ctx.reply(
    \`🔄 *Live Swap Rate Quote*\\n\\n\` +
    \`• *Deposit:* \${amountHuman} \${from.toUpperCase()}\\n\` +
    \`• *Estimated Output:* *\${q.amountOutFormatted} \${to.toUpperCase()}*\\n\` +
    \`• *Guaranteed Minimum:* \${q.minAmountOutFormatted} \${to.toUpperCase()}\\n\` +
    \`• *Est. Settlement Time:* ~\${q.timeEstimateSeconds}s\`,
    { parse_mode: 'Markdown' }
  );
});`,
    },
  },

  // ─── 03. SWAP: Create Swap Order ───
  {
    method: "POST",
    path: "/api/v1/swap/create",
    title: "Create Swap Order",
    category: "swap",
    rateLimit: "10 req/min (IP) · 60 req/min (API Key)",
    description:
      "Commits a cross-chain crypto-to-crypto swap order and generates a single-use deposit address. Authenticate with your X-API-Key header to automatically attribute the swap to your Partner account and activate the 50/50 fee split (no per-chain feeRecipient required). Upon settlement, 50% of the custom fee is converted to USD at the live CoinGecko rate and credited to your Partner Portal balance.",
    parameters: [
      {
        name: "fromAsset",
        type: "string",
        location: "body",
        required: true,
        description: "Source token symbol (e.g. 'ETH', 'SOL', 'LTC', 'BTC'). Also accepts 'originAsset'.",
        example: "SOL",
      },
      {
        name: "amount",
        type: "string",
        location: "body",
        required: true,
        description: "Amount to swap as an integer string in raw base/atomic units (e.g. '1000000000' for 1 SOL).",
        example: "1000000000",
      },
      {
        name: "recipient",
        type: "string",
        location: "body",
        required: true,
        description: "User's destination-chain wallet address to receive the swapped tokens.",
        example: "0xUserBaseRecipientAddress",
      },
      {
        name: "chain",
        type: "string",
        location: "body",
        required: false,
        description:
          "Source blockchain (e.g. 'sol', 'base', 'polygon', 'ltc', 'arb', 'bsc', 'eth', 'btc', 'tron'). Also accepts 'originChain'.",
        example: "sol",
      },
      {
        name: "toAsset",
        type: "string",
        location: "body",
        required: false,
        description: "Target token symbol (e.g. 'SOL', 'USDC'). Defaults to Base USDC if omitted.",
        example: "USDC",
      },
      {
        name: "destinationChain",
        type: "string",
        location: "body",
        required: false,
        description:
          "Target blockchain (e.g. 'sol', 'base', 'polygon', 'ltc', 'arb', 'bsc', 'eth', 'btc', 'tron'). Defaults to Base if omitted.",
        example: "base",
      },
      {
        name: "refundTo",
        type: "string",
        location: "body",
        required: false,
        description: "User's origin-chain address for automatic refund if solvers cannot fulfill.",
        example: "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
      },
      {
        name: "totalFeeBps",
        type: "number",
        location: "body",
        required: false,
        description:
          "Custom partner fee in basis points (range: 20 to 450 bps, default 100 for 1.00%). Split 50/50 between Partner (credited in USD on settlement) and ZkPay Treasury.",
        example: "100",
      },
      {
        name: "slippageBps",
        type: "number",
        location: "body",
        required: false,
        description: "Slippage tolerance in basis points (range: 10 to 500 bps, default 100).",
        example: "100",
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: true,
        description:
          "Partner API key for order tracking and automatic 50/50 USD fee attribution. Also accepts 'Authorization: Bearer <key>'.",
        example: "zkpay_live_secret_key",
      },
    ],
    body: {
      fromAsset: "SOL",
      chain: "sol",
      toAsset: "USDC",
      destinationChain: "base",
      amount: "1000000000",
      recipient: "0xUserBaseRecipientAddress",
      refundTo: "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
      totalFeeBps: 100,
      slippageBps: 100,
    },
    response: {
      success: true,
      order: {
        swapId: "swp_1727382000000",
        status: "PENDING_DEPOSIT",
        totalAmountIn: "1000000000",
        netSwapAmount: "988800000",
        feeAmount: "11200000",
        partnerFeeAmount: "5000000",
        zkpayFeeAmount: "6200000",
        deposit: {
          address: "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
          memo: null,
          amount: "1",
          deadline: "2026-10-01T15:15:00.000Z",
        },
        settlement: {
          recipient: "0xUserBaseRecipientAddress",
          destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
          estimatedAmountOut: "102.50",
          minAmountOut: "101.47",
          timeEstimateSeconds: 60,
        },
      },
    },
    codeExamples: {
      curl: `curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fromAsset": "SOL",
    "chain": "sol",
    "toAsset": "USDC",
    "destinationChain": "base",
    "amount": "1000000000",
    "recipient": "0xUserBaseRecipientAddress",
    "refundTo": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
    "totalFeeBps": 100,
    "slippageBps": 100
  }'`,
      js: `// Commit cross-chain swap order and obtain a single-use deposit address
const res = await fetch("https://zkpay.top/api/v1/swap/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  },
  body: JSON.stringify({
    fromAsset: "SOL",
    chain: "sol",
    toAsset: "USDC",
    destinationChain: "base",
    amount: "1000000000", // 1 SOL in lamports
    recipient: "0xUserBaseRecipientAddress",
    refundTo: "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
    totalFeeBps: 100,
    slippageBps: 100
  })
});
const data = await res.json();
console.log("Deposit to:", data.order.deposit.address, "Amount:", data.order.deposit.amount);`,
      python: `import requests

payload = {
    "fromAsset": "SOL",
    "chain": "sol",
    "toAsset": "USDC",
    "destinationChain": "base",
    "amount": "1000000000",
    "recipient": "0xUserBaseRecipientAddress",
    "refundTo": "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
    "totalFeeBps": 100,
    "slippageBps": 100
}
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
}
response = requests.post("https://zkpay.top/api/v1/swap/create", json=payload, headers=headers)
data = response.json()
print("Deposit Address:", data["order"]["deposit"]["address"])`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Initiate Live Swap Order
bot.command('swap', async (ctx) => {
  const [from, to, amountHuman, recipient] = ctx.message.text.split(' ').slice(1);
  if (!from || !to || !amountHuman || !recipient) {
    return ctx.reply('Usage: /swap <from> <to> <amount> <recipientAddress>');
  }

  const atomicAmount = (BigInt(Math.round(Number(amountHuman) * 1e6)) * BigInt(1e3)).toString();
  const res = await fetch('https://zkpay.top/api/v1/swap/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.ZKPAY_API_KEY
    },
    body: JSON.stringify({
      fromAsset: from.toUpperCase(),
      chain: from.toLowerCase(),
      toAsset: to.toUpperCase(),
      destinationChain: 'base',
      amount: atomicAmount,
      recipient,
      totalFeeBps: 100,
      slippageBps: 100
    })
  });
  const data = await res.json();
  if (!data.success) return ctx.reply(\`❌ Swap creation failed: \${data.message || data.error}\`);

  const ord = data.order;
  await ctx.reply(
    \`📥 *Swap Order Created*\\n\\n\` +
    \`Deposit *\${ord.deposit.amount} \${from.toUpperCase()}* to:\\n\\\`\${ord.deposit.address}\\\`\\n\\n\` +
    \`• *Estimated Output:* ~\${ord.settlement.estimatedAmountOut} \${to.toUpperCase()}\`,
    { parse_mode: 'Markdown' }
  );
});`,
    },
  },

  // ─── 04. SWAP: Track Swap Status ───
  {
    method: "GET",
    path: "/api/v1/swap/status?depositAddress=0x89c1...",
    title: "Track Swap Status",
    category: "swap",
    rateLimit: "60 req/min (IP) · 240 req/min (API Key)",
    description:
      "Polls real-time swap execution across source and destination chains. Returns mapped status: pending → processing → settled / failed / refunded. If a swap fails or times out, status transitions to 'refunded' and funds return to 'refundTo'.",
    parameters: [
      {
        name: "depositAddress",
        type: "string",
        location: "query",
        required: true,
        description: "The single-use deposit address on the source chain returned by /swap/create. Also accepts 'address'.",
        example: "0x89c1...EthereumDepositAddress",
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "API Key (optional, raises rate limit from 60 req/min to 240 req/min for faster polling).",
        example: "zkpay_live_secret_key",
      },
    ],
    response: {
      success: true,
      depositAddress: "0x89c1...EthereumDepositAddress",
      status: "settled",
      rawStatus: "SUCCESS",
      depositedAmount: "0.01 ETH",
      settledAmount: "0.2415 SOL",
      destinationTxHash: "5KtP...solanaTxSignature",
      destinationExplorerUrl: "https://solscan.io/tx/5KtP...",
      updatedAt: "2026-10-01T15:02:15.000Z",
    },
    codeExamples: {
      curl: `curl -X GET "https://zkpay.top/api/v1/swap/status?depositAddress=0x89c1...EthereumDepositAddress" \\
  -H "X-API-Key: zkpay_live_your_secret_key"`,
      js: `// Poll real-time swap execution state across chains
const depositAddress = "0x89c1...EthereumDepositAddress";
const res = await fetch(\`https://zkpay.top/api/v1/swap/status?depositAddress=\${depositAddress}\`, {
  headers: { "X-API-Key": "YOUR_ZKPAY_API_KEY" }
});
const status = await res.json();
console.log(\`Swap Status: \${status.status}\`);
if (status.status === "settled") {
  console.log(\`Delivered: \${status.settledAmount}\`);
  console.log(\`Explorer Link: \${status.destinationExplorerUrl}\`);
}`,
      python: `import requests

params = {"depositAddress": "0x89c1...EthereumDepositAddress"}
headers = {"X-API-Key": "YOUR_ZKPAY_API_KEY"}

response = requests.get("https://zkpay.top/api/v1/swap/status", params=params, headers=headers)
data = response.json()
print(f"Status: {data.get('status')}, Settled: {data.get('settledAmount')}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Track Swap Order Execution
bot.command('swapstatus', async (ctx) => {
  const depositAddress = ctx.message.text.split(' ')[1];
  if (!depositAddress) return ctx.reply('Usage: /swapstatus <depositAddress>');

  const res = await fetch(\`https://zkpay.top/api/v1/swap/status?depositAddress=\${depositAddress}\`);
  const data = await res.json();
  if (!data.success) return ctx.reply(\`❌ \${data.message || 'Status query failed'}\`);

  await ctx.reply(
    \`🛰️ *Swap Status:* \${data.status.toUpperCase()}\\n\` +
    \`• *Deposited:* \${data.depositedAmount || 'Awaiting deposit'}\\n\` +
    (data.settledAmount ? \`• *Delivered:* \${data.settledAmount}\` : ''),
    { parse_mode: 'Markdown' }
  );
});`,
    },
  },
];
