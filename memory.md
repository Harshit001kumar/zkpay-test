# ZkPay Project Memory

> This file is the single source of truth for all project knowledge. Updated automatically.

## Core Identity
- **App**: ZkPay — Crypto-to-Fiat Scan & Pay
- **Stack**: Next.js 14, TypeScript, Privy (free plan), viem, wagmi, TailwindCSS
- **Hosting**: Render (auto-deploys from `Harshit001kumar/zkpay-test` GitHub repo)
- **Deploy workflow**: Push to GitHub → Render auto-builds → runs `npm install` from `package.json` automatically. NEVER ask user to run npm install locally. Just add deps to package.json.
- **Design**: Mobile-first, minimalist, no clutter

## User Preferences & Rules
- Always prioritize **mobile-first** design
- User runs **git commands manually** (Windows permission issues)
- Use **npm** (not yarn — yarn is not installed)
- Etherscan/Basescan APIs: use **V2 API format** (single API key string)
- Ethereum addresses in Hardhat: always **lowercase + `ethers.getAddress()`**
- **Privy is on the FREE plan** — no Smart Wallets (ERC-4337). Use two-signature approach for fee collection.
- **Deployment is on Render** — not Vercel, not local. Always remember this.

## Deployed Contracts (Base Sepolia)
| Contract | Address |
|---|---|
| ZkPayIntegrator | `0x5610D5f587F9cEEBb11C2920D15aC54175b40b2f` |
| Diamond (P2PKit) | `0xd8d6acdbc5dbafa073827f3335dbb06df31580f6` |
| USDC | `0x036cbd53842c5426634e7929541ec2318f3dcf7e` |
| Treasury | `0x0242898972A3DCA88082Ccc366B27cBf950E25b8` |
| Owner/Deployer | `0x21F082Ed82FE2700bFd621BAf01CbC0CEb0616E5` |

## P2PKit Integration (Critical Knowledge)
- **No whitelist needed** for offramp (SELL). The P2PKit team confirmed this.
- Per-transaction sell limit: **100 USDC** (INR), **200 USDC** (other currencies). No KYC required.
- Buy limit for unverified wallets: **0** (onramp requires zkKYC).
- Sell limit is denominated in **USDC, not fiat**. Never confuse the two.
- **Never hardcode 100/200** — always read from `getTxLimits()` at runtime.
- `fiatAmountLimit` must be passed **explicitly** on every `placeOrder` (never `0n`).
- `waitForReceipt: true` is **required** to get `orderId` back from `placeOrder`.
- Payout address (UPI ID) must be **persisted durably** (localStorage keyed by orderId).
- Order status flow: `placed → accepted → paid → completed` (or `cancelled`).
- SDK modules needed: `@p2pdotme/sdk/orders`, `@p2pdotme/sdk/profile`, `@p2pdotme/sdk/prices`.
- SDK needs **node polyfills** (Buffer, global) in the browser for ECIES encryption.
- Base Sepolia testnet may be behind mainnet — always test against mainnet values.
- The quickstart doc is at: `c:\Users\HARSHIT KUMAR\Downloads\offramp-no-kyc-quickstart.md`

## Fee Collection Strategy
- **1% platform fee** (100 bps) on every transaction.
- **Collection Method (1-Click UX)**: Since the user enabled Coinbase Smart Wallet in Privy, we bundle the transactions using EIP-5792 (`wallet_sendCalls`):
  1. Transfer 1% fee (extra on top) to Treasury
  2. Approve DIAMOND for 100% of the requested amount
  3. SDK `placeOrder` (via prepared calldata)

## ChangeNOW Cross-Chain Deposits
- API routes: `/api/exchange`, `/api/exchange/estimate`, `/api/exchange/status`
- Supported assets: BTC, ETH, SOL, USDT (TRC20), USDC (ERC20), MATIC, BNB (BSC)
- Target: USDC on Base
- API key stored server-side as `CHANGENOW_API_KEY` env var
- QR codes generated via `api.qrserver.com` (no npm dependency)

## Key Files
| File | Purpose |
|---|---|
| `src/lib/constants.ts` | Contract addresses, chain config, deposit assets |
| `src/lib/abi.ts` | ABI definitions (ERC20, Integrator) |
| `src/lib/p2pkit.ts` | P2PKit SDK wrapper (currently placeholder — being rewritten) |
| `src/lib/history.ts` | Local transaction history (localStorage) |
| `src/lib/types.ts` | MerchantData type |
| `src/components/Providers.tsx` | Privy + Wagmi providers |
| `src/components/Scanner.tsx` | QR code scanning + UPI URL parsing |
| `src/components/PaymentEntry.tsx` | Amount entry screen |
| `src/components/CheckoutFlow.tsx` | Payment execution (approve + placeOrder) |
| `src/components/CashoutFlow.tsx` | Cash out to UPI (being rewritten with real SDK) |
| `src/components/DepositFlow.tsx` | Cross-chain deposit via ChangeNOW |
| `src/components/LandingPage.tsx` | Unauthenticated landing page |
| `src/app/page.tsx` | Main dashboard (tabs: Pay, Cash Out, Deposit) |
| `next.config.mjs` | Webpack config with resolve fallbacks |
| `payment-integrators/` | Smart contract source (Hardhat) |

## Roadmap (Priority Order)
1. **Phase 1**: Launch payments with P2PKit (Mainnet) — IN PROGRESS
2. **Phase 2**: Proprietary App Payments Network (Amazon, Blinkit, Swiggy) — using own merchant network
3. **Phase 3**: Finances & Growth (ZkPay Pro subscription, Treasury Yield, B2B APIs)

## Documents Created
- `ZkPay_Integration_Proposal.html` — For P2PKit team / whitelisting
- `ZkPay_Action_Plan.html` — Internal team roadmap

## Important Workflow Rules
- **NEVER ask user to run `npm install`** — just add deps to `package.json`. Render handles the rest.
- **No custom smart contract deployment** — we are using the P2PKit SDK directly, not deploying `ZkPayIntegrator.sol` to mainnet.
- The `payment-integrators/` folder is legacy testnet work. The production flow is SDK-only.

## Current Work
- **Active Task**: Rewriting `CashoutFlow.tsx` and `p2pkit.ts` with real `@p2pdotme/sdk` integration (pure SDK, no smart contract)
