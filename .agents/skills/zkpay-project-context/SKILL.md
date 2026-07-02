---
name: zkpay-project-context
description: ZkPay project architecture, deployed contracts, key files, deployment info, and roadmap for the crypto-to-fiat scan-and-pay app.
---

## Project Overview
ZkPay is a mobile-first crypto-to-fiat payment app. Users scan a UPI QR code and pay with USDC on Base chain. The app routes payments through the P2PKit protocol.

## Tech Stack
- **Frontend**: Next.js, TypeScript, Privy (wallet auth), viem (contract calls), html5-qrcode (QR scanning)
- **Smart Contract**: Solidity 0.8.28, Hardhat, deployed on Base (Sepolia testnet)
- **Hosting**: Render (auto-deploys from `Harshit001kumar/zkpay-test` GitHub repo)
- **Protocol**: P2PKit (`p2pdotme/payment-integrators`)

## Deployed Contract (Base Sepolia)
- **ZkPayIntegrator**: `0x5610D5f587F9cEEBb11C2920D15aC54175b40b2f`
- **Diamond (P2P Protocol)**: `0xd8d6acdbc5dbafa073827f3335dbb06df31580f6`
- **USDC**: `0x036cbd53842c5426634e7929541ec2318f3dcf7e`
- **Treasury**: `0x0242898972A3DCA88082Ccc366B27cBf950E25b8`
- **Owner/Deployer**: `0x21F082Ed82FE2700bFd621BAf01CbC0CEb0616E5`
- **Verified on Basescan**: https://sepolia.basescan.org/address/0x5610D5f587F9cEEBb11C2920D15aC54175b40b2f#code

## Key Files (d:\zk_pay)
- `src/lib/constants.ts` — Contract addresses and chain config
- `src/lib/abi.ts` — ABI definitions for INTEGRATOR and ERC20
- `src/lib/types.ts` — MerchantData type definition
- `src/components/Scanner.tsx` — QR code scanning and UPI URL parsing
- `src/components/PaymentEntry.tsx` — Amount entry screen
- `src/components/CheckoutFlow.tsx` — Payment execution (approve + userPlaceOrder)

## Smart Contract (d:\zk_pay\payment-integrators)
- `contracts/integrators/zk_pay/ZkPayIntegrator.sol` — Custom integrator
- `scripts/deploy-zkpay.ts` — Hardhat deployment script
- Follows P2PKit's canonical `UserProxy` + `CREATE2` architecture
- Implements: `validateOrder`, `onOrderComplete`, `onOrderCancel`, `userPlaceOrder`

## Monetization (Current)
- 1% platform convenience fee (100 bps), charged to sender, routed to Treasury wallet automatically via smart contract

## Monetization (Future Roadmap)
- ZkPay Pro subscription (0% fees for $10/month)
- Treasury Yield (auto-deposit fees into Aave/Compound for APY)
- B2B Payroll (bulk USDC-to-UPI for companies)
- ZkPay Credit (collateralized scan-and-pay-later)
- Custom `@zkpay` usernames
- Merchant Dashboard SaaS
- White-label SDK/Widget licensing
- Sponsored merchant listings (ads)
- Affiliate cashback deals

## Whitelisting Status
- ✅ Contract deployed to Base Sepolia
- ✅ Contract verified on Basescan
- ⬜ Fork `p2pdotme/payment-integrators` and open Pull Request
- ⬜ File Whitelist Request issue
- ⬜ Deploy to Base Mainnet after approval
