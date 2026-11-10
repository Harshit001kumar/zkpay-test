/**
 * Shared visual metadata for the supported swap chains.
 * Used by the 3D canvas, swap widget token marks, landing page and in-app dashboard
 * so every surface renders the same brand color, short code and finality hint.
 */

export interface ChainVisual {
  id: string;
  name: string;
  code: string;
  color: string;
  finality: string;
  vm: string;
}

export const CHAIN_VISUALS: ChainVisual[] = [
  { id: "btc", name: "Bitcoin", code: "BTC", color: "#F7931A", finality: "~10m", vm: "UTXO" },
  { id: "eth", name: "Ethereum", code: "ETH", color: "#627EEA", finality: "~12s", vm: "EVM" },
  { id: "sol", name: "Solana", code: "SOL", color: "#14F195", finality: "~1s", vm: "SVM" },
  { id: "base", name: "Base", code: "BASE", color: "#2970FF", finality: "~2s", vm: "EVM" },
  { id: "arb", name: "Arbitrum", code: "ARB", color: "#28A0F0", finality: "~1s", vm: "EVM" },
  { id: "polygon", name: "Polygon", code: "POL", color: "#8247E5", finality: "~3s", vm: "EVM" },
  { id: "bsc", name: "BNB Chain", code: "BNB", color: "#F3BA2F", finality: "~3s", vm: "EVM" },
  { id: "tron", name: "Tron", code: "TRX", color: "#FF3B3B", finality: "~3s", vm: "TVM" },
  { id: "ltc", name: "Litecoin", code: "LTC", color: "#A6B4C8", finality: "~2.5m", vm: "UTXO" },
];

const BY_ID: Record<string, ChainVisual> = CHAIN_VISUALS.reduce((acc, c) => {
  acc[c.id] = c;
  return acc;
}, {} as Record<string, ChainVisual>);

export function chainVisual(id: string): ChainVisual {
  return (
    BY_ID[id] || {
      id,
      name: id.toUpperCase(),
      code: id.toUpperCase(),
      color: "#8E9BB0",
      finality: "",
      vm: "",
    }
  );
}

/** Brand tint per token symbol (falls back to chain color). */
const TOKEN_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  SOL: "#14F195",
  USDC: "#2775CA",
  USDT: "#26A17B",
  BNB: "#F3BA2F",
  TRX: "#FF3B3B",
  LTC: "#A6B4C8",
  ARB: "#28A0F0",
  POL: "#8247E5",
};

export function tokenColor(symbol: string, chainId?: string): string {
  return TOKEN_COLORS[symbol] || (chainId ? chainVisual(chainId).color : "#8E9BB0");
}

/** Popular one tap routes, expressed as "SYMBOL:chain". */
export interface PopularPair {
  label: string;
  from: string;
  to: string;
}

export const POPULAR_PAIRS: PopularPair[] = [
  { label: "SOL to USDC on Base", from: "SOL:sol", to: "USDC:base" },
  { label: "BTC to ETH", from: "BTC:btc", to: "ETH:eth" },
  { label: "USDT Tron to USDC Base", from: "USDT:tron", to: "USDC:base" },
  { label: "LTC to USDT Polygon", from: "LTC:ltc", to: "USDT:polygon" },
  { label: "ETH to SOL", from: "ETH:eth", to: "SOL:sol" },
];
