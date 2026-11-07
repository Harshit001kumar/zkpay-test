# ZkPay — Instant Cross-Chain Swap Engine & Developer API

A mobile-first cross-chain crypto swap platform and B2B developer API that powers instant non-custodial token swaps across **9 blockchains** (`BTC`, `ETH`, `SOL`, `Base`, `Polygon`, `Arbitrum`, `BSC`, `Tron`, `LTC`) with an automated **50/50 USD Partner Revenue Share**.

## Key Features

- **Cross-Chain Web Swap (`SwapWidget.tsx`)**: Swap 17 curated tokens across 9 blockchains with single-use deposit addresses, QR codes, and real-time 4-stage status tracking.
- **Developer Swap API (`/api/v1/swap/*`)**:
  - `GET /api/v1/swap/tokens` — Discover supported tokens across all 9 chains
  - `GET /api/v1/swap/quote` — Dry-run quote & 50/50 partner fee split preview
  - `POST /api/v1/swap/create` — Generate single-use deposit address & lock quote
  - `GET /api/v1/swap/status` — Poll real-time swap execution status
- **Automated 50/50 USD Partner Ledger (`/partner`)**:
  - Pass `X-API-Key` on swap requests to earn 50% of custom swap fees (20–450 bps) credited in USD upon settlement.
  - Withdraw anytime starting at **$1.00 USD** in **USDC (Base)**, **USDT (Polygon)**, **SOL**, or **LTC**.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the Web Swap or visit `/docs` and `/partner` for Developer API integration.
