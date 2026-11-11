import crypto from "crypto";
import { Buffer } from "buffer";
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbi,
  getAddress,
  isAddress,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, arbitrum, polygon, bsc } from "viem/chains";
import { CONTRACTS, normalizeChain, SWAP_ALLOWED_TOKENS, getTreasuryAddressForChain } from "@/lib/constants";
import {
  ProxySwapOrder,
  getProxyOrderByAddress,
  getProxyOrderBySwapId,
  getPendingProxyOrders,
  getForwardedOrUncreditedProxyOrders,
  getRecentProxyOrders,
  updateProxySwapOrder,
  getDecryptedProxyPrivateKey,
} from "./proxySwapStore";
import { creditPartnerFeeOnSettlement } from "./partnerBalanceStore";
import { getRelayerWalletClient, getRelayerWalletClientForChain } from "./relayer";
import { decodeBase58 } from "./proxyWallets";
import {
  getResilientPublicClientForChain,
  fetchResilientSolanaRpc,
  getEvmRpcConfig,
} from "./rpcConfig";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// EIP-3009 transferWithAuthorization ABI (supported by USDC on Base, Polygon, Arbitrum)
const EIP3009_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

// Deterministic CREATE2 address for Multicall3 across all EVM chains (Base, Polygon, Arb, BSC, Mainnet)
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const MULTICALL3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
  "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])",
]);

// Known USDC addresses that support EIP-3009 (Circle's native USDC)
const EIP3009_USDC: Record<string, `0x${string}`> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  arb: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

// EIP-712 domain for USDC transferWithAuthorization
const USDC_EIP712_NAMES: Record<string, string> = {
  base: "USD Coin",
  arb: "USD Coin",
  polygon: "USD Coin",
};
const USDC_EIP712_VERSIONS: Record<string, string> = {
  base: "2",
  arb: "2",
  polygon: "2",
};
const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  arb: 42161,
  polygon: 137,
  bsc: 56,
};

// ─── BSC Dynamic Gas Calculation ───
// BSC gas advances are 100% dynamic (no fixed BNB floor): advance = live gasPrice × gas units × safety margin.
// At ~0.1–1 gwei this is ~$0.01–$0.25 instead of a flat ~$0.50, and unused BNB is swept back to the relayer.
// The only floor is on the gas PRICE (BSC validators reject txs below 0.1 gwei).
const BSC_MIN_GAS_PRICE = 100_000_000n; // 0.1 gwei
const BSC_FALLBACK_GAS_PRICE = 1_000_000_000n; // 1 gwei, used only if the RPC gasPrice call fails

/**
 * Preemptively notifies NEAR Intents 1Click service (POST /v0/deposit/submit)
 * that a deposit transaction has been broadcast for the specified solver deposit address.
 * This registers the tx in NEAR Intents' mempool indexer, preventing solver timeouts
 * while awaiting slow block explorers.
 */
export async function notifyNearIntentsDepositSubmit(
  depositAddress: string,
  txHash: string
): Promise<boolean> {
  if (!depositAddress || !txHash) return false;
  try {
    const res = await fetch("https://1click.chaindefuser.com/v0/deposit/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash,
        depositAddress,
      }),
    });
    if (res.ok) {
      console.log(
        `[ProxyForwarder] ✓ Preemptively submitted deposit tx ${txHash} for ${depositAddress} to Near Intents 1Click.`
      );
      return true;
    } else {
      const errText = await res.text().catch(() => "");
      console.warn(
        `[ProxyForwarder] Near Intents deposit/submit returned ${res.status}: ${errText}`
      );
      return false;
    }
  } catch (err: any) {
    console.warn(
      `[ProxyForwarder] Failed to notify Near Intents deposit/submit:`,
      err?.message || err
    );
    return false;
  }
}

/**
 * Signs an EIP-3009 transferWithAuthorization and has the relayer submit it.
 * The proxy wallet signs off-chain (no gas needed), the relayer pays all gas.
 */
async function executeGaslessUsdcTransfer(params: {
  proxyAccount: ReturnType<typeof privateKeyToAccount>;
  tokenAddress: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  chainKey: string;
  publicClient: any;
}): Promise<string> {
  const { proxyAccount, tokenAddress, to, value, chainKey, publicClient } = params;
  const chainId = CHAIN_IDS[chainKey];
  const nonce = ("0x" + crypto.randomBytes(32).toString("hex")) as `0x${string}`;
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

  // EIP-712 typed data for transferWithAuthorization
  const domain = {
    name: USDC_EIP712_NAMES[chainKey] || "USD Coin",
    version: USDC_EIP712_VERSIONS[chainKey] || "2",
    chainId,
    verifyingContract: tokenAddress,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: proxyAccount.address,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  // Proxy signs the authorization off-chain (no gas!)
  const signature = await proxyAccount.signTypedData({
    domain,
    types,
    primaryType: "TransferWithAuthorization",
    message,
  });

  // Split signature into v, r, s
  const r = ("0x" + signature.slice(2, 66)) as `0x${string}`;
  const s = ("0x" + signature.slice(66, 130)) as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  // Relayer on THIS chain submits the authorization (relayer pays gas)
  const relayer = getRelayerWalletClientForChain(chainKey);
  const txHash = await relayer.writeContract({
    account: relayer.account,
    address: tokenAddress,
    abi: EIP3009_ABI,
    functionName: "transferWithAuthorization",
    args: [proxyAccount.address, to, value, validAfter, validBefore, nonce, v, r, s],
  });

  return txHash;
}

interface GaslessTransferOutput {
  to: `0x${string}`;
  value: bigint;
}

/**
 * Bundles multiple EIP-3009 USDC transfers into a single atomic transaction
 * via Multicall3 (or falls back to single/sequential execution).
 */
async function executeBundledGaslessUsdcTransfers(params: {
  proxyAccount: ReturnType<typeof privateKeyToAccount>;
  tokenAddress: `0x${string}`;
  outputs: GaslessTransferOutput[];
  chainKey: string;
  publicClient: any;
}): Promise<string> {
  const { proxyAccount, tokenAddress, outputs, chainKey, publicClient } = params;
  const validOutputs = outputs.filter((o) => o.value > 0n);

  if (validOutputs.length === 0) {
    throw new Error("No non-zero outputs for gasless USDC transfer.");
  }

  // If only 1 output, call transferWithAuthorization directly
  if (validOutputs.length === 1) {
    return executeGaslessUsdcTransfer({
      proxyAccount,
      tokenAddress,
      to: validOutputs[0].to,
      value: validOutputs[0].value,
      chainKey,
      publicClient,
    });
  }

  // Multiple outputs: build EIP-3009 signatures for each recipient
  const chainId = CHAIN_IDS[chainKey];
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

  const domain = {
    name: USDC_EIP712_NAMES[chainKey] || "USD Coin",
    version: USDC_EIP712_VERSIONS[chainKey] || "2",
    chainId,
    verifyingContract: tokenAddress,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const calls: { target: `0x${string}`; allowFailure: boolean; callData: `0x${string}` }[] = [];

  for (const out of validOutputs) {
    const nonce = ("0x" + crypto.randomBytes(32).toString("hex")) as `0x${string}`;
    const message = {
      from: proxyAccount.address,
      to: out.to,
      value: out.value,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await proxyAccount.signTypedData({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message,
    });

    const r = ("0x" + signature.slice(2, 66)) as `0x${string}`;
    const s = ("0x" + signature.slice(66, 130)) as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);

    const callData = encodeFunctionData({
      abi: EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [proxyAccount.address, out.to, out.value, validAfter, validBefore, nonce, v, r, s],
    });

    calls.push({
      target: tokenAddress,
      allowFailure: false,
      callData,
    });
  }

  // Submit via Multicall3 using the Relayer
  const relayer = getRelayerWalletClientForChain(chainKey);
  try {
    const txHash = await relayer.writeContract({
      account: relayer.account,
      address: MULTICALL3_ADDRESS,
      abi: MULTICALL3_ABI,
      functionName: "aggregate3",
      args: [calls],
    });
    console.log(`[ProxyForwarder] ✓ Atomic Multicall3 bundled ${calls.length} USDC transfers in 1 tx: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.warn("[ProxyForwarder] Multicall3 bundle failed, falling back to sequential transfers:", err?.message || err);
    let lastHash = "";
    for (const out of validOutputs) {
      lastHash = await executeGaslessUsdcTransfer({
        proxyAccount,
        tokenAddress,
        to: out.to,
        value: out.value,
        chainKey,
        publicClient,
      });
      await publicClient.waitForTransactionReceipt({ hash: lastHash as `0x${string}` }).catch(() => {});
    }
    return lastHash;
  }
}

// Known token addresses across Tier 2 chains
export const CHAIN_TOKENS: Record<string, Record<string, `0x${string}`>> = {
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
  arb: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDCe: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI: "0xDA10009cBd5D07dd0CeCc6616156627515b3c58A",
  },
  polygon: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDCe: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    V2_1: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    v2_1: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  bsc: {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  },
};

function getChainConfig(chainStr: string) {
  const { chain, key } = getEvmRpcConfig(chainStr);
  return { chain, key };
}

function getPublicClientForChain(chainStr: string) {
  return getResilientPublicClientForChain(chainStr);
}

function getWalletClientForChain(chainStr: string, account: any) {
  const { chain, transports } = getEvmRpcConfig(chainStr);
  return createWalletClient({
    account,
    chain,
    transport: fallback(transports, { rank: false, retryCount: 2 }),
  });
}

/**
 * Resilient ERC-20 transfer helper that:
 * 1. Uses a 90,000 gas limit so upgradeable proxy tokens (e.g. Polygon USDT0) with cold SSTORE to fresh solver addresses never revert with Out of Gas.
 * 2. Signs a Type-0 legacy transaction with Polygon minimum gas floor (35 gwei), avoiding all EIP-1559 maxFeePerGas < maxPriorityFeePerGas errors.
 * 3. Pre-flight checks native balance before EVERY transfer (including Tx #2 fee transfers): clamps gasPrice if affordable, or automatically advances a top-up from the relayer if gas spiked mid-sweep.
 * 4. Broadcasts via walletClient first, then falls back to direct raw broadcast across all configured RPC endpoints (with headers).
 */
async function sendResilientErc20Transfer(params: {
  chainKey: string;
  publicClient: any;
  walletClient: any;
  proxyAccount: ReturnType<typeof privateKeyToAccount>;
  tokenAddress: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
}): Promise<{ txHash?: `0x${string}`; error?: string }> {
  const { chainKey, publicClient, walletClient, proxyAccount, tokenAddress, to, amount } = params;
  const gasLimit = 90_000n;
  const minGasFloor = chainKey === "polygon" ? 35_000_000_000n : chainKey === "bsc" ? BSC_MIN_GAS_PRICE : 0n;
  const baseGasPrice = (await publicClient
    .getGasPrice()
    .catch(() => (chainKey === "polygon" ? 40_000_000_000n : 1_000_000_000n))) as bigint;

  let effectiveGasPrice = (baseGasPrice * 125n) / 100n;
  if (effectiveGasPrice < minGasFloor) {
    effectiveGasPrice = minGasFloor;
  }

  const minViableGasPrice = baseGasPrice > minGasFloor ? baseGasPrice : minGasFloor;

  // Pre-flight native gas check before this transfer (protects both Tx #1 and Tx #2!)
  let nativeBal = (await publicClient.getBalance({ address: proxyAccount.address }).catch(() => 0n)) as bigint;
  if (nativeBal < gasLimit * minViableGasPrice) {
    // Proxy wallet does not have enough native gas to cover 90,000 gas at current network gasPrice -> top up from relayer!
    try {
      const relayer = getRelayerWalletClientForChain(chainKey);
      const minTopUpFloor =
        chainKey === "polygon"
          ? parseUnits("0.025", 18)
          : chainKey === "bsc"
          ? 0n // Dynamic: top up exactly neededForTx (gasLimit × live gasPrice × 1.4)
          : 15_000_000_000_000n;
      const neededForTx = (gasLimit * effectiveGasPrice * 14n) / 10n;
      const targetBal = neededForTx > minTopUpFloor ? neededForTx : minTopUpFloor;
      if (targetBal > nativeBal) {
        const topUpAmount = targetBal - nativeBal;
        const fundTx = await relayer.sendTransaction({
          account: relayer.account,
          to: proxyAccount.address,
          value: topUpAmount,
        });
        await publicClient.waitForTransactionReceipt({ hash: fundTx }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));
        nativeBal = (await publicClient.getBalance({ address: proxyAccount.address }).catch(() => nativeBal + topUpAmount)) as bigint;
        console.log(`[ProxyForwarder] ✓ Pre-flight gas top-up (${formatUnits(topUpAmount, 18)}) to ${proxyAccount.address}: ${fundTx}`);
      }
    } catch (topUpErr: any) {
      console.warn(`[ProxyForwarder] Pre-flight gas top-up warning on ${chainKey}:`, topUpErr?.message || topUpErr);
    }
  }

  if (nativeBal > 0n && nativeBal < gasLimit * effectiveGasPrice) {
    const maxAffordableGasPrice = (nativeBal * 96n) / (100n * gasLimit);
    if (maxAffordableGasPrice >= minGasFloor && maxAffordableGasPrice >= (baseGasPrice * 90n) / 100n) {
      effectiveGasPrice = maxAffordableGasPrice;
    }
  }

  let primaryErr: any;
  try {
    const hash = await walletClient.writeContract({
      account: proxyAccount,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amount],
      gas: gasLimit,
      gasPrice: effectiveGasPrice,
      type: "legacy",
    });
    if (hash) {
      return { txHash: hash as `0x${string}` };
    }
  } catch (err: any) {
    primaryErr = err;
    console.warn(`[ProxyForwarder] writeContract failed on ${chainKey}, falling back to multi-RPC raw broadcast:`, err?.shortMessage || err?.message || err);
  }

  // Fallback: sign legacy raw transaction locally and broadcast across all endpoints
  const rpcErrors: string[] = [];
  try {
    const { endpoints } = getEvmRpcConfig(chainKey);
    const calldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, amount],
    });

    const nonce = await publicClient.getTransactionCount({
      address: proxyAccount.address,
      blockTag: "pending",
    }).catch(() =>
      publicClient.getTransactionCount({
        address: proxyAccount.address,
      })
    );

    const rawTx = await proxyAccount.signTransaction({
      to: tokenAddress,
      data: calldata,
      gas: gasLimit,
      nonce,
      chainId: CHAIN_IDS[chainKey] || 137,
      type: "legacy",
      gasPrice: effectiveGasPrice,
    });

    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ep.headers || {}),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "eth_sendRawTransaction",
            params: [rawTx],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          rpcErrors.push(`${ep.url}: HTTP ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        if (data?.result && typeof data.result === "string" && data.result.startsWith("0x")) {
          console.log(`[ProxyForwarder] ✓ Direct multi-RPC broadcast succeeded via ${ep.url}: ${data.result}`);
          return { txHash: data.result as `0x${string}` };
        } else if (data?.error) {
          const msg = data.error?.message || JSON.stringify(data.error);
          rpcErrors.push(msg);
          console.warn(`[ProxyForwarder] Direct broadcast to ${ep.url} rejected: ${msg}`);
        }
      } catch (netErr: any) {
        rpcErrors.push(netErr?.message || "Network timeout");
      }
    }
  } catch (rawErr: any) {
    rpcErrors.push(rawErr?.message || String(rawErr));
  }

  const fallbackErrorMsg =
    rpcErrors.find((e) => !e.includes("HTTP ")) ||
    rpcErrors[0] ||
    primaryErr?.cause?.reason ||
    primaryErr?.cause?.shortMessage ||
    primaryErr?.details ||
    primaryErr?.shortMessage ||
    primaryErr?.message ||
    "RPC broadcast failed";

  return { error: String(fallbackErrorMsg).replace(/\.+$/, "") };
}


// In-memory concurrency locks to prevent double-sweeping
const sweepLocks = new Set<string>();

/**
 * FEE SAFETY INVARIANT (single source of truth for every ERC-20 solver forward):
 *
 * The solver may only ever receive (liveBalance − fees), and ONLY while the user's principal is
 * still sitting in the proxy. Any balance at or below the fee total belongs to ZkPay / the partner
 * and must NEVER be forwarded to the solver: the quote is FLEX_INPUT, so the solver silently
 * absorbs any extra tokens and the fee is lost.
 *
 * `expectedNetUnits` is the net we computed when the deposit was detected. If the live net is far
 * below it, the principal has already left (stale RPC read, concurrent sweep, or a previous
 * forward that confirmed late) and we must not send anything.
 *
 * Returns 0n whenever a solver transfer must NOT be made.
 */
export function getSafeSolverForwardAmount(
  liveBalance: bigint,
  totalFeeUnits: bigint,
  expectedNetUnits: bigint
): bigint {
  if (liveBalance <= totalFeeUnits) return 0n;
  const net = liveBalance - totalFeeUnits;
  if (expectedNetUnits > 0n && net < (expectedNetUnits * 90n) / 100n) return 0n;
  return net;
}

// A broadcast solver forward with no receipt after this long is treated as dropped and may be retried.
const PENDING_FORWARD_STALE_MS = 10 * 60 * 1000;

/**
 * Checks on-chain deposit on the proxy address and automatically executes
 * the upfront fee split and forward to Near Intents solvers.
 */
export async function checkAndForwardProxyDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  if (order.status === "FORWARDED" || order.status === "SETTLED" || order.status === "FAILED") {
    return order;
  }

  const normChain = normalizeChain(order.chain) || order.chain.toLowerCase();
  const lockKey = `${normChain}:${order.proxyDepositAddress.toLowerCase()}`;

  if (sweepLocks.has(lockKey)) {
    return order;
  }

  // Backoff / Cooldown: if a sweep attempt failed within the last 10 seconds,
  // do not repeatedly hammer the RPC on every 500ms status poll.
  if (order.lastAttemptAt && Date.now() - order.lastAttemptAt < 10_000 && order.error) {
    return order;
  }

  sweepLocks.add(lockKey);
  try {
    // ── 1. Solana Deposit Check ──
    if (normChain === "sol") {
      return await checkSolanaDeposit(order);
    }

    // ── 2. Litecoin Deposit Check ──
    if (normChain === "ltc") {
      return await checkLtcDeposit(order);
    }

    // ── 3. EVM Chains (Base, Arbitrum, Polygon, BSC) ──
    return await checkEvmDeposit(order);
  } finally {
    sweepLocks.delete(lockKey);
  }
}

/**
 * Normalizes order.fromAsset so chain prefixes ("BASE", "ARB", "BSC", "POLYGON", "V2_1")
 * always resolve to the canonical asset symbol ("ETH", "BNB", "POL", "USDC", "USDT", etc.).
 */
function normalizeOrderFromAsset(order: ProxySwapOrder): string {
  let upperSymbol = (order.fromAsset || "").toUpperCase();
  const allowedMatch = SWAP_ALLOWED_TOKENS.find(
    (t) => t.assetId.toLowerCase() === (order.originAssetId || "").toLowerCase()
  );
  if (allowedMatch) {
    upperSymbol = allowedMatch.symbol.toUpperCase();
  } else if (upperSymbol === "BASE" || upperSymbol === "ARB") {
    upperSymbol = "ETH";
  } else if (upperSymbol === "BSC") {
    upperSymbol = "BNB";
  } else if (upperSymbol === "POLYGON") {
    upperSymbol = "POL";
  } else if (upperSymbol === "V2_1") {
    upperSymbol = order.originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") ? "USDT" : "USDC";
  }

  if (upperSymbol && order.fromAsset !== upperSymbol) {
    order.fromAsset = upperSymbol;
    updateProxySwapOrder(order.swapId, { fromAsset: upperSymbol }).catch(() => {});
  }
  return upperSymbol;
}

/**
 * Handles EVM deposit detection, Case A (Native) and Case B (Stablecoins / ERC-20).
 */
async function checkEvmDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  const publicClient = getPublicClientForChain(order.chain);
  const proxyAddress = getAddress(order.proxyDepositAddress as `0x${string}`);
  const solverAddress = getAddress(order.solverDepositAddress as `0x${string}`);
  const treasuryAddress = getAddress(
    (order.treasuryAddress || CONTRACTS.TREASURY) as `0x${string}`
  );

  const { chain, key: chainKey } = getChainConfig(order.chain);

  const upperSymbol = normalizeOrderFromAsset(order);

  const isNative =
    upperSymbol === "ETH" ||
    upperSymbol === "BNB" ||
    upperSymbol === "POL" ||
    upperSymbol === "MATIC";

  if (isNative) {
    // ─── CASE A: Native Gas Token (ETH, BNB, POL) ───
    const balanceWei = await publicClient.getBalance({ address: proxyAddress });
    const expectedAtomic = BigInt(order.totalAmountIn);

    // Minimum 90% threshold to tolerate slight gas fluctuations
    if (balanceWei < (expectedAtomic * 90n) / 100n || balanceWei === 0n) {
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] Native deposit detected for order ${order.swapId}: ${formatUnits(balanceWei, 18)} ${upperSymbol}`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const rawKey = getDecryptedProxyPrivateKey(order);
    const proxyAccount = privateKeyToAccount(rawKey);

    const walletClient = getWalletClientForChain(order.chain, proxyAccount);

    let zkpayFeeWei = 0n;
    let partnerFeeWei = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeWei = (balanceWei * BigInt(order.zkpayFeeBps)) / 10000n;
      if ((order.partnerFeeBps ?? 0) > 0) {
        partnerFeeWei = (balanceWei * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else {
      zkpayFeeWei = (balanceWei * BigInt(order.feeAmount)) / expectedAtomic;
    }

    // 100% of all fees collected are swept to ZkPay Treasury on-chain.
    // Partner's share is credited off-chain upon swap completion.
    const totalFeeWei = zkpayFeeWei + partnerFeeWei;
    const hasFees = totalFeeWei > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase();

    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const maxFee = feeData?.maxFeePerGas || (await publicClient.getGasPrice());
    const l1Buffer = (chainKey === "base" || chainKey === "arb") ? 600_000_000_000n : 10_000_000_000n;
    const gasLimit = hasFees ? 150_000n : 120_000n;
    const gasReserve = gasLimit * maxFee + l1Buffer;

    if (balanceWei <= gasReserve + totalFeeWei) {
      throw new Error("Remaining native balance too small to cover gas and fees.");
    }

    const netWei = balanceWei - gasReserve - totalFeeWei;
    if (netWei <= 0n) {
      throw new Error("Net balance for solver is 0 after fees and gas reserve.");
    }

    let forwardTxHash = "";
    let feeTxHash = "";

    if (hasFees) {
      // ── ATOMIC BUNDLE VIA MULTICALL3 ──
      // Solver transfer is Call #1 so Near Intents is funded immediately in the same block!
      const calls: { target: `0x${string}`; allowFailure: boolean; value: bigint; callData: `0x${string}` }[] = [];

      calls.push({
        target: solverAddress,
        allowFailure: false,
        value: netWei,
        callData: "0x",
      });

      // 100% of fees to Treasury
      calls.push({
        target: treasuryAddress,
        allowFailure: false,
        value: totalFeeWei,
        callData: "0x",
      });

      const totalToSend = netWei + totalFeeWei;

      try {
        forwardTxHash = await walletClient.writeContract({
          account: proxyAccount,
          address: MULTICALL3_ADDRESS,
          abi: MULTICALL3_ABI,
          functionName: "aggregate3Value",
          args: [calls],
          value: totalToSend,
          gas: gasLimit,
        });
        feeTxHash = forwardTxHash;
        console.log(`[ProxyForwarder] ✓ Atomic Multicall3 bundled native transfer (solver + fees): ${forwardTxHash}`);
      } catch (mcErr: any) {
        console.warn("[ProxyForwarder] Multicall3 aggregate3Value failed, falling back to sequential transfers:", mcErr?.message || mcErr);
        // Fallback: send solver first, then 100% fee to treasury
        forwardTxHash = await walletClient.sendTransaction({
          account: proxyAccount,
          to: solverAddress,
          value: netWei,
          gas: 120_000n,
        });
        notifyNearIntentsDepositSubmit(order.solverDepositAddress, forwardTxHash).catch(() => {});

        feeTxHash = await walletClient.sendTransaction({
          account: proxyAccount,
          to: treasuryAddress,
          value: totalFeeWei,
          gas: 120_000n,
        }).catch(() => "");
      }
    } else {
      // Direct transfer to solver (no fees)
      forwardTxHash = await walletClient.sendTransaction({
        account: proxyAccount,
        to: solverAddress,
        value: netWei,
        gas: 120_000n,
      });
      console.log(`[ProxyForwarder] Direct solver forward broadcast: ${forwardTxHash}`);
    }

    notifyNearIntentsDepositSubmit(order.solverDepositAddress, forwardTxHash).catch(() => {});

    let receipt: any = null;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });
    } catch (rcptErr: any) {
      console.warn(`[ProxyForwarder] Waiting for receipt failed for tx ${forwardTxHash}:`, rcptErr?.message || rcptErr);
    }

    const isSuccess = receipt && (receipt.status === "success" || receipt.status === 1 || receipt.status === "0x1");
    if (!isSuccess) {
      console.error(
        `[ProxyForwarder] Native EVM transfer reverted or unconfirmed for order ${order.swapId}, tx: ${forwardTxHash}, receipt status: ${receipt?.status}`
      );
      return order;
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      totalAmountIn: balanceWei.toString(),
      netSwapAmount: netWei.toString(),
      feeAmount: (hasFees ? totalFeeWei : 0n).toString(),
      zkpayFeeAmount: (hasFees ? zkpayFeeWei : 0n).toString(),
      partnerFeeAmount: (hasFees ? partnerFeeWei : 0n).toString(),
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash: feeTxHash || forwardTxHash,
      forwardTxHash,
    });

    return updated || order;
  } else {
    // ─── CASE B: Stablecoins & ERC-20s (USDC, USDT) ───
    const tokenMap = CHAIN_TOKENS[chainKey] || {};
    let resolvedSymbol = upperSymbol;

    if (resolvedSymbol === "V2_1" || !tokenMap[resolvedSymbol]) {
      const found = SWAP_ALLOWED_TOKENS.find(
        (t) => t.assetId.toLowerCase() === (order.originAssetId || "").toLowerCase()
      );
      if (found) {
        resolvedSymbol = found.symbol.toUpperCase();
      } else if (order.originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") || order.originAssetId?.toLowerCase().includes("usdt")) {
        resolvedSymbol = "USDT";
      } else if (order.originAssetId?.includes("qiStmoQJDQPTebaPjgx5VBxZv6L") || order.originAssetId?.includes("v2_1") || order.originAssetId?.toLowerCase().includes("usdc")) {
        resolvedSymbol = "USDC";
      }
    }

    let tokenAddress: `0x${string}` | undefined = tokenMap[resolvedSymbol] || tokenMap[upperSymbol];

    if (!tokenAddress && order.originAssetId.includes("0x")) {
      const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
      if (match) {
        tokenAddress = getAddress(match[0]);
      }
    }

    if (!tokenAddress && chainKey === "polygon") {
      tokenAddress = tokenMap["USDC"];
      resolvedSymbol = "USDC";
    }

    if (tokenAddress && order.fromAsset !== resolvedSymbol) {
      updateProxySwapOrder(order.swapId, { fromAsset: resolvedSymbol }).catch(() => {});
      order.fromAsset = resolvedSymbol;
    }

    if (!tokenAddress) {
      console.warn(`[ProxyForwarder] Unknown token contract for ${upperSymbol} on ${order.chain}`);
      return order;
    }

    const tokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAddress],
    })) as bigint;

    const expectedAtomic = BigInt(order.totalAmountIn);

    if (tokenBalance < (expectedAtomic * 90n) / 100n || tokenBalance === 0n) {
      // Reconcile ONLY if the proxy wallet genuinely already executed the solver transfer on-chain
      // and ONLY the small ZkPay fee (or 0 balance) remains in the proxy wallet!
      // Never trigger this if the user's principal is still in the wallet or if forwardTxHash reverted.
      const proxyNonce = await publicClient.getTransactionCount({ address: proxyAddress }).catch(() => 0);
      const expectedOrderFee = order.feeAmount ? BigInt(order.feeAmount) : (expectedAtomic * 3n) / 100n;
      const maxFeeCeiling = expectedOrderFee > 0n ? expectedOrderFee * 2n : (expectedAtomic * 20n) / 100n;

      if (
        proxyNonce > 0 &&
        expectedAtomic > 0n &&
        tokenBalance <= maxFeeCeiling &&
        tokenBalance < (expectedAtomic * 35n) / 100n
      ) {
        // Verify that if order.forwardTxHash is recorded, it did NOT revert on-chain
        let solverTxReverted = false;
        if (order.forwardTxHash && order.forwardTxHash.startsWith("0x")) {
          const prevReceipt = await publicClient
            .getTransactionReceipt({ hash: order.forwardTxHash as `0x${string}` })
            .catch(() => null);
          if (prevReceipt && prevReceipt.status === "reverted") {
            solverTxReverted = true;
          }
        }

        if (!solverTxReverted) {
          console.log(
            `[ProxyForwarder] Reconciling order ${order.swapId}: proxy ${proxyAddress} has on-chain nonce=${proxyNonce} and remaining fee balance=${tokenBalance.toString()} ${upperSymbol}. Solver transfer already occurred.`
          );
          let feeTxHash = order.feeTxHash || "";
          if (tokenBalance > 0n) {
            try {
              const rawKey = getDecryptedProxyPrivateKey(order);
              const proxyAccount = privateKeyToAccount(rawKey);
              const walletClient = getWalletClientForChain(order.chain, proxyAccount);
              const feeRes = await sendResilientErc20Transfer({
                chainKey,
                publicClient,
                walletClient,
                proxyAccount,
                tokenAddress,
                to: treasuryAddress,
                amount: tokenBalance,
              });
              if (feeRes.txHash) {
                const feeReceipt = await publicClient
                  .waitForTransactionReceipt({ hash: feeRes.txHash })
                  .catch(() => null);
                if (!feeReceipt || feeReceipt.status === "success") {
                  feeTxHash = feeRes.txHash;
                  console.log(
                    `[ProxyForwarder] ✓ Reconciled & swept remaining fee (${tokenBalance.toString()}) to Treasury: ${feeRes.txHash}`
                  );
                }
              }
            } catch (reconcileErr) {
              console.warn(`[ProxyForwarder] Reconcile fee sweep warning for ${order.swapId}:`, reconcileErr);
            }
          }
          const updated = await updateProxySwapOrder(order.swapId, {
            status: "FORWARDED",
            ...(feeTxHash ? { feeTxHash } : {}),
          });
          return updated || order;
        }
      }
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] Token deposit detected for order ${order.swapId}: ${tokenBalance.toString()} ${upperSymbol} on ${order.chain}`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const rawKey = getDecryptedProxyPrivateKey(order);
    const proxyAccount = privateKeyToAccount(rawKey);

    const tokenDecimals = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    })) as number;

    const isStable = upperSymbol === "USDC" || upperSymbol === "USDT";
    // Fixed fee: 0.05 units for USDC/USDT (50,000 in 6 decimals)
    const fixedFeeUnits = isStable
      ? (order.fixedFeeAmount ? BigInt(order.fixedFeeAmount) : (tokenDecimals >= 2 ? 5n * 10n ** BigInt(tokenDecimals - 2) : 0n))
      : 0n;

    let zkpayFeeUnits = 0n;
    let partnerFeeUnits = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeUnits = (tokenBalance * BigInt(order.zkpayFeeBps)) / 10000n + fixedFeeUnits;
      if ((order.partnerFeeBps ?? 0) > 0) {
        partnerFeeUnits = (tokenBalance * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else {
      zkpayFeeUnits = (tokenBalance * BigInt(order.feeAmount)) / expectedAtomic;
    }

    const totalFeeUnits = zkpayFeeUnits + partnerFeeUnits;
    if (tokenBalance <= totalFeeUnits) {
      throw new Error("Token deposit too small to cover fees.");
    }

    const netTokenUnits = tokenBalance - totalFeeUnits;

    // Check if eligible for gasless EIP-3009 transfer
    const isGaslessEligible =
      EIP3009_USDC[chainKey] &&
      tokenAddress.toLowerCase() === EIP3009_USDC[chainKey].toLowerCase();

    if (isGaslessEligible) {
      // ── GASLESS PATH: Atomic Multicall3 or Single EIP-3009 ──
      console.log(`[ProxyForwarder] Using atomic gasless EIP-3009 for USDC transfer on ${chainKey}`);

      const outputs: GaslessTransferOutput[] = [];
      // 1. Solver forward (First in list so Near Intents receives funds immediately!)
      outputs.push({ to: solverAddress, value: netTokenUnits });

      // 2. 100% of fees to Treasury
      if (totalFeeUnits > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
        outputs.push({ to: treasuryAddress, value: totalFeeUnits });
      }

      const bundleTxHash = await executeBundledGaslessUsdcTransfers({
        proxyAccount,
        tokenAddress,
        outputs,
        chainKey,
        publicClient,
      });

      console.log(`[ProxyForwarder] ✓ Bundled gasless USDC transfer completed: ${bundleTxHash}`);
      notifyNearIntentsDepositSubmit(order.solverDepositAddress, bundleTxHash).catch(() => {});
      await publicClient.waitForTransactionReceipt({ hash: bundleTxHash as `0x${string}` }).catch(() => {});

      const updated = await updateProxySwapOrder(order.swapId, {
        status: "FORWARDED",
        totalAmountIn: tokenBalance.toString(),
        netSwapAmount: netTokenUnits.toString(),
        feeAmount: totalFeeUnits.toString(),
        zkpayFeeAmount: zkpayFeeUnits.toString(),
        partnerFeeAmount: partnerFeeUnits.toString(),
        depositTxHash: bundleTxHash,
        feeTxHash: bundleTxHash,
        forwardTxHash: bundleTxHash,
      });

      return updated || order;
    }

    // ── LEGACY PATH: Dynamic Live Gas advance to proxy (for USDT, DAI, etc.) ──
    const nativeBalance = await publicClient.getBalance({ address: proxyAddress });
    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const gasPrice = await publicClient.getGasPrice();
    const rawMaxFee = feeData?.maxFeePerGas && feeData.maxFeePerGas > gasPrice ? feeData.maxFeePerGas : gasPrice;
    const minChainGasPrice = chainKey === "polygon" ? 40_000_000_000n : chainKey === "bsc" ? BSC_MIN_GAS_PRICE : 0n;
    const maxFee = rawMaxFee > minChainGasPrice ? rawMaxFee : minChainGasPrice;
    const nativeSym = chainKey === "polygon" ? "POL" : chainKey === "bsc" ? "BNB" : "ETH";

    const transfersCount = 2n;
    // Dynamic gas: (maxFee * 95,000 gas * count) + 50% safety margin for multi-block baseFee spikes
    // (All unused native gas is automatically swept back to the relayer in Step 4)
    const calculatedGasNeeded = (maxFee * 95000n * transfersCount * 15n) / 10n;
    const minNeededFloor = chainKey === "polygon"
      ? parseUnits("0.035", 18)
      : (chainKey === "bsc" ? 0n /* Dynamic: no fixed BNB floor */ : 35_000_000_000_000n);
    const gasNeeded = calculatedGasNeeded > minNeededFloor ? calculatedGasNeeded : minNeededFloor;

    if (nativeBalance < gasNeeded) {
      try {
        const relayer = getRelayerWalletClientForChain(chainKey);
        const relayerNativeBal = await publicClient.getBalance({ address: relayer.account.address });
        const advanceAmount = gasNeeded - nativeBalance;

        if (chainKey === "polygon" && relayerNativeBal < 2_000_000_000_000_000_000n) {
          console.warn(
            `[ProxyForwarder] ⚠️ Polygon relayer gas low: ${formatUnits(relayerNativeBal, 18)} POL remaining. Top up soon to prevent USDT sweep delays.`
          );
        }

        if (relayerNativeBal < advanceAmount) {
          console.error(
            `[ProxyForwarder] ⚠️ RELAYER GAS EMPTY on ${chainKey.toUpperCase()}: has ${relayerNativeBal} wei ${nativeSym}, needs ${advanceAmount}.`
          );
          return order;
        }

        const fundTx = await relayer.sendTransaction({
          account: relayer.account,
          to: proxyAddress,
          value: advanceAmount,
        });
        await publicClient.waitForTransactionReceipt({ hash: fundTx });
        console.log(`[ProxyForwarder] ✓ Live ${nativeSym} gas advance to proxy ${proxyAddress}: ${fundTx}`);
      } catch (fundErr: any) {
        console.error(`[ProxyForwarder] ✗ Gas advance failed on ${chainKey}:`, fundErr?.message || fundErr);
        return order;
      }
    }

    const walletClient = getWalletClientForChain(order.chain, proxyAccount);

    // 1. Transfer Net to Solver FIRST (Crucial: Prevents Near Intents solver deadline expiry!)
    const remainingTokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAddress],
    })) as bigint;

    if (remainingTokenBalance === 0n) {
      console.log(`[ProxyForwarder] Proxy balance is 0 for order ${order.swapId}. Funds already moved.`);
      return order;
    }

    // GUARD 1: never re-send if a solver forward was already broadcast and is pending or confirmed.
    // (Re-read the order so we see a forwardTxHash persisted by an earlier tick.)
    const latestOrder = (await getProxyOrderBySwapId(order.swapId).catch(() => null)) || order;
    if (latestOrder.forwardTxHash && latestOrder.forwardTxHash.startsWith("0x")) {
      const priorReceipt = await publicClient
        .getTransactionReceipt({ hash: latestOrder.forwardTxHash as `0x${string}` })
        .catch(() => null);
      const isStalePending =
        !priorReceipt &&
        !!latestOrder.lastAttemptAt &&
        Date.now() - latestOrder.lastAttemptAt > PENDING_FORWARD_STALE_MS;
      if (priorReceipt?.status === "success" || (!priorReceipt && !isStalePending)) {
        console.warn(
          `[ProxyForwarder] Solver forward ${latestOrder.forwardTxHash} already ${priorReceipt ? "confirmed" : "pending"} for order ${order.swapId}. Not re-sending; remaining fee will be swept to Treasury by reconciliation.`
        );
        return latestOrder;
      }
    }

    // GUARD 2: amount invariant - the fee portion can never be sent to the solver.
    const finalNetTokens = getSafeSolverForwardAmount(remainingTokenBalance, totalFeeUnits, netTokenUnits);

    if (finalNetTokens === 0n) {
      console.warn(
        `[ProxyForwarder] Refusing solver forward for order ${order.swapId}: live balance ${remainingTokenBalance.toString()} vs fees ${totalFeeUnits.toString()} / expected net ${netTokenUnits.toString()}. Principal already left the proxy; remaining balance is the platform fee and will be swept to Treasury.`
      );
      return order;
    }

    const forwardRes = await sendResilientErc20Transfer({
      chainKey,
      publicClient,
      walletClient,
      proxyAccount,
      tokenAddress,
      to: solverAddress,
      amount: finalNetTokens,
    });

    if (!forwardRes.txHash) {
      console.warn(`[ProxyForwarder] Solver transfer failed:`, forwardRes.error);
      await updateProxySwapOrder(order.swapId, {
        status: "PENDING_DEPOSIT",
        lastAttemptAt: Date.now(),
        error: forwardRes.error,
      }).catch(() => {});
      return order;
    }

    const forwardTxHash = forwardRes.txHash;
    console.log(`[ProxyForwarder] Net token forward to solver broadcast FIRST: ${forwardTxHash}`);

    // Persist the hash IMMEDIATELY (before waiting for the receipt) so any later tick / instance sees
    // that a solver forward is in flight and never sends a second one (see GUARD 1 above).
    await updateProxySwapOrder(order.swapId, {
      forwardTxHash,
      lastAttemptAt: Date.now(),
    }).catch(() => {});

    // CRITICAL: Wait for solver forward receipt and verify it succeeded on-chain BEFORE saving forwardTxHash or sending fees!
    const solverReceipt = await publicClient
      .waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}`, timeout: 45_000 })
      .catch(() => null);

    if (solverReceipt && solverReceipt.status === "reverted") {
      console.error(
        `[ProxyForwarder] ✗ Solver transfer REVERTED on-chain (${forwardTxHash}) for order ${order.swapId}! Aborting fee sweep.`
      );
      await updateProxySwapOrder(order.swapId, {
        status: "PENDING_DEPOSIT",
        forwardTxHash: undefined,
        lastAttemptAt: Date.now(),
        error: `Solver transfer transaction ${forwardTxHash} reverted on-chain.`,
      }).catch(() => {});
      return order;
    }

    // If receipt timed out, verify on-chain whether the tokens actually left the proxy wallet
    if (!solverReceipt) {
      const postBalCheck = (await publicClient
        .readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [proxyAddress],
        })
        .catch(() => remainingTokenBalance)) as bigint;
      if (postBalCheck >= remainingTokenBalance) {
        console.warn(
          `[ProxyForwarder] Solver transfer ${forwardTxHash} receipt not yet available and balance unchanged. Will re-verify on next tick.`
        );
        return order;
      }
    }

    // Confirmed on-chain: immediately checkpoint status & forwardTxHash in DB so order never reverts to PENDING_DEPOSIT
    await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: forwardTxHash,
      forwardTxHash,
      error: undefined,
    }).catch(() => {});

    // Immediately notify Near Intents 1Click so indexer recognizes the deposit!
    notifyNearIntentsDepositSubmit(order.solverDepositAddress, forwardTxHash).catch(() => {});
    console.log(`[ProxyForwarder] ✓ Solver forward confirmed on-chain: ${forwardTxHash}`);

    // 2. Transfer 100% of fees to Treasury
    let feeTxHash = "";
    if (totalFeeUnits > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
      try {
        const remainingBal = (await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [proxyAddress],
        })) as bigint;
        const feeToSend = remainingBal >= totalFeeUnits ? totalFeeUnits : remainingBal;
        if (feeToSend > 0n) {
          const feeRes = await sendResilientErc20Transfer({
            chainKey,
            publicClient,
            walletClient,
            proxyAccount,
            tokenAddress,
            to: treasuryAddress,
            amount: feeToSend,
          });
          if (feeRes.txHash) {
            console.log(`[ProxyForwarder] Token fee transfer to Treasury broadcast: ${feeRes.txHash}`);
            const feeReceipt = await publicClient
              .waitForTransactionReceipt({ hash: feeRes.txHash as `0x${string}` })
              .catch(() => null);
            if (!feeReceipt || feeReceipt.status === "success") {
              feeTxHash = feeRes.txHash;
              console.log(`[ProxyForwarder] ✓ Token fee confirmed on-chain to Treasury: ${feeTxHash}`);
            } else {
              console.warn(`[ProxyForwarder] ✗ Token fee transfer to Treasury reverted on-chain: ${feeRes.txHash}`);
            }
          }
        }
      } catch (feeErr) {
        console.error("[ProxyForwarder] Token fee transfer error:", feeErr);
      }
    }

    // 4. Sweep leftover native gas dust back to relayer (exact 21,000 gas legacy transfer leaving 0 dust)
    try {
      const leftoverNative = await publicClient.getBalance({ address: proxyAddress });
      const gasPrice = await publicClient.getGasPrice();
      const sweepGas = 21000n;
      const minGasFloor = chainKey === "polygon" ? 30_000_000_000n : 0n;
      const calculatedGasPrice = (gasPrice * 115n) / 100n; // 15% priority boost
      const effectiveGasPrice = calculatedGasPrice > minGasFloor ? calculatedGasPrice : minGasFloor;
      const txGasCost = sweepGas * effectiveGasPrice;

      if (leftoverNative > (txGasCost * 12n) / 10n) {
        const relayerAddr = getRelayerWalletClientForChain(chainKey).account.address;
        const valueToSend = leftoverNative - txGasCost;
        const dustTx = await walletClient.sendTransaction({
          account: proxyAccount,
          to: relayerAddr,
          value: valueToSend,
          gas: sweepGas,
          gasPrice: effectiveGasPrice,
          type: "legacy",
        });
        await publicClient.waitForTransactionReceipt({ hash: dustTx as `0x${string}` }).catch(() => {});
        console.log(`[ProxyForwarder] ✓ Swept ${formatUnits(valueToSend, 18)} ${nativeSym} dust back to relayer: ${dustTx}`);
      }
    } catch (dustErr) {
      console.warn("[ProxyForwarder] Native dust sweep warning (non-fatal):", dustErr);
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      totalAmountIn: tokenBalance.toString(),
      netSwapAmount: netTokenUnits.toString(),
      feeAmount: (feeTxHash ? totalFeeUnits : 0n).toString(),
      zkpayFeeAmount: (feeTxHash ? zkpayFeeUnits : 0n).toString(),
      partnerFeeAmount: (feeTxHash ? partnerFeeUnits : 0n).toString(),
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash,
      forwardTxHash,
    });

    return updated || order;
  }
}

function to32Bytes(buf: Buffer): Buffer {
  if (buf.length === 32) return buf;
  if (buf.length < 32) {
    const out = Buffer.alloc(32);
    buf.copy(out, 32 - buf.length);
    return out;
  }
  return buf.subarray(buf.length - 32);
}

async function fetchSolanaRpc(method: string, params: any[]): Promise<any> {
  return fetchResilientSolanaRpc(method, params);
}

// ─── Solana constants ───
// 1 signature = 5,000 lamports base fee (no priority fee).
const SOLANA_NETWORK_FEE = 5000n;
// Rent-exempt minimum for a 0-data System account. After any transaction, every touched
// account must hold either 0 lamports or >= this amount, otherwise the runtime rejects
// the whole transaction with InsufficientFundsForRent.
const SOLANA_RENT_EXEMPT_MIN = 890_880n;
// Below this the deposit is treated as "not arrived yet".
const SOLANA_MIN_SWEEP_LAMPORTS = 50_000n;

function isSolanaBase58Address(addr?: string | null): boolean {
  if (!addr) return false;
  const clean = addr.trim();
  if (clean.startsWith("0x")) return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean);
}

interface SolanaTransferOutput {
  toBase58: string;
  lamports: bigint;
}

/**
 * Builds, signs (Ed25519), and broadcasts a native Solana transaction with ONE
 * System Program transfer instruction PER output (any number of outputs).
 * - Duplicate recipients are merged, zero outputs dropped.
 * - Preflight simulation is ENABLED, so rent/balance errors are rejected by the RPC
 *   before broadcast instead of landing on-chain as failed transactions.
 */
async function sendSolanaMultiTransfer(params: {
  fromPubkeyBase58: string;
  fromPrivKeyHex: string;
  outputs: SolanaTransferOutput[];
}): Promise<string> {
  const fromKey = params.fromPubkeyBase58.trim();

  const merged = new Map<string, bigint>();
  for (const o of params.outputs) {
    const to = (o.toBase58 || "").trim();
    if (o.lamports <= 0n || to === fromKey) continue;
    if (!isSolanaBase58Address(to)) {
      throw new Error(`Invalid Solana recipient address: '${to}'`);
    }
    merged.set(to, (merged.get(to) || 0n) + o.lamports);
  }
  if (merged.size === 0) {
    throw new Error("No valid Solana transfer outputs to send.");
  }

  const bhResult = await fetchSolanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = bhResult?.value?.blockhash;
  if (!blockhash) {
    throw new Error("Failed to retrieve latest Solana blockhash.");
  }

  const recipients = Array.from(merged.entries());

  // Account keys: [signer/payer (0), ...recipients (writable, unsigned), SystemProgram (readonly, last)]
  const accountKeys: Buffer[] = [
    to32Bytes(decodeBase58(fromKey)),
    ...recipients.map(([to]) => to32Bytes(decodeBase58(to))),
    Buffer.alloc(32), // 11111111111111111111111111111111 (System Program)
  ];
  const programIndex = accountKeys.length - 1;

  const instructions: Buffer[] = recipients.map(([, lamports], i) => {
    const data = Buffer.alloc(12);
    data.writeUInt32LE(2, 0); // SystemInstruction::Transfer
    data.writeBigUInt64LE(lamports, 4);
    return Buffer.concat([
      Buffer.from([programIndex]),
      Buffer.from([2, 0, i + 1]), // 2 accounts: from(0), to(i+1)
      Buffer.from([12]),
      data,
    ]);
  });

  // Header: 1 required signature, 0 readonly signed, 1 readonly unsigned (System Program)
  // Counts are < 128 so each compact-u16 length fits in one byte.
  const message = Buffer.concat([
    Buffer.from([1, 0, 1]),
    Buffer.from([accountKeys.length]),
    ...accountKeys,
    to32Bytes(decodeBase58(blockhash)),
    Buffer.from([instructions.length]),
    ...instructions,
  ]);

  const cleanHex = params.fromPrivKeyHex.replace(/^0x/, "");
  const rawPrivSeed = Buffer.from(cleanHex, "hex").subarray(0, 32);
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), rawPrivSeed]),
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, message, privKeyObj);

  const wireTxBase64 = Buffer.concat([Buffer.from([1]), signature, message]).toString("base64");

  const txSignature = await fetchSolanaRpc("sendTransaction", [
    wireTxBase64,
    {
      encoding: "base64",
      skipPreflight: false, // simulate first: reject rent / balance errors before broadcast
      preflightCommitment: "confirmed",
      maxRetries: 5,
    },
  ]);

  console.log(
    `[ProxyForwarder] Solana tx broadcast (${recipients.length} transfer(s)): ${txSignature} :: ` +
      recipients.map(([to, l]) => `${l} -> ${to}`).join(", ")
  );
  return txSignature;
}

/**
 * Polls signature status until confirmed. Throws if the transaction failed on-chain.
 * Returns "timeout" if not confirmed within the window (preflight already passed).
 */
async function waitForSolanaSignature(
  signature: string,
  timeoutMs = 20_000
): Promise<"confirmed" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    let status: any = null;
    try {
      const res = await fetchSolanaRpc("getSignatureStatuses", [[signature], { searchTransactionHistory: false }]);
      status = res?.value?.[0] || null;
    } catch {
      // transient RPC failure — keep polling
    }
    if (status) {
      if (status.err) {
        throw new Error(`Solana transaction ${signature} failed on-chain: ${JSON.stringify(status.err)}`);
      }
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return "confirmed";
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "timeout";
}

/**
 * Backwards-compatible wrapper (used by the recovery / refund paths).
 */
async function sendSolanaTransfer(params: {
  fromPubkeyBase58: string;
  fromPrivKeyHex: string;
  toPubkeyBase58: string;
  transferLamports: bigint;
  feeRecipientBase58?: string | null;
  feeLamports?: bigint;
  partnerRecipientBase58?: string | null;
  partnerLamports?: bigint;
}): Promise<string> {
  const outputs: SolanaTransferOutput[] = [
    { toBase58: params.toPubkeyBase58, lamports: params.transferLamports },
  ];
  if (params.feeRecipientBase58 && (params.feeLamports ?? 0n) > 0n) {
    outputs.push({ toBase58: params.feeRecipientBase58, lamports: params.feeLamports! });
  }
  if (params.partnerRecipientBase58 && (params.partnerLamports ?? 0n) > 0n) {
    outputs.push({ toBase58: params.partnerRecipientBase58, lamports: params.partnerLamports! });
  }
  return sendSolanaMultiTransfer({
    fromPubkeyBase58: params.fromPubkeyBase58,
    fromPrivKeyHex: params.fromPrivKeyHex,
    outputs,
  });
}

/**
 * Handles Solana proxy deposit balance checking and executes real on-chain forward.
 */
async function checkSolanaDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  try {
    const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress, { commitment: "confirmed" }]);
    const lamports = BigInt(balanceRes?.value || 0);
    // Exact Solana transaction fee: 1 signature = 5,000 lamports (0.000005 SOL)
    // CRITICAL: On Solana, an account must have either >= 890,880 lamports (rent-exempt) OR exactly 0 lamports.
    // Setting network fee to exactly 5,000 lamports ensures 0 lamports remain, cleanly closing the proxy account without rent errors.
    const SOLANA_NETWORK_FEE = 5000n;

    // Safely parse expected atomic units (handles decimal inputs e.g. "0.00339" or atomic units)
    let expectedAtomic = 0n;
    try {
      const clean = (order.totalAmountIn || "0").trim();
      if (clean.includes(".")) {
        const { parseUnits } = await import("viem");
        expectedAtomic = parseUnits(clean, 9); // SOL has 9 decimals
      } else {
        expectedAtomic = BigInt(clean);
      }
    } catch {
      expectedAtomic = 0n;
    }

    // Await deposit if balance is zero or cannot cover network gas fee (~5000 lamports).
    if (lamports <= SOLANA_NETWORK_FEE) {
      return order; // Awaiting deposit
    }

    // Prevent Solana Dust Premature Sweep: ensure lamports >= (expectedAtomic - 10000n) before triggering forwarding.
    // If lamports < (expectedAtomic - 10000n), return order so it keeps awaiting the real deposit.
    if (expectedAtomic > 0n) {
      const minRequiredLamports = expectedAtomic > 10000n ? expectedAtomic - 10000n : expectedAtomic;
      if (lamports < minRequiredLamports) {
        return order; // Awaiting real deposit
      }
    }

    // On Solana, an uninitialized recipient (such as Near Intents single-use solver address)
    // CANNOT receive less than 890,880 lamports (~$0.13) without failing simulation with InsufficientFundsForRent.
    if (lamports < SOLANA_RENT_EXEMPT_MIN + SOLANA_NETWORK_FEE) {
      try {
        const solverBalRes = await fetchSolanaRpc("getBalance", [order.solverDepositAddress]);
        const solverBal = BigInt(solverBalRes?.value || 0);
        if (solverBal < SOLANA_RENT_EXEMPT_MIN) {
          return order; // Awaiting full deposit
        }
      } catch {
        return order;
      }
    }

    console.log(
      `[ProxyForwarder] Solana deposit detected for order ${order.swapId}: ${lamports} lamports (address: ${order.proxyDepositAddress})`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING", lastAttemptAt: Date.now() });

    const privKeyHex = getDecryptedProxyPrivateKey(order);

    let zkpayFeeLamports = 0n;
    let partnerFeeLamports = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeLamports = (lamports * BigInt(order.zkpayFeeBps)) / 10000n;
      if ((order.partnerFeeBps ?? 0) > 0) {
        partnerFeeLamports = (lamports * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else if (order.feeAmount && expectedAtomic > 0n) {
      zkpayFeeLamports = (lamports * BigInt(order.feeAmount)) / expectedAtomic;
    }

    // Solana Rent-Exemption & Address Validation:
    // On Solana, a newly created account (or one with 0 balance) CANNOT receive less than 890,880 lamports (~$0.13).
    // If a fee is below 890,880 lamports, or if the recipient is invalid/uninitialized,
    // we roll the fee into the solver transfer so the proxy account is cleanly emptied to EXACTLY 0 lamports.
    const isSolanaAddr = (addr?: string | null) => {
      if (!addr) return false;
      const clean = addr.trim();
      if (clean.startsWith("0x")) return false;
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean);
    };

    const feeNotes: string[] = [];

    const totalFeeLamports = zkpayFeeLamports + partnerFeeLamports;
    let effectiveZkpayFee = 0n;
    const effectivePartnerFee = 0n;
    const solTreasury = order.treasuryAddress || getTreasuryAddressForChain("sol");

    if (
      solTreasury &&
      isSolanaAddr(solTreasury) &&
      solTreasury.trim() !== order.proxyDepositAddress.trim() &&
      solTreasury.trim() !== order.solverDepositAddress.trim() &&
      totalFeeLamports > 0n
    ) {
      if (totalFeeLamports >= SOLANA_RENT_EXEMPT_MIN) {
        effectiveZkpayFee = totalFeeLamports;
      } else {
        try {
          const treasuryBalRes = await fetchSolanaRpc("getBalance", [solTreasury.trim()]);
          const treasuryBal = BigInt(treasuryBalRes?.value || 0);
          if (treasuryBal >= SOLANA_RENT_EXEMPT_MIN) {
            effectiveZkpayFee = totalFeeLamports;
          } else {
            feeNotes.push(
              `Treasury fee (${totalFeeLamports} lamports) rolled into solver transfer (below rent threshold)`
            );
          }
        } catch {
          feeNotes.push(`Treasury fee (${totalFeeLamports} lamports) rolled into solver transfer (RPC check failed)`);
        }
      }
    }

    // CRITICAL: The total lamports leaving the proxy account MUST equal (lamports - SOLANA_NETWORK_FEE).
    // Any fee that is not routed to Treasury is given to Solver.
    // This GUARANTEES the remaining balance in proxy account is EXACTLY 0 LAMPORTS (never stuck with dust).
    const solverLamports = lamports - SOLANA_NETWORK_FEE - effectiveZkpayFee;

    if (solverLamports <= 0n) {
      throw new Error(`Solana deposit (${lamports} lamports) too small to cover 5,000 lamport network fee.`);
    }

    console.log(
      `[ProxyForwarder] Sweeping SOL: ${solverLamports} -> Solver (${order.solverDepositAddress}), ${effectiveZkpayFee} -> Treasury (${solTreasury}), 5000 fee. Residual balance = 0 lamports.`
    );

    const txHash = await sendSolanaTransfer({
      fromPubkeyBase58: order.proxyDepositAddress,
      fromPrivKeyHex: privKeyHex,
      toPubkeyBase58: order.solverDepositAddress,
      transferLamports: solverLamports,
      feeRecipientBase58: effectiveZkpayFee > 0n ? solTreasury : null,
      feeLamports: effectiveZkpayFee,
      partnerRecipientBase58: null,
      partnerLamports: 0n,
    });

    notifyNearIntentsDepositSubmit(order.solverDepositAddress, txHash).catch(() => {});

    const confirmStatus = await waitForSolanaSignature(txHash, 25_000);
    if (confirmStatus === "confirmed") {
      console.log(`[ProxyForwarder] ✓ Solana transfer confirmed on-chain: ${txHash}`);
    } else {
      console.log(`[ProxyForwarder] Solana transfer ${txHash} broadcast accepted; confirmation polling timed out (will finalize asynchronously).`);
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      totalAmountIn: lamports.toString(),
      netSwapAmount: solverLamports.toString(),
      feeAmount: effectiveZkpayFee.toString(),
      zkpayFeeAmount: (effectiveZkpayFee > 0n ? zkpayFeeLamports : 0n).toString(),
      partnerFeeAmount: (effectiveZkpayFee > 0n ? partnerFeeLamports : 0n).toString(),
      depositTxHash: txHash,
      feeTxHash: (effectiveZkpayFee > 0n || effectivePartnerFee > 0n) ? txHash : undefined,
      forwardTxHash: txHash,
      feeNote: feeNotes.length > 0 ? feeNotes.join("; ") : undefined,
      lastAttemptAt: Date.now(),
      error: undefined,
    });

    return updated || order;
  } catch (err: any) {
    console.error("[ProxyForwarder] Solana balance/sweep error:", err);
    // Revert status to PENDING_DEPOSIT and record error message with lastAttemptAt so backoff prevents flapping
    await updateProxySwapOrder(order.swapId, {
      status: "PENDING_DEPOSIT",
      lastAttemptAt: Date.now(),
      error: `Solana sweep error: ${err?.message || err}`,
    }).catch(() => {});
  }

  return order;
}

/**
 * Handles Litecoin proxy deposit balance checking and executes real on-chain UTXO sweep.
 */
async function checkLtcDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  try {
    const { getLtcBalanceAndUtxos, sweepLtcDeposit, LTC_DUST_THRESHOLD_SATOSHIS } = await import("./ltcClient");
    const { balanceSatoshis, utxos } = await getLtcBalanceAndUtxos(order.proxyDepositAddress);

    // Safely parse expected atomic units (handles decimal inputs e.g. "0.0035" or atomic units)
    let expectedAtomic = 0n;
    try {
      const clean = (order.totalAmountIn || "0").trim();
      if (clean.includes(".")) {
        const { parseUnits } = await import("viem");
        expectedAtomic = parseUnits(clean, 8); // LTC has 8 decimals
      } else {
        expectedAtomic = BigInt(clean);
      }
    } catch {
      expectedAtomic = 0n;
    }

    // Minimum balance needed to cover LTC miner fee (~3000-5000 sats)
    const minThreshold = expectedAtomic > 0n ? (expectedAtomic * 80n) / 100n : 5000n;
    if (utxos.length === 0 || balanceSatoshis <= 5000n || (expectedAtomic > 0n && balanceSatoshis < minThreshold)) {
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] LTC deposit detected for order ${order.swapId}: ${balanceSatoshis} satoshis (${utxos.length} UTXOs on ${order.proxyDepositAddress})`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const privKeyHex = getDecryptedProxyPrivateKey(order);

    let zkpayFeeSats = 0n;
    let partnerFeeSats = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeSats = (balanceSatoshis * BigInt(order.zkpayFeeBps)) / 10000n;
      if ((order.partnerFeeBps ?? 0) > 0) {
        partnerFeeSats = (balanceSatoshis * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else if (order.feeAmount && expectedAtomic > 0n) {
      zkpayFeeSats = (balanceSatoshis * BigInt(order.feeAmount)) / expectedAtomic;
    }

    const totalFeeSats = zkpayFeeSats + partnerFeeSats;

    const txHash = await sweepLtcDeposit({
      proxyAddress: order.proxyDepositAddress,
      privKeyHex,
      solverAddress: order.solverDepositAddress,
      treasuryAddress: order.treasuryAddress || getTreasuryAddressForChain("ltc"),
      partnerAddress: undefined,
      zkpayFeeSatoshis: totalFeeSats,
      partnerFeeSatoshis: 0n,
    });

    notifyNearIntentsDepositSubmit(order.solverDepositAddress, txHash).catch(() => {});

    const dustLimit = LTC_DUST_THRESHOLD_SATOSHIS || 5460n;
    const hasFeeOutput = totalFeeSats >= dustLimit;

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      totalAmountIn: balanceSatoshis.toString(),
      feeAmount: (hasFeeOutput ? totalFeeSats : 0n).toString(),
      zkpayFeeAmount: (hasFeeOutput ? zkpayFeeSats : 0n).toString(),
      partnerFeeAmount: (hasFeeOutput ? partnerFeeSats : 0n).toString(),
      depositTxHash: txHash,
      feeTxHash: hasFeeOutput ? txHash : undefined,
      forwardTxHash: txHash,
    });

    return updated || order;
  } catch (err: any) {
    console.error("[ProxyForwarder] LTC balance/sweep error:", err);
    // Revert status to PENDING_DEPOSIT and record error message so the sweeper daemon retries
    await updateProxySwapOrder(order.swapId, {
      status: "PENDING_DEPOSIT",
      error: `LTC sweep error: ${err?.message || err}`,
      lastAttemptAt: Date.now(),
    }).catch(() => {});
  }

  return order;
}

export interface TokenBalanceInfo {
  symbol: string;
  address: string;
  balanceFormatted: string;
  rawBalance: string;
  decimals: number;
  isExpected: boolean;
}

export interface ProxyBalanceReport {
  swapId: string;
  chain: string;
  proxyDepositAddress: string;
  orderStatus: string;
  createdAt: number;
  expiresAt: number;
  refundTo: string;
  solverDepositAddress: string;
  fromAsset: string;
  toAsset: string;
  expectedAmount: string;
  hasMismatchedTokens: boolean;
  mismatchedWarning?: string;
  nativeBalance: {
    symbol: string;
    balanceFormatted: string;
    rawBalance: string;
    hasGas: boolean;
  };
  tokens: TokenBalanceInfo[];
}

export function getExplorerTxUrl(chain: string, txHash: string): string {
  const c = normalizeChain(chain);
  if (c === "sol") return `https://solscan.io/tx/${txHash}`;
  if (c === "ltc") return `https://litecoinspace.org/tx/${txHash}`;
  if (c === "polygon") return `https://polygonscan.com/tx/${txHash}`;
  if (c === "arb") return `https://arbiscan.io/tx/${txHash}`;
  if (c === "bsc") return `https://bscscan.com/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

/**
 * Inspects all on-chain balances (native gas + ERC-20 tokens) across a proxy deposit address.
 * Automatically scans known tokens to detect mismatched deposits (e.g. USDC sent when USDT was selected).
 */
export async function inspectProxyDepositBalances(
  addressOrSwapId: string,
  customTokenAddress?: string
): Promise<{ success: boolean; report?: ProxyBalanceReport; message?: string }> {
  const query = addressOrSwapId.trim();
  const order =
    (await getProxyOrderByAddress(query)) ||
    (await getProxyOrderBySwapId(query));

  if (!order) {
    return { success: false, message: `No proxy order found for '${query}'.` };
  }

  const normChain = normalizeChain(order.chain) || order.chain.toLowerCase();
  const upperSymbol = normalizeOrderFromAsset(order);

  // 1. SOLANA
  if (normChain === "sol") {
    let lamports = 0n;
    try {
      const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress]);
      lamports = BigInt(balanceRes?.value || 0);
    } catch (e) {
      console.warn("[Inspect] Solana balance query warning:", e);
    }
    const formatted = (Number(lamports) / 1e9).toFixed(6);

    return {
      success: true,
      report: {
        swapId: order.swapId,
        chain: order.chain,
        proxyDepositAddress: order.proxyDepositAddress,
        orderStatus: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        refundTo: order.refundTo,
        solverDepositAddress: order.solverDepositAddress,
        fromAsset: order.fromAsset,
        toAsset: order.toAsset,
        expectedAmount: order.totalAmountFormatted || "0",
        hasMismatchedTokens: false,
        nativeBalance: {
          symbol: "SOL",
          balanceFormatted: formatted,
          rawBalance: lamports.toString(),
          hasGas: lamports > 5000n,
        },
        tokens: [],
      },
    };
  }

  // 1.5 LITECOIN
  if (normChain === "ltc") {
    let balanceSatoshis = 0n;
    try {
      const { getLtcBalanceAndUtxos } = await import("./ltcClient");
      const res = await getLtcBalanceAndUtxos(order.proxyDepositAddress);
      balanceSatoshis = res.balanceSatoshis;
    } catch (e) {
      console.warn("[Inspect] LTC balance query warning:", e);
    }
    const formatted = (Number(balanceSatoshis) / 1e8).toFixed(8);

    return {
      success: true,
      report: {
        swapId: order.swapId,
        chain: order.chain,
        proxyDepositAddress: order.proxyDepositAddress,
        orderStatus: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        refundTo: order.refundTo,
        solverDepositAddress: order.solverDepositAddress,
        fromAsset: order.fromAsset,
        toAsset: order.toAsset,
        expectedAmount: order.totalAmountFormatted || "0",
        hasMismatchedTokens: false,
        nativeBalance: {
          symbol: "LTC",
          balanceFormatted: formatted,
          rawBalance: balanceSatoshis.toString(),
          hasGas: balanceSatoshis > 3000n,
        },
        tokens: [],
      },
    };
  }

  // 2. EVM CHAINS (Base, Arbitrum, Polygon, BSC)
  const publicClient = getPublicClientForChain(order.chain);
  const nativeSymbol =
    normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";

  let nativeWei = 0n;
  try {
    nativeWei = await publicClient.getBalance({
      address: order.proxyDepositAddress as `0x${string}`,
    });
  } catch (e) {
    console.warn("[Inspect] Native balance fetch error:", e);
  }

  const nativeFormatted = (Number(nativeWei) / 1e18).toFixed(6);
  const gasPrice = await publicClient.getGasPrice().catch(() => 1000000000n);
  const hasGas = nativeWei >= 21000n * gasPrice;

  // Build list of tokens to check
  const tokensToCheck = new Map<string, { symbol: string; address: `0x${string}` }>();
  const chainTokens = CHAIN_TOKENS[normChain] || {};
  for (const [sym, addr] of Object.entries(chainTokens)) {
    tokensToCheck.set(addr.toLowerCase(), { symbol: sym, address: addr });
  }

  // If order's originAssetId specifies a contract address, add it
  if (order.originAssetId.includes("0x")) {
    const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
    if (match) {
      const addr = getAddress(match[0]);
      if (!tokensToCheck.has(addr.toLowerCase())) {
        tokensToCheck.set(addr.toLowerCase(), { symbol: upperSymbol, address: addr });
      }
    }
  }

  // If custom token address passed
  if (customTokenAddress && isAddress(customTokenAddress.trim())) {
    const addr = getAddress(customTokenAddress.trim());
    if (!tokensToCheck.has(addr.toLowerCase())) {
      tokensToCheck.set(addr.toLowerCase(), { symbol: "CUSTOM", address: addr });
    }
  }

  const tokenList: TokenBalanceInfo[] = [];
  let hasMismatchedTokens = false;
  let mismatchedWarning = "";

  for (const { symbol, address } of tokensToCheck.values()) {
    try {
      const [rawBal, decimals, dynSymbol] = await Promise.all([
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [order.proxyDepositAddress as `0x${string}`],
        }) as Promise<bigint>,
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: "decimals",
        }).catch(() => 6) as Promise<number>,
        publicClient.readContract({
          address,
          abi: ERC20_ABI,
          functionName: "symbol",
        }).catch(() => symbol) as Promise<string>,
      ]);

      const formatted = formatUnits(rawBal, decimals);
      const isExpected =
        dynSymbol.toUpperCase() === upperSymbol || symbol.toUpperCase() === upperSymbol;

      if (rawBal > 0n && !isExpected) {
        hasMismatchedTokens = true;
        mismatchedWarning = `Mismatched deposit detected! Order expected ${upperSymbol}, but found ${formatted} ${dynSymbol} on ${order.chain}.`;
      }

      tokenList.push({
        symbol: dynSymbol || symbol,
        address,
        balanceFormatted: formatted,
        rawBalance: rawBal.toString(),
        decimals,
        isExpected,
      });
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    report: {
      swapId: order.swapId,
      chain: order.chain,
      proxyDepositAddress: order.proxyDepositAddress,
      orderStatus: order.status,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      refundTo: order.refundTo,
      solverDepositAddress: order.solverDepositAddress,
      fromAsset: order.fromAsset,
      toAsset: order.toAsset,
      expectedAmount: order.totalAmountFormatted || "0",
      hasMismatchedTokens,
      mismatchedWarning: hasMismatchedTokens ? mismatchedWarning : undefined,
      nativeBalance: {
        symbol: nativeSymbol,
        balanceFormatted: nativeFormatted,
        rawBalance: nativeWei.toString(),
        hasGas,
      },
      tokens: tokenList,
    },
  };
}

export interface RecoverResult {
  success: boolean;
  message: string;
  txHash?: string;
  order?: ProxySwapOrder | null;
  recoveredAmount?: string;
  destination?: string;
  explorerUrl?: string;
}

export interface RecoverOptions {
  action?: "forward" | "refund" | "custom";
  customRecipient?: string;
  tokenAddress?: string; // "native" or specific 0x... address
  tokenType?: "native" | "token" | "auto";
  amount?: string;
}

/**
 * Permanent emergency recovery function for any stuck deposit across Solana or EVM chains.
 * Can sweep funds directly to Near Intents solver address, refund 100% to the user,
 * or manually transfer to ANY custom destination address entered by admin.
 * Supports sweeping native gas or any ERC-20 token (even mismatched tokens).
 */
export async function recoverProxyDeposit(
  addressOrSwapId: string,
  options?: RecoverOptions
): Promise<RecoverResult> {
  const query = addressOrSwapId.trim();
  const order =
    (await getProxyOrderByAddress(query)) ||
    (await getProxyOrderBySwapId(query));

  if (!order) {
    return {
      success: false,
      message: `No proxy order found for '${query}'.`,
    };
  }

  const normChain = normalizeChain(order.chain) || order.chain.toLowerCase();
  const lockKey = `${normChain}:${order.proxyDepositAddress.toLowerCase()}`;

  if (sweepLocks.has(lockKey)) {
    // Wait up to 3 seconds if an active background check is finishing
    for (let waitIdx = 0; waitIdx < 15; waitIdx++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!sweepLocks.has(lockKey)) break;
    }
  }

  // If still locked (stale or stuck background check), override lock for manual admin recovery
  if (sweepLocks.has(lockKey)) {
    console.warn(`[ProxyRecovery] Overriding active/stale sweep lock for ${lockKey} to allow recovery.`);
    sweepLocks.delete(lockKey);
  }

  sweepLocks.add(lockKey);
  try {
    const action = options?.action || "forward";

    // Determine recipient destination address
    let destination = options?.customRecipient?.trim();
    if (!destination) {
      destination = action === "refund" ? order.refundTo : order.solverDepositAddress;
    }

  // 1. SOLANA RECOVERY
  if (normChain === "sol") {
    const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress]);
    const lamports = BigInt(balanceRes?.value || 0);
    const MIN_NETWORK_FEE = 5000n;

    if (lamports <= MIN_NETWORK_FEE) {
      return {
        success: false,
        message: `Proxy address has insufficient balance to sweep (${lamports} lamports). Funds may have already been swept.`,
        order,
      };
    }

    const privKeyHex = getDecryptedProxyPrivateKey(order);

    let totalFeeLamports = 0n;
    if (action === "forward") {
      let parsedTotal = 0n;
      try {
        const clean = (order.totalAmountIn || "0").trim();
        parsedTotal = clean.includes(".") ? parseUnits(clean, 9) : BigInt(clean);
      } catch {}
      if (order.feeAmount && parsedTotal > 0n) {
        totalFeeLamports = (lamports * BigInt(order.feeAmount)) / parsedTotal;
      } else if (order.zkpayFeeBps !== undefined) {
        const totalBps = BigInt(order.zkpayFeeBps) + BigInt(order.partnerFeeBps || 0);
        totalFeeLamports = (lamports * totalBps) / 10000n;
      }
    }

    const SOLANA_RENT_EXEMPT_MIN = 890_880n;
    const effectiveTreasuryFee = totalFeeLamports >= SOLANA_RENT_EXEMPT_MIN ? totalFeeLamports : 0n;
    const solverLamports = (action === "forward")
      ? lamports - MIN_NETWORK_FEE - effectiveTreasuryFee
      : lamports - MIN_NETWORK_FEE;

    const txHash = await sendSolanaTransfer({
      fromPubkeyBase58: order.proxyDepositAddress,
      fromPrivKeyHex: privKeyHex,
      toPubkeyBase58: destination,
      transferLamports: solverLamports,
      feeRecipientBase58: effectiveTreasuryFee > 0n ? (order.treasuryAddress || getTreasuryAddressForChain("sol")) : null,
      feeLamports: effectiveTreasuryFee,
    });

    if (action === "forward") {
      notifyNearIntentsDepositSubmit(destination, txHash).catch(() => {});
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "EXPIRED" : "FORWARDED",
      forwardTxHash: txHash,
      feeTxHash: (action === "forward" && effectiveTreasuryFee > 0n) ? txHash : undefined,
      ...(action === "refund"
        ? {
            feeCredited: true,
            feeAmount: "0",
            zkpayFeeAmount: "0",
            partnerFeeAmount: "0",
            error: `Refunded to ${destination}`,
          }
        : {
            totalAmountIn: lamports.toString(),
            netSwapAmount: solverLamports.toString(),
            feeAmount: effectiveTreasuryFee.toString(),
            ...(effectiveTreasuryFee === 0n
              ? { zkpayFeeAmount: "0", partnerFeeAmount: "0" }
              : {}),
          }),
    });

    const explorerUrl = getExplorerTxUrl("sol", txHash);

    return {
      success: true,
      message: `Successfully forwarded ${solverLamports} lamports to ${destination}${effectiveTreasuryFee > 0n ? ` (+ fee ${effectiveTreasuryFee} lamports to ZkPay Treasury)` : ""}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(solverLamports) / 1e9).toFixed(6) + " SOL",
      destination,
      explorerUrl,
    };
  }

  // 1.5 LITECOIN RECOVERY
  if (normChain === "ltc") {
    if (!destination || (!destination.startsWith("L") && !destination.startsWith("M") && !destination.startsWith("ltc1"))) {
      return {
        success: false,
        message: `Invalid LTC destination address: '${destination}'. Must start with L, M, or ltc1.`,
        order,
      };
    }

    const { getLtcBalanceAndUtxos, sweepLtcDeposit } = await import("./ltcClient");
    const { balanceSatoshis, utxos } = await getLtcBalanceAndUtxos(order.proxyDepositAddress);
    const MINER_FEE_SATOSHIS = 3000n;

    if (utxos.length === 0 || balanceSatoshis <= MINER_FEE_SATOSHIS) {
      return {
        success: false,
        message: `Proxy address has insufficient LTC balance to sweep (${balanceSatoshis} satoshis).`,
        order,
      };
    }

    const privKeyHex = getDecryptedProxyPrivateKey(order);

    let totalFeeSats = 0n;
    if (action === "forward") {
      let parsedTotal = 0n;
      try {
        const clean = (order.totalAmountIn || "0").trim();
        parsedTotal = clean.includes(".") ? parseUnits(clean, 8) : BigInt(clean);
      } catch {}
      if (order.feeAmount && parsedTotal > 0n) {
        totalFeeSats = (balanceSatoshis * BigInt(order.feeAmount)) / parsedTotal;
      } else if (order.zkpayFeeBps !== undefined) {
        const totalBps = BigInt(order.zkpayFeeBps) + BigInt(order.partnerFeeBps || 0);
        totalFeeSats = (balanceSatoshis * totalBps) / 10000n;
      }
    }

    const effectiveFeeSats = totalFeeSats >= 5460n ? totalFeeSats : 0n;
    const solverSats = (action === "forward")
      ? balanceSatoshis - MINER_FEE_SATOSHIS - effectiveFeeSats
      : balanceSatoshis - MINER_FEE_SATOSHIS;

    const txHash = await sweepLtcDeposit({
      proxyAddress: order.proxyDepositAddress,
      privKeyHex,
      solverAddress: destination,
      treasuryAddress: order.treasuryAddress || getTreasuryAddressForChain("ltc"),
      zkpayFeeSatoshis: effectiveFeeSats,
      partnerFeeSatoshis: 0n,
    });

    if (action === "forward") {
      notifyNearIntentsDepositSubmit(destination, txHash).catch(() => {});
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "EXPIRED" : "FORWARDED",
      forwardTxHash: txHash,
      feeTxHash: (action === "forward" && effectiveFeeSats > 0n) ? txHash : undefined,
      ...(action === "refund"
        ? {
            feeCredited: true,
            feeAmount: "0",
            zkpayFeeAmount: "0",
            partnerFeeAmount: "0",
            error: `Refunded to ${destination}`,
          }
        : {
            totalAmountIn: balanceSatoshis.toString(),
            netSwapAmount: solverSats.toString(),
            feeAmount: effectiveFeeSats.toString(),
            ...(effectiveFeeSats === 0n
              ? { zkpayFeeAmount: "0", partnerFeeAmount: "0" }
              : {}),
          }),
    });

    const explorerUrl = getExplorerTxUrl("ltc", txHash);

    return {
      success: true,
      message: `Successfully forwarded ${(Number(solverSats) / 1e8).toFixed(8)} LTC to ${destination}${effectiveFeeSats > 0n ? ` (+ fee ${(Number(effectiveFeeSats) / 1e8).toFixed(8)} LTC to ZkPay Treasury)` : ""}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(solverSats) / 1e8).toFixed(8) + " LTC",
      destination,
      explorerUrl,
    };
  }

  // 2. EVM RECOVERY (Base, Arbitrum, Polygon, BSC)
  if (!isAddress(destination)) {
    return {
      success: false,
      message: `Invalid EVM destination address: '${destination}'.`,
      order,
    };
  }
  const cleanDestination = getAddress(destination);

  const publicClient = getPublicClientForChain(order.chain);
  const privKeyHex = getDecryptedProxyPrivateKey(order);
  const proxyAccount = privateKeyToAccount(privKeyHex);
  const walletClient = getWalletClientForChain(order.chain, proxyAccount);

  const upperSymbol = normalizeOrderFromAsset(order);
  const isNative =
    upperSymbol === "ETH" ||
    upperSymbol === "BNB" ||
    upperSymbol === "POL" ||
    upperSymbol === "MATIC";

  const explicitNative =
    options?.tokenType === "native" ||
    options?.tokenAddress?.toLowerCase() === "native";

  const explicitToken =
    options?.tokenType === "token" ||
    (options?.tokenAddress && options.tokenAddress.toLowerCase() !== "native");

  const sweepNative = explicitNative || (!explicitToken && isNative);

  if (sweepNative) {
    const balanceWei = await publicClient.getBalance({ address: proxyAccount.address });
    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const gasPrice = await publicClient.getGasPrice().catch(() => 100_000_000n);
    const maxFee = feeData?.maxFeePerGas ? (feeData.maxFeePerGas * 120n) / 100n : (gasPrice * 120n) / 100n;
    const maxPriorityFee = feeData?.maxPriorityFeePerGas || (gasPrice > 1_000_000_000n ? 1_000_000_000n : gasPrice);

    // Dynamic gas limit: estimate gas for cleanDestination (e.g. smart contracts, EIP-7702 delegated accounts require > 21k gas)
    const estimatedGas = await publicClient
      .estimateGas({
        account: proxyAccount,
        to: cleanDestination,
        value: 1000n,
      })
      .catch(() => 45000n);
    const gasLimit = estimatedGas > 21000n ? (estimatedGas * 130n) / 100n : 45000n;

    // Critical: Base and Arbitrum are L2s that charge an L1 DA fee on top of execution gas.
    const l1DataReserve = (normChain === "base" || normChain === "arb") ? 600_000_000_000n : 10_000_000_000n;
    const totalGasReserve = (gasLimit * maxFee) + l1DataReserve;

    const treasuryAddress = getAddress((order.treasuryAddress || CONTRACTS.TREASURY) as `0x${string}`);
    let totalFeeWei = 0n;

    if (action === "forward") {
      let parsedTotal = 0n;
      try {
        const clean = (order.totalAmountIn || "0").trim();
        parsedTotal = clean.includes(".") ? parseUnits(clean, 18) : BigInt(clean);
      } catch {}
      if (order.feeAmount && parsedTotal > 0n) {
        totalFeeWei = (balanceWei * BigInt(order.feeAmount)) / parsedTotal;
      } else if (order.zkpayFeeBps !== undefined) {
        const totalBps = BigInt(order.zkpayFeeBps) + BigInt(order.partnerFeeBps || 0);
        totalFeeWei = (balanceWei * totalBps) / 10000n;
      }
    }

    const hasFees =
      action === "forward" &&
      totalFeeWei > 0n &&
      treasuryAddress.toLowerCase() !== cleanDestination.toLowerCase();

    const totalReserveAndFees = totalGasReserve + totalFeeWei;

    if (balanceWei <= totalReserveAndFees) {
      return {
        success: false,
        message: `Proxy address has insufficient native balance to sweep (${balanceWei} wei). Total gas and fees required: ${totalReserveAndFees} wei.`,
        order,
      };
    }

    const maxSweepable = balanceWei - totalReserveAndFees;
    const netSolverWei = options?.amount
      ? (parseUnits(options.amount, 18) > maxSweepable ? maxSweepable : parseUnits(options.amount, 18))
      : maxSweepable;

    if (netSolverWei <= 0n) {
      return {
        success: false,
        message: `Calculated sweep amount is 0 wei after gas reserve and fees.`,
        order,
      };
    }

    let txHash: `0x${string}` = "0x";

    if (hasFees) {
      // ── ATOMIC BUNDLE VIA MULTICALL3 (1 SINGLE TX) ──
      try {
        const calls: { target: `0x${string}`; allowFailure: boolean; value: bigint; callData: `0x${string}` }[] = [];
        // 1. Solver (Call #1)
        calls.push({
          target: cleanDestination,
          allowFailure: false,
          value: netSolverWei,
          callData: "0x",
        });
        // 2. 100% of fees to Treasury
        if (totalFeeWei > 0n && treasuryAddress.toLowerCase() !== cleanDestination.toLowerCase()) {
          calls.push({
            target: treasuryAddress,
            allowFailure: false,
            value: totalFeeWei,
            callData: "0x",
          });
        }

        const totalBundleValue = netSolverWei + totalFeeWei;
        txHash = await walletClient.writeContract({
          account: proxyAccount,
          address: MULTICALL3_ADDRESS,
          abi: MULTICALL3_ABI,
          functionName: "aggregate3Value",
          args: [calls],
          value: totalBundleValue,
        });
        console.log(`[Recover] ✓ Atomic Multicall3 bundled native forward to solver + fees in 1 tx: ${txHash}`);
      } catch (bundleErr) {
        console.warn("[Recover] Multicall3 bundle failed, falling back to direct transfer:", bundleErr);
        const txParams: any = {
          account: proxyAccount,
          to: cleanDestination,
          value: netSolverWei,
          gas: gasLimit,
        };
        if (feeData?.maxFeePerGas) {
          txParams.maxFeePerGas = maxFee;
          txParams.maxPriorityFeePerGas = maxPriorityFee;
        } else {
          txParams.gasPrice = maxFee;
        }
        txHash = await walletClient.sendTransaction(txParams);
      }
    } else {
      const txParams: any = {
        account: proxyAccount,
        to: cleanDestination,
        value: netSolverWei,
        gas: gasLimit,
      };
      if (feeData?.maxFeePerGas) {
        txParams.maxFeePerGas = maxFee;
        txParams.maxPriorityFeePerGas = maxPriorityFee;
      } else {
        txParams.gasPrice = maxFee;
      }
      txHash = await walletClient.sendTransaction(txParams);
    }

    if (action === "forward") {
      notifyNearIntentsDepositSubmit(cleanDestination, txHash).catch(() => {});
    }

    await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => {});

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "EXPIRED" : "FORWARDED",
      forwardTxHash: txHash,
      feeTxHash: (action === "forward" && hasFees) ? txHash : undefined,
      ...(action === "refund"
        ? {
            feeCredited: true,
            feeAmount: "0",
            zkpayFeeAmount: "0",
            partnerFeeAmount: "0",
            error: `Refunded to ${cleanDestination}`,
          }
        : {
            totalAmountIn: balanceWei.toString(),
            netSwapAmount: netSolverWei.toString(),
            feeAmount: (hasFees ? totalFeeWei : 0n).toString(),
            ...(!hasFees ? { zkpayFeeAmount: "0", partnerFeeAmount: "0" } : {}),
          }),
    });

    const explorerUrl = getExplorerTxUrl(order.chain, txHash);

    return {
      success: true,
      message: `Successfully forwarded ${(Number(netSolverWei) / 1e18).toFixed(6)} native gas tokens to ${cleanDestination}${totalFeeWei > 0n ? ` (+ fee ${(Number(totalFeeWei) / 1e18).toFixed(6)} to ZkPay Treasury)` : ""}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(netSolverWei) / 1e18).toFixed(6),
      destination: cleanDestination,
      explorerUrl,
    };
  } else {
    // ERC-20 token sweep (Supports order's asset, explicit tokenAddress, or auto-detecting mismatched token)
    let tokenAddress: `0x${string}` | null = null;

    if (options?.tokenAddress && isAddress(options.tokenAddress)) {
      tokenAddress = getAddress(options.tokenAddress);
    } else {
      let resolvedUpper = upperSymbol;
      if (resolvedUpper === "V2_1") {
        resolvedUpper = order.originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") ? "USDT" : "USDC";
      }
      tokenAddress = CHAIN_TOKENS[normChain]?.[resolvedUpper] || CHAIN_TOKENS[normChain]?.[upperSymbol] || null;
      if (!tokenAddress && order.originAssetId.includes("0x")) {
        const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
        if (match) tokenAddress = getAddress(match[0]);
      }

      // Auto-detect: if expected token has 0 balance, scan known tokens for any balance > 0
      if (!tokenAddress) {
        const candidateTokens = CHAIN_TOKENS[normChain] || {};
        for (const candidateAddr of Object.values(candidateTokens)) {
          const bal = (await publicClient
            .readContract({
              address: candidateAddr,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [proxyAccount.address],
            })
            .catch(() => 0n)) as bigint;

          if (bal > 0n) {
            tokenAddress = candidateAddr;
            break;
          }
        }
      }
    }

    if (!tokenAddress) {
      throw new Error(`Cannot resolve ERC-20 token address for ${order.fromAsset} on ${order.chain}. Please provide tokenAddress.`);
    }

    const [tokenBalance, decimals, tokenSymbol] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [proxyAccount.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
      }).catch(() => 6) as Promise<number>,
      publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "symbol",
      }).catch(() => upperSymbol) as Promise<string>,
    ]);

    if (tokenBalance === 0n) {
      return {
        success: false,
        message: `Proxy address has 0 ${tokenSymbol} token balance.`,
        order,
      };
    }

    const isStable = upperSymbol === "USDC" || upperSymbol === "USDT";
    const fixedFeeUnits = isStable
      ? (order.fixedFeeAmount ? BigInt(order.fixedFeeAmount) : (decimals >= 2 ? 5n * 10n ** BigInt(decimals - 2) : 0n))
      : 0n;

    let totalFeeUnits = 0n;
    const treasuryAddress = getAddress((order.treasuryAddress || CONTRACTS.TREASURY) as `0x${string}`);

    if (action === "forward") {
      let parsedTotal = 0n;
      try {
        const clean = (order.totalAmountIn || "0").trim();
        parsedTotal = clean.includes(".") ? parseUnits(clean, decimals) : BigInt(clean);
      } catch {}
      if (order.feeAmount && parsedTotal > 0n) {
        totalFeeUnits = (tokenBalance * BigInt(order.feeAmount)) / parsedTotal;
      } else if (order.zkpayFeeBps !== undefined) {
        const totalBps = BigInt(order.zkpayFeeBps) + BigInt(order.partnerFeeBps || 0);
        totalFeeUnits = (tokenBalance * totalBps) / 10000n + fixedFeeUnits;
      }
    }
    const proxyNonce = await publicClient.getTransactionCount({ address: proxyAccount.address }).catch(() => 0);
    let expectedAtomic = 0n;
    try {
      const clean = (order.totalAmountIn || "0").trim();
      expectedAtomic = clean.includes(".") ? parseUnits(clean, decimals) : BigInt(clean);
    } catch {}
    const expectedOrderFee = order.feeAmount ? BigInt(order.feeAmount) : totalFeeUnits;
    const maxFeeCeiling = expectedOrderFee > 0n ? expectedOrderFee * 2n : totalFeeUnits * 2n;

    // CRITICAL GUARD:
    // Never treat the proxy balance as "only fee remaining" if the user's swap principal is still in the wallet!
    // Even if order.forwardTxHash was set or proxyNonce > 0 from a previously reverted transaction,
    // if tokenBalance > maxFeeCeiling, the solver was NOT paid and the principal is still in the proxy wallet.
    let hasVerifiedForwardTx = false;
    if (order.forwardTxHash && order.forwardTxHash.startsWith("0x")) {
      const prevReceipt = await publicClient
        .getTransactionReceipt({ hash: order.forwardTxHash as `0x${string}` })
        .catch(() => null);
      if (prevReceipt && prevReceipt.status === "success") {
        hasVerifiedForwardTx = true;
      }
    }

    const isBalanceOnlyFee =
      tokenBalance > 0n &&
      maxFeeCeiling > 0n &&
      tokenBalance <= maxFeeCeiling &&
      (expectedAtomic === 0n || tokenBalance < (expectedAtomic * 35n) / 100n);

    const isSolverAlreadyPaid = isBalanceOnlyFee && (hasVerifiedForwardTx || proxyNonce > 0);

    // If solver was ALREADY paid in an earlier verified transaction and ONLY the small platform fee remains in the proxy wallet,
    // sweep the remaining fee to ZkPay Treasury!
    if (action === "forward" && isSolverAlreadyPaid) {
      console.log(
        `[Recover] Solver already paid (tx=${order.forwardTxHash || "on-chain"}, nonce=${proxyNonce}) and only fee (${tokenBalance.toString()}) remains. Sweeping fee to ZkPay Treasury...`
      );

      const liveFeeBal = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [proxyAccount.address],
      })) as bigint;

      if (liveFeeBal === 0n) {
        const updated = await updateProxySwapOrder(order.swapId, { status: "FORWARDED" });
        return {
          success: true,
          message: `Proxy address balance is 0 ${tokenSymbol}. Solver was already paid and fee has already been cleared!`,
          order: updated || order,
          destination: treasuryAddress,
        };
      }

      const ethBalance = await publicClient.getBalance({ address: proxyAccount.address });
      const rawGasPrice = await publicClient
        .getGasPrice()
        .catch(() => (normChain === "bsc" ? BSC_FALLBACK_GAS_PRICE : 40_000_000_000n));
      const gasPrice = normChain === "bsc" && rawGasPrice < BSC_MIN_GAS_PRICE ? BSC_MIN_GAS_PRICE : rawGasPrice;
      const minNeededFloor =
        normChain === "polygon" ? parseUnits("0.02", 18) : normChain === "bsc" ? 0n : 30_000_000_000_000n;
      const gasNeeded = (gasPrice * 95_000n * 15n) / 10n;
      const targetGas = gasNeeded > minNeededFloor ? gasNeeded : minNeededFloor;

      if (ethBalance < targetGas) {
        try {
          const relayer = getRelayerWalletClientForChain(normChain);
          const advanceAmount = targetGas - ethBalance;
          const fundTx = await relayer.sendTransaction({
            account: relayer.account,
            to: proxyAccount.address,
            value: advanceAmount,
          });
          await publicClient.waitForTransactionReceipt({ hash: fundTx });
          await new Promise((r) => setTimeout(r, 2500));
        } catch (fundErr) {
          console.warn("[Recover] Optional gas advance warning during fee sweep:", fundErr);
        }
      }

      const feeRes = await sendResilientErc20Transfer({
        chainKey: normChain,
        publicClient,
        walletClient,
        proxyAccount,
        tokenAddress,
        to: treasuryAddress,
        amount: liveFeeBal,
      });

      if (!feeRes.txHash) {
        return {
          success: false,
          message: `Failed to sweep remaining ${formatUnits(liveFeeBal, decimals)} ${tokenSymbol} fee to Treasury (${treasuryAddress}): ${feeRes.error}`,
          order,
        };
      }

      const feeTxHash = feeRes.txHash;
      const feeReceipt = await publicClient
        .waitForTransactionReceipt({ hash: feeTxHash as `0x${string}`, timeout: 45_000 })
        .catch(() => null);

      if (feeReceipt && feeReceipt.status === "reverted") {
        return {
          success: false,
          message: `Fee transfer transaction ${feeTxHash} reverted on-chain. Please retry.`,
          order,
        };
      }

      console.log(`[Recover] ✓ Remaining fee swept to ZkPay Treasury: ${feeTxHash}`);

      const updated = await updateProxySwapOrder(order.swapId, {
        status: "FORWARDED",
        feeTxHash,
      });

      return {
        success: true,
        message: `Solver was already paid! Successfully swept remaining ${formatUnits(liveFeeBal, decimals)} ${tokenSymbol} platform fee to ZkPay Treasury (${treasuryAddress})!`,
        txHash: feeTxHash,
        order: updated,
        recoveredAmount: `${formatUnits(liveFeeBal, decimals)} ${tokenSymbol}`,
        destination: treasuryAddress,
        explorerUrl: getExplorerTxUrl(order.chain, feeTxHash),
      };
    }

    // FEE SAFETY: when forwarding to the solver, a balance at or below the fee total is the platform
    // fee itself and must never be sent to the solver (it would be absorbed by the FLEX_INPUT quote).
    const isSolverDestination =
      cleanDestination.toLowerCase() === (order.solverDepositAddress || "").toLowerCase();
    if (action === "forward" && isSolverDestination && totalFeeUnits > 0n && tokenBalance <= totalFeeUnits) {
      return {
        success: false,
        message: `Refusing to forward ${formatUnits(tokenBalance, decimals)} ${tokenSymbol} to the solver: this is at or below the platform fee (${formatUnits(totalFeeUnits, decimals)} ${tokenSymbol}), so the swap principal has already left the proxy. To sweep it to Treasury, retry with customRecipient=${treasuryAddress}.`,
        order,
      };
    }

    const netSolverUnits = (action === "forward" && tokenBalance > totalFeeUnits)
      ? tokenBalance - totalFeeUnits
      : (options?.amount ? parseUnits(options.amount, decimals) : tokenBalance);

    const sweepAmount = netSolverUnits;

    // Check if USDC supports gasless EIP-3009 transfer
    if (EIP3009_USDC[normChain] && tokenAddress.toLowerCase() === EIP3009_USDC[normChain].toLowerCase()) {
      try {
        console.log(`[Recover] Attempting gasless EIP-3009 USDC transfer on ${normChain}...`);
        let txHash = "";

        if (action === "forward" && totalFeeUnits > 0n) {
          const outputs: GaslessTransferOutput[] = [
            { to: cleanDestination, value: netSolverUnits },
          ];
          if (totalFeeUnits > 0n && treasuryAddress.toLowerCase() !== cleanDestination.toLowerCase()) {
            outputs.push({ to: treasuryAddress, value: totalFeeUnits });
          }

          txHash = await executeBundledGaslessUsdcTransfers({
            proxyAccount,
            tokenAddress,
            outputs,
            chainKey: normChain,
            publicClient,
          });
          console.log(`[Recover] ✓ Atomic gasless Multicall3 bundled Solver + ZkPay Treasury in 1 tx: ${txHash}`);
        } else {
          txHash = await executeGaslessUsdcTransfer({
            proxyAccount,
            tokenAddress,
            to: cleanDestination,
            value: sweepAmount,
            chainKey: normChain,
            publicClient,
          });
        }

        if (action === "forward") {
          notifyNearIntentsDepositSubmit(cleanDestination, txHash).catch(() => {});
        }

        const updated = await updateProxySwapOrder(order.swapId, {
          status: action === "refund" ? "EXPIRED" : "FORWARDED",
          forwardTxHash: txHash,
          feeTxHash: (action === "forward" && totalFeeUnits > 0n) ? txHash : undefined,
          ...(action === "refund"
            ? {
                feeCredited: true,
                feeAmount: "0",
                zkpayFeeAmount: "0",
                partnerFeeAmount: "0",
                error: `Refunded to ${cleanDestination}`,
              }
            : {
                totalAmountIn: tokenBalance.toString(),
                netSwapAmount: netSolverUnits.toString(),
                feeAmount: totalFeeUnits.toString(),
                ...(totalFeeUnits === 0n ? { zkpayFeeAmount: "0", partnerFeeAmount: "0" } : {}),
              }),
        });

        const explorerUrl = getExplorerTxUrl(order.chain, txHash);
        return {
          success: true,
          message: `Successfully forwarded ${formatUnits(netSolverUnits, decimals)} ${tokenSymbol} to ${cleanDestination}${totalFeeUnits > 0n ? ` (+ fee ${formatUnits(totalFeeUnits, decimals)} to ZkPay Treasury in 1 tx)` : ""}!`,
          txHash,
          order: updated,
          recoveredAmount: `${formatUnits(netSolverUnits, decimals)} ${tokenSymbol}`,
          destination: cleanDestination,
          explorerUrl,
        };
      } catch (gaslessErr: any) {
        console.warn(`[Recover] Gasless transfer failed, falling back to standard transfer:`, gaslessErr?.message || gaslessErr);
      }
    }

    const ethBalance = await publicClient.getBalance({ address: proxyAccount.address });
    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const gasPrice = await publicClient.getGasPrice();
    const rawMaxFee = feeData?.maxFeePerGas && feeData.maxFeePerGas > gasPrice ? feeData.maxFeePerGas : (gasPrice * 13n) / 10n;
    const minChainGasPrice = normChain === "polygon" ? 40_000_000_000n : normChain === "bsc" ? BSC_MIN_GAS_PRICE : 0n;
    const maxFee = rawMaxFee > minChainGasPrice ? rawMaxFee : minChainGasPrice;
    const transfersCount = (action === "forward" && totalFeeUnits > 0n) ? 2n : 1n;
    const calculatedGas = (maxFee * 95000n * transfersCount * 15n) / 10n;
    const minNeededFloor = normChain === "polygon" 
      ? parseUnits("0.035", 18) 
      : (normChain === "bsc" ? 0n /* Dynamic: no fixed BNB floor */ : 35_000_000_000_000n);
    const gasNeeded = calculatedGas > minNeededFloor ? calculatedGas : minNeededFloor;

    if (ethBalance < gasNeeded) {
      try {
        const relayer = getRelayerWalletClientForChain(normChain);
        const relayerBal = await publicClient.getBalance({ address: relayer.account.address });
        const advanceAmount = gasNeeded - ethBalance;

        if (relayerBal > advanceAmount * 2n) {
          const fundTx = await relayer.sendTransaction({
            account: relayer.account,
            to: proxyAccount.address,
            value: advanceAmount,
          });
          await publicClient.waitForTransactionReceipt({ hash: fundTx });
          console.log(`[Recover] ✓ Gas advance to proxy ${proxyAccount.address} on ${normChain}: ${fundTx}`);
          // 2.5s propagation sleep to ensure Bor RPC nodes have updated proxy balance
          await new Promise((r) => setTimeout(r, 2500));
        } else {
          const nativeSym = normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";
          return {
            success: false,
            message: `Proxy wallet holds ${formatUnits(sweepAmount, decimals)} ${tokenSymbol}, but has insufficient native ${nativeSym} for network gas fee (${ethBalance} wei) and relayer gas tank is low (${formatUnits(relayerBal, 18)} ${nativeSym}). Please send some ${nativeSym} to relayer address ${relayer.account.address} or proxy address ${proxyAccount.address}.`,
            order,
          };
        }
      } catch (advanceErr: any) {
        console.warn(`[Recover] Relayer gas advance failed on ${normChain}:`, advanceErr);
        const nativeSym = normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";
        return {
          success: false,
          message: `Proxy wallet holds ${formatUnits(sweepAmount, decimals)} ${tokenSymbol}, but has insufficient native ${nativeSym} for gas fee (${ethBalance} wei). Please send ~0.05 ${nativeSym} to proxy address ${proxyAccount.address} to power the transaction, then retry.`,
          order,
        };
      }
    }

    // 1. Transfer Net to Solver FIRST (Crucial: Prevents Near Intents solver deadline expiry!)
    // Re-verify real-time on-chain token balance before sending transfer!
    // (A background daemon or previous run may have already swept the balance during gas advance)
    const liveTokenBal = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAccount.address],
    })) as bigint;

    if (liveTokenBal === 0n) {
      console.log(`[Recover] Proxy ${proxyAccount.address} balance is 0 ${tokenSymbol}. Funds already swept.`);
      const updated = await updateProxySwapOrder(order.swapId, {
        status: action === "refund" ? "EXPIRED" : "FORWARDED",
        ...(action === "refund"
          ? { feeCredited: true, feeAmount: "0", zkpayFeeAmount: "0", partnerFeeAmount: "0" }
          : {}),
      });
      return {
        success: true,
        message: `Proxy address balance is 0 ${tokenSymbol}. Funds have already been successfully swept / forwarded on-chain!`,
        order: updated || order,
      };
    }

    // Check if recipient or sender is blacklisted by USDT compliance contract
    const isRecipientBlocked = await publicClient.readContract({
      address: tokenAddress,
      abi: parseAbi(["function isBlocked(address) view returns (bool)"]),
      functionName: "isBlocked",
      args: [cleanDestination],
    }).catch(() => false);

    if (isRecipientBlocked) {
      return {
        success: false,
        message: `Recipient address ${cleanDestination} is blacklisted by the Tether (USDT) contract compliance! Tokens cannot be sent to this destination. Please select "Refund to User" (${order.refundTo}) or enter a custom recipient address to safely recover the funds.`,
        order,
      };
    }

    const isSenderBlocked = await publicClient.readContract({
      address: tokenAddress,
      abi: parseAbi(["function isBlocked(address) view returns (bool)"]),
      functionName: "isBlocked",
      args: [proxyAccount.address],
    }).catch(() => false);

    if (isSenderBlocked) {
      return {
        success: false,
        message: `Proxy address ${proxyAccount.address} has been flagged/blocked by the ${tokenSymbol} contract compliance.`,
        order,
      };
    }

    const finalSolverUnits =
      action === "forward" && isSolverDestination && totalFeeUnits > 0n
        ? getSafeSolverForwardAmount(liveTokenBal, totalFeeUnits, netSolverUnits)
        : liveTokenBal >= netSolverUnits
        ? netSolverUnits
        : liveTokenBal;
    if (finalSolverUnits === 0n) {
      return {
        success: false,
        message: `Live proxy balance (${formatUnits(liveTokenBal, decimals)} ${tokenSymbol}) dropped below the expected net amount; the principal has already left the proxy. Not forwarding the remaining fee to the solver.`,
        order,
      };
    }
    console.log(`[Recover] Executing ERC-20 transfer of ${formatUnits(finalSolverUnits, decimals)} ${tokenSymbol} to ${cleanDestination}...`);

    const transferRes = await sendResilientErc20Transfer({
      chainKey: normChain,
      publicClient,
      walletClient,
      proxyAccount,
      tokenAddress,
      to: cleanDestination,
      amount: finalSolverUnits,
    });

    const txHash = transferRes.txHash;

    if (!txHash) {
      console.error(`[Recover] Transfer failed on-chain:`, transferRes.error);
      const postBal = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [proxyAccount.address],
      }).catch(() => 0n)) as bigint;

      if (postBal === 0n) {
        const updated = await updateProxySwapOrder(order.swapId, {
          status: action === "refund" ? "EXPIRED" : "FORWARDED",
          ...(action === "refund"
            ? { feeCredited: true, feeAmount: "0", zkpayFeeAmount: "0", partnerFeeAmount: "0" }
            : {}),
        });
        return {
          success: true,
          message: `Proxy ${tokenSymbol} balance is 0. The transfer was successfully executed by a concurrent process.`,
          order: updated || order,
        };
      }

      const postEth = await publicClient.getBalance({ address: proxyAccount.address }).catch(() => 0n);
      const detailedError = transferRes.error || "RPC broadcast failed";
      const nativeSym = normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";

      return {
        success: false,
        message: `On-chain transfer to ${cleanDestination} failed: ${detailedError}. Proxy holds ${formatUnits(postBal, decimals)} ${tokenSymbol} and ${formatUnits(postEth, 18)} ${nativeSym}. Please retry in a few seconds or check RPC connectivity.`,
        order,
      };
    }

    // CRITICAL: Wait for solver/recipient transfer receipt and verify it succeeded on-chain BEFORE saving forwardTxHash or sending fee!
    const solverReceipt = await publicClient
      .waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 45_000 })
      .catch(() => null);

    if (solverReceipt && solverReceipt.status === "reverted") {
      console.error(`[Recover] ✗ Transfer to ${cleanDestination} REVERTED on-chain: ${txHash}`);
      await updateProxySwapOrder(order.swapId, {
        status: "PENDING_DEPOSIT",
        forwardTxHash: undefined,
        error: `Transfer transaction ${txHash} reverted on-chain.`,
      }).catch(() => {});
      return {
        success: false,
        message: `On-chain transfer to ${cleanDestination} reverted on-chain (tx: ${txHash}). Funds are still safely in the proxy wallet; please retry.`,
        txHash,
        order,
        explorerUrl: getExplorerTxUrl(order.chain, txHash),
      };
    }

    // Confirmed on-chain: checkpoint status & forwardTxHash in DB so order never remains in PENDING_DEPOSIT
    await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "EXPIRED" : "FORWARDED",
      forwardTxHash: txHash,
      ...(action === "refund"
        ? {
            feeCredited: true,
            feeAmount: "0",
            zkpayFeeAmount: "0",
            partnerFeeAmount: "0",
            error: `Refunded to ${cleanDestination}`,
          }
        : {}),
    }).catch(() => {});

    if (action === "forward") {
      notifyNearIntentsDepositSubmit(cleanDestination, txHash).catch(() => {});
    }

    console.log(`[Recover] ✓ Transfer to ${cleanDestination} confirmed on-chain: ${txHash}`);

    // 2. Transfer 100% of fees to Treasury (if action === "forward")
    let feeTxHash = "";
    if (action === "forward" && totalFeeUnits > 0n && treasuryAddress.toLowerCase() !== cleanDestination.toLowerCase()) {
      try {
        const remainingBal = (await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [proxyAccount.address],
        })) as bigint;
        const feeToSend = remainingBal >= totalFeeUnits ? totalFeeUnits : remainingBal;
        if (feeToSend > 0n) {
          const feeRes = await sendResilientErc20Transfer({
            chainKey: normChain,
            publicClient,
            walletClient,
            proxyAccount,
            tokenAddress,
            to: treasuryAddress,
            amount: feeToSend,
          });
          if (feeRes.txHash) {
            console.log(`[Recover] Token ZkPay Treasury fee transfer broadcast: ${feeRes.txHash}`);
            const feeReceipt = await publicClient
              .waitForTransactionReceipt({ hash: feeRes.txHash as `0x${string}` })
              .catch(() => null);
            if (!feeReceipt || feeReceipt.status === "success") {
              feeTxHash = feeRes.txHash;
              console.log(`[Recover] ✓ Token ZkPay Treasury fee confirmed on-chain: ${feeTxHash}`);
            } else {
              console.warn(`[Recover] ✗ Token ZkPay Treasury fee transfer reverted on-chain: ${feeRes.txHash}`);
            }
          }
        }
      } catch (feeErr) {
        console.error("[Recover] Token ZkPay Treasury fee transfer error:", feeErr);
      }
    }

    // 3. Sweep leftover native gas dust back to relayer (exact 21,000 gas legacy transfer leaving 0 dust)
    try {
      const nativeSym = normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";
      const leftoverNative = await publicClient.getBalance({ address: proxyAccount.address });
      const gasPrice = await publicClient.getGasPrice();
      const sweepGas = 21000n;
      const minGasFloor = normChain === "polygon" ? 30_000_000_000n : 0n;
      const calculatedGasPrice = (gasPrice * 115n) / 100n;
      const effectiveGasPrice = calculatedGasPrice > minGasFloor ? calculatedGasPrice : minGasFloor;
      const txGasCost = sweepGas * effectiveGasPrice;

      if (leftoverNative > (txGasCost * 12n) / 10n) {
        const relayerAddr = getRelayerWalletClientForChain(normChain).account.address;
        const valueToSend = leftoverNative - txGasCost;
        const dustTx = await walletClient.sendTransaction({
          account: proxyAccount,
          to: relayerAddr,
          value: valueToSend,
          gas: sweepGas,
          gasPrice: effectiveGasPrice,
          type: "legacy",
        });
        await publicClient.waitForTransactionReceipt({ hash: dustTx as `0x${string}` }).catch(() => {});
        console.log(`[Recover] ✓ Swept ${formatUnits(valueToSend, 18)} ${nativeSym} dust back to relayer: ${dustTx}`);
      }
    } catch (dustErr) {
      console.warn("[Recover] Native dust sweep warning (non-fatal):", dustErr);
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "EXPIRED" : "FORWARDED",
      forwardTxHash: txHash,
      feeTxHash: feeTxHash || (action === "forward" ? txHash : undefined),
      ...(action === "refund"
        ? {
            feeCredited: true,
            feeAmount: "0",
            zkpayFeeAmount: "0",
            partnerFeeAmount: "0",
            error: `Refunded to ${cleanDestination}`,
          }
        : {
            totalAmountIn: liveTokenBal.toString(),
            netSwapAmount: finalSolverUnits.toString(),
            feeAmount: (feeTxHash ? totalFeeUnits : 0n).toString(),
          }),
    });

    const explorerUrl = getExplorerTxUrl(order.chain, txHash);

    return {
      success: true,
      message: `Successfully forwarded ${formatUnits(netSolverUnits, decimals)} ${tokenSymbol} to ${cleanDestination}${totalFeeUnits > 0n ? ` (+ fee ${formatUnits(totalFeeUnits, decimals)} to ZkPay Treasury)` : ""}!`,
      txHash,
      order: updated,
      recoveredAmount: `${formatUnits(netSolverUnits, decimals)} ${tokenSymbol}`,
      destination: cleanDestination,
      explorerUrl,
    };
  }
} finally {
  sweepLocks.delete(lockKey);
}
}

let sweeperInterval: ReturnType<typeof setInterval> | null = null;
let isSweeperTickActive = false;

/**
 * Starts the automatic background sweeper daemon.
 * Periodically scans all PENDING_DEPOSIT proxy orders:
 * 1. If an order has received funds, it forwards to solver immediately.
 * 2. If an order has expired (past deadline) with funds deposited, it automatically refunds 100% to the user's refundTo address!
 * 3. If an order has 0 balance and expired > 1 hour ago, marks status as EXPIRED.
 * 4. Checks FORWARDED orders against NEAR Intents solver status and automatically credits partner fees upon SETTLED status!
 */
/**
 * Checks whether an expired proxy account currently holds deposited funds.
 */
async function hasProxyDepositFunds(order: ProxySwapOrder): Promise<boolean> {
  const normChain = normalizeChain(order.chain) || order.chain.toLowerCase();
  try {
    if (normChain === "sol") {
      const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress]);
      const lamports = BigInt(balanceRes?.value || 0);
      return lamports > 5000n;
    } else if (normChain === "ltc") {
      const { getLtcBalanceAndUtxos } = await import("./ltcClient");
      const { balanceSatoshis } = await getLtcBalanceAndUtxos(order.proxyDepositAddress);
      return balanceSatoshis > 3000n;
    } else {
      const publicClient = getPublicClientForChain(order.chain);
      if (!isAddress(order.proxyDepositAddress)) return false;
      const cleanAddress = getAddress(order.proxyDepositAddress as `0x${string}`);
      const nativeBal = await publicClient.getBalance({ address: cleanAddress }).catch(() => 0n);
      if (nativeBal > 100_000_000_000_000n) {
        return true;
      }
      const upperSymbol = normalizeOrderFromAsset(order);
      const isNative =
        upperSymbol === "ETH" ||
        upperSymbol === "BNB" ||
        upperSymbol === "POL" ||
        upperSymbol === "MATIC";
      if (!isNative) {
        const tokenMap = CHAIN_TOKENS[normChain] || {};
        let tokenAddress: `0x${string}` | null = tokenMap[upperSymbol] || null;
        if (!tokenAddress && order.originAssetId?.includes("0x")) {
          const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
          if (match) tokenAddress = getAddress(match[0] as `0x${string}`);
        }
        if (tokenAddress) {
          const tokenBal = (await publicClient
            .readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [cleanAddress],
            })
            .catch(() => 0n)) as bigint;
          if (tokenBal > 0n) return true;
        }
      }
    }
  } catch (e) {
    console.warn(`[ProxySweeperDaemon] Error checking balance for expired order ${order.swapId}:`, e);
  }
  return false;
}

/**
 * Executes a single sweep and settlement cycle across all active proxy swap orders.
 * Returns the count of checked orders and processed operations.
 */
export async function runProxySweeperTick(): Promise<{ checked: number; processed: number }> {
  if (isSweeperTickActive) return { checked: 0, processed: 0 };
  isSweeperTickActive = true;
  let checked = 0;
  let processed = 0;

  try {
    // Phase 1: Sweep PENDING_DEPOSIT / FORWARDING orders
    const pendingOrders = await getPendingProxyOrders();
    if (pendingOrders && pendingOrders.length > 0) {
      checked += pendingOrders.length;
      for (const order of pendingOrders) {
        try {
          const isExpired = Date.now() > order.expiresAt + 60_000;

          if (isExpired) {
            // Check if funds were deposited on an expired quote.
            // If yes, automatic 100% refund to user's refundTo address!
            const refundRes = await recoverProxyDeposit(order.proxyDepositAddress, { action: "refund" });
            if (refundRes.success) {
              console.log(
                `[ProxySweeperDaemon] Automatically refunded expired deposit for order ${order.swapId} to user ${order.refundTo}. Tx: ${refundRes.txHash}`
              );
              processed++;
            } else {
              // Before marking order EXPIRED, check if proxy balance has deposited funds.
              // If funds exist, do not discard; transition to REFUND_PENDING or attempt emergency refund.
              const hasFunds = await hasProxyDepositFunds(order);
              if (hasFunds) {
                console.warn(
                  `[ProxySweeperDaemon] Order ${order.swapId} expired but proxy still holds deposited funds! Transitioning to REFUND_PENDING.`
                );
                await updateProxySwapOrder(order.swapId, {
                  status: "REFUND_PENDING",
                  error: refundRes.message || "Proxy holds deposited funds requiring refund",
                });
              } else if (Date.now() > order.expiresAt + 3600_000) {
                // No funds were deposited and order expired > 1 hour ago -> mark EXPIRED
                await updateProxySwapOrder(order.swapId, { status: "EXPIRED" });
              }
            }
          } else {
            // Order is active within deadline -> attempt forward sweep
            const res = await checkAndForwardProxyDeposit(order);
            if (res.status === "FORWARDED") processed++;
          }
        } catch (itemErr) {
          console.warn(`[ProxySweeperDaemon] Error sweeping order ${order.swapId}:`, itemErr);
        }
      }
    }

    // Phase 2: Monitor FORWARDED orders for upstream solver settlement & credit uncredited SETTLED partner fees
    const forwardedOrUncredited = await getForwardedOrUncreditedProxyOrders(25);
    if (forwardedOrUncredited && forwardedOrUncredited.length > 0) {
      checked += forwardedOrUncredited.length;
      for (const order of forwardedOrUncredited) {
        try {
          if (order.status === "SETTLED" && !order.feeCredited) {
            await creditPartnerFeeOnSettlement(order);
            processed++;
          } else if (order.status === "FORWARDED" && order.solverDepositAddress) {
            const solverUrl = `https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(order.solverDepositAddress.trim())}`;
            const headers: Record<string, string> = { Accept: "application/json" };
            if (process.env.NEAR_INTENTS_API_KEY) {
              headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
            }
            const res = await fetch(solverUrl, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null);
            if (res && res.ok) {
              const data = await res.json().catch(() => null);
              const rawSt = data?.status;
              if (rawSt === "SUCCESS") {
                const rawOriginHash = data?.swapDetails?.originChainTxHashes?.[0]?.hash;
                const updatedOrder =
                  (await updateProxySwapOrder(order.swapId, {
                    status: "SETTLED",
                    ...(rawOriginHash && !order.forwardTxHash ? { forwardTxHash: rawOriginHash } : {}),
                  })) || { ...order, status: "SETTLED" as const };
                await creditPartnerFeeOnSettlement(updatedOrder);
                processed++;
              } else if (rawSt === "FAILED" || rawSt === "REFUNDED") {
                await updateProxySwapOrder(order.swapId, { status: "FAILED" });
                processed++;
              }
            }
          }
        } catch (settleErr) {
          console.warn(`[ProxySweeperDaemon] Settlement check warning for ${order.swapId}:`, settleErr);
        }
      }
    }
  } catch (daemonErr) {
    console.warn("[ProxySweeperDaemon] Sweeper tick error:", daemonErr);
  } finally {
    isSweeperTickActive = false;
  }

  return { checked, processed };
}

export function ensureProxySweeperDaemonRunning() {
  if (sweeperInterval) return;

  console.log("[ProxySweeperDaemon] Starting automated background proxy deposit sweeper & settlement monitor (interval: 12s)...");

  sweeperInterval = setInterval(async () => {
    await runProxySweeperTick();
  }, 12_000);

  if (sweeperInterval && typeof (sweeperInterval as any).unref === "function") {
    (sweeperInterval as any).unref();
  }
}

// Auto-start daemon when module loads
try {
  ensureProxySweeperDaemonRunning();
} catch (e) {
  // Safe fallback
}

/**
 * Sweeps stranded native gas dust from past proxy wallets back to the relayer gas tank.
 * Can be called manually by admin or periodically to recycle all unspent POL/BNB/ETH.
 */
export async function sweepAllProxyDustToRelayer(
  chainKey: string = "polygon",
  limit: number = 50
): Promise<{
  success: boolean;
  totalSweptFormatted: string;
  sweptCount: number;
  skippedCount: number;
  details: Array<{ address: string; amount: string; txHash?: string }>;
}> {
  const normChain = normalizeChain(chainKey) || chainKey.toLowerCase();
  const publicClient = getPublicClientForChain(normChain);
  const relayer = getRelayerWalletClientForChain(normChain);
  const relayerAddress = relayer.account.address;
  const nativeSym = normChain === "polygon" ? "POL" : normChain === "bsc" ? "BNB" : "ETH";

  const orders = await getRecentProxyOrders(limit);
  const chainOrders = orders.filter(
    (o) => (normalizeChain(o.chain) || o.chain.toLowerCase()) === normChain && o.encryptedPrivateKey
  );

  let totalSweptWei = 0n;
  let sweptCount = 0;
  let skippedCount = 0;
  const details: Array<{ address: string; amount: string; txHash?: string }> = [];

  const gasPrice = await publicClient.getGasPrice();
  const sweepGas = 21000n;
  const minGasFloor = normChain === "polygon" ? 30_000_000_000n : 0n;
  const calculatedGasPrice = (gasPrice * 115n) / 100n;
  const effectiveGasPrice = calculatedGasPrice > minGasFloor ? calculatedGasPrice : minGasFloor;
  const txGasCost = sweepGas * effectiveGasPrice;
  const minThreshold = (txGasCost * 13n) / 10n; // Needs at least 1.3x gas cost to be worth sweeping

  for (const order of chainOrders) {
    try {
      const rawKey = getDecryptedProxyPrivateKey(order);
      const proxyAccount = privateKeyToAccount(rawKey);
      const balance = await publicClient.getBalance({ address: proxyAccount.address });

      if (balance <= minThreshold) {
        skippedCount++;
        continue;
      }

      const valueToSend = balance - txGasCost;
      const walletClient = getWalletClientForChain(normChain, proxyAccount);

      const txHash = await walletClient.sendTransaction({
        account: proxyAccount,
        to: relayerAddress,
        value: valueToSend,
        gas: sweepGas,
        gasPrice: effectiveGasPrice,
        type: "legacy",
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => {});
      totalSweptWei += valueToSend;
      sweptCount++;
      details.push({
        address: proxyAccount.address,
        amount: `${formatUnits(valueToSend, 18)} ${nativeSym}`,
        txHash,
      });
      console.log(`[RecycleDust] ✓ Recycled ${formatUnits(valueToSend, 18)} ${nativeSym} from ${proxyAccount.address} -> relayer: ${txHash}`);
    } catch (e: any) {
      console.warn(`[RecycleDust] Failed to sweep ${order.proxyDepositAddress}:`, e?.message || e);
    }
  }

  return {
    success: true,
    totalSweptFormatted: `${formatUnits(totalSweptWei, 18)} ${nativeSym}`,
    sweptCount,
    skippedCount,
    details,
  };
}

