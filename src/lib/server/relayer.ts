import { createWalletClient, fallback, parseEther, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CONTRACTS, RELAY_GAS_FEE_USDC } from "@/lib/constants";
import { getResilientPublicClient } from "@/lib/server/p2pRates";
import { getEvmRpcConfig } from "@/lib/server/rpcConfig";

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
    process.env.SWEEPER_PRIVATE_KEY ||
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
    const { chain, transports } = getEvmRpcConfig("base");

    _walletClient = createWalletClient({
      account: getRelayerAccount(),
      chain,
      transport: fallback(transports, { rank: false }),
    });
  }
  return _walletClient;
}

export function getRelayerWalletClient() {
  return getWalletClient();
}

// Same relayer key, but a wallet client bound to the requested chain (Base, Polygon, Arbitrum, BSC...)
const _chainWalletClients = new Map<string, any>();
export function getRelayerWalletClientForChain(chainStr: string) {
  const { chain, transports, key } = getEvmRpcConfig(chainStr);
  const cached = _chainWalletClients.get(key);
  if (cached) return cached;

  const client = createWalletClient({
    account: getRelayerAccount(),
    chain,
    transport: fallback(transports, { rank: false }),
  });
  _chainWalletClients.set(key, client);
  return client;
}

function getPublicClient() {
  return getResilientPublicClient();
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
    return false; // Fail closed to prevent gas tank drainage during RPC disruptions
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
    account: getRelayerAccount(),
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

/**
 * Calculates or estimates the gas fee in USDC for a relayed transaction.
 * Defaults to RELAY_GAS_FEE_USDC ($0.05).
 */
export async function calculateGasFeeInUsdc(gasEstimate?: bigint): Promise<number> {
  if (!gasEstimate) return RELAY_GAS_FEE_USDC;
  try {
    const publicClient = getResilientPublicClient();
    const gasPrice = await publicClient.getGasPrice();
    const ethCostWei = gasEstimate * gasPrice;
    // Base L2 gas in USD
    const ethPriceUsd = 3000;
    const calculated = (Number(ethCostWei) / 1e18) * ethPriceUsd;
    return Math.max(0.02, Number(calculated.toFixed(2)));
  } catch {
    return RELAY_GAS_FEE_USDC;
  }
}

/**
 * Sends USDC directly from the Relayer wallet to a recipient (used for refunds).
 */
export async function sendUsdcFromRelayer(toAddress: `0x${string}`, amountWei: bigint): Promise<string> {
  const relayerWallet = getRelayerWalletClient();
  const publicClient = getResilientPublicClient();
  const txHash = await relayerWallet.writeContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [toAddress, amountWei],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
  return txHash;
}

/**
 * Ensures the Relayer wallet has approved the Diamond contract for USDC.
 * Approves maxUint256 once so individual orders execute with 0 extra approval gas.
 */
export async function ensureRelayerDiamondApproved(minAmountWei: bigint): Promise<void> {
  const publicClient = getResilientPublicClient();
  const relayerWallet = getRelayerWalletClient();
  const relayerAddress = getRelayerAddress();

  const allowance = (await publicClient.readContract({
    address: CONTRACTS.USDC as `0x${string}`,
    abi: parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]),
    functionName: "allowance",
    args: [relayerAddress, CONTRACTS.DIAMOND as `0x${string}`],
  })) as bigint;

  if (allowance < minAmountWei) {
    console.log("[Relayer] Approving Diamond for USDC allowance...");
    const maxUint256 = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
    const approveTx = await relayerWallet.writeContract({
      address: CONTRACTS.USDC as `0x${string}`,
      abi: parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]),
      functionName: "approve",
      args: [CONTRACTS.DIAMOND as `0x${string}`, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }
}
