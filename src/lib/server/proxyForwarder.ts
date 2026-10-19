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

    const walletClient = getWalletClientForChain(order.chain, proxyAccount);

    let zkpayFeeWei = 0n;
    let partnerFeeWei = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeWei = (balanceWei * BigInt(order.zkpayFeeBps)) / 10000n;
      if (order.partnerFeeRecipient && (order.partnerFeeBps ?? 0) > 0) {
        partnerFeeWei = (balanceWei * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else {
      zkpayFeeWei = (balanceWei * BigInt(order.feeAmount)) / expectedAtomic;
    }

    // 1. Transfer Fee to Treasury if fee > 0
    let feeTxHash = "";
    if (zkpayFeeWei > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
      try {
        feeTxHash = await walletClient.sendTransaction({
          account: proxyAccount,
          to: treasuryAddress,
          value: zkpayFeeWei,
        });
        console.log(`[ProxyForwarder] ZkPay fee transfer broadcast: ${feeTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: feeTxHash as `0x${string}` });
      } catch (feeErr) {
        console.warn("[ProxyForwarder] ZkPay fee transfer warning:", feeErr);
      }
    }

    // 2. Transfer Partner fee if specified and > 0
    let partnerTxHash = "";
    if (partnerFeeWei > 0n && order.partnerFeeRecipient && isAddress(order.partnerFeeRecipient)) {
      try {
        partnerTxHash = await walletClient.sendTransaction({
          account: proxyAccount,
          to: getAddress(order.partnerFeeRecipient),
          value: partnerFeeWei,
        });
        console.log(`[ProxyForwarder] Partner fee transfer broadcast: ${partnerTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: partnerTxHash as `0x${string}` });
      } catch (partnerErr) {
        console.warn("[ProxyForwarder] Partner fee transfer warning:", partnerErr);
      }
    }

    // 3. Query exact remaining balance after fees & live gas deduction
    const remainingBalance = await publicClient.getBalance({ address: proxyAddress });
    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const maxFee = feeData?.maxFeePerGas || (await publicClient.getGasPrice());
    const l1Buffer = (chainKey === "base" || chainKey === "arb") ? 600_000_000_000n : 10_000_000_000n;
    const gasReserve = 25000n * maxFee + l1Buffer;
    const netWei = remainingBalance > gasReserve ? remainingBalance - gasReserve : 0n;

    if (netWei <= 0n) {
      throw new Error("Remaining balance too small to cover L2 transfer gas.");
    }

    // 4. Transfer Net to Solver
    const forwardTxHash = await walletClient.sendTransaction({
      account: proxyAccount,
      to: solverAddress,
      value: netWei,
    });
    console.log(`[ProxyForwarder] Solver forward broadcast: ${forwardTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: feeTxHash || forwardTxHash,
      feeTxHash: feeTxHash || partnerTxHash,
      forwardTxHash,
    });

    return updated || order;
  } else {
    // ─── CASE B: Stablecoins & ERC-20s (USDC, USDT) ───
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

    const isStable = upperSymbol === "USDC" || upperSymbol === "USDT";
    // Fixed fee: 0.05 units for USDC/USDT (50,000 in 6 decimals)
    const fixedFeeUnits = isStable
      ? (order.fixedFeeAmount ? BigInt(order.fixedFeeAmount) : (tokenDecimals >= 2 ? 5n * 10n ** BigInt(tokenDecimals - 2) : 0n))
      : 0n;

    let zkpayFeeUnits = 0n;
    let partnerFeeUnits = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeUnits = (tokenBalance * BigInt(order.zkpayFeeBps)) / 10000n + fixedFeeUnits;
      if (order.partnerFeeRecipient && (order.partnerFeeBps ?? 0) > 0) {
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
      // ── GASLESS PATH: Relayer on chainKey submits EIP-3009 transferWithAuthorization ──
      console.log(`[ProxyForwarder] Using gasless EIP-3009 for USDC transfer on ${chainKey}`);

      // 1. ZkPay Fee to Treasury (gasless)
      let feeTxHash = "";
      if (zkpayFeeUnits > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
        try {
          feeTxHash = await executeGaslessUsdcTransfer({
            proxyAccount,
            tokenAddress,
            to: treasuryAddress,
            value: zkpayFeeUnits,
            chainKey,
            publicClient,
          });
          console.log(`[ProxyForwarder] ✓ Gasless ZkPay fee transfer: ${feeTxHash}`);
          await publicClient.waitForTransactionReceipt({ hash: feeTxHash as `0x${string}` });
        } catch (feeErr) {
          console.warn("[ProxyForwarder] Gasless ZkPay fee transfer error:", feeErr);
        }
      }

      // 2. Partner Fee to Partner Recipient (gasless)
      let partnerTxHash = "";
      if (partnerFeeUnits > 0n && order.partnerFeeRecipient && isAddress(order.partnerFeeRecipient)) {
        try {
          partnerTxHash = await executeGaslessUsdcTransfer({
            proxyAccount,
            tokenAddress,
            to: getAddress(order.partnerFeeRecipient),
            value: partnerFeeUnits,
            chainKey,
            publicClient,
          });
          console.log(`[ProxyForwarder] ✓ Gasless partner fee transfer: ${partnerTxHash}`);
          await publicClient.waitForTransactionReceipt({ hash: partnerTxHash as `0x${string}` });
        } catch (partnerErr) {
          console.warn("[ProxyForwarder] Gasless partner fee transfer error:", partnerErr);
        }
      }

      // 3. Net to Solver (gasless)
      const remainingTokenBalance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [proxyAddress],
      })) as bigint;

      const finalNetTokens = remainingTokenBalance > 0n ? remainingTokenBalance : netTokenUnits;

      const forwardTxHash = await executeGaslessUsdcTransfer({
        proxyAccount,
        tokenAddress,
        to: solverAddress,
        value: finalNetTokens,
        chainKey,
        publicClient,
      });
      console.log(`[ProxyForwarder] ✓ Gasless solver forward: ${forwardTxHash}`);
      await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

      const updated = await updateProxySwapOrder(order.swapId, {
        status: "FORWARDED",
        depositTxHash: feeTxHash || forwardTxHash,
        feeTxHash: feeTxHash || partnerTxHash,
        forwardTxHash,
      });

      return updated || order;
    }

    // ── LEGACY PATH: Dynamic Live Gas advance to proxy (for USDT, DAI, etc.) ──
    const nativeBalance = await publicClient.getBalance({ address: proxyAddress });
    const feeData = await publicClient.estimateFeesPerGas().catch(() => null);
    const gasPrice = await publicClient.getGasPrice();
    const maxFee = feeData?.maxFeePerGas || gasPrice;
    const nativeSym = chainKey === "polygon" ? "POL" : chainKey === "bsc" ? "BNB" : "ETH";

    const transfersCount = partnerFeeUnits > 0n ? 3n : 2n;
    const gasNeeded = maxFee * 65000n * transfersCount;

    if (nativeBalance < gasNeeded) {
      try {
        const relayer = getRelayerWalletClientForChain(chainKey);
        const relayerNativeBal = await publicClient.getBalance({ address: relayer.account.address });
        const advanceAmount = gasNeeded - nativeBalance;

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

    // 1. Transfer ZkPay fee
    let feeTxHash = "";
    if (zkpayFeeUnits > 0n && treasuryAddress.toLowerCase() !== solverAddress.toLowerCase()) {
      try {
        feeTxHash = await walletClient.writeContract({
          account: proxyAccount,
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [treasuryAddress, zkpayFeeUnits],
        });
        console.log(`[ProxyForwarder] Token ZkPay fee transfer broadcast: ${feeTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: feeTxHash as `0x${string}` });
      } catch (feeErr) {
        console.warn("[ProxyForwarder] Token ZkPay fee transfer error:", feeErr);
      }
    }

    // 2. Transfer Partner fee
    let partnerTxHash = "";
    if (partnerFeeUnits > 0n && order.partnerFeeRecipient && isAddress(order.partnerFeeRecipient)) {
      try {
        partnerTxHash = await walletClient.writeContract({
          account: proxyAccount,
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [getAddress(order.partnerFeeRecipient), partnerFeeUnits],
        });
        console.log(`[ProxyForwarder] Token partner fee transfer broadcast: ${partnerTxHash}`);
        await publicClient.waitForTransactionReceipt({ hash: partnerTxHash as `0x${string}` });
      } catch (partnerErr) {
        console.warn("[ProxyForwarder] Token partner fee transfer error:", partnerErr);
      }
    }

    // 3. Transfer Net to Solver
    const remainingTokenBalance = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [proxyAddress],
    })) as bigint;

    const finalNetTokens = remainingTokenBalance > 0n ? remainingTokenBalance : netTokenUnits;

    const forwardTxHash = await walletClient.writeContract({
      account: proxyAccount,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [solverAddress, finalNetTokens],
    });
    console.log(`[ProxyForwarder] Net token forward to solver broadcast: ${forwardTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: forwardTxHash as `0x${string}` });

    // 4. Sweep leftover native gas dust back to relayer using live fee + L1 reserve
    try {
      const leftoverNative = await publicClient.getBalance({ address: proxyAddress });
      const currentGas = await publicClient.getGasPrice();
      const l1Buffer = (chainKey === "base" || chainKey === "arb") ? 600_000_000_000n : 10_000_000_000n;
      const dustGasCost = 45000n * currentGas + l1Buffer;
      if (leftoverNative > dustGasCost) {
        const relayerAddr = getRelayerWalletClientForChain(chainKey).account.address;
        const dustTx = await walletClient.sendTransaction({
          account: proxyAccount,
          to: relayerAddr,
          value: leftoverNative - dustGasCost,
          gas: 45000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: dustTx as `0x${string}` });
        console.log(`[ProxyForwarder] ✓ Swept ${leftoverNative - dustGasCost} wei ${nativeSym} dust back to relayer: ${dustTx}`);
      }
    } catch (dustErr) {
      console.warn("[ProxyForwarder] Native dust sweep warning (non-fatal):", dustErr);
    }

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
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

/**
 * Builds, signs (Ed25519), and broadcasts a native Solana transfer transaction
 * with solver transfer, optional ZkPay treasury fee, and optional partner fee.
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
  const {
    fromPubkeyBase58,
    fromPrivKeyHex,
    toPubkeyBase58,
    transferLamports,
    feeRecipientBase58,
    feeLamports = 0n,
    partnerRecipientBase58,
    partnerLamports = 0n,
  } = params;

  const bhResult = await fetchSolanaRpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = bhResult?.value?.blockhash;
  if (!blockhash) {
    throw new Error("Failed to retrieve latest Solana blockhash.");
  }

  const fromPubkeyBuf = to32Bytes(decodeBase58(fromPubkeyBase58));
  const toPubkeyBuf = to32Bytes(decodeBase58(toPubkeyBase58));
  const blockhashBuf = to32Bytes(decodeBase58(blockhash));
  const systemProgramBuf = Buffer.alloc(32); // 11111111111111111111111111111111

  const hasTreasuryFee =
    Boolean(feeRecipientBase58) &&
    feeLamports > 0n &&
    feeRecipientBase58?.trim() !== toPubkeyBase58.trim();

  const hasPartnerFee =
    Boolean(partnerRecipientBase58) &&
    partnerLamports > 0n &&
    partnerRecipientBase58?.trim() !== toPubkeyBase58.trim() &&
    partnerRecipientBase58?.trim() !== feeRecipientBase58?.trim();

  let accountKeys: Buffer;
  let instructions: Buffer;

  if (hasTreasuryFee && hasPartnerFee && feeRecipientBase58 && partnerRecipientBase58) {
    const feePubkeyBuf = to32Bytes(decodeBase58(feeRecipientBase58.trim()));
    const partnerPubkeyBuf = to32Bytes(decodeBase58(partnerRecipientBase58.trim()));

    // 5 Accounts: [from(0), to(1), treasury(2), partner(3), SystemProgram(4)]
    accountKeys = Buffer.concat([
      Buffer.from([5]),
      fromPubkeyBuf,
      toPubkeyBuf,
      feePubkeyBuf,
      partnerPubkeyBuf,
      systemProgramBuf,
    ]);

    // Ix 0: Transfer to solver
    const ix0Data = Buffer.alloc(12);
    ix0Data.writeUInt32LE(2, 0);
    ix0Data.writeBigUInt64LE(transferLamports, 4);
    const ix0 = Buffer.concat([
      Buffer.from([4]), // program index = 4
      Buffer.from([2, 0, 1]), // from(0), to(1)
      Buffer.from([12]),
      ix0Data,
    ]);

    // Ix 1: Transfer fee to treasury
    const ix1Data = Buffer.alloc(12);
    ix1Data.writeUInt32LE(2, 0);
    ix1Data.writeBigUInt64LE(feeLamports, 4);
    const ix1 = Buffer.concat([
      Buffer.from([4]),
      Buffer.from([2, 0, 2]), // from(0), treasury(2)
      Buffer.from([12]),
      ix1Data,
    ]);

    // Ix 2: Transfer fee to partner
    const ix2Data = Buffer.alloc(12);
    ix2Data.writeUInt32LE(2, 0);
    ix2Data.writeBigUInt64LE(partnerLamports, 4);
    const ix2 = Buffer.concat([
      Buffer.from([4]),
      Buffer.from([2, 0, 3]), // from(0), partner(3)
      Buffer.from([12]),
      ix2Data,
    ]);

    instructions = Buffer.concat([Buffer.from([3]), ix0, ix1, ix2]);
  } else if (hasTreasuryFee && feeRecipientBase58) {
    const feePubkeyBuf = to32Bytes(decodeBase58(feeRecipientBase58.trim()));

    // 4 Accounts: [from(0), to(1), treasury(2), SystemProgram(3)]
    accountKeys = Buffer.concat([
      Buffer.from([4]),
      fromPubkeyBuf,
      toPubkeyBuf,
      feePubkeyBuf,
      systemProgramBuf,
    ]);

    const ix0Data = Buffer.alloc(12);
    ix0Data.writeUInt32LE(2, 0);
    ix0Data.writeBigUInt64LE(transferLamports, 4);
    const ix0 = Buffer.concat([
      Buffer.from([3]),
      Buffer.from([2, 0, 1]),
      Buffer.from([12]),
      ix0Data,
    ]);

    const ix1Data = Buffer.alloc(12);
    ix1Data.writeUInt32LE(2, 0);
    ix1Data.writeBigUInt64LE(feeLamports, 4);
    const ix1 = Buffer.concat([
      Buffer.from([3]),
      Buffer.from([2, 0, 2]),
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
      Buffer.from([2]),
      Buffer.from([2, 0, 1]),
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
      skipPreflight: true,
      maxRetries: 5,
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
    const balanceRes = await fetchSolanaRpc("getBalance", [order.proxyDepositAddress, { commitment: "confirmed" }]);
    const lamports = BigInt(balanceRes?.value || 0);
    // Exact Solana transaction fee: 1 signature = 5,000 lamports (0.000005 SOL)
    // CRITICAL: On Solana, an account must have either >= 890,880 lamports (rent-exempt) OR exactly 0 lamports.
    // Setting network fee to exactly 5,000 lamports ensures 0 lamports remain, cleanly closing the proxy account without rent errors.
    const SOLANA_NETWORK_FEE = 5000n;

    const expectedAtomic = BigInt(order.totalAmountIn);
    if (lamports < (expectedAtomic * 90n) / 100n || lamports <= SOLANA_NETWORK_FEE) {
      return order; // Awaiting deposit
    }

    console.log(
      `[ProxyForwarder] Solana deposit detected for order ${order.swapId}: ${lamports} lamports (address: ${order.proxyDepositAddress})`
    );

    await updateProxySwapOrder(order.swapId, { status: "FORWARDING" });

    const privKeyHex = getDecryptedProxyPrivateKey(order);

    let zkpayFeeLamports = 0n;
    let partnerFeeLamports = 0n;

    if (order.zkpayFeeBps !== undefined) {
      zkpayFeeLamports = (lamports * BigInt(order.zkpayFeeBps)) / 10000n;
      if (order.partnerFeeRecipient && (order.partnerFeeBps ?? 0) > 0) {
        partnerFeeLamports = (lamports * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else {
      zkpayFeeLamports = (lamports * BigInt(order.feeAmount)) / expectedAtomic;
    }

    // Rent exemption validation for fee recipients:
    // If a recipient does not exist on Solana (0 balance) and receives < 890,880 lamports, Solana rejects for rent.
    let effectiveZkpayFee = zkpayFeeLamports;
    if (effectiveZkpayFee > 0n && effectiveZkpayFee < 890_880n && order.treasuryAddress) {
      try {
        const treasuryBalRes = await fetchSolanaRpc("getBalance", [order.treasuryAddress]);
        const treasuryBal = BigInt(treasuryBalRes?.value || 0);
        if (treasuryBal === 0n) {
          console.warn(`[ProxyForwarder] Solana treasury ${order.treasuryAddress} has 0 balance and fee ${effectiveZkpayFee} is below rent threshold. Forwarding to solver.`);
          effectiveZkpayFee = 0n;
        }
      } catch {
        // proceed
      }
    }

    let effectivePartnerFee = partnerFeeLamports;
    if (effectivePartnerFee > 0n && effectivePartnerFee < 890_880n && order.partnerFeeRecipient) {
      try {
        const partnerBalRes = await fetchSolanaRpc("getBalance", [order.partnerFeeRecipient]);
        const partnerBal = BigInt(partnerBalRes?.value || 0);
        if (partnerBal === 0n) {
          console.warn(`[ProxyForwarder] Solana partner ${order.partnerFeeRecipient} has 0 balance and fee ${effectivePartnerFee} is below rent threshold. Forwarding to solver.`);
          effectivePartnerFee = 0n;
        }
      } catch {
        // proceed
      }
    }

    const available = lamports - SOLANA_NETWORK_FEE - effectiveZkpayFee - effectivePartnerFee;
    if (available <= 0n) {
      throw new Error(`Solana deposit (${lamports} lamports) too small to cover network gas fee and fees.`);
    }

    const solverLamports = available;

    console.log(
      `[ProxyForwarder] Sweeping SOL: ${solverLamports} -> Solver (${order.solverDepositAddress}), ${effectiveZkpayFee} -> Treasury (${order.treasuryAddress}), ${effectivePartnerFee} -> Partner (${order.partnerFeeRecipient || "none"})`
    );

    const txHash = await sendSolanaTransfer({
      fromPubkeyBase58: order.proxyDepositAddress,
      fromPrivKeyHex: privKeyHex,
      toPubkeyBase58: order.solverDepositAddress,
      transferLamports: solverLamports,
      feeRecipientBase58: effectiveZkpayFee > 0n ? order.treasuryAddress : null,
      feeLamports: effectiveZkpayFee,
      partnerRecipientBase58: (effectivePartnerFee > 0n && order.partnerFeeRecipient) ? order.partnerFeeRecipient : null,
      partnerLamports: effectivePartnerFee,
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: txHash,
      feeTxHash: (effectiveZkpayFee > 0n || effectivePartnerFee > 0n) ? txHash : undefined,
      forwardTxHash: txHash,
    });

    return updated || order;
  } catch (err: any) {
    console.error("[ProxyForwarder] Solana balance/sweep error:", err);
    // Revert status to PENDING_DEPOSIT and record error message so the sweeper daemon retries
    await updateProxySwapOrder(order.swapId, {
      status: "PENDING_DEPOSIT",
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
    const { getLtcBalanceAndUtxos, sweepLtcDeposit } = await import("./ltcClient");
    const { balanceSatoshis, utxos } = await getLtcBalanceAndUtxos(order.proxyDepositAddress);
    const expectedAtomic = BigInt(order.totalAmountIn);

    if (balanceSatoshis < (expectedAtomic * 90n) / 100n || balanceSatoshis <= 5000n) {
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
      if (order.partnerFeeRecipient && (order.partnerFeeBps ?? 0) > 0) {
        partnerFeeSats = (balanceSatoshis * BigInt(order.partnerFeeBps!)) / 10000n;
      }
    } else {
      zkpayFeeSats = (balanceSatoshis * BigInt(order.feeAmount)) / expectedAtomic;
    }

    const txHash = await sweepLtcDeposit({
      proxyAddress: order.proxyDepositAddress,
      privKeyHex,
      solverAddress: order.solverDepositAddress,
      treasuryAddress: order.treasuryAddress,
      partnerAddress: order.partnerFeeRecipient,
      zkpayFeeSatoshis: zkpayFeeSats,
      partnerFeeSatoshis: partnerFeeSats,
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: "FORWARDED",
      depositTxHash: txHash,
      feeTxHash: (zkpayFeeSats > 0n || partnerFeeSats > 0n) ? txHash : undefined,
      forwardTxHash: txHash,
    });

    return updated || order;
  } catch (err) {
    console.warn("[ProxyForwarder] LTC balance/sweep error:", err);
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
  const upperSymbol = order.fromAsset.toUpperCase();

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
      error: action === "refund" ? `Manually refunded to ${destination}` : undefined,
    });

    const explorerUrl = getExplorerTxUrl("sol", txHash);

    return {
      success: true,
      message: `Successfully swept ${sweepAmount} lamports to ${destination}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(sweepAmount) / 1e9).toFixed(6) + " SOL",
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
    const sweepAmountSats = balanceSatoshis - MINER_FEE_SATOSHIS;

    const txHash = await sweepLtcDeposit({
      proxyAddress: order.proxyDepositAddress,
      privKeyHex,
      solverAddress: destination,
      treasuryAddress: destination,
      zkpayFeeSatoshis: 0n,
      partnerFeeSatoshis: 0n,
    });

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? `Manually refunded to ${destination}` : undefined,
    });

    const explorerUrl = getExplorerTxUrl("ltc", txHash);

    return {
      success: true,
      message: `Successfully swept ${(Number(sweepAmountSats) / 1e8).toFixed(8)} LTC to ${destination}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(sweepAmountSats) / 1e8).toFixed(8) + " LTC",
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

  const upperSymbol = order.fromAsset.toUpperCase();
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
    // We reserve 600 gwei (~0.0000006 ETH) for L1 DA overhead on Base/Arb to ensure balance covers cost.
    const l1DataReserve = (normChain === "base" || normChain === "arb") ? 600_000_000_000n : 10_000_000_000n;
    const totalGasReserve = (gasLimit * maxFee) + l1DataReserve;

    if (balanceWei <= totalGasReserve) {
      return {
        success: false,
        message: `Proxy address has insufficient native balance to sweep (${balanceWei} wei). Total gas and L1 DA reserve required: ${totalGasReserve} wei.`,
        order,
      };
    }

    const maxSweepable = balanceWei - totalGasReserve;
    const sweepAmount = options?.amount
      ? (parseUnits(options.amount, 18) > maxSweepable ? maxSweepable : parseUnits(options.amount, 18))
      : maxSweepable;

    if (sweepAmount <= 0n) {
      return {
        success: false,
        message: `Calculated sweep amount is 0 wei after gas reserve.`,
        order,
      };
    }

    const txParams: any = {
      account: proxyAccount,
      to: cleanDestination,
      value: sweepAmount,
      gas: gasLimit,
    };
    if (feeData?.maxFeePerGas) {
      txParams.maxFeePerGas = maxFee;
      txParams.maxPriorityFeePerGas = maxPriorityFee;
    } else {
      txParams.gasPrice = maxFee;
    }

    const txHash = await walletClient.sendTransaction(txParams);

    await publicClient.waitForTransactionReceipt({ hash: txHash }).catch(() => {});

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? `Manually refunded to ${cleanDestination}` : undefined,
    });

    const explorerUrl = getExplorerTxUrl(order.chain, txHash);

    return {
      success: true,
      message: `Successfully swept ${(Number(sweepAmount) / 1e18).toFixed(6)} native gas tokens to ${cleanDestination}!`,
      txHash,
      order: updated,
      recoveredAmount: (Number(sweepAmount) / 1e18).toFixed(6),
      destination: cleanDestination,
      explorerUrl,
    };
  } else {
    // ERC-20 token sweep (Supports order's asset, explicit tokenAddress, or auto-detecting mismatched token)
    let tokenAddress: `0x${string}` | null = null;

    if (options?.tokenAddress && isAddress(options.tokenAddress)) {
      tokenAddress = getAddress(options.tokenAddress);
    } else {
      tokenAddress = CHAIN_TOKENS[normChain]?.[upperSymbol] || null;
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

    const sweepAmount = options?.amount
      ? parseUnits(options.amount, decimals)
      : tokenBalance;

    // Check if USDC supports gasless EIP-3009 transfer
    if (EIP3009_USDC[normChain] && tokenAddress.toLowerCase() === EIP3009_USDC[normChain].toLowerCase()) {
      try {
        console.log(`[Recover] Attempting gasless EIP-3009 USDC transfer on ${normChain}...`);
        const txHash = await executeGaslessUsdcTransfer({
          proxyAccount,
          tokenAddress,
          to: cleanDestination,
          value: sweepAmount,
          chainKey: normChain,
          publicClient,
        });

        const updated = await updateProxySwapOrder(order.swapId, {
          status: action === "refund" ? "SETTLED" : "FORWARDED",
          forwardTxHash: txHash,
          error: action === "refund" ? `Manually refunded to ${cleanDestination}` : undefined,
        });

        const explorerUrl = getExplorerTxUrl(order.chain, txHash);
        return {
          success: true,
          message: `Successfully swept ${formatUnits(sweepAmount, decimals)} ${tokenSymbol} via gasless relayer to ${cleanDestination}!`,
          txHash,
          order: updated,
          recoveredAmount: `${formatUnits(sweepAmount, decimals)} ${tokenSymbol}`,
          destination: cleanDestination,
          explorerUrl,
        };
      } catch (gaslessErr: any) {
        console.warn(`[Recover] Gasless transfer failed, falling back to standard transfer:`, gaslessErr?.message || gaslessErr);
      }
    }

    const ethBalance = await publicClient.getBalance({ address: proxyAccount.address });
    const gasPrice = await publicClient.getGasPrice();
    const minGasNeeded = 60000n * gasPrice;

    if (ethBalance < minGasNeeded) {
      try {
        const relayer = getRelayerWalletClientForChain(normChain);
        const relayerBal = await publicClient.getBalance({ address: relayer.account.address });
        const advanceAmount = normChain === "polygon" ? parseUnits("0.05", 18) : (normChain === "bsc" ? parseUnits("0.001", 18) : 30_000_000_000_000n);

        if (relayerBal > advanceAmount * 2n) {
          const fundTx = await relayer.sendTransaction({
            account: relayer.account,
            to: proxyAccount.address,
            value: advanceAmount,
          });
          await publicClient.waitForTransactionReceipt({ hash: fundTx });
          console.log(`[Recover] ✓ Gas advance to proxy ${proxyAccount.address} on ${normChain}: ${fundTx}`);
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

    const txHash = await walletClient.writeContract({
      account: proxyAccount,
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [cleanDestination, sweepAmount],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash }).catch(() => {});

    const updated = await updateProxySwapOrder(order.swapId, {
      status: action === "refund" ? "SETTLED" : "FORWARDED",
      forwardTxHash: txHash,
      error: action === "refund" ? `Manually refunded to ${cleanDestination}` : undefined,
    });

    const explorerUrl = getExplorerTxUrl(order.chain, txHash);

    return {
      success: true,
      message: `Successfully swept ${formatUnits(sweepAmount, decimals)} ${tokenSymbol} to ${cleanDestination}!`,
      txHash,
      order: updated,
      recoveredAmount: `${formatUnits(sweepAmount, decimals)} ${tokenSymbol}`,
      destination: cleanDestination,
      explorerUrl,
    };
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

