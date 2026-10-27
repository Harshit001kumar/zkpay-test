export type PartnerTxType = "payin_session" | "pay_link" | "swap";
export type PartnerTxStatus = "COMPLETED" | "PENDING" | "FAILED" | "EXPIRED";

export interface PartnerTransaction {
  id: string;
  type: PartnerTxType;
  productLabel: string;
  apiKeyId: string | null;
  apiKeyLabel: string;
  status: PartnerTxStatus;
  rawStatus: string;
  amount: string;
  currency: string;
  amountUsdEstimate: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  partnerFeeAmount?: string | null;
  partnerFeeCurrency?: string | null;
  partnerFeeUsdEstimate: number;
  chain?: string;
  destinationChain?: string;
  fromAsset?: string;
  toAsset?: string;
  recipient?: string;
  customerIdentifier?: string;
  txHash?: string | null;
  depositAddress?: string | null;
  explorerUrl?: string | null;
  createdAt: number;
  expiresAt?: number;
  settledAt?: number;
  source: "api" | "app" | "checkout";
  details?: Record<string, any>;
}

export interface PartnerMetrics {
  totalVolumeUsd: number;
  totalTransactions: number;
  successfulTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  successRate: number;
  estimatedPartnerEarningsUsd: number;
  breakdownByType: {
    swaps: number;
    payins: number;
    paylinks: number;
  };
  volumeByType: {
    swapsUsd: number;
    payinsUsd: number;
    paylinksUsd: number;
  };
  activeKeysCount: number;
}

export function getExplorerTxUrl(chain?: string, txHash?: string | null): string | null {
  if (!txHash) return null;
  const c = (chain || "").toLowerCase();
  if (c.includes("poly") || c.includes("matic")) return `https://polygonscan.com/tx/${txHash}`;
  if (c.includes("arb")) return `https://arbiscan.io/tx/${txHash}`;
  if (c.includes("bsc") || c.includes("binance")) return `https://bscscan.com/tx/${txHash}`;
  if (c.includes("sol")) return `https://solscan.io/tx/${txHash}`;
  if (c.includes("opt")) return `https://optimistic.etherscan.io/tx/${txHash}`;
  if (c.includes("eth") || c.includes("mainnet")) return `https://etherscan.io/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}
