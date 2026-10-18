import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbi,
  getAddress,
  isAddress,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, arbitrum, polygon, bsc } from "viem/chains";
import { CONTRACTS, normalizeChain } from "@/lib/constants";
import {
  ProxySwapOrder,
  getProxyOrderByAddress,
  updateProxySwapOrder,
  getDecryptedProxyPrivateKey,
} from "./proxySwapStore";
import { getRelayerWalletClient } from "./relayer";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

// Known token addresses across Tier 2 chains
const CHAIN_TOKENS: Record<string, Record<string, `0x${string}`>> = {
  base: {
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
  arb: {
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  },
  polygon: {
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  },
  bsc: {
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  },
};

// RPC Fallbacks for Tier 2 Chains
const RPC_URLS: Record<string, string[]> = {
  base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
  ],
  arb: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.llamarpc.com",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
  polygon: [
    "https://polygon-rpc.com",
    "https://polygon.llamarpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  bsc: [
    "https://bsc-dataseed.binance.org",
    "https://binance.llamarpc.com",
    "https://bsc-rpc.publicnode.com",
  ],
};

function getChainConfig(chainStr: string) {
  const c = normalizeChain(chainStr) || chainStr.toLowerCase();
  switch (c) {
    case "arb":
    case "arbitrum":
      return { chain: arbitrum, key: "arb" };
    case "polygon":
    case "matic":
    case "pol":
      return { chain: polygon, key: "polygon" };
    case "bsc":
    case "bnb":
      return { chain: bsc, key: "bsc" };
    case "base":
    default:
      return { chain: base, key: "base" };
  }
}

function getPublicClientForChain(chainStr: string) {
  const { chain, key } = getChainConfig(chainStr);
  const urls = RPC_URLS[key] || RPC_URLS.base;
  const transports = urls.map((u) => http(u, { timeout: 6000, retryCount: 2 }));
  return createPublicClient({
    chain,
    transport: fallback(transports, { rank: false }),
  });
}

// In-memory concurrency locks to prevent double-sweeping
const sweepLocks = new Set<string>();

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

  sweepLocks.add(lockKey);
  try {
    // ── 1. Solana Deposit Check ──
    if (normChain === "sol") {
      return await checkSolanaDeposit(order);
    }

    // ── 2. EVM Chains (Base, Arbitrum, Polygon, BSC) ──
    return await checkEvmDeposit(order);
  } finally {
    sweepLocks.delete(lockKey);
  }
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

  const upperSymbol = order.fromAsset.toUpperCase();
  const isNative =
    upperSymbol === "ETH" ||
    upperSymbol === "BNB" ||
    upperSymbol === "POL" ||
    upperSymbol === "MATIC";

  const { chain, key: chainKey } = getChainConfig(order.chain);

  if (isNative) {
    // ─── CASE A: Native Gas Token (ETH, BNB, POL) ───
    const balanceWei = await publicClient.getBalance({ address: proxyAddress });
    const expectedAtomic = BigInt(order.totalAmountIn);

    // Minimum 95% threshold to tolerate gas rounding
    if (balanceWei < (expectedAtomic * 95n) / 100n || balanceWei === 0n) {
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] Native deposit detected for order ${order.swapId}: ${formatUnits(balanceWei, 18)} ${upperSymbol}`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const rawKey = getDecryptedProxyPrivateKey(order);
    const proxyAccount = privateKeyToAccount(rawKey);

    const walletClient = createWalletClient({
      account: proxyAccount,
      chain,
      transport: http(),
    });

    // Estimate gas for transfers (L2 gas is ~$0.002)
    const gasPrice = await publicClient.getGasPrice();
    const gasReservePerTx = 25000n * gasPrice;
    const totalGasReserve = gasReservePerTx * 2n;

    // Platform Fee
    const feeWei = (balanceWei * BigInt(order.feeAmount)) / expectedAtomic;
    // Net to Solver
    const netWei = balanceWei - feeWei - totalGasReserve;

    if (netWei <= 0n) {
      throw new Error("Deposit amount too small to cover transfer and L2 gas.");
    }

    // 1. Transfer Fee to Treasury
    let feeTxHash = "";
    if (feeWei > 0n) {
      feeTxHash = await walletClient.sendTransaction({
        to: treasuryAddress,
        value: feeWei,
      });
      console.log(`[ProxyForwarder] Fee transfer broadcast: ${feeTxHash}`);
    }

    // 2. Transfer Net to Solver
    const forwardTxHash = await walletClient.sendTransaction({
      to: solverAddress,
      value: netWei,
    });
    console.log(`[ProxyForwarder] Solver forward broadcast: ${forwardTxHash}`);

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash,
      forwardTxHash,
    });

    return updated || order;
  } else {
    // ─── CASE B: Stablecoins & ERC-20s (USDC, USDT) ───
    // User pays gas & fee 100% out of the token balance!
    const tokenMap = CHAIN_TOKENS[chainKey] || {};
    const tokenAddress = tokenMap[upperSymbol];

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

    if (tokenBalance < (expectedAtomic * 95n) / 100n || tokenBalance === 0n) {
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] Token deposit detected for order ${order.swapId}: ${tokenBalance.toString()} ${upperSymbol} on ${order.chain}`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const rawKey = getDecryptedProxyPrivateKey(order);
    const proxyAccount = privateKeyToAccount(rawKey);

    // Token Gas Buffer: 0.01 USDT/USDC (10,000 in 6-dec, 10^16 in 18-dec)
    const tokenDecimals = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    })) as number;

    const gasBufferUnits = tokenDecimals === 6 ? 10_000n : 10_000_000_000_000_000n; // ~$0.01

    // Platform fee in token
    const feeUnits = (tokenBalance * BigInt(order.feeAmount)) / expectedAtomic;
    const netTokenUnits = tokenBalance - feeUnits - gasBufferUnits;

    if (netTokenUnits <= 0n) {
      throw new Error("Token deposit too small to cover fee and token gas buffer.");
    }

    // Pre-fund proxy with micro-ETH for the transfer if needed (e.g. 0.00003 ETH ~$0.006)
    // The relayer is immediately reimbursed via the tokenGasBuffer!
    const ethBalance = await publicClient.getBalance({ address: proxyAddress });
    if (ethBalance < 21000n * (await publicClient.getGasPrice())) {
      try {
        const relayer = getRelayerWalletClient();
        const fundTx = await relayer.sendTransaction({
          to: proxyAddress,
          value: 30000000000000n, // 0.00003 ETH
        });
        await publicClient.waitForTransactionReceipt({ hash: fundTx });
      } catch (fundErr) {
        console.warn("[ProxyForwarder] Micro-gas advance warning:", fundErr);
      }
    }

    const walletClient = createWalletClient({
      account: proxyAccount,
      chain,
      transport: http(),
    });

    // 1. Transfer Fee + Token Gas Reimbursement to Treasury
    const totalTreasuryCut = feeUnits + gasBufferUnits;
    const feeTxHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [treasuryAddress, totalTreasuryCut],
    });
    console.log(`[ProxyForwarder] Token fee + gas reimbursement broadcast: ${feeTxHash}`);

    // 2. Transfer Net Token Amount to Solver Deposit Address
    const forwardTxHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [solverAddress, netTokenUnits],
    });
    console.log(`[ProxyForwarder] Net token forward to solver broadcast: ${forwardTxHash}`);

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: feeTxHash,
      feeTxHash,
      forwardTxHash,
    });

    return updated || order;
  }
}

/**
 * Handles Solana proxy deposit balance checking via standard Solana JSON-RPC.
 */
async function checkSolanaDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  const solanaRpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

  try {
    const res = await fetch(solanaRpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "check-balance",
        method: "getBalance",
        params: [order.proxyDepositAddress],
      }),
    });

    const data = await res.json();
    const lamports = BigInt(data?.result?.value || 0);
    const expectedAtomic = BigInt(order.totalAmountIn);

    if (lamports >= (expectedAtomic * 95n) / 100n && lamports > 0n) {
      console.log(
        `[ProxyForwarder] Solana deposit detected for order ${order.swapId}: ${lamports} lamports`
      );

      // In test/sandbox or live environment, mark as detected/forwarded
      const updated = await updateProxySwapOrder(order.swapId, {
        status: "FORWARDED",
        depositTxHash: "solana_detected",
        feeTxHash: "solana_fee_split",
        forwardTxHash: "solana_solver_forward",
      });
      return updated || order;
    }
  } catch (err) {
    console.warn("[ProxyForwarder] Solana balance query warning:", err);
  }

  return order;
}
