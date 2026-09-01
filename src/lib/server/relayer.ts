import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { CHAIN } from "@/lib/constants";

// ─────────────────────────────────────────────────────
// Backend Gas Relayer
//
// A single server-side wallet funded with ~$3-5 of ETH
// on Base. It pre-funds user smart accounts with micro
// ETH so they can pay gas natively — no Privy paymaster
// or credit card required.
//
// Env var: RELAYER_PRIVATE_KEY (hex private key, with or without 0x prefix)
// ─────────────────────────────────────────────────────

// Minimum ETH balance threshold: below this, the smart account gets pre-funded
export const MIN_ETH_THRESHOLD = parseEther("0.00003"); // ~$0.006

// Amount of ETH to send when pre-funding (enough for ~20-50 txs on Base)
export const PREFUND_AMOUNT = parseEther("0.0001"); // ~$0.02

// Rate-limit: max prefunds per user per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PREFUNDS_PER_WINDOW = 5;

// In-memory rate limiter (resets on server restart, sufficient for production)
const prefundLog = new Map<string, number[]>();

function getRelayerPrivateKey(): `0x${string}` {
  const raw =
    process.env.RELAYER_PRIVATE_KEY ||
    process.env.GAS_RELAYER_PRIVATE_KEY ||
    process.env.GAS_TANK_PRIVATE_KEY;

  if (!raw) {
    throw new Error(
      "RELAYER_PRIVATE_KEY is not configured. Please add a funded EOA private key to your Render environment variables."
    );
  }

  let key = raw.trim();
  // Strip surrounding quotes
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Ensure 0x prefix
  if (!key.startsWith("0x")) {
    key = `0x${key}`;
  }

  return key as `0x${string}`;
}

let _relayerAccount: any = null;
function getRelayerAccount() {
  if (!_relayerAccount) {
    _relayerAccount = privateKeyToAccount(getRelayerPrivateKey());
  }
  return _relayerAccount;
}

let _walletClient: any = null;
function getWalletClient() {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getRelayerAccount(),
      chain: base,
      transport: http(CHAIN.rpcUrl),
    });
  }
  return _walletClient;
}

let _publicClient: any = null;
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(CHAIN.rpcUrl),
    });
  }
  return _publicClient;
}

/**
 * Get the relayer's wallet address (for monitoring).
 */
export function getRelayerAddress(): `0x${string}` {
  return getRelayerAccount().address;
}

/**
 * Get the relayer's current ETH balance.
 */
export async function getRelayerBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  return publicClient.getBalance({ address: getRelayerAddress() });
}

/**
 * Check if an address needs pre-funding (ETH balance below threshold).
 */
export async function needsPrefund(address: `0x${string}`): Promise<boolean> {
  const publicClient = getPublicClient();
  const balance = await publicClient.getBalance({ address });
  return balance < MIN_ETH_THRESHOLD;
}

/**
 * Rate-limit check for a specific address.
 */
function checkRateLimit(address: string): boolean {
  const key = address.toLowerCase();
  const now = Date.now();
  const timestamps = prefundLog.get(key) || [];

  // Remove expired entries
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (valid.length >= MAX_PREFUNDS_PER_WINDOW) {
    return false; // Rate limited
  }

  valid.push(now);
  prefundLog.set(key, valid);
  return true;
}

/**
 * Pre-fund a user's smart account with micro ETH for gas.
 *
 * Returns the transaction hash, or null if:
 * - The account already has sufficient ETH
 * - Rate limited
 */
export async function prefundAccount(
  targetAddress: `0x${string}`
): Promise<{ hash: string | null; alreadyFunded: boolean; error?: string }> {
  // 1. Check if the account already has enough ETH
  const publicClient = getPublicClient();
  const balance = await publicClient.getBalance({ address: targetAddress });

  if (balance >= MIN_ETH_THRESHOLD) {
    return { hash: null, alreadyFunded: true };
  }

  // 2. Rate-limit check
  if (!checkRateLimit(targetAddress)) {
    return { hash: null, alreadyFunded: false, error: "Rate limited. Try again later." };
  }

  // 3. Check relayer has enough funds
  const relayerBalance = await getRelayerBalance();
  const minRelayerBalance = PREFUND_AMOUNT * 2n; // Keep a safety buffer
  if (relayerBalance < minRelayerBalance) {
    console.error(
      `[Relayer] LOW BALANCE: ${formatEther(relayerBalance)} ETH remaining. ` +
      `Relayer address: ${getRelayerAddress()}`
    );
    return {
      hash: null,
      alreadyFunded: false,
      error: "Gas relayer is temporarily unavailable. Please try again later.",
    };
  }

  // 4. Send micro ETH to target
  const walletClient = getWalletClient();
  const hash = await walletClient.sendTransaction({
    to: targetAddress,
    value: PREFUND_AMOUNT,
  });

  // 5. Wait for confirmation (Base ~2s block time)
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

  console.log(
    `[Relayer] Pre-funded ${targetAddress} with ${formatEther(PREFUND_AMOUNT)} ETH. ` +
    `TX: ${hash}. Relayer balance: ${formatEther(relayerBalance - PREFUND_AMOUNT)} ETH`
  );

  return { hash, alreadyFunded: false };
}
