# ZkPay — Crypto to Fiat Scan & Pay

A premium mobile-first web app that lets users pay merchants with local fiat (UPI, bank transfer, etc.), settled instantly in USDC on the **Base** network via [P2PKit](https://p2pkit.com).

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                   │
│  Next.js + @p2pdotme/widgets + Privy Auth   │
│  Deployed on Render (free tier)             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           ZkPayIntegrator.sol               │
│  IP2PIntegrator on Base (Sepolia → Mainnet) │
│  • validateOrder (limits)                   │
│  • onOrderComplete (1% fee → treasury)      │
│  • onOrderCancel (refund slots)             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           P2P Diamond (P2PKit)              │
│  Merchant network settles fiat off-chain    │
│  On-chain: USDC on Base                     │
└─────────────────────────────────────────────┘
```

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/zk-pay.git
cd zk-pay
cp .env.example .env
# Edit .env with your Privy App ID
```

### 2. Install & run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone or browser.

### 3. Deploy to Render (free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — just add your env vars
5. Deploy!

## Project Structure

```
zk_pay/
├── contracts/
│   └── integrators/zk_pay/
│       └── ZkPayIntegrator.sol     # On-chain integrator (Base)
├── src/
│   ├── app/
│   │   ├── globals.css             # Ocean Obsidian design system
│   │   ├── layout.tsx              # Root layout + SEO
│   │   └── page.tsx                # Main dashboard
│   ├── components/
│   │   ├── BottomNav.tsx           # Bottom navigation bar
│   │   ├── CashoutFlow.tsx         # USDC → Fiat offramp
│   │   ├── CheckoutFlow.tsx        # Fiat → USDC onramp
│   │   ├── PaymentHistory.tsx      # Transaction history
│   │   ├── Scanner.tsx             # QR code scanner
│   │   └── WalletConnect.tsx       # Wallet connection UI
│   └── lib/
│       ├── constants.ts            # Contract addresses & config
│       └── p2pkit.ts               # P2PKit SDK helpers
├── render.yaml                     # Render deployment config
├── tailwind.config.ts              # Ocean Obsidian tokens
└── package.json
```

## Smart Contract

The `ZkPayIntegrator` implements `IP2PIntegrator` with:

| Parameter | Default | Description |
|---|---|---|
| `baseTxLimit` | 20 USDC | Max per transaction |
| `dailyTxCountLimit` | 5 | Max transactions per user per day |
| `platformFeeBps` | 100 (1%) | Platform fee sent to treasury |

### Deploy to Base Sepolia

```bash
npx hardhat run scripts/deploy.ts --network base-sepolia
```

## Revenue Model

Every completed payment routes through `onOrderComplete`, which:
1. Calculates 1% fee
2. Sends fee to your treasury wallet
3. Sends remainder to the merchant

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Blockchain**: Base (L2), USDC, Solidity
- **Payments**: P2PKit (`@p2pdotme/widgets`)
- **Auth**: Privy (embedded wallets + sponsored gas)
- **Deploy**: Render (free tier)

## License

MIT
