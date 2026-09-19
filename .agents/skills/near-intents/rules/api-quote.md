---
title: POST /v0/quote
impact: CRITICAL
tags: api, quote, swap
---

# POST /v0/quote

Generates swap quote. Use `dry: true` for preview, `dry: false` to get deposit address.

```typescript
const res = await fetch('https://1click.chaindefuser.com/v0/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dry: false, // true for preview, false to commit and get deposit address
    swapType: 'FLEX_INPUT', // or EXACT_INPUT
    slippageTolerance: 100, // 1% (100 bps)
    originAsset: 'nep141:btc.omft.near', // or nep141:sol.omft.near, etc.
    destinationAsset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    amount: '1000000', // smallest units (satoshis, lamports, wei, etc.)
    recipient: '0x...', // recipient Base address
    refundTo: '0x...', // refund address
  })
});
const quote = await res.json();
```

## Request Fields

### Required
- `dry`: boolean (`true` = preview only, `false` = get deposit address valid ~10 min)
- `swapType`: 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT'
- `originAsset`: Source token assetId from GET /v0/tokens
- `destinationAsset`: Destination token assetId
- `amount`: Amount in smallest units
- `recipient`: Address to receive output tokens (e.g. user's Base address)
- `refundTo`: Address for refunds if swap fails

## Response

```typescript
interface QuoteResponse {
  quoteId: string;
  depositAddress: string;
  depositMemo?: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  deadline: string; // ISO timestamp
  timeEstimateSeconds?: number;
}
```
