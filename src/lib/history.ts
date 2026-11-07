"use client";

// ─── Cross-Chain Swap History Service (localStorage) ───

export interface TransactionRecord {
  hash: string; // swapId or depositAddress or txHash
  type: "swap" | "payment" | "cashout" | "deposit";
  title: string;
  fromAsset?: string;
  toAsset?: string;
  fromChain?: string;
  toChain?: string;
  amountIn?: string;
  amountOut?: string;
  depositAddress?: string;
  amountINR: number;
  amountUSDC: number;
  fee: number;
  protocolFee?: number;
  recipient: string;
  merchantName?: string;
  orderId?: string;
  network: string;
  timestamp: number; // Unix ms
  status?: "pending" | "settled" | "failed";
}

const STORAGE_KEY = "zkpay_transactions";

/** Retrieve all saved transactions, newest first */
export function getTransactions(): TransactionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TransactionRecord[];
  } catch {
    return [];
  }
}

/** Save a new transaction to history */
export function saveTransaction(tx: TransactionRecord): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getTransactions().filter((item) => item.hash !== tx.hash);
    existing.unshift(tx);
    const trimmed = existing.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

/** Update an existing transaction's status */
export function updateTransactionStatus(
  hashOrDeposit: string,
  status: "pending" | "settled" | "failed",
  amountOut?: string
): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getTransactions();
    let updated = false;
    for (const item of existing) {
      if (item.hash === hashOrDeposit || item.depositAddress === hashOrDeposit) {
        item.status = status;
        if (amountOut) item.amountOut = amountOut;
        updated = true;
      }
    }
    if (updated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }
  } catch {}
}

/** Retrieve a single transaction by hash or deposit address */
export function getTransactionByHash(hash: string): TransactionRecord | null {
  const all = getTransactions();
  return all.find((tx) => tx.hash === hash || tx.depositAddress === hash) || null;
}

/** Get relative time string (e.g. "2 hours ago") */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
