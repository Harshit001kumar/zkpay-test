export type SupportedChainId =
  | "base"
  | "sol"
  | "eth"
  | "btc"
  | "polygon"
  | "arb"
  | "bsc"
  | "tron"
  | "ltc";

export interface SwapTokenItem {
  symbol: string;
  name: string;
  assetId: string;
  blockchain: SupportedChainId | string;
  decimals: number;
}

export interface ChainInfo {
  id: SupportedChainId;
  name: string;
  shortName: string;
  badgeColor: string;
  addressPlaceholder: string;
  finalityLabel: string;
  zeroFee?: boolean;
}

export const CHAIN_METADATA: Record<SupportedChainId, ChainInfo> = {
  base: {
    id: "base",
    name: "Base",
    shortName: "BASE",
    badgeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    addressPlaceholder: "0x... (Base EVM Address)",
    finalityLabel: "~2s",
  },
  sol: {
    id: "sol",
    name: "Solana",
    shortName: "SOL",
    badgeColor: "text-purple-400 border-purple-500/30 bg-purple-500/10",
    addressPlaceholder: "Base58 Solana Address (e.g. 7vN2...)",
    finalityLabel: "~1s",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    shortName: "POL",
    badgeColor: "text-violet-400 border-violet-500/30 bg-violet-500/10",
    addressPlaceholder: "0x... (Polygon EVM Address)",
    finalityLabel: "~3s",
  },
  arb: {
    id: "arb",
    name: "Arbitrum",
    shortName: "ARB",
    badgeColor: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    addressPlaceholder: "0x... (Arbitrum EVM Address)",
    finalityLabel: "~2s",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    shortName: "BSC",
    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    addressPlaceholder: "0x... (BSC EVM Address)",
    finalityLabel: "~3s",
  },
  eth: {
    id: "eth",
    name: "Ethereum",
    shortName: "ETH",
    badgeColor: "text-slate-300 border-slate-400/30 bg-slate-500/10",
    addressPlaceholder: "0x... (Ethereum Mainnet Address)",
    finalityLabel: "~15s",
    zeroFee: true,
  },
  btc: {
    id: "btc",
    name: "Bitcoin",
    shortName: "BTC",
    badgeColor: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    addressPlaceholder: "bc1... or 1... / 3... (Bitcoin Address)",
    finalityLabel: "~10m",
    zeroFee: true,
  },
  ltc: {
    id: "ltc",
    name: "Litecoin",
    shortName: "LTC",
    badgeColor: "text-zinc-300 border-zinc-400/30 bg-zinc-500/10",
    addressPlaceholder: "ltc1... or L... / M... (Litecoin Address)",
    finalityLabel: "~2.5m",
  },
  tron: {
    id: "tron",
    name: "Tron",
    shortName: "TRX",
    badgeColor: "text-red-400 border-red-500/30 bg-red-500/10",
    addressPlaceholder: "T... (Tron TRC20 Address)",
    finalityLabel: "~3s",
    zeroFee: true,
  },
};
