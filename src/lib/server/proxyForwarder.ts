import crypto from "crypto";
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
  getProxyOrderBySwapId,
  getPendingProxyOrders,
  updateProxySwapOrder,
  getDecryptedProxyPrivateKey,
} from "./proxySwapStore";
import { getRelayerWalletClient } from "./relayer";
import { decodeBase58 } from "./proxyWallets";

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

    const walletClient = createWalletClient({
      account: proxyAccount,
      chain,
      transport: http(),
    });

    const feeWei = (balanceWei * BigInt(order.feeAmount)) / expectedAtomic;

    // 1. Transfer Fee to Treasury if fee > 0
    let feeTxHash = "";
    if (feeWei > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
      try {
        feeTxHash = await walletClient.sendTransaction({
          to: treasuryAddress,
          value: feeWei,
        });
        console.log(`[ProxyForwarder] Fee transfer broadcast: ${feeTxHash}`);
        // Wait for fee receipt so nonce is incremented and state is mined
        await publicClient.waitForTransactionReceipt({ hash: feeTxHash as `0x${string}` });
      } catch (feeErr) {
        console.warn("[ProxyForwarder] Fee transfer warning, proceeding with solver forward:", feeErr);
      }
    }

    // 2. Query exact remaining balance after fee & gas deduction
    const remainingBalance = await publicClient.getBalance({ address: proxyAddress });
    const currentGasPrice = await publicClient.getGasPrice();
    const gasReserve = 30000n * currentGasPrice; // Safe buffer for native L2 transfer
    const netWei = remainingBalance > gasReserve ? remainingBalance - gasReserve : 0n;

    if (netWei <= 0n) {
      throw new Error("Remaining balance too small to cover L2 transfer gas.");
    }

    // 3. Transfer Net to Solver
    const forwardTxHash = await walletClient.sendTransaction({
      to: solverAddress,
      value: netWei,
    });
    console.log(`[ProxyForwarder] Solver forward broadcast: ${forwardTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash,
      forwardTxHash,
    });

    return updated || order;
  } else {
    // ─── CASE B: Stablecoins & ERC-20s (USDC, USDT) ───
    // Dynamically resolve token address from CHAIN_TOKENS or regex match from originAssetId
    const tokenMap = CHAIN_TOKENS[chainKey] || {};
    let tokenAddress: `0x${string}` | undefined = tokenMap[upperSymbol];

    if (!tokenAddress && order.originAssetId.includes("0x")) {
      const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
      if (match) {
        tokenAddress = getAddress(match[0]);
      }
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

    const gasBufferUnits = tokenDecimals === 6 ? 10_000n : 10_000_000_000_000_000n; // ~$0.01

    // Platform fee in token
    const feeUnits = (tokenBalance * BigInt(order.feeAmount)) / expectedAtomic;
    const netTokenUnits = tokenBalance > feeUnits + gasBufferUnits
      ? tokenBalance - feeUnits - gasBufferUnits
      : tokenBalance - feeUnits;

    if (netTokenUnits <= 0n) {
      throw new Error("Token deposit too small to cover fee and token gas buffer.");
    }

    // Pre-fund proxy with micro-ETH for the transfer if needed (e.g. 0.00003 ETH ~$0.006)
    // The relayer is immediately reimbursed via the tokenGasBuffer!
    const ethBalance = await publicClient.getBalance({ address: proxyAddress });
    const gasPrice = await publicClient.getGasPrice();
    if (ethBalance < 35000n * gasPrice) {
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
    let feeTxHash = "";
    const totalTreasuryCut = feeUnits + gasBufferUnits;
    if (totalTreasuryCut > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
      try {
        feeTxHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [treasuryAddress, totalTreasuryCut],
        });
        console.log(`[ProxyForwarder] Token fee + gas reimbursement broadcast: ${feeTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: feeTxHash as `0x${string}` });
      } catch (feeErr) {
        console.warn("[ProxyForwarder] Token fee transfer error, continuing to solver:", feeErr);
      }
    }

    // 2. Query exact remaining token balance and transfer net to solver
    const remainingTokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAddress],
    })) as bigint;

    const finalNetTokens = remainingTokenBalance > 0n ? remainingTokenBalance : netTokenUnits;

    const forwardTxHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [solverAddress, finalNetTokens],
    });
    console.log(`[ProxyForwarder] Net token forward to solver broadcast: ${forwardTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash,
      forwardTxHash,
    });

    return updated || order;
  }
}

const SOLANA_RPCS = [
  process.env.SOLANA_RPC_URL,
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.rpc.extrnode.com",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
].filter(Boolean) as string[];

async function fetchSolanaRpc(method: string, params: any[]): Promise<any> {
  let lastError: any = null;
  for (const rpcUrl of SOLANA_RPCS) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `sol-${Date.now()}`,
          method,
          params,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) {
        lastError = data.error;
        continue;
      }
      return data.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`All Solana RPCs failed for ${method}: ${lastError?.message || JSON.stringify(lastError)}`);
}

/**
 * Builds, signs (Ed25519), and broadcasts a native Solana transfer transaction
 * with 1 or 2 instructions (solver transfer + optional treasury fee).
 */
async function sendSolanaTransfer(params: {
  fromPubkeyBase58: string;
  fromPrivKeyHex: string;
  toPubkeyBase58: string;
  transferLamports: bigint;
  feeRecipientBase58?: string | null;
  feeLamports?: bigint;
}): Promise<string> {
  const {
    fromPubkeyBase58,
    fromPrivKeyHex,
    toPubkeyBase58,
    transferLamports,
    feeRecipientBase58,
    feeLamports = 0n,
  } = params;

  const bhResult = await fetchSolanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = bhResult?.value?.blockhash;
  if (!blockhash) {
    throw new Error("Failed to retrieve latest Solana blockhash.");
  }

  const fromPubkeyBuf = decodeBase58(fromPubkeyBase58);
  const toPubkeyBuf = decodeBase58(toPubkeyBase58);
  const blockhashBuf = decodeBase58(blockhash);
  const systemProgramBuf = Buffer.alloc(32); // 11111111111111111111111111111111

  const hasFeeTransfer =
    Boolean(feeRecipientBase58) &&
    feeLamports > 0n &&
    feeRecipientBase58?.trim() !== toPubkeyBase58.trim();

  let accountKeys: Buffer;
  let instructions: Buffer;

  if (hasFeeTransfer && feeRecipientBase58) {
    const feePubkeyBuf = decodeBase58(feeRecipientBase58.trim());
    // 4 Accounts: [from(0), to(1), fee(2), SystemProgram(3)]
    accountKeys = Buffer.concat([
      Buffer.from([4]),
      fromPubkeyBuf,
      toPubkeyBuf,
      feePubkeyBuf,
      systemProgramBuf,
    ]);

    // Ix 0: Transfer to solver
    const ix0Data = Buffer.alloc(12);
    ix0Data.writeUInt32LE(2, 0); // Transfer = 2
    ix0Data.writeBigUInt64LE(transferLamports, 4);

    const ix0 = Buffer.concat([
      Buffer.from([3]), // program index = 3
      Buffer.from([2, 0, 1]), // 2 accounts: 0 (from), 1 (to)
      Buffer.from([12]),
      ix0Data,
    ]);

    // Ix 1: Transfer fee to treasury
    const ix1Data = Buffer.alloc(12);
    ix1Data.writeUInt32LE(2, 0);
    ix1Data.writeBigUInt64LE(feeLamports, 4);

    const ix1 = Buffer.concat([
      Buffer.from([3]), // program index = 3
      Buffer.from([2, 0, 2]), // 2 accounts: 0 (from), 2 (fee)
      Buffer.from([12]),
      ix1Data,
    ]);

    instructions = Buffer.concat([Buffer.from([2]), ix0, ix1]);
  } else {
    // 3 Accounts: [from(0), to(1), SystemProgram(2)]
    accountKeys = Buffer.concat([
      Buffer.from([3]),
      fromPubkeyBuf,
      toPubkeyBuf,
      systemProgramBuf,
    ]);

    const ix0Data = Buffer.alloc(12);
    ix0Data.writeUInt32LE(2, 0);
    ix0Data.writeBigUInt64LE(transferLamports, 4);

    const ix0 = Buffer.concat([
      Buffer.from([2]), // program index = 2
      Buffer.from([2, 0, 1]), // 2 accounts: 0 (from), 1 (to)
      Buffer.from([12]),
      ix0Data,
    ]);

    instructions = Buffer.concat([Buffer.from([1]), ix0]);
  }

  // Header: 1 req sig, 0 readonly signed, 1 readonly unsigned (SystemProgram)
  const header = Buffer.from([1, 0, 1]);
  const message = Buffer.concat([header, accountKeys, blockhashBuf, instructions]);

  // Sign with Ed25519
  const cleanHex = fromPrivKeyHex.replace(/^0x/, "");
  const rawPrivSeed = Buffer.from(cleanHex, "hex").subarray(0, 32);

  const pkcs8Der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    rawPrivSeed,
  ]);
  const privKeyObj = crypto.createPrivateKey({
    key: pkcs8Der,
    format: "der",
    type: "pkcs8",
  });

  const signature = crypto.sign(null, message, privKeyObj);

  const wireTx = Buffer.concat([
    Buffer.from([1]), // 1 signature
    signature,
    message,
  ]);

  const wireTxBase64 = wireTx.toString("base64");

  const txSignature = await fetchSolanaRpc("sendTransaction", [
    wireTxBase64,
    {
      encoding: "base64",
      preflightCommitment: "confirmed",
      skipPreflight: false,
    },
  ]);

  console.log(`[ProxyForwarder] Solana on-chain transfer broadcast success: ${txSignature}`);
  return txSignature;
}

/**
 * Handles Solana proxy deposit balance checking and executes real on-chain forward.
 */
async function checkSolanaDeposit(order: ProxySwapOrder): Promise<ProxySwapOrder> {
  try {
    const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress]);
    const lamports = BigInt(balanceRes?.value || 0);
    const MIN_NETWORK_FEE = 5000n; // 0.000005 SOL

    if (lamports > MIN_NETWORK_FEE) {
      console.log(
        `[ProxyForwarder] Solana deposit detected for order ${order.swapId}: ${lamports} lamports (address: ${order.proxyDepositAddress})`
      );

      const privKeyHex = getDecryptedProxyPrivateKey(order);
      const expectedSolverLamports = BigInt(order.netSwapAmount);
      const available = lamports - MIN_NETWORK_FEE;

      let solverLamports = expectedSolverLamports;
      let feeLamports = 0n;

      if (available <= expectedSolverLamports) {
        solverLamports = available;
        feeLamports = 0n;
      } else {
        solverLamports = expectedSolverLamports;
        feeLamports = available - expectedSolverLamports;
      }

      console.log(
        `[ProxyForwarder] Sweeping SOL: ${solverLamports} -> Solver (${order.solverDepositAddress}), ${feeLamports} -> Treasury (${order.treasuryAddress})`
      );

      const txHash = await sendSolanaTransfer({
        fromPubkeyBase58: order.proxyDepositAddress,
        fromPrivKeyHex: privKeyHex,
        toPubkeyBase58: order.solverDepositAddress,
        transferLamports: solverLamports,
        feeRecipientBase58: feeLamports > 0n ? order.treasuryAddress : null,
        feeLamports,
      });

      const updated = await updateProxySwapOrder(order.swapId, {
        status: "FORWARDED",
        depositTxHash: txHash,
        feeTxHash: feeLamports > 0n ? txHash : undefined,
        forwardTxHash: txHash,
      });

      return updated || order;
    }
  } catch (err) {
    console.warn("[ProxyForwarder] Solana balance/sweep error:", err);
  }

  return order;
}

export interface RecoverResult {
  success: boolean;
  message: string;
  txHash?: string;
  order?: ProxySwapOrder | null;
  recoveredAmount?: string;
  destination?: string;
}

/**
 * Permanent emergency recovery function for any stuck deposit across Solana or EVM chains.
 * Can sweep funds directly to Near Intents solver address or refund 100% to the user.
 */
export async function recoverProxyDeposit(
  addressOrSwapId: string,
  options?: {
    action?: "forward" | "refund";
    customRecipient?: string;
  }
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
  const action = options?.action || "forward";

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
    const destination =
      options?.customRecipient ||
      (action === "refund" ? order.refundTo : order.solverDepositAddress);

    const sweepAmount = lamports - MIN_NETWORK_FEE;

    const txHash = await sendSolanaTransfer({
      fromPubkeyBase58: order.proxyDepositAddress,
      fromPrivKeyHex: privKeyHex,
      toPubkeyBase58: destination,
      transferLamports: sweepAmount,
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? "Manually refunded to user" : undefined,
    });

    return {
      success: true,
      message: `Successfully swept ${sweepAmount} lamports to ${destination}!`,
      txHash,
      order: updated,
      recoveredAmount: sweepAmount.toString(),
      destination,
    };
  }

  // 2. EVM RECOVERY (Base, Arbitrum, Polygon, BSC)
  const publicClient = getPublicClientForChain(order.chain);
  const privKeyHex = getDecryptedProxyPrivateKey(order);
  const proxyAccount = privateKeyToAccount(privKeyHex);
  const { chain } = getChainConfig(order.chain);

  const walletClient = createWalletClient({
    account: proxyAccount,
    chain,
    transport: http(),
  });

  const destination = (options?.customRecipient ||
    (action === "refund" ? order.refundTo : order.solverDepositAddress)) as `0x${string}`;

  const upperSymbol = order.fromAsset.toUpperCase();
  const isNative =
    upperSymbol === "ETH" ||
    upperSymbol === "BNB" ||
    upperSymbol === "POL" ||
    upperSymbol === "MATIC";

  if (isNative) {
    const balanceWei = await publicClient.getBalance({ address: proxyAccount.address });
    const gasPrice = await publicClient.getGasPrice();
    const gasLimit = 21000n;
    const gasCost = gasLimit * gasPrice;

    if (balanceWei <= gasCost) {
      return {
        success: false,
        message: `Proxy address has insufficient balance to sweep (${balanceWei} wei).`,
        order,
      };
    }

    const sweepAmount = balanceWei - gasCost;
    const txHash = await walletClient.sendTransaction({
      to: destination,
      value: sweepAmount,
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? "Manually refunded to user" : undefined,
    });

    return {
      success: true,
      message: `Successfully swept ${sweepAmount} wei to ${destination}!`,
      txHash,
      order: updated,
      recoveredAmount: sweepAmount.toString(),
      destination,
    };
  } else {
    // ERC-20 token sweep
    let tokenAddress = CHAIN_TOKENS[order.chain]?.[upperSymbol];
    if (!tokenAddress && order.originAssetId.includes("0x")) {
      const match = order.originAssetId.match(/0x[a-fA-F0-9]{40}/);
      if (match) {
        tokenAddress = getAddress(match[0]);
      }
    }

    if (!tokenAddress) {
      throw new Error(`Cannot resolve ERC-20 token address for ${order.fromAsset} on ${order.chain}`);
    }

    const tokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAccount.address],
    })) as bigint;

    if (tokenBalance === 0n) {
      return {
        success: false,
        message: `Proxy address has 0 ${order.fromAsset} token balance.`,
        order,
      };
    }

    const ethBalance = await publicClient.getBalance({ address: proxyAccount.address });
    if (ethBalance < 21000n * (await publicClient.getGasPrice())) {
      try {
        const relayer = getRelayerWalletClient();
        const fundTx = await relayer.sendTransaction({
          to: proxyAccount.address,
          value: 30000000000000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: fundTx });
      } catch (e) {
        console.warn("[Recover] Gas advance warning:", e);
      }
    }

    const txHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [destination, tokenBalance],
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? "Manually refunded to user" : undefined,
    });

    return {
      success: true,
      message: `Successfully swept ${tokenBalance} tokens to ${destination}!`,
      txHash,
      order: updated,
      recoveredAmount: tokenBalance.toString(),
      destination,
    };
  }
}

let sweeperInterval: NodeJS.Timeout | null = null;
let isSweeperTickActive = false;

/**
 * Starts the automatic background sweeper daemon.
 * Periodically scans all PENDING_DEPOSIT proxy orders:
 * 1. If an order has received funds, it forwards to solver immediately.
 * 2. If an order has expired (past deadline) with funds deposited, it automatically refunds 100% to the user's refundTo address!
 * 3. If an order has 0 balance and expired > 1 hour ago, marks status as EXPIRED.
 */
export function ensureProxySweeperDaemonRunning() {
  if (sweeperInterval) return;

  console.log("[ProxySweeperDaemon] Starting automated background proxy deposit sweeper (interval: 12s)...");

  sweeperInterval = setInterval(async () => {
    if (isSweeperTickActive) return;
    isSweeperTickActive = true;

    try {
      const pendingOrders = await getPendingProxyOrders();
      if (!pendingOrders || pendingOrders.length === 0) {
        return;
      }

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
            } else {
              // No funds were deposited and order expired > 1 hour ago -> mark EXPIRED
              if (Date.now() > order.expiresAt + 3600_000) {
                await updateProxySwapOrder(order.swapId, { status: "EXPIRED" });
              }
            }
          } else {
            // Order is active within deadline -> attempt forward sweep
            await checkAndForwardProxyDeposit(order);
          }
        } catch (itemErr) {
          console.warn(`[ProxySweeperDaemon] Error sweeping order ${order.swapId}:`, itemErr);
        }
      }
    } catch (daemonErr) {
      console.warn("[ProxySweeperDaemon] Sweeper tick error:", daemonErr);
    } finally {
      isSweeperTickActive = false;
    }
  }, 12_000);

  if (sweeperInterval.unref) {
    sweeperInterval.unref();
  }
}

// Auto-start daemon when module loads
try {
  ensureProxySweeperDaemonRunning();
} catch (e) {
  // Safe fallback
}

