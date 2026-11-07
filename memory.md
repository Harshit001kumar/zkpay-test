# ZkPay Project Memory

> This file is the single source of truth for all project knowledge. Updated automatically.

## Core Identity
- **App**: ZkPay — Instant Cross-Chain Swap Engine & Developer API
- **Business Model**:
  1. **Developer B2B Swap Infrastructure (Primary)**: Empower developers, Telegram/Discord bots, wallets, and DApps to integrate `/api/v1/swap/*` for instant cross-chain crypto swaps across 9 blockchains (`btc`, `eth`, `base`, `polygon`, `sol`, `arb`, `bsc`, `tron`, `ltc`) with an automated **50/50 USD Partner Revenue Share** and $1.00 minimum crypto withdrawals via `/partner`.
  2. **Consumer Web Swap (Secondary)**: Allow end-users to swap crypto directly on `zkpay.top` via the mobile-first `SwapWidget.tsx`.
- **Stack**: Next.js 14, TypeScript, Privy, viem, wagmi, MongoDB, TailwindCSS
- **Hosting**: Render (auto-deploys from `Harshit001kumar/zkpay-test` GitHub repo)
- **Deploy workflow**: Push to GitHub → Render auto-builds → runs `npm install` from `package.json` automatically. NEVER ask user to run npm install locally. Just add deps to package.json.
- **Design**: Mobile-first, minimalist, no clutter

## User Preferences & Rules
- Always prioritize **mobile-first** design
- User runs **git commands manually** (Windows permission issues)
- Use **npm** (not yarn — yarn is not installed)
- Etherscan/Basescan APIs: use **V2 API format** (single API key string)
- Ethereum addresses in Hardhat: always **lowercase + `ethers.getAddress()`**
- **Deployment is on Render** — not Vercel, not local. Always remember this.

## Cross-Chain Swap API (`/api/v1/swap/*`)
- **Supported Blockchains (9)**: Bitcoin (`btc`), Ethereum (`eth`), Base (`base`), Polygon (`polygon`), Solana (`sol`), Arbitrum (`arb`), BNB Chain (`bsc`), Tron (`tron`), Litecoin (`ltc`).
- **Curated Assets (17)**: Defined in `src/lib/server/swapRouter.ts` (`CURATED_SWAP_TOKENS`).
- **Endpoints**:
  - `GET /api/v1/swap/tokens` — Discover supported tokens & chains
  - `GET /api/v1/swap/quote` — Dry-run quote with 50/50 fee split breakdown
  - `POST /api/v1/swap/create` — Generate single-use deposit address & lock quote
  - `GET /api/v1/swap/status` — Poll real-time swap status (`pending` → `processing` → `settled` / `failed` / `refunded`)
  - `POST /api/v1/swap/recover` — Manual recovery for delayed proxy forwards
- **50/50 Partner Fee Share**:
  - Fee-Share Enabled Chains: `base`, `polygon`, `arb`, `bsc`, `sol` (Native SOL), `ltc` (Native LTC).
  - Direct 0% Fee Routes (High Gas Networks): `eth`, `btc`, `tron` route directly to solvers with 0% platform fee to save user gas.
  - Partners pass `X-API-Key` header; upon settlement (`status === "settled"`), 50% of `totalFeeBps` is converted to USD at live CoinGecko rates and credited to the Partner Portal (`/partner`).

## Key Files
| File | Purpose |
|---|---|
| `src/lib/server/swapRouter.ts` | Core NEAR 1Click solver router, fee calculation, token registry |
| `src/lib/server/proxyForwarder.ts` | Single-transfer proxy sweep, gas sponsorship, background settlement |
| `src/lib/server/proxyWallets.ts` | Single-use EVM, Solana, and Litecoin deposit wallet generator |
| `src/lib/server/cryptoVault.ts` | Standalone AES-256-GCM encryption for ephemeral proxy keys |
| `src/lib/server/proxySwapStore.ts` | MongoDB store for proxy swap orders |
| `src/lib/server/directSwapStore.ts` | MongoDB store for direct solver swap orders |
| `src/lib/server/partnerBalanceStore.ts` | Partner USD fee credit ledger & crypto payout tickets |
| `src/lib/server/partnerLedger.ts` | Partner swap analytics & earnings aggregation |
| `src/components/SwapWidget.tsx` | Interactive cross-chain web swap UI |
| `src/components/LandingPage.tsx` | B2B Developer API + live Web Swap landing page |
| `src/components/Dashboard.tsx` | Authenticated user swap & developer quick-access hub |
| `src/app/partner/page.tsx` | Partner Portal for API keys, swap analytics & crypto withdrawals |
| `src/app/docs/page.tsx` | Interactive Swap API documentation & AI Agent Master Prompt |
| `src/app/admin/page.tsx` | Admin Swap & Partner Payout Console |
