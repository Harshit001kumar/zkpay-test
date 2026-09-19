---
title: GET /v0/tokens
impact: CRITICAL
tags: api, tokens
---

# GET /v0/tokens

Fetch supported tokens. Cache result (changes infrequently).

```typescript
const response = await fetch('https://1click.chaindefuser.com/v0/tokens');
const tokens = await response.json();
```

## Response

```typescript
interface Token {
  assetId: string;          // Use in originAsset/destinationAsset
  decimals: number;         // For amount conversion
  blockchain: string;       // 'eth', 'sol', 'near', 'base', 'arb', 'bsc', 'tron', 'btc', etc.
  symbol: string;           // 'USDC', 'ETH', 'BTC', 'SOL', 'USDT'
  price: number;            // USD price
  priceUpdatedAt: string;   // ISO timestamp
  contractAddress?: string; // On-chain contract address
}
```

### Key Base Destination Asset
Base USDC assetId:
`nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`
Decimals: 6
Symbol: USDC
