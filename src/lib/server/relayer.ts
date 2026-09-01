import { createWalletClient, createPublicClient, http, parseEther, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { CHAIN, CONTRACTS } from "@/lib/constants";

// ─────────────────────────────────────────────────────
// Enterprise-Grade Backend Gas Relayer ("Gas Tank")
//
// Multi-layered security to prevent drain, Sybil abuse,
// and unauthorized gas extraction while providing seamless
// 1-click execution for legitimate users.
// ─────────────────────────────────────────────────────

// Minimum ETH threshold: below this, account is eligible for pre-funding
export const MIN_ETH_THRESHOLD = parseEther("0.00003"); // ~$0.006

// Amount of ETH dispensed per prefund (enough for ~20-50 txs on Base)
export const PREFUND_AMOUNT = parseEther("0.0001"); // ~$0.02

// ── Security Constraints ──
// 1. Sliding window rate-limits per user wallet
const COOLDOWN_PER_ADDRESS_MS = 5 * 60 * 1000; // 5 minutes cooldown between prefunds
const MAX_PREFUNDS_PER_DAY = 3; // Max 3 prefunds per 24 hours per wallet
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

// 2. Global Circuit Breaker: Max 0.005 ETH (~$1.00) total dispensed per hour across all users
const HOURLY_GLOBAL_BUDGET = parseEther("0.005");
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

// 3. Minimum USDC balance for Sybil / bot-farm prevention (1 cent = 10,000 wei in 6 decimals)
export const MIN_USDC_FOR_PREFUND = 10_000n; // $0.01 USDC

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

// In-memory security tracking stores
const addressPrefundTimestamps = new Map<string, number[]>();
let hourlyGlobalDispatched: { timestamp: number; amount: bigint }[] = [];

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
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
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

export function getRelayerAddress(): `0x${string}` {
  return getRelayerAccount().address;
}

export async function getRelayerBalance(): Promise<bigint> {
  const publicClient = getPublicClient();
  return publicClient.getBalance({ address: getRelayerAddress() });
}

export async function needsPrefund(address: `0x${string}`): Promise<boolean> {
  const publicClient = getPublicClient();
  const balance = await publicClient.getBalance({ address });
  return balance < MIN_ETH_THRESHOLD;
}

/**
 * Security Layer 1: Check Global Circuit Breaker
 */
function checkGlobalCircuitBreaker(): boolean {
  const now = Date.now();
  // Filter dispatches in the last 1 hour
  hourlyGlobalDispatched = hourlyGlobalDispatched.filter(
    (item) => now - item.timestamp < HOURLY_WINDOW_MS
  );

  const totalHourDispensed = hourlyGlobalDispatched.reduce(
    (acc, item) => acc + item.amount,
    0n
  );

  return totalHourDispensed + PREFUND_AMOUNT <= HOURLY_GLOBAL_BUDGET;
}

/**
 * Security Layer 2: Check Address Cooldown & Daily Cap
 */
function checkAddressRateLimit(address: string): { allowed: boolean; reason?: string } {
  const key = address.toLowerCase();
  const now = Date.now();
  const timestamps = addressPrefundTimestamps.get(key) || [];

  // Filter entries in the last 24h
  const recent24h = timestamps.filter((t) => now - t < WINDOW_24H_MS);

  // Check cooldown from last prefund
  const lastPrefund = recent24h[recent24h.length - 1];
  if (lastPrefund && now - lastPrefund < COOLDOWN_PER_ADDRESS_MS) {
    const waitSeconds = Math.ceil((COOLDOWN_PER_ADDRESS_MS - (now - lastPrefund)) / 1000);
    return {
      allowed: false,
      reason: `Please wait ${waitSeconds}s before requesting gas again.`,
    };
  }

  // Check 24h max prefund cap
  if (recent24h.length >= MAX_PREFUNDS_PER_DAY) {
    return {
      allowed: false,
      reason: "Daily gas subsidy limit reached for this wallet.",
    };
  }

  return { allowed: true };
}

function recordPrefund(address: string) {
  const key = address.toLowerCase();
  const now = Date.now();

  const timestamps = addressPrefundTimestamps.get(key) || [];
  timestamps.push(now);
  addressPrefundTimestamps.set(key, timestamps);

  hourlyGlobalDispatched.push({ timestamp: now, amount: PREFUND_AMOUNT });
}

/**
 * Security Layer 3: Verify Minimum On-Chain USDC Activity (Sybil Resistance)
 */
export async function checkUsdcActivity(address: `0x${string}`): Promise<boolean> {
  try {
    const publicClient = getPublicClient();
    const balance = (await publicClient.readContract({
      address: CONTRACTS.USDC as `0x${string}`,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;

    return balance >= MIN_USDC_FOR_PREFUND;
  } catch (err) {
    console.warn("[Relayer Security] USDC balance check failed:", err);
    return true; // Don't block legitimate users if RPC fails
  }
}

/**
 * Pre-fund account with full security verification
 */
export async function prefundAccount(
  targetAddress: `0x${string}`
): Promise<{ hash: string | null; alreadyFunded: boolean; error?: string }> {
  const publicClient = getPublicClient();

  // 1. Balance Threshold Check
  const balance = await publicClient.getBalance({ address: targetAddress });
  if (balance >= MIN_ETH_THRESHOLD) {
    return { hash: null, alreadyFunded: true };
  }

  // 2. Global Circuit Breaker Check
  if (!checkGlobalCircuitBreaker()) {
    console.warn("[Relayer Security] Global hourly budget reached. Circuit breaker engaged.");
    return {
      hash: null,
      alreadyFunded: false,
      error: "High network volume. Gas relayer temporarily throttled. Please try again shortly.",
    };
  }

  // 3. User Cooldown & Rate Limit Check
  const rateCheck = checkAddressRateLimit(targetAddress);
  if (!rateCheck.allowed) {
    return {
      hash: null,
      alreadyFunded: false,
      error: rateCheck.reason || "Rate limit exceeded.",
    };
  }

  // 4. Check Relayer Gas Tank Health
  const relayerBalance = await getRelayerBalance();
  const minRelayerBalance = PREFUND_AMOUNT * 2n;
  if (relayerBalance < minRelayerBalance) {
    console.error(
      `[Relayer Security] LOW GAS TANK: ${formatEther(relayerBalance)} ETH remaining at ${getRelayerAddress()}`
    );
    return {
      hash: null,
      alreadyFunded: false,
      error: "Gas tank requires refill. Please contact support.",
    };
  }

  // 5. Broadcast micro ETH on Base
  const walletClient = getWalletClient();
  const hash = await walletClient.sendTransaction({
    to: targetAddress,
    value: PREFUND_AMOUNT,
  });

  // 6. Record in security ledger
  recordPrefund(targetAddress);

  // 7. Wait for receipt
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

  console.log(
    `[Relayer Security] Secured pre-fund: ${targetAddress} (+${formatEther(PREFUND_AMOUNT)} ETH). TX: ${hash}`
  );

  return { hash, alreadyFunded: false };
}
