"use client";

// ─── Transaction History Service (localStorage) ───

export interface TransactionRecord {
  hash: string;
  type: "payment" | "cashout" | "deposit";
  title: string;
  amountINR: number;
  amountUSDC: number;
  fee: number;
  recipient: string; // UPI ID or wallet address
  network: string;
  timestamp: number; // Unix ms
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
  const existing = getTransactions();
  existing.unshift(tx); // newest first
  // Keep only the last 50 transactions
  const trimmed = existing.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** Retrieve a single transaction by hash */
export function getTransactionByHash(hash: string): TransactionRecord | null {
  const all = getTransactions();
  return all.find((tx) => tx.hash === hash) || null;
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
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
