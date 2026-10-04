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
  category: "payments" | "swap";
  rateLimit?: string;
  parameters: EndpointParameter[];
  body?: Record<string, any>;
  response: Record<string, any>;
  codeExamples: EndpointCodeExamples;
}

export const ENDPOINTS: Endpoint[] = [
  // ─── 01. PAYMENTS: Live Exchange Rates ───
  {
    method: "GET",
    path: "/api/v1/rates",
    title: "Live Exchange Rates",
    category: "payments",
    description: "Returns live on-chain exchange rates for supported fiat currencies (INR, USD, EUR, GBP) queried directly from the P2P Diamond contract on Base Mainnet. No authentication required.",
    parameters: [
      {
        name: "currency",
        type: "string",
        location: "query",
        required: false,
        description: "Filter to a single fiat currency. Supported values: 'INR', 'USD', 'EUR', 'GBP'. If omitted, returns live rates for all supported fiat currencies.",
        example: "INR"
      },
      {
        name: "Accept",
        type: "string",
        location: "header",
        required: false,
        description: "Preferred content format for response.",
        example: "application/json"
      }
    ],
    response: {
      success: true,
      rates: {
        USDC_INR: { sell: 87.5, buy: 88.2, spread: 0.7, lastUpdated: 1755500000, source: "onchain_diamond" },
        USDC_USD: { sell: 1.0, buy: 1.01, spread: 0.01, lastUpdated: 1755500000, source: "onchain_diamond" },
        USDC_EUR: { sell: 0.92, buy: 0.93, spread: 0.01, lastUpdated: 1755500000, source: "onchain_diamond" },
        USDC_GBP: { sell: 0.78, buy: 0.79, spread: 0.01, lastUpdated: 1755500000, source: "onchain_diamond" }
      },
      network: "Base Mainnet",
      chainId: 8453
    },
    codeExamples: {
      curl: `# Query all live fiat exchange rates on Base Mainnet:
curl -X GET "https://zkpay.top/api/v1/rates" \\
  -H "Accept: application/json"

# Or filter by single currency (e.g. INR):
curl -X GET "https://zkpay.top/api/v1/rates?currency=INR" \\
  -H "Accept: application/json"`,
      js: `// Fetch live on-chain USDC exchange rates (all fiat currencies or specific currency)
const currency = "INR"; // Optional: "INR" | "USD" | "EUR" | "GBP"
const url = currency 
  ? \`https://zkpay.top/api/v1/rates?currency=\${currency}\` 
  : "https://zkpay.top/api/v1/rates";

const res = await fetch(url, {
  method: "GET",
  headers: { "Accept": "application/json" }
});
const data = await res.json();
console.log("Network:", data.network);
console.log(\`1 USDC = ₹\${data.rates.USDC_INR.sell} INR (Spread: \${data.rates.USDC_INR.spread}%)\`);`,
      python: `import requests

# Query live on-chain rates (pass currency='INR' or omit for all currencies)
params = {"currency": "INR"}  # Optional: "INR", "USD", "EUR", "GBP"
headers = {"Accept": "application/json"}

response = requests.get("https://zkpay.top/api/v1/rates", params=params, headers=headers)
data = response.json()

print(f"Network: {data.get('network')}")
rates = data.get("rates", {})
if "USDC_INR" in rates:
    print(f"1 USDC = {rates['USDC_INR']['sell']} INR (Spread: {rates['USDC_INR']['spread']}%)")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Query Live Oracle Rates
bot.command('rate', async (ctx) => {
  const currency = (ctx.message.text.split(' ')[1] || 'INR').toUpperCase();

  const res = await fetch(\`https://zkpay.top/api/v1/rates?currency=\${currency}\`);
  const data = await res.json();

  if (!data.success || !data.rates[\`USDC_\${currency}\`]) {
    return ctx.reply(\`❌ Currency \${currency} not supported. Try: INR, USD, EUR, GBP\`);
  }

  const rate = data.rates[\`USDC_\${currency}\`];
  await ctx.reply(
    \`💱 *Live ZkPay Oracle Rate*\\n\\n\` +
    \`• *Pair:* USDC/\${currency}\\n\` +
    \`• *Sell Rate:* \${rate.sell} \${currency}\\n\` +
    \`• *Network:* \${data.network} (Base Chain ID 8453)\\n\` +
    \`• *Spread:* \${rate.spread}% (0% ZkPay markup)\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 02. PAYMENTS: Fee & Payout Calculator ───
  {
    method: "POST",
    path: "/api/v1/quotes",
    title: "Fee & Payout Calculator",
    category: "payments",
    description: "Computes exact USDC principal, 1% ZkPay fee, total required, and validates 100 USDC zero-KYC tier limits. Maximum single order amount is 10,000 fiat units.",
    parameters: [
      {
        name: "amount",
        type: "number",
        location: "body",
        required: true,
        description: "Desired fiat payout amount to be disbursed to recipient. Must be a positive number under 10,000.",
        example: "1000"
      },
      {
        name: "currency",
        type: "string",
        location: "body",
        required: false,
        description: "Fiat currency for payout. Supported: 'INR' (default), 'USD', 'EUR', 'GBP'.",
        example: "INR"
      },
      {
        name: "Content-Type",
        type: "string",
        location: "header",
        required: true,
        description: "Must be 'application/json'.",
        example: "application/json"
      }
    ],
    body: {
      amount: 1000,
      currency: "INR"
    },
    response: {
      success: true,
      fiatAmount: "₹ 1,000.00",
      usdcPrincipal: "11.43",
      feeUsdc: "0.11",
      protocolFeeUsdc: "0.00",
      totalUsdc: "11.54",
      rate: "87.50",
      feeBps: 100,
      currency: "INR",
      withinNoKycLimit: true,
      expiresAt: 1755500300
    },
    codeExamples: {
      curl: `curl -X POST "https://zkpay.top/api/v1/quotes" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 1000,
    "currency": "INR"
  }'`,
      js: `// Calculate exact USDC required and verify zero-KYC tier eligibility (<$100)
const res = await fetch("https://zkpay.top/api/v1/quotes", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: 1000,       // Desired fiat payout
    currency: "INR"     // "INR" | "USD" | "EUR" | "GBP"
  })
});
const quote = await res.json();
console.log(\`Pay \${quote.totalUsdc} USDC to settle \${quote.fiatAmount}\`);
console.log(\`Zero-KYC Eligible (<$100): \${quote.withinNoKycLimit}\`);`,
      python: `import requests

payload = {
    "amount": 1000,
    "currency": "INR"  # "INR", "USD", "EUR", "GBP"
}
headers = {"Content-Type": "application/json"}

response = requests.post("https://zkpay.top/api/v1/quotes", json=payload, headers=headers)
quote = response.json()

print(f"Fiat Amount: {quote['fiatAmount']}")
print(f"Total USDC needed: {quote['totalUsdc']} (Fee: {quote['feeUsdc']} USDC)")
print(f"Within Zero-KYC Floor: {quote['withinNoKycLimit']}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Calculate Fee Quote
bot.command('quote', async (ctx) => {
  const [amountStr, curr = 'INR'] = ctx.message.text.split(' ').slice(1);
  const amount = Number(amountStr);
  if (!amount || isNaN(amount)) {
    return ctx.reply('Usage: /quote <amount> [currency]\\nExample: /quote 1000 INR');
  }

  const res = await fetch('https://zkpay.top/api/v1/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: curr.toUpperCase() })
  });
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ \${data.error || 'Failed to fetch quote'}\`);

  await ctx.reply(
    \`🧾 *ZkPay Fee Breakdown*\\n\\n\` +
    \`• *Payout:* \${data.fiatAmount}\\n\` +
    \`• *USDC Principal:* \${data.usdcPrincipal} USDC\\n\` +
    \`• *Protocol Fee (1%):* \${data.feeUsdc} USDC\\n\` +
    \`• *Total to Debit:* *\${data.totalUsdc} USDC*\\n\` +
    \`• *Effective Rate:* 1 USDC = \${data.rate} \${curr.toUpperCase()}\\n\` +
    \`• *Zero-KYC Floor:* \${data.withinNoKycLimit ? '✅ Under $100 (No KYC)' : '⚠️ Requires zkKYC'}\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 03. PAYMENTS: Create Shareable Pay Link ───
  {
    method: "POST",
    path: "/api/v1/paylinks",
    title: "Create Shareable Pay Link",
    category: "payments",
    description: "Generates a hosted payment URL with 1-click wallet connect, EIP-681 QR view, custom branding, and webhook notification triggers. Ideal for e-commerce checkouts and invoices.",
    parameters: [
      {
        name: "amountINR",
        type: "number",
        location: "body",
        required: true,
        description: "Fiat amount in INR to be disbursed to merchant upon wallet payment (e.g. 2500). Also accepts 'amount'.",
        example: "2500"
      },
      {
        name: "recipientUpi",
        type: "string",
        location: "body",
        required: true,
        description: "Recipient merchant UPI VPA (Virtual Payment Address). Must contain '@' e.g. 'merchant@okaxis'. Also accepts 'upi'.",
        example: "merchant@okaxis"
      },
      {
        name: "title",
        type: "string",
        location: "body",
        required: false,
        description: "Title or invoice label shown on hosted pay page (max 100 chars). Defaults to 'ZkPay Payment'.",
        example: "Invoice #104 - Freelance Work"
      },
      {
        name: "type",
        type: "string",
        location: "body",
        required: false,
        description: "Payment link type: 'one_time' (single payment, deactivated after settlement) or 'reusable' (accepts recurring payments). Defaults to 'one_time'.",
        example: "one_time"
      },
      {
        name: "webhookUrl",
        type: "string",
        location: "body",
        required: false,
        description: "Public HTTPS URL to receive HMAC SHA-256 signed event notifications upon settlement.",
        example: "https://mysite.com/api/zkpay-webhook"
      },
      {
        name: "redirectUrl",
        type: "string",
        location: "body",
        required: false,
        description: "Public HTTPS URL to redirect payer's browser upon successful on-chain settlement.",
        example: "https://mysite.com/checkout/success"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: true,
        description: "Merchant API Key for authentication and order attribution. Format: 'zkpay_live_...'. Also accepts 'Authorization: Bearer <key>'.",
        example: "zkpay_live_secret_key"
      }
    ],
    body: {
      title: "Invoice #104 - Freelance Work",
      amountINR: 2500,
      recipientUpi: "merchant@okaxis",
      type: "one_time",
      webhookUrl: "https://mysite.com/api/zkpay-webhook",
      redirectUrl: "https://mysite.com/checkout/success"
    },
    response: {
      success: true,
      linkId: "pl_live_9a8f2c",
      payUrl: "https://zkpay.top/pay/pl_live_9a8f2c",
      amountINR: "₹ 2,500.00",
      estimatedUsdc: "28.57 USDC",
      status: "ACTIVE",
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fzkpay.top%2Fpay%2Fpl_live_9a8f2c",
      createdAt: 1727382000000
    },
    codeExamples: {
      curl: `curl -X POST "https://zkpay.top/api/v1/paylinks" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Invoice #104 - Freelance Work",
    "amountINR": 2500,
    "recipientUpi": "merchant@okaxis",
    "type": "one_time",
    "webhookUrl": "https://mysite.com/api/zkpay-webhook",
    "redirectUrl": "https://mysite.com/checkout/success"
  }'`,
      js: `// Generate hosted checkout URL with QR code and wallet connect
const res = await fetch("https://zkpay.top/api/v1/paylinks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  },
  body: JSON.stringify({
    title: "Invoice #104 - Freelance Work",
    amountINR: 2500,
    recipientUpi: "merchant@okaxis",
    type: "one_time", // "one_time" | "reusable"
    webhookUrl: "https://mysite.com/api/zkpay-webhook",
    redirectUrl: "https://mysite.com/checkout/success"
  })
});
const link = await res.json();
console.log(\`Hosted Pay Link: \${link.payUrl}\`);
console.log(\`QR Code: \${link.qrCodeUrl}\`);`,
      python: `import requests

payload = {
    "title": "Invoice #104 - Freelance Work",
    "amountINR": 2500,
    "recipientUpi": "merchant@okaxis",
    "type": "one_time",  # "one_time" or "reusable"
    "webhookUrl": "https://mysite.com/api/zkpay-webhook",
    "redirectUrl": "https://mysite.com/checkout/success"
}
headers = {
    "X-API-Key": "YOUR_ZKPAY_API_KEY",
    "Content-Type": "application/json"
}

response = requests.post("https://zkpay.top/api/v1/paylinks", json=payload, headers=headers)
link = response.json()
print(f"Shareable Pay URL: {link['payUrl']}")
print(f"Status: {link['status']} | Estimated: {link['estimatedUsdc']}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Generate Shareable Invoice Link
bot.command('invoice', async (ctx) => {
  const [amount, upi, ...titleWords] = ctx.message.text.split(' ').slice(1);
  const title = titleWords.join(' ') || 'Order Payment';

  if (!amount || !upi) {
    return ctx.reply('Usage: /invoice <amountINR> <recipientUpi> [title]\\nExample: /invoice 2500 merchant@okaxis Web Design');
  }

  const res = await fetch('https://zkpay.top/api/v1/paylinks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.ZKPAY_API_KEY
    },
    body: JSON.stringify({
      title,
      amountINR: Number(amount),
      recipientUpi: upi,
      type: 'one_time',
      webhookUrl: 'https://my-bot.com/webhook',
      redirectUrl: \`https://t.me/\${ctx.botInfo.username}\`
    })
  });
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ \${data.error || 'Failed to create pay link'}\`);

  await ctx.reply(
    \`🔗 *Payment Invoice Created*\\n\\n\` +
    \`• *Title:* \${data.title}\\n\` +
    \`• *Amount:* ₹\${amount} (\${data.estimatedUsdc})\\n\` +
    \`• *Settles To:* \`\${upi}\`\\n\\n\` +
    \`Tap the button below to connect wallet & pay in USDC on Base:\`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: \`💳 Pay ₹\${amount} with Crypto\`, url: data.payUrl }]]
      }
    }
  );
});`
    }
  },

  // ─── 04. PAYMENTS: Track Pay Link Status ───
  {
    method: "GET",
    path: "/api/v1/paylinks?id=pl_live_9a8f2c",
    title: "Track Pay Link Status",
    category: "payments",
    description: "Fetches live payment status, on-chain transaction hash, settlement timestamps, and payment details for a specific pay link.",
    parameters: [
      {
        name: "id",
        type: "string",
        location: "query",
        required: true,
        description: "The unique pay link ID returned at creation (e.g. 'pl_live_9a8f2c').",
        example: "pl_live_9a8f2c"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "Merchant API Key (optional, allows creator to view private order notes).",
        example: "zkpay_live_secret_key"
      }
    ],
    response: {
      success: true,
      linkId: "pl_live_9a8f2c",
      title: "Invoice #104 - Freelance Work",
      payUrl: "https://zkpay.top/pay/pl_live_9a8f2c",
      amountINR: "₹ 2,500.00",
      estimatedUsdc: "28.57 USDC",
      recipientUpi: "merchant@okaxis",
      type: "one_time",
      status: "PAID",
      rate: 87.5,
      createdAt: 1727382000000,
      paidAt: 1727382120000,
      txHash: "0x7a4e89f2d1c6b3e5a0f8c4d2e1b9a7f5c3d1e0b8a6f4c2d0e9b7a5f3c1d9e7b5"
    },
    codeExamples: {
      curl: `curl -X GET "https://zkpay.top/api/v1/paylinks?id=pl_live_9a8f2c" \\
  -H "X-API-Key: zkpay_live_your_secret_key"`,
      js: `// Query status and on-chain payment details for a pay link
const linkId = "pl_live_9a8f2c";
const res = await fetch(\`https://zkpay.top/api/v1/paylinks?id=\${linkId}\`, {
  headers: { "X-API-Key": "YOUR_ZKPAY_API_KEY" }
});
const link = await res.json();
console.log(\`Status: \${link.status}\`); // ACTIVE, PAID, EXPIRED
if (link.status === "PAID") {
  console.log(\`Paid at: \${link.paidAt} | On-chain Tx: \${link.txHash}\`);
}`,
      python: `import requests

params = {"id": "pl_live_9a8f2c"}
headers = {"X-API-Key": "YOUR_ZKPAY_API_KEY"}

response = requests.get("https://zkpay.top/api/v1/paylinks", params=params, headers=headers)
link = response.json()

print(f"Status: {link.get('status')} | Tx: {link.get('txHash')}")
print(f"Amount: {link.get('amountINR')} | Paid At: {link.get('paidAt')}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Track Invoice Status
bot.command('checklink', async (ctx) => {
  const linkId = ctx.message.text.split(' ')[1];
  if (!linkId) return ctx.reply('Usage: /checklink <linkId>\\nExample: /checklink pl_live_9a8f2c');

  const res = await fetch(\`https://zkpay.top/api/v1/paylinks?id=\${linkId}\`, {
    headers: { 'X-API-Key': process.env.ZKPAY_API_KEY }
  });
  const link = await res.json();

  if (!link.success) return ctx.reply(\`❌ Link not found.\`);

  const statusBadge = link.status === 'PAID' ? '✅ PAID & SETTLED' : '⏳ AWAITING PAYMENT';
  await ctx.reply(
    \`📋 *Invoice Status: \${statusBadge}*\\n\\n\` +
    \`• *Link ID:* \`\${link.linkId}\`\\n\` +
    \`• *Title:* \${link.title}\\n\` +
    \`• *Amount:* \${link.amountINR} (\${link.estimatedUsdc})\\n\` +
    \`• *Recipient:* \`\${link.recipientUpi}\`\\n\` +
    (link.txHash ? \`• *On-Chain Tx:* \`\${link.txHash}\`\\n\` : '') +
    (link.paidAt ? \`• *Paid At:* \${new Date(link.paidAt).toLocaleString()}\\n\` : ''),
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 05. PAYMENTS: Dynamic Deposit Session (Bots) ───
  {
    method: "POST",
    path: "/api/v1/payin-sessions",
    title: "Dynamic Deposit Session (Bots)",
    category: "payments",
    description: "Generates a 30-minute unique Base deposit address for Telegram/Discord bots with automated on-chain listener. As soon as USDC is detected, funds are automatically swept and dispatched to merchant UPI.",
    parameters: [
      {
        name: "recipientUpi",
        type: "string",
        location: "body",
        required: true,
        description: "Merchant UPI VPA to receive the fiat settlement (e.g. 'merchant@okaxis').",
        example: "merchant@okaxis"
      },
      {
        name: "amountINR",
        type: "number",
        location: "body",
        required: true,
        description: "Desired INR amount to be disbursed to merchant UPI (e.g. 500).",
        example: "500"
      },
      {
        name: "webhookUrl",
        type: "string",
        location: "body",
        required: false,
        description: "Public HTTPS webhook URL to notify bot server upon settlement.",
        example: "https://my-bot.com/webhook"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "Merchant API Key (optional, recommended for merchant revenue tracking).",
        example: "zkpay_live_secret_key"
      }
    ],
    body: {
      recipientUpi: "merchant@okaxis",
      amountINR: 500,
      webhookUrl: "https://my-bot.com/webhook"
    },
    response: {
      success: true,
      sessionId: "ses_live_8f7a2c9b1d",
      status: "AWAITING_PAYMENT",
      clientSecret: "sec_8f7a2c9b1d",
      statusUrl: "/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d&token=sec_8f7a2c9b1d",
      payinAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      network: "Base Mainnet",
      expectedAmountUsdc: "5.76",
      fiatAmount: "₹ 500.00",
      recipientUpi: "merchant@okaxis",
      expiresInSeconds: 1800,
      qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=ethereum%3A0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913%408453%2Ftransfer%3Faddress%3D0x742d35Cc6634C0532925a3b844Bc454e4438f44e%26uint256%3D5760000"
    },
    codeExamples: {
      curl: `curl -X POST "https://zkpay.top/api/v1/payin-sessions" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipientUpi": "merchant@okaxis",
    "amountINR": 500,
    "webhookUrl": "https://my-bot.com/webhook"
  }'`,
      js: `// Generate dedicated Base deposit address with automated on-chain listener
const res = await fetch("https://zkpay.top/api/v1/payin-sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  },
  body: JSON.stringify({
    recipientUpi: "merchant@okaxis",
    amountINR: 500,
    webhookUrl: "https://my-bot.com/webhook"
  })
});
const session = await res.json();
console.log(\`Base Deposit Address: \${session.payinAddress}\`);
console.log(\`Expected USDC: \${session.expectedAmountUsdc}\`);
console.log(\`Client Secret Token: \${session.clientSecret}\`);`,
      python: `import requests

payload = {
    "recipientUpi": "merchant@okaxis",
    "amountINR": 500,
    "webhookUrl": "https://my-bot.com/webhook"
}
headers = {
    "X-API-Key": "YOUR_ZKPAY_API_KEY",
    "Content-Type": "application/json"
}

response = requests.post("https://zkpay.top/api/v1/payin-sessions", json=payload, headers=headers)
session = response.json()
print(f"Base Deposit Address: {session['payinAddress']}")
print(f"Expected USDC: {session['expectedAmountUsdc']} (Validity: {session['expiresInSeconds']}s)")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - In-Chat Deposit Address & QR Code
bot.command('pay', async (ctx) => {
  const [amount, upiId] = ctx.message.text.split(' ').slice(1);
  if (!amount || !upiId) {
    return ctx.reply('Usage: /pay <amountINR> <recipientUpi>\\nExample: /pay 500 merchant@okaxis');
  }

  const res = await fetch('https://zkpay.top/api/v1/payin-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.ZKPAY_API_KEY
    },
    body: JSON.stringify({
      recipientUpi: upiId,
      amountINR: Number(amount),
      webhookUrl: 'https://my-bot.com/zkpay-webhook'
    })
  });
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ \${data.error || 'Failed to start session'}\`);

  await ctx.replyWithPhoto(data.qrCodeUrl, {
    caption: \`💳 *Scan or Send USDC on Base*\\n\\n\` +
             \`• *Amount to Send:* \`\${data.expectedAmountUsdc} USDC\`\\n\` +
             \`• *Deposit Address:* \`\${data.payinAddress}\`\\n\` +
             \`• *Network:* Base Mainnet (Chain ID 8453)\\n\` +
             \`• *Settles to:* \`\${upiId}\` (\${data.fiatAmount})\\n\` +
             \`• *Validity:* 30 minutes (auto-detected on-chain)\\n\\n\` +
             \`_Funds disburse to merchant UPI in under 3 minutes upon deposit._\`,
    parse_mode: 'Markdown'
  });
});`
    }
  },

  // ─── 06. PAYMENTS: Check Session Status ───
  {
    method: "GET",
    path: "/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d&token=sec_8f7a2c9b1d",
    title: "Check Session Status",
    category: "payments",
    description: "Actively checks on-chain USDC balance on Base Mainnet and updates session state upon deposit detection. Provide ?token= (clientSecret returned at creation) or merchant X-API-Key header for full unmasked recipient details.",
    parameters: [
      {
        name: "id",
        type: "string",
        location: "query",
        required: true,
        description: "Session ID returned at session creation (e.g. 'ses_live_8f7a2c9b1d').",
        example: "ses_live_8f7a2c9b1d"
      },
      {
        name: "token",
        type: "string",
        location: "query",
        required: false,
        description: "The ephemeral 'clientSecret' returned at creation. Safe for client-side/bot callers to view full session details without exposing merchant API key.",
        example: "sec_8f7a2c9b1d"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "Merchant API Key (alternative to token query parameter).",
        example: "zkpay_live_secret_key"
      }
    ],
    response: {
      success: true,
      sessionId: "ses_live_8f7a2c9b1d",
      status: "SETTLED",
      recipientUpi: "merchant@okaxis",
      fiatAmount: "₹ 500.00",
      receivedUsdc: "5.76 USDC",
      payinAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      settledAt: 1727382180000
    },
    codeExamples: {
      curl: `# Query with clientSecret token (safe for client/bot caller):
curl -X GET "https://zkpay.top/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d&token=sec_8f7a2c9b1d" \\
  -H "Accept: application/json"

# Or query with merchant API key:
curl -X GET "https://zkpay.top/api/v1/payin-sessions?id=ses_live_8f7a2c9b1d" \\
  -H "X-API-Key: zkpay_live_your_secret_key"`,
      js: `// Poll deposit session status until state transitions to SETTLED
const sessionId = "ses_live_8f7a2c9b1d";
const clientSecret = "sec_8f7a2c9b1d";

const res = await fetch(\`https://zkpay.top/api/v1/payin-sessions?id=\${sessionId}&token=\${clientSecret}\`);
const data = await res.json();
console.log(\`Status: \${data.status}\`); // AWAITING_PAYMENT -> PAYMENT_DETECTED -> SETTLED / EXPIRED
if (data.status === "SETTLED") {
  console.log(\`Received: \${data.receivedUsdc}, Disbursed: \${data.fiatAmount}\`);
}`,
      python: `import requests

params = {
    "id": "ses_live_8f7a2c9b1d",
    "token": "sec_8f7a2c9b1d"  # Or pass headers={"X-API-Key": "..."}
}
response = requests.get("https://zkpay.top/api/v1/payin-sessions", params=params)
data = response.json()
print(f"Session Status: {data.get('status')} | Received: {data.get('receivedUsdc')}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Check Deposit Session State
bot.command('status', async (ctx) => {
  const sessionId = ctx.message.text.split(' ')[1];
  if (!sessionId) return ctx.reply('Usage: /status <sessionId>\\nExample: /status ses_live_8f7a2c9b1d');

  const res = await fetch(\`https://zkpay.top/api/v1/payin-sessions?id=\${sessionId}\`, {
    headers: { 'X-API-Key': process.env.ZKPAY_API_KEY }
  });
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ Session not found.\`);

  const badges = {
    'AWAITING_PAYMENT': '⏳ Awaiting Deposit on Base',
    'PAYMENT_DETECTED': '🔍 USDC Detected, Settling Fiat...',
    'SETTLED': '✅ Settled to Merchant UPI',
    'EXPIRED': '❌ Session Expired'
  };

  await ctx.reply(
    \`📊 *Deposit Session Status*\\n\\n\` +
    \`• *State:* \${badges[data.status] || data.status}\\n\` +
    \`• *Session ID:* \\\`\${data.sessionId}\\\`\\n\` +
    \`• *Amount:* \${data.fiatAmount} (\${data.receivedUsdc || data.expectedAmountUsdc})\\n\` +
    \`• *Merchant UPI:* \\\`\${data.recipientUpi}\\\`\\n\` +
    \`• *Deposit Address:* \\\`\${data.payinAddress}\\\`\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 07. SWAP: Supported Swap Tokens ───
  {
    method: "GET",
    path: "/api/v1/swap/tokens?chain=sol",
    title: "Supported Swap Tokens",
    category: "swap",
    rateLimit: "60 req/min (IP) · 300 req/min (API Key)",
    description: "Returns all supported tokens across 8 blockchains. Tokens can be used as either origin (fromAsset) or destination (toAsset). Filter by ?chain=base|sol|eth|btc|tron|arb|bsc|ltc.",
    parameters: [
      {
        name: "chain",
        type: "string",
        location: "query",
        required: false,
        description: "Filter tokens by blockchain. Supported values: 'base', 'sol', 'eth', 'btc', 'tron', 'arb', 'bsc', 'ltc'. If omitted, returns tokens across all chains.",
        example: "sol"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "API Key (optional, raises rate limit from 60 req/min to 300 req/min).",
        example: "zkpay_live_secret_key"
      }
    ],
    response: {
      success: true,
      count: 17,
      tokens: [
        { assetId: "nep141:sol.omft.near", symbol: "SOL", name: "Solana", blockchain: "sol", decimals: 9 },
        { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", symbol: "USDC", name: "USDC (Base)", blockchain: "base", decimals: 6 },
        { assetId: "nep141:btc.omft.near", symbol: "BTC", name: "Bitcoin", blockchain: "btc", decimals: 8 },
        { assetId: "nep141:eth.omft.near", symbol: "ETH", name: "Ethereum", blockchain: "eth", decimals: 18 },
        { assetId: "nep141:ltc.omft.near", symbol: "LTC", name: "Litecoin", blockchain: "ltc", decimals: 8 }
      ]
    },
    codeExamples: {
      curl: `# Filter supported swap tokens by blockchain (base, sol, eth, btc, tron, arb, bsc, ltc)
curl -X GET "https://zkpay.top/api/v1/swap/tokens?chain=sol" \\
  -H "Accept: application/json"

# Or query all supported cross-chain tokens with API Key:
curl -X GET "https://zkpay.top/api/v1/swap/tokens" \\
  -H "X-API-Key: zkpay_live_your_secret_key"`,
      js: `// Query supported swap tokens (filter by chain: sol, base, eth, btc, tron, arb, bsc, ltc)
const chain = "sol";
const res = await fetch(\`https://zkpay.top/api/v1/swap/tokens?chain=\${chain}\`, {
  headers: { "X-API-Key": "YOUR_ZKPAY_API_KEY" }
});
const { tokens } = await res.json();
tokens.forEach(t => console.log(\`\${t.symbol} on \${t.blockchain} (\${t.decimals} decimals) -> \${t.assetId}\`));`,
      python: `import requests

params = {"chain": "sol"}  # "base", "sol", "eth", "btc", "tron", "arb", "bsc", "ltc"
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
    return ctx.reply('❌ No tokens found. Supported chains: base, sol, eth, btc, tron, arb, bsc, ltc');
  }

  const list = data.tokens.slice(0, 8).map(t =>
    \`• *\${t.symbol}* (\${t.name}) — \\\`\${t.blockchain}\\\` [\${t.decimals} dec]\`
  ).join('\\n');

  await ctx.reply(
    \`🪙 *Supported Swap Tokens (\${chain ? chain.toUpperCase() : 'All Chains'})*\\n\\n\${list}\\n\\n\` +
    \`_Total assets available: \${data.count}_\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 08. SWAP: Get Swap Quote (Dry Run) ───
  {
    method: "GET",
    path: "/api/v1/swap/quote?fromAsset=ETH&chain=eth&toAsset=SOL&destinationChain=sol&amount=10000000000000000&feeRecipient=7vN24xV8y...SolanaPayoutAddress&totalFeeBps=100&slippageBps=100",
    title: "Get Swap Quote (Dry Run)",
    category: "swap",
    rateLimit: "30 req/min (IP) · 120 req/min (API Key)",
    description: "Preview real-time crypto-to-crypto pricing with transparent partner fee breakdown. Pass 'toAsset' (e.g. SOL, ETH, USDC) and optional 'destinationChain' (e.g. sol, base, arb, btc, tron, bsc, ltc). Defaults to Base USDC if omitted. IMPORTANT: 'amount' must be an integer string in ATOMIC UNITS (smallest denomination, e.g. 10000000000000000 for 0.01 ETH). Never pass human decimals like '0.01'. Partner fees are settled in the DESTINATION ASSET on the destination chain.",
    parameters: [
      {
        name: "fromAsset",
        type: "string",
        location: "query",
        required: true,
        description: "Source token symbol (e.g. 'ETH', 'SOL', 'BTC') or full assetId.",
        example: "ETH"
      },
      {
        name: "amount",
        type: "string",
        location: "query",
        required: true,
        description: "Amount to swap as an integer string in raw base/atomic units (e.g. 10000000000000000 for 0.01 ETH, 250000 for ~0.00025 SOL). Never pass human decimals.",
        example: "10000000000000000"
      },
      {
        name: "chain",
        type: "string",
        location: "query",
        required: false,
        description: "Source blockchain: 'eth', 'sol', 'base', 'btc', 'tron', 'arb', 'bsc', 'ltc'.",
        example: "eth"
      },
      {
        name: "toAsset",
        type: "string",
        location: "query",
        required: false,
        description: "Destination token symbol (e.g. 'SOL', 'USDC'). Defaults to Base USDC if omitted.",
        example: "SOL"
      },
      {
        name: "destinationChain",
        type: "string",
        location: "query",
        required: false,
        description: "Destination blockchain (e.g. 'sol', 'base', 'eth', 'btc', 'tron', 'arb', 'bsc', 'ltc'). Defaults to Base if omitted.",
        example: "sol"
      },
      {
        name: "feeRecipient",
        type: "string",
        location: "query",
        required: false,
        description: "CRITICAL: Partner's payout address on the DESTINATION CHAIN (e.g. Solana address for SOL, Bitcoin address for BTC, 0x EVM address for Base/ETH/Arbitrum/BSC, Tron address for TRC20). Fees are paid in the DESTINATION ASSET. Partners must ensure the address matches the destination chain or the fee will be permanently lost. Split 50/50 with ZkPay Treasury.",
        example: "7vN24xV8y...SolanaPayoutAddress"
      },
      {
        name: "totalFeeBps",
        type: "number",
        location: "query",
        required: false,
        description: "Custom partner fee in basis points (range: 20 to 450 bps, e.g. 100 for 1.00%). Split 50/50 with partner feeRecipient.",
        example: "100"
      },
      {
        name: "slippageBps",
        type: "number",
        location: "query",
        required: false,
        description: "Slippage tolerance in basis points (range: 10 to 500 bps, default 100 for 1.00%).",
        example: "100"
      },
      {
        name: "recipient",
        type: "string",
        location: "query",
        required: false,
        description: "User's destination-chain address for exact quote route calculation.",
        example: "7vN24xV8y...SolanaAddress"
      },
      {
        name: "refundTo",
        type: "string",
        location: "query",
        required: false,
        description: "User's origin-chain address for automatic refunds on expiry.",
        example: "0xUserEthAddress"
      }
    ],
    response: {
      success: true,
      quote: {
        quoteId: "q_1727382000000",
        originAsset: "nep141:eth.omft.near",
        destinationAsset: "nep141:sol.omft.near",
        amountIn: "10000000000000000",
        amountInFormatted: "0.01",
        amountOut: "241500000",
        amountOutFormatted: "0.2415",
        minAmountOut: "239085000",
        minAmountOutFormatted: "0.2391",
        feeBreakdown: {
          networkProtocolFeeBps: 25,
          totalCustomFeeBps: 100,
          split: { zkpayFeeBps: 50, partnerFeeBps: 50, partnerFeeRecipient: "7vN24xV8y...SolanaPayoutAddress" },
          totalDeductionsBps: 125
        },
        timeEstimateSeconds: 45,
        expiresAt: "2026-10-01T15:00:00.000Z"
      }
    },
    codeExamples: {
      curl: `# GET request with query parameters (feeRecipient must match destinationChain!):
curl -X GET "https://zkpay.top/api/v1/swap/quote?fromAsset=ETH&chain=eth&toAsset=SOL&destinationChain=sol&amount=10000000000000000&feeRecipient=7vN24xV8y...SolanaPayoutAddress&totalFeeBps=100&slippageBps=100" \\
  -H "Accept: application/json"

# Or POST request with JSON payload:
curl -X POST "https://zkpay.top/api/v1/swap/quote" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fromAsset": "ETH",
    "chain": "eth",
    "toAsset": "SOL",
    "destinationChain": "sol",
    "amount": "10000000000000000",
    "feeRecipient": "7vN24xV8y...SolanaPayoutAddress",
    "totalFeeBps": 100,
    "slippageBps": 100
  }'`,
      js: `// Calculate swap quote with partner revenue share and atomic units
// NOTE: feeRecipient MUST be an address on destinationChain (Solana address for SOL destination)
const query = new URLSearchParams({
  fromAsset: "ETH",
  chain: "eth",
  toAsset: "SOL",
  destinationChain: "sol",
  amount: "10000000000000000", // 0.01 ETH in wei (atomic integer string)
  feeRecipient: "7vN24xV8y...SolanaPayoutAddress", // Destination-chain address to receive 50% fee
  totalFeeBps: "100", // 1.00% total fee (50 bps to partner, 50 bps to ZkPay)
  slippageBps: "100"  // 1.00% max slippage
});

const res = await fetch(\`https://zkpay.top/api/v1/swap/quote?\${query}\`, {
  headers: { "Accept": "application/json" }
});
const { quote } = await res.json();
console.log(\`Estimated: \${quote.amountOutFormatted} SOL (Min: \${quote.minAmountOutFormatted} SOL)\`);
console.log(\`Partner Revenue: \${quote.feeBreakdown.split.partnerFeeBps} bps in destination asset\`);`,
      python: `import requests

# NOTE: feeRecipient MUST be on the destination chain (e.g. Solana address for SOL destination)
params = {
    "fromAsset": "ETH",
    "chain": "eth",
    "toAsset": "SOL",
    "destinationChain": "sol",
    "amount": "10000000000000000",  # Atomic units integer string
    "feeRecipient": "7vN24xV8y...SolanaPayoutAddress",
    "totalFeeBps": 100,
    "slippageBps": 100
}
response = requests.get("https://zkpay.top/api/v1/swap/quote", params=params)
data = response.json()
q = data["quote"]

print(f"Est Output: {q['amountOutFormatted']} SOL (Est Time: {q['timeEstimateSeconds']}s)")
print(f"Partner Fee: {q['feeBreakdown']['split']['partnerFeeBps']} bps")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Cross-Chain Swap Quote Preview
bot.command('swapquote', async (ctx) => {
  const [from, to, amountHuman] = ctx.message.text.split(' ').slice(1);
  if (!from || !to || !amountHuman) {
    return ctx.reply('Usage: /swapquote <fromAsset> <toAsset> <amount>\\nExample: /swapquote ETH SOL 0.01');
  }

  // Convert human float to atomic units (e.g. 18 decimals for ETH)
  const atomic = (BigInt(Math.round(Number(amountHuman) * 1e6)) * BigInt(1e12)).toString();

  const query = new URLSearchParams({
    fromAsset: from.toUpperCase(),
    toAsset: to.toUpperCase(),
    amount: atomic,
    totalFeeBps: '100',
    slippageBps: '100'
  });

  const res = await fetch(\`https://zkpay.top/api/v1/swap/quote?\${query}\`);
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ \${data.message || data.error}\`);

  const q = data.quote;
  await ctx.reply(
    \`🔄 *Live Swap Rate Quote*\\n\\n\` +
    \`• *Deposit:* \${q.amountInFormatted} \${from.toUpperCase()}\\n\` +
    \`• *Estimated Output:* *\${q.amountOutFormatted} \${to.toUpperCase()}*\\n\` +
    \`• *Guaranteed Minimum:* \${q.minAmountOutFormatted} \${to.toUpperCase()}\\n\` +
    \`• *Partner Fee Split:* \${q.feeBreakdown.split.partnerFeeBps} bps (50/50 share in \${to.toUpperCase()})\\n\` +
    \`• *Est. Settlement Time:* ~\${q.timeEstimateSeconds}s\\n\` +
    \`• *Valid Until:* \${new Date(q.expiresAt).toLocaleTimeString()}\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 09. SWAP: Create Swap Order ───
  {
    method: "POST",
    path: "/api/v1/swap/create",
    title: "Create Swap Order",
    category: "swap",
    rateLimit: "10 req/min (IP) · 60 req/min (API Key)",
    description: "Commits a cross-chain crypto-to-crypto swap order and generates a single-use deposit address. Fees are split 50/50 between ZkPay Treasury and your feeRecipient, settled in the DESTINATION ASSET on the destination chain. Always pass 'refundTo' with the user's origin-chain address to guarantee automatic refunds if order expires or slips beyond tolerance.",
    parameters: [
      {
        name: "fromAsset",
        type: "string",
        location: "body",
        required: true,
        description: "Source token symbol (e.g. 'ETH', 'SOL', 'BTC'). Also accepts 'originAsset'.",
        example: "ETH"
      },
      {
        name: "amount",
        type: "string",
        location: "body",
        required: true,
        description: "Amount to swap as an integer string in raw base/atomic units (e.g. '10000000000000000' for 0.01 ETH).",
        example: "10000000000000000"
      },
      {
        name: "recipient",
        type: "string",
        location: "body",
        required: true,
        description: "User's destination-chain wallet address to receive the swapped tokens.",
        example: "7vN24xV8y...SolanaRecipientAddress"
      },
      {
        name: "chain",
        type: "string",
        location: "body",
        required: false,
        description: "Source blockchain (e.g. 'eth', 'sol', 'btc', 'tron', 'arb', 'base', 'bsc', 'ltc'). Also accepts 'originChain'.",
        example: "eth"
      },
      {
        name: "toAsset",
        type: "string",
        location: "body",
        required: false,
        description: "Target token symbol (e.g. 'SOL', 'USDC'). Defaults to Base USDC if omitted.",
        example: "SOL"
      },
      {
        name: "destinationChain",
        type: "string",
        location: "body",
        required: false,
        description: "Target blockchain (e.g. 'sol', 'base', 'eth', 'btc', 'tron', 'arb', 'bsc', 'ltc'). Defaults to Base if omitted.",
        example: "sol"
      },
      {
        name: "refundTo",
        type: "string",
        location: "body",
        required: false,
        description: "User's origin-chain address for automatic refund if solvers cannot fulfill.",
        example: "0xUserEthRefundAddress"
      },
      {
        name: "feeRecipient",
        type: "string",
        location: "body",
        required: false,
        description: "CRITICAL: Partner's payout address on the DESTINATION CHAIN (e.g. Solana address for SOL, Bitcoin address for BTC, 0x EVM address for Base/ETH/Arbitrum/BSC, Tron address for TRC20). Fees are settled in the DESTINATION ASSET. Partners must ensure the address matches the destination chain or the fee will be permanently lost. If omitted, 100% routes to ZkPay Treasury.",
        example: "7vN24xV8y...SolanaPartnerAddress"
      },
      {
        name: "totalFeeBps",
        type: "number",
        location: "body",
        required: false,
        description: "Custom partner fee in basis points (range: 20 to 450 bps, e.g. 100 for 1.00%).",
        example: "100"
      },
      {
        name: "slippageBps",
        type: "number",
        location: "body",
        required: false,
        description: "Slippage tolerance in basis points (range: 10 to 500 bps, default 100).",
        example: "100"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: true,
        description: "Partner API key for order tracking and fee attribution.",
        example: "zkpay_live_secret_key"
      }
    ],
    body: {
      fromAsset: "ETH",
      chain: "eth",
      toAsset: "SOL",
      destinationChain: "sol",
      amount: "10000000000000000",
      recipient: "7vN24xV8y...SolanaRecipientAddress",
      refundTo: "0xUserEthRefundAddress",
      feeRecipient: "7vN24xV8y...SolanaPartnerAddress",
      totalFeeBps: 100,
      slippageBps: 100
    },
    response: {
      success: true,
      order: {
        swapId: "swp_1727382000000",
        status: "PENDING_DEPOSIT",
        deposit: {
          address: "0x89c1...EthereumDepositAddress",
          memo: null,
          amount: "0.01",
          deadline: "2026-10-01T15:15:00.000Z"
        },
        settlement: {
          recipient: "7vN24xV8y...SolanaRecipientAddress",
          destinationAsset: "nep141:sol.omft.near",
          estimatedAmountOut: "0.2415",
          minAmountOut: "0.2391",
          timeEstimateSeconds: 60
        },
        feeSplit: {
          totalCustomFeeBps: 100,
          zkpayFeeBps: 50,
          partnerFeeBps: 50,
          partnerFeeRecipient: "7vN24xV8y...SolanaPartnerAddress",
          networkProtocolFeeBps: 25,
          totalDeductionsBps: 125,
          treasuryAddress: "Gpn7iW3zAMt2UXZ6kb3MCEmXrQxkH7VrzR3dDKe58Ldf",
          feeSettlementNote: "Fees are paid in the destination asset to the recipient on the destination chain."
        }
      }
    },
    codeExamples: {
      curl: `curl -X POST "https://zkpay.top/api/v1/swap/create" \\
  -H "X-API-Key: zkpay_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fromAsset": "ETH",
    "chain": "eth",
    "toAsset": "SOL",
    "destinationChain": "sol",
    "amount": "10000000000000000",
    "recipient": "7vN24xV8y...SolanaRecipientAddress",
    "refundTo": "0xUserEthRefundAddress",
    "feeRecipient": "7vN24xV8y...SolanaPartnerAddress",
    "totalFeeBps": 100,
    "slippageBps": 100
  }'`,
      js: `// Commit cross-chain swap order and obtain a single-use deposit address
// NOTE: feeRecipient MUST be on the destinationChain (e.g. Solana address for SOL destination)
const res = await fetch("https://zkpay.top/api/v1/swap/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_ZKPAY_API_KEY"
  },
  body: JSON.stringify({
    fromAsset: "ETH",
    chain: "eth",
    toAsset: "SOL",
    destinationChain: "sol",
    amount: "10000000000000000", // Atomic units integer
    recipient: "7vN24xV8y...SolanaRecipientAddress",
    refundTo: "0xUserEthRefundAddress",
    feeRecipient: "7vN24xV8y...SolanaPartnerAddress", // Destination-chain address
    totalFeeBps: 100, // 50/50 revenue split paid in destination asset
    slippageBps: 100
  })
});
const { order } = await res.json();
console.log(\`Deposit Address on Ethereum: \${order.deposit.address}\`);
console.log(\`Deposit Deadline: \${order.deposit.deadline}\`);
console.log(\`Estimated Output: \${order.settlement.estimatedAmountOut} SOL\`);
console.log(\`Fee Settled To: \${order.feeSplit.partnerFeeRecipient} on \${order.feeSplit.treasuryAddress ? 'destination chain' : ''}\`);`,
      python: `import requests

# NOTE: feeRecipient MUST be on the destination chain (e.g. Solana address for SOL destination)
payload = {
    "fromAsset": "ETH",
    "chain": "eth",
    "toAsset": "SOL",
    "destinationChain": "sol",
    "amount": "10000000000000000",
    "recipient": "7vN24xV8y...SolanaRecipientAddress",
    "refundTo": "0xUserEthRefundAddress",
    "feeRecipient": "7vN24xV8y...SolanaPartnerAddress",
    "totalFeeBps": 100,
    "slippageBps": 100
}
headers = {
    "X-API-Key": "YOUR_ZKPAY_API_KEY",
    "Content-Type": "application/json"
}

response = requests.post("https://zkpay.top/api/v1/swap/create", json=payload, headers=headers)
data = response.json()
print("Deposit Address:", data["order"]["deposit"]["address"])
print("Estimated Output:", data["order"]["settlement"]["estimatedAmountOut"])
print("Partner Fee Recipient:", data["order"]["feeSplit"]["partnerFeeRecipient"])`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Initiate Live Swap Order
bot.command('swap', async (ctx) => {
  const [from, to, amountHuman, recipient, refundTo] = ctx.message.text.split(' ').slice(1);
  if (!from || !to || !amountHuman || !recipient) {
    return ctx.reply(
      'Usage: /swap <from> <to> <amount> <recipientAddress> [refundAddress]\\n' +
      'Example: /swap ETH SOL 0.01 7vN24xV... 0xUserEth...'
    );
  }

  const atomicAmount = (BigInt(Math.round(Number(amountHuman) * 1e6)) * BigInt(1e12)).toString();

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
      destinationChain: to.toLowerCase(),
      amount: atomicAmount,
      recipient,
      refundTo: refundTo || recipient,
      feeRecipient: process.env.PARTNER_PAYOUT_ADDRESS,
      totalFeeBps: 100,
      slippageBps: 100
    })
  });
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ Swap creation failed: \${data.message || data.error}\`);

  const ord = data.order;
  await ctx.reply(
    \`📥 *Swap Order Created*\\n\\n\` +
    \`Deposit *\${amountHuman} \${from.toUpperCase()}* to this single-use deposit address:\\n\\n\` +
    \`\\\`\${ord.deposit.address}\\\`\\n\\n\` +
    \`• *Receiving Address:* \\\`\${ord.settlement.recipient}\\\`\\n\` +
    \`• *Estimated Output:* ~\${ord.settlement.estimatedAmountOut} \${to.toUpperCase()}\\n\` +
    \`• *Deadline:* \${new Date(ord.deposit.deadline).toLocaleTimeString()}\\n\` +
    \`• *Check Status:* \\\`/swapstatus \${ord.deposit.address}\\\`\`,
    { parse_mode: 'Markdown' }
  );
});`
    }
  },

  // ─── 10. SWAP: Track Swap Status ───
  {
    method: "GET",
    path: "/api/v1/swap/status?depositAddress=0x89c1...",
    title: "Track Swap Status",
    category: "swap",
    rateLimit: "60 req/min (IP) · 240 req/min (API Key)",
    description: "Polls real-time swap execution across source and destination chains. Returns mapped status: pending → processing → settled / failed / refunded. If a swap fails or times out, status transitions to 'refunded' and funds return to 'refundTo'.",
    parameters: [
      {
        name: "depositAddress",
        type: "string",
        location: "query",
        required: true,
        description: "The single-use deposit address on the source chain returned by /swap/create. Also accepts 'address'.",
        example: "0x89c1...EthereumDepositAddress"
      },
      {
        name: "X-API-Key",
        type: "string",
        location: "header",
        required: false,
        description: "API Key (optional, raises rate limit from 60 req/min to 240 req/min for faster polling).",
        example: "zkpay_live_secret_key"
      }
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
      updatedAt: "2026-10-01T15:02:15.000Z"
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
console.log(\`Swap Status: \${status.status}\`); // pending -> processing -> settled / failed / refunded
if (status.status === "settled") {
  console.log(\`Delivered: \${status.settledAmount}\`);
  console.log(\`Explorer Link: \${status.destinationExplorerUrl}\`);
}`,
      python: `import requests

params = {"depositAddress": "0x89c1...EthereumDepositAddress"}
headers = {"X-API-Key": "YOUR_ZKPAY_API_KEY"}

response = requests.get("https://zkpay.top/api/v1/swap/status", params=params, headers=headers)
data = response.json()

print(f"Status: {data.get('status')}")
print(f"Deposited: {data.get('depositedAmount')}")
print(f"Settled: {data.get('settledAmount')}")
print(f"Destination Tx: {data.get('destinationTxHash')}")`,
      telegram: `// Node.js Telegram Bot Example (telegraf) - Track Swap Order Execution
bot.command('swapstatus', async (ctx) => {
  const depositAddress = ctx.message.text.split(' ')[1];
  if (!depositAddress) return ctx.reply('Usage: /swapstatus <depositAddress>\\nExample: /swapstatus 0x89c1...');

  const res = await fetch(\`https://zkpay.top/api/v1/swap/status?depositAddress=\${depositAddress}\`);
  const data = await res.json();

  if (!data.success) return ctx.reply(\`❌ \${data.message || 'Status query failed'}\`);

  const statusIcons = {
    'pending': '⏳ Awaiting Deposit on Origin Chain',
    'processing': '🔄 Solvers Executing Swap...',
    'settled': '✅ Delivered to Recipient Wallet',
    'failed': '❌ Execution Failed',
    'refunded': '↩️ Refunded to Origin Address'
  };

  let report = \`🛰️ *Swap Order Status*\\n\\n\` +
               \`• *State:* \${statusIcons[data.status] || data.status}\\n\` +
               \`• *Deposit Address:* \\\`\${depositAddress}\\\`\\n\` +
               \`• *Deposited:* \${data.depositedAmount || 'Awaiting deposit'}\\n\`;

  if (data.status === 'settled') {
    report += \`• *Delivered:* \${data.settledAmount}\\n\` +
              \`• *Explorer Tx:* [View on Explorer](\${data.destinationExplorerUrl})\\n\`;
  }

  await ctx.reply(report, { parse_mode: 'Markdown', disable_web_page_preview: true });
});`
    }
  }
];
