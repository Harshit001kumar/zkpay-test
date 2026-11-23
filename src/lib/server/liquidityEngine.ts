import { formatUnits, getAddress, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  type PoolAssetDefinition,
  resolvePoolAsset,
  getLiquidityPoolConfig,
  getRecentLiquidityOutflowUsd,
  recordLiquidityTransfer,
} from "./liquidityConfig";
import {
  getLiquidityBalances,
  getLiquidityWalletAddress,
  sendFromLiquidityWallet,
  verifyLiquidityPayoutOnChain,
} from "./liquidityWallets";
import {
  type ProxySwapOrder,
  claimOrderForPayout,
  getProxyOrderBySwapId,
  updateProxySwapOrder,
  getDecryptedProxyPrivateKey,
} from "./proxySwapStore";
import { getFreshTokenPriceUsd, getLiveTokenPriceUsd } from "./priceService";
import { getLtcBalanceAndUtxos, sweepLtcDeposit, LTC_DUST_THRESHOLD_SATOSHIS } from "./ltcClient";
import {
  getResilientPublicClientForChain,
  getSecondaryPolygonPublicClient,
  fetchResilientSolanaRpc,
  getEvmRpcConfig,
} from "./rpcConfig";
import { createWalletClient, fallback } from "viem";
import {
  sendResilientErc20Transfer,
  sendSolanaMultiTransfer,
  waitForSolanaSignature,
  recoverProxyDeposit,
  getExplorerTxUrl,
} from "./proxyForwarder";
import { creditPartnerFeeOnSettlement } from "./partnerBalanceStore";

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

const POLYGON_FINALITY_CONFIRMATIONS = 32n;

/**
 * Pure BigInt fixed-point output calculation (10^8 USD scaling) to avoid JS float overflow on 18-dec tokens.
 */
export function computeOutputAtomicBigInt(
  netInAtomic: bigint,
  originDecimals: number,
  originPriceUsd: number,
  destDecimals: number,
  destPriceUsd: number,
  spreadBps: number
): bigint {
  if (
    netInAtomic <= 0n ||
    !Number.isFinite(originPriceUsd) ||
    !Number.isFinite(destPriceUsd) ||
    originPriceUsd <= 0 ||
    destPriceUsd <= 0
  ) {
    return 0n;
  }
  const origPriceE8 = BigInt(Math.round(originPriceUsd * 1e8));
  const destPriceE8 = BigInt(Math.round(destPriceUsd * 1e8));
  if (origPriceE8 <= 0n || destPriceE8 <= 0n) return 0n;

  const clampedSpread = BigInt(Math.min(500, Math.max(0, Math.round(spreadBps))));
  const numerator =
    netInAtomic * origPriceE8 * (10000n - clampedSpread) * 10n ** BigInt(destDecimals);
  const denominator = destPriceE8 * 10000n * 10n ** BigInt(originDecimals);
  return numerator / denominator;
}

function formatCleanHuman(atomic: bigint, decimals: number, maxFrac = 6): string {
  const raw = formatUnits(atomic, decimals);
  if (!raw.includes(".")) return raw;
  const [whole, frac] = raw.split(".");
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export interface InternalQuoteAttempt {
  eligible: boolean;
  reason?: string;
  originDef?: PoolAssetDefinition;
  destDef?: PoolAssetDefinition;
  amountOutAtomic?: string;
  amountOutFormatted?: string;
  minAmountOutAtomic?: string;
  minAmountOutFormatted?: string;
  originPriceUsd?: number;
  destPriceUsd?: number;
  orderUsd?: number;
  timeEstimateSeconds?: number;
}

/**
 * Evaluates whether a swap can be fulfilled directly by ZkPay's Internal Liquidity Pool
 * and computes the exact destination payout using live USD prices and identical fee math.
 */
export async function quoteInternalLiquiditySwap(params: {
  originAssetId: string;
  destinationAssetId: string;
  originChain: string;
  destinationChain: string;
  totalAmountIn: string;
  netSwapAmount: string;
  slippageBps?: number | null;
}): Promise<InternalQuoteAttempt> {
  const originDef = resolvePoolAsset(params.originAssetId, params.originChain);
  const destDef = resolvePoolAsset(params.destinationAssetId, params.destinationChain);

  if (!originDef || !destDef || originDef.assetKey === destDef.assetKey) {
    return { eligible: false, reason: "PAIR_NOT_IN_POOL" };
  }

  const config = await getLiquidityPoolConfig();
  if (!config.enabled) {
    return { eligible: false, reason: "POOL_DISABLED" };
  }
  if (
    config.pausedAssets.includes(originDef.assetKey) ||
    config.pausedAssets.includes(destDef.assetKey)
  ) {
    return { eligible: false, reason: "ASSET_PAUSED" };
  }

  const originPoolAddr = getLiquidityWalletAddress(originDef.assetKey);
  const destPoolAddr = getLiquidityWalletAddress(destDef.assetKey);
  if (!originPoolAddr || !destPoolAddr) {
    return { eligible: false, reason: "WALLET_NOT_CONFIGURED" };
  }

  const [originPriceUsd, destPriceUsd] = await Promise.all([
    getFreshTokenPriceUsd(originDef.symbol, 60_000),
    getFreshTokenPriceUsd(destDef.symbol, 60_000),
  ]);

  if (originPriceUsd <= 0 || destPriceUsd <= 0) {
    return { eligible: false, reason: "STALE_OR_UNAVAILABLE_PRICE" };
  }

  const totalInAtomic = BigInt(params.totalAmountIn);
  const netInAtomic = BigInt(params.netSwapAmount);
  if (totalInAtomic <= 0n || netInAtomic <= 0n) {
    return { eligible: false, reason: "INVALID_AMOUNT" };
  }

  const totalInTokens = Number(formatUnits(totalInAtomic, originDef.decimals));
  const netInTokens = Number(formatUnits(netInAtomic, originDef.decimals));
  const orderUsd = totalInTokens * originPriceUsd;

  if (!Number.isFinite(orderUsd) || orderUsd <= 0) {
    return { eligible: false, reason: "INVALID_USD_VALUE" };
  }
  if (orderUsd > config.maxSwapUsd) {
    return { eligible: false, reason: "EXCEEDS_MAX_SWAP_USD" };
  }

  try {
    const outflow = await getRecentLiquidityOutflowUsd();
    if (
      outflow.hourlyUsd + orderUsd > config.maxHourlyOutflowUsd ||
      outflow.dailyUsd + orderUsd > config.maxDailyOutflowUsd
    ) {
      return { eligible: false, reason: "VELOCITY_LIMIT_REACHED" };
    }
  } catch {
    return { eligible: false, reason: "VELOCITY_CHECK_UNAVAILABLE" };
  }

  const spreadBps = Math.min(500, Math.max(0, Number(config.spreadBufferBps) || 0));
  const amountOutAtomic = computeOutputAtomicBigInt(
    netInAtomic,
    originDef.decimals,
    originPriceUsd,
    destDef.decimals,
    destPriceUsd,
    spreadBps
  );

  if (amountOutAtomic <= 0n) {
    return { eligible: false, reason: "ZERO_OUTPUT" };
  }

  // Enforce network dust floors on destination output
  if (destDef.assetKey === "ltc:LTC" && amountOutAtomic < LTC_DUST_THRESHOLD_SATOSHIS) {
    return { eligible: false, reason: "OUTPUT_BELOW_LTC_DUST" };
  }
  if (destDef.assetKey === "sol:SOL" && amountOutAtomic < 100_000n) {
    return { eligible: false, reason: "OUTPUT_BELOW_SOL_MIN" };
  }
  if (destDef.assetKey === "polygon:USDT" && amountOutAtomic < 10_000n) {
    return { eligible: false, reason: "OUTPUT_BELOW_USDT_MIN" };
  }

  // Check live destination wallet balance, active reservations, and gas health
  const balances = await getLiquidityBalances();
  const destStatus = balances[destDef.assetKey];
  if (!destStatus || !destStatus.configured || destStatus.paused || !destStatus.gasHealthy) {
    return { eligible: false, reason: "DEST_WALLET_NOT_READY" };
  }

  const availableDestAtomic = BigInt(destStatus.availableAtomic || "0");
  if (availableDestAtomic < amountOutAtomic) {
    return { eligible: false, reason: "INSUFFICIENT_POOL_LIQUIDITY" };
  }

  const slip = Math.min(5000, Math.max(10, Number(params.slippageBps) || 100));
  const minAmountOutAtomic = (amountOutAtomic * BigInt(10000 - slip)) / 10000n;

  return {
    eligible: true,
    originDef,
    destDef,
    amountOutAtomic: amountOutAtomic.toString(),
    amountOutFormatted: formatCleanHuman(amountOutAtomic, destDef.decimals, 6),
    minAmountOutAtomic: minAmountOutAtomic.toString(),
    minAmountOutFormatted: formatCleanHuman(minAmountOutAtomic, destDef.decimals, 6),
    originPriceUsd,
    destPriceUsd,
    orderUsd: Math.round(orderUsd * 100) / 100,
    timeEstimateSeconds: originDef.chain === "ltc" ? 150 : 15,
  };
}

/**
 * Single-sweeps 100% of the proxy deposit (principal + fee) into our Origin Liquidity Hot Wallet.
 * Never refunds or reverts a settled swap if the sweep encounters a temporary RPC error.
 */
export async function sweepInternalProxyToLiquidityWallet(
  order: ProxySwapOrder
): Promise<{ swept: boolean; txHash?: string; error?: string }> {
  const latest = (await getProxyOrderBySwapId(order.swapId)) || order;
  if (latest.sweepStatus === "SWEPT" && latest.sweepTxHash) {
    return { swept: true, txHash: latest.sweepTxHash };
  }

  const originDef = resolvePoolAsset(latest.originAssetId, latest.chain);
  if (!originDef) {
    return { swept: false, error: "Unsupported origin pool asset for sweep." };
  }

  const poolAddress = getLiquidityWalletAddress(originDef.assetKey);
  if (!poolAddress) {
    return { swept: false, error: `Origin liquidity wallet not configured for ${originDef.assetKey}.` };
  }

  // Mark attempt timestamp to prevent concurrent duplicate sweep broadcasts
  await updateProxySwapOrder(latest.swapId, {
    lastAttemptAt: Date.now(),
  }).catch(() => {});

  try {
    const rawKey = getDecryptedProxyPrivateKey(latest);
    let sweepTxHash = "";
    let sweptAtomic = 0n;

    if (originDef.assetKey === "ltc:LTC") {
      const ltcBal = await getLtcBalanceAndUtxos(latest.proxyDepositAddress);
      if (ltcBal.confirmedBalanceSatoshis <= LTC_DUST_THRESHOLD_SATOSHIS) {
        if (latest.sweepTxHash) {
          await updateProxySwapOrder(latest.swapId, { sweepStatus: "SWEPT" });
          return { swept: true, txHash: latest.sweepTxHash };
        }
        return { swept: false, error: "LTC proxy confirmed balance is zero or below dust." };
      }
      sweptAtomic = ltcBal.confirmedBalanceSatoshis;
      sweepTxHash = await sweepLtcDeposit({
        proxyAddress: latest.proxyDepositAddress,
        privKeyHex: rawKey,
        solverAddress: poolAddress,
        treasuryAddress: poolAddress,
        zkpayFeeSatoshis: 0n,
        confirmedOnly: true,
      });
    } else if (originDef.assetKey === "sol:SOL") {
      const balRes = await fetchResilientSolanaRpc("getBalance", [
        order.proxyDepositAddress,
        { commitment: "finalized" },
      ]);
      const lamports = BigInt(balRes?.value || 0);
      if (lamports <= 5000n) {
        if (order.sweepTxHash) {
          await updateProxySwapOrder(order.swapId, { sweepStatus: "SWEPT" });
          return { swept: true, txHash: order.sweepTxHash };
        }
        return { swept: false, error: "SOL proxy balance is zero." };
      }
      sweptAtomic = lamports - 5000n;
      sweepTxHash = await sendSolanaMultiTransfer({
        fromPubkeyBase58: order.proxyDepositAddress,
        fromPrivKeyHex: rawKey,
        outputs: [{ toBase58: poolAddress, lamports: sweptAtomic }],
      });
      const sigState = await waitForSolanaSignature(sweepTxHash, 25_000);
      if (sigState === "timeout") {
        const postBal = await fetchResilientSolanaRpc("getBalance", [
          order.proxyDepositAddress,
          { commitment: "confirmed" },
        ]).catch(() => null);
        if (!postBal || BigInt(postBal?.value || 0) > 5000n) {
          return { swept: false, error: "SOL sweep confirmation timed out; will retry." };
        }
      }
    } else {
      // polygon:USDT
      const publicClient = getResilientPublicClientForChain("polygon");
      const proxyAddress = getAddress(order.proxyDepositAddress as `0x${string}`);
      const tokenBal = (await publicClient.readContract({
        address: originDef.tokenAddress!,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [proxyAddress],
      })) as bigint;

      if (tokenBal <= 0n) {
        if (order.sweepTxHash) {
          await updateProxySwapOrder(order.swapId, { sweepStatus: "SWEPT" });
          return { swept: true, txHash: order.sweepTxHash };
        }
        return { swept: false, error: "Polygon USDT proxy balance is zero." };
      }
      sweptAtomic = tokenBal;
      const proxyAccount = privateKeyToAccount(rawKey);
      const { chain, transports } = getEvmRpcConfig("polygon");
      const walletClient = createWalletClient({
        account: proxyAccount,
        chain,
        transport: fallback(transports, { rank: false, retryCount: 2 }),
      });

      const res = await sendResilientErc20Transfer({
        chainKey: "polygon",
        publicClient,
        walletClient,
        proxyAccount,
        tokenAddress: originDef.tokenAddress!,
        to: getAddress(poolAddress as `0x${string}`),
        amount: tokenBal,
      });

      if (!res.txHash) {
        throw new Error(res.error || "Failed sweeping Polygon USDT to liquidity wallet.");
      }
      sweepTxHash = res.txHash;
      const receipt = await publicClient
        .waitForTransactionReceipt({ hash: res.txHash, timeout: 40_000 })
        .catch(() => null);
      if (receipt && receipt.status !== "success") {
        throw new Error(`Polygon USDT sweep tx ${res.txHash} reverted on-chain.`);
      }
      if (!receipt) {
        const postBal = (await publicClient
          .readContract({
            address: originDef.tokenAddress!,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [proxyAddress],
          })
          .catch(() => tokenBal)) as bigint;
        if (postBal > 0n) {
          return { swept: false, error: `Polygon USDT sweep ${res.txHash} awaiting confirmation.` };
        }
      }
    }

    await updateProxySwapOrder(order.swapId, {
      sweepStatus: "SWEPT",
      sweepTxHash,
      forwardTxHash: order.forwardTxHash || sweepTxHash,
      depositTxHash: order.depositTxHash || sweepTxHash,
    });

    const priceUsd = await getLiveTokenPriceUsd(originDef.symbol);
    const sweptNum = Number(formatUnits(sweptAtomic, originDef.decimals));
    await recordLiquidityTransfer({
      type: "SWEEP_IN",
      assetKey: originDef.assetKey,
      chain: originDef.chain,
      symbol: originDef.symbol,
      amountAtomic: sweptAtomic.toString(),
      amountFormatted: formatCleanHuman(sweptAtomic, originDef.decimals, 6),
      amountUsd: Math.round(sweptNum * (priceUsd || 0) * 10000) / 10000,
      txHash: sweepTxHash,
      explorerUrl: getExplorerTxUrl(originDef.chain, sweepTxHash),
      fromAddress: order.proxyDepositAddress,
      toAddress: poolAddress,
      swapId: order.swapId,
      note: "100% single-sweep (principal + fee) into liquidity wallet",
    });

    return { swept: true, txHash: sweepTxHash };
  } catch (err: any) {
    console.warn(
      `[LiquidityEngine] Single-sweep to liquidity wallet pending retry for ${order.swapId}:`,
      err?.message || err
    );
    await updateProxySwapOrder(order.swapId, {
      sweepStatus: "PENDING_SWEEP",
      lastAttemptAt: Date.now(),
    }).catch(() => {});
    return { swept: false, error: err?.message || "Sweep failed" };
  }
}

/**
 * Processes an active INTERNAL_POOL swap order:
 * 1. Verifies strict 1-confirmation deposit on LTC (or confirmed balance on SOL/Polygon).
 * 2. Atomically claims payout lock in MongoDB to prevent double-payout across instances.
 * 3. Dispatches destination payout from our Liquidity Hot Wallet (or auto-refunds 100% on failure).
 * 4. Credits partner 50% USD fee share and single-sweeps 100% of deposit into our Origin Liquidity Wallet.
 */
export async function processInternalLiquidityOrder(
  order: ProxySwapOrder
): Promise<ProxySwapOrder> {
  if (order.fulfillmentMode !== "INTERNAL_POOL") return order;

  if (order.status === "SETTLED") {
    if (order.sweepStatus === "PENDING_SWEEP") {
      // Debounce concurrent auto-sweep retries within 45s while allowing explicit admin retry_sweep
      const recentlyAttempted =
        order.lastAttemptAt && Date.now() - order.lastAttemptAt < 45_000;
      if (!recentlyAttempted) {
        const sweepRes = await sweepInternalProxyToLiquidityWallet(order);
        const refreshed = (await getProxyOrderBySwapId(order.swapId)) || order;
        if (sweepRes.swept) {
          await creditPartnerFeeOnSettlement(refreshed).catch((e) =>
            console.warn("[LiquidityEngine] Partner fee settlement credit warning:", e)
          );
        }
        return refreshed;
      }
    }
    return order;
  }

  const originDef = resolvePoolAsset(order.originAssetId, order.chain);
  const destDef = resolvePoolAsset(order.destinationAssetId || order.toAsset, order.destinationChain);
  if (!originDef || !destDef) {
    return order;
  }

  // Reconcile an in-flight PAYING_OUT order if a previous payout broadcast timed out awaiting receipt
  if (order.status === "PAYING_OUT") {
    if (!order.destinationTxHash) {
      return order;
    }
    const receiptState = await verifyLiquidityPayoutOnChain(
      destDef.assetKey,
      order.destinationTxHash
    );
    if (receiptState === "pending") {
      return order;
    }
    if (receiptState === "confirmed") {
      const reconciledOrder =
        (await updateProxySwapOrder(order.swapId, {
          status: "SETTLED",
          sweepStatus: order.sweepStatus || "PENDING_SWEEP",
          forwardTxHash: order.forwardTxHash || order.destinationTxHash,
          error: undefined,
        })) || { ...order, status: "SETTLED" as const };
      if (reconciledOrder.paylinkId) {
        import("./paylinkStore")
          .then((m) => m.markPaylinkPaidIfSingleUse(reconciledOrder.paylinkId!, reconciledOrder.swapId))
          .catch(() => {});
      }
      const sweepRes = await sweepInternalProxyToLiquidityWallet(reconciledOrder);
      const refreshed = (await getProxyOrderBySwapId(order.swapId)) || reconciledOrder;
      if (sweepRes.swept) {
        await creditPartnerFeeOnSettlement(refreshed).catch((e) =>
          console.warn("[LiquidityEngine] Partner fee settlement credit warning:", e)
        );
      }
      return refreshed;
    }
    // receiptState === "reverted": payout confirmed reverted on-chain -> safe to 100% auto-refund
    const refundRes = await recoverProxyDeposit(order.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    const refunded = await updateProxySwapOrder(order.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `Payout tx ${order.destinationTxHash} reverted on-chain; automatically refunded 100% to ${order.refundTo}.`
        : `Payout tx ${order.destinationTxHash} reverted on-chain; auto-refund requires attention: ${refundRes.message}`,
    });
    return refunded || order;
  }

  if (
    order.status === "FAILED" ||
    order.status === "REFUNDED" ||
    order.status === "REFUNDING" ||
    order.status === "REFUND_PENDING" ||
    order.status === "EXPIRED"
  ) {
    return order;
  }

  // Expired orders must only go through the sweeper refund path (prevents payout + refund race).
  if (order.expiresAt && Date.now() > order.expiresAt) {
    return order;
  }

  const expectedAtomic = BigInt(order.totalAmountIn);
  const minThreshold = (expectedAtomic * 90n) / 100n;
  let confirmedDepositAtomic = 0n;

  try {
    if (originDef.assetKey === "ltc:LTC") {
      const ltcBal = await getLtcBalanceAndUtxos(order.proxyDepositAddress);
      const ltcPrice = await getFreshTokenPriceUsd("LTC", 60_000).catch(() => 0);
      const estUsd =
        ltcPrice > 0 ? Number(formatUnits(expectedAtomic, 8)) * ltcPrice : 0;
      // Require 2 confirmations for >= $100 LTC deposits (or when price oracle unavailable), else 1 conf
      const requiredConfs = estUsd >= 100 || ltcPrice <= 0 ? 2 : 1;
      const deeplyConfirmed = ltcBal.confirmedUtxos
        .filter((u) => (u.confirmations ?? (u.confirmed ? 1 : 0)) >= requiredConfs)
        .reduce((acc, u) => acc + u.value, 0n);

      if (deeplyConfirmed < minThreshold) {
        if (
          ltcBal.balanceSatoshis >= minThreshold &&
          order.status === "PENDING_DEPOSIT"
        ) {
          const detected = await updateProxySwapOrder(order.swapId, {
            status: "DETECTED",
          });
          return detected || { ...order, status: "DETECTED" };
        }
        return order;
      }
      confirmedDepositAtomic = deeplyConfirmed;
    } else if (originDef.assetKey === "sol:SOL") {
      const [finalizedRes, confirmedRes] = await Promise.all([
        fetchResilientSolanaRpc("getBalance", [
          order.proxyDepositAddress,
          { commitment: "finalized" },
        ]),
        order.status === "PENDING_DEPOSIT"
          ? fetchResilientSolanaRpc("getBalance", [
              order.proxyDepositAddress,
              { commitment: "confirmed" },
            ]).catch(() => null)
          : Promise.resolve(null),
      ]);
      const finalizedLamports = BigInt(finalizedRes?.value || 0);
      if (finalizedLamports < minThreshold || finalizedLamports <= 5000n) {
        const confLamports = BigInt(confirmedRes?.value || 0);
        if (
          confLamports >= minThreshold &&
          confLamports > 5000n &&
          order.status === "PENDING_DEPOSIT"
        ) {
          const detected = await updateProxySwapOrder(order.swapId, { status: "DETECTED" });
          return detected || { ...order, status: "DETECTED" };
        }
        return order;
      }
      confirmedDepositAtomic = finalizedLamports;
    } else {
      // polygon:USDT — require 32 block finality (~64s) to prevent Bor reorg drains
      const publicClient = getResilientPublicClientForChain("polygon");
      const proxyAddress = getAddress(order.proxyDepositAddress as `0x${string}`);
      const latestBlock = await publicClient.getBlockNumber();
      const safeBlock =
        latestBlock > POLYGON_FINALITY_CONFIRMATIONS
          ? latestBlock - POLYGON_FINALITY_CONFIRMATIONS
          : 0n;

      const [latestBal, finalizedBal] = await Promise.all([
        publicClient.readContract({
          address: originDef.tokenAddress!,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [proxyAddress],
        }) as Promise<bigint>,
        safeBlock > 0n
          ? (publicClient.readContract({
              address: originDef.tokenAddress!,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [proxyAddress],
              blockNumber: safeBlock,
            }) as Promise<bigint>)
          : Promise.resolve(0n),
      ]);

      if (finalizedBal < minThreshold || finalizedBal <= 0n) {
        if (latestBal >= minThreshold && order.status === "PENDING_DEPOSIT") {
          const detected = await updateProxySwapOrder(order.swapId, { status: "DETECTED" });
          return detected || { ...order, status: "DETECTED" };
        }
        return order;
      }

      // Cross-check orders >= $50 USDT on an independent secondary Polygon RPC at the same finalized block
      if (finalizedBal >= 50_000_000n) {
        const secondaryClient = getSecondaryPolygonPublicClient();
        const secondaryBal = (await secondaryClient.readContract({
          address: originDef.tokenAddress!,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [proxyAddress],
          blockNumber: safeBlock,
        })) as bigint;
        if (secondaryBal < minThreshold || secondaryBal < finalizedBal) {
          console.warn(
            `[LiquidityEngine] Polygon dual-RPC mismatch at block ${safeBlock} for ${order.swapId}: primary=${finalizedBal}, secondary=${secondaryBal}`
          );
          return order;
        }
      }

      confirmedDepositAtomic = latestBal < finalizedBal ? latestBal : finalizedBal;
    }
  } catch (checkErr) {
    console.warn(`[LiquidityEngine] Deposit balance check warning for ${order.swapId}:`, checkErr);
    return order;
  }

  // Atomic cross-instance payout claim
  const claimed = await claimOrderForPayout(order.swapId);
  if (!claimed) {
    return (await getProxyOrderBySwapId(order.swapId)) || order;
  }

  // SECURITY GUARD 1: Reject & 100% auto-refund over-deposits (>105% of quoted amount)
  // Prevents an attacker from quoting $1 (passing maxSwapUsd & reserve checks) and depositing $10,000 to drain the hot wallet.
  const maxAllowedDepositAtomic = (expectedAtomic * 105n) / 100n;
  if (confirmedDepositAtomic > maxAllowedDepositAtomic) {
    console.warn(
      `[LiquidityEngine] Over-deposit rejected for ${claimed.swapId}: confirmed=${confirmedDepositAtomic}, maxAllowed=${maxAllowedDepositAtomic}. Auto-refunding 100%.`
    );
    const refundRes = await recoverProxyDeposit(claimed.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    const updated = await updateProxySwapOrder(claimed.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `Deposit (${formatCleanHuman(confirmedDepositAtomic, originDef.decimals, 6)} ${originDef.symbol}) exceeded quoted amount by >5%; automatically refunded 100% to ${claimed.refundTo}.`
        : `Over-deposit (>105% of quote) rejected; automatic refund pending: ${refundRes.message}`,
    });
    return updated || claimed;
  }

  // Recompute exact fee & net input on actual confirmed deposit (preserving identical 200 bps / 50-50 / $0.02 rules)
  const zkpayBps = BigInt(claimed.zkpayFeeBps ?? 200);
  const partnerBps = BigInt(claimed.partnerFeeBps ?? 0);
  const isStable = originDef.symbol === "USDT";
  const twoCentsUnits = isStable ? 20_000n : 0n;

  const zkpayPercentFee = (confirmedDepositAtomic * zkpayBps) / 10000n;
  const actualFixedFee = isStable && zkpayPercentFee < twoCentsUnits ? twoCentsUnits : 0n;
  const actualZkpayFee = zkpayPercentFee + actualFixedFee;
  const actualPartnerFee = partnerBps > 0n ? (confirmedDepositAtomic * partnerBps) / 10000n : 0n;
  const actualTotalFee = actualZkpayFee + actualPartnerFee;

  const actualNetIn =
    confirmedDepositAtomic > actualTotalFee ? confirmedDepositAtomic - actualTotalFee : 0n;

  const baseExpectedOut = BigInt(claimed.expectedAmountOut || "0");
  const baseNetIn = BigInt(claimed.netSwapAmount || "1");
  const quotedOutAtomic =
    baseExpectedOut > 0n && baseNetIn > 0n
      ? (baseExpectedOut * actualNetIn) / baseNetIn
      : 0n;

  // SECURITY GUARD 2: Re-verify live multi-oracle spot prices at payout time
  // Protects pool against 20-minute free-option arbitrage while protecting user against >3% adverse slippage.
  const [liveOriginPrice, liveDestPrice, poolCfg] = await Promise.all([
    getFreshTokenPriceUsd(originDef.symbol, 45_000),
    getFreshTokenPriceUsd(destDef.symbol, 45_000),
    getLiquidityPoolConfig(),
  ]);

  if (liveOriginPrice <= 0 || liveDestPrice <= 0) {
    const refundRes = await recoverProxyDeposit(claimed.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    const updated = await updateProxySwapOrder(claimed.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `Live price oracle verification unavailable at payout time; automatically refunded 100% to ${claimed.refundTo}.`
        : `Live price oracle verification unavailable; auto-refund pending: ${refundRes.message}`,
    });
    return updated || claimed;
  }

  const spreadBps = Math.max(0, Math.min(500, Number(poolCfg.spreadBufferBps ?? 25)));
  const liveSpotOutAtomic = computeOutputAtomicBigInt(
    actualNetIn,
    originDef.decimals,
    liveOriginPrice,
    destDef.decimals,
    liveDestPrice,
    spreadBps
  );

  // SECURITY GUARD 2B: Enforce emergency kill switch & velocity circuit breakers immediately before payout
  const depositUsd = Number(formatUnits(confirmedDepositAtomic, originDef.decimals)) * liveOriginPrice;
  const outflow = await getRecentLiquidityOutflowUsd().catch(() => null);
  const poolPausedOrBlocked =
    !poolCfg.enabled ||
    poolCfg.pausedAssets.includes(originDef.assetKey) ||
    poolCfg.pausedAssets.includes(destDef.assetKey) ||
    depositUsd > poolCfg.maxSwapUsd ||
    !outflow ||
    outflow.hourlyUsd + depositUsd > poolCfg.maxHourlyOutflowUsd ||
    outflow.dailyUsd + depositUsd > poolCfg.maxDailyOutflowUsd;

  if (poolPausedOrBlocked) {
    const reason =
      !poolCfg.enabled ||
      poolCfg.pausedAssets.includes(originDef.assetKey) ||
      poolCfg.pausedAssets.includes(destDef.assetKey)
        ? "Internal liquidity pool paused by security control"
        : "Liquidity pool velocity limit reached";
    console.warn(`[LiquidityEngine] Blocking payout for ${claimed.swapId}: ${reason}. Auto-refunding.`);
    const refundRes = await recoverProxyDeposit(claimed.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    const updated = await updateProxySwapOrder(claimed.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `${reason}; automatically refunded 100% to ${claimed.refundTo}.`
        : `${reason}; auto-refund pending: ${refundRes.message}`,
    });
    return updated || claimed;
  }

  // Never pay more than the quoted rate OR the live spot rate, and hard-cap at 105% of original quote
  const hardCapOutAtomic = (baseExpectedOut * 105n) / 100n;
  let actualOutAtomic =
    quotedOutAtomic < liveSpotOutAtomic ? quotedOutAtomic : liveSpotOutAtomic;
  if (actualOutAtomic > hardCapOutAtomic) {
    actualOutAtomic = hardCapOutAtomic;
  }

  // If market moved >3% against the quote during deposit confirmation, auto-refund 100%
  const minAcceptableOutAtomic = (quotedOutAtomic * 97n) / 100n;
  if (actualOutAtomic <= 0n || actualOutAtomic < minAcceptableOutAtomic) {
    const reason =
      actualOutAtomic <= 0n
        ? "Deposit too small after fee calculation"
        : "Market price moved >3% beyond quote slippage tolerance during confirmation";
    const refundRes = await recoverProxyDeposit(claimed.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    const updated = await updateProxySwapOrder(claimed.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `${reason}; automatically refunded 100% to ${claimed.refundTo}.`
        : `${reason}; auto-refund pending: ${refundRes.message}`,
    });
    return updated || claimed;
  }

  // Dispatch destination payout from our Liquidity Hot Wallet (persisting destinationTxHash immediately on broadcast)
  let payoutRes: { txHash: string; explorerUrl: string; fromAddress: string };
  try {
    payoutRes = await sendFromLiquidityWallet({
      assetKey: destDef.assetKey,
      toAddress: claimed.recipient,
      amountAtomic: actualOutAtomic,
      enforceMinReserve: true,
      onBroadcast: async (txHash) => {
        await updateProxySwapOrder(claimed.swapId, {
          status: "PAYING_OUT",
          destinationTxHash: txHash,
          destinationExplorerUrl: getExplorerTxUrl(destDef.chain, txHash),
        });
      },
    });
  } catch (payoutErr: any) {
    // SECURITY GUARD 3: If payout was already broadcast on-chain and only confirmation timed out,
    // NEVER auto-refund (prevents user receiving both payout AND refund!). Lock in PAYING_OUT for receipt reconciliation.
    if (payoutErr?.broadcasted && !payoutErr?.reverted && payoutErr?.txHash) {
      console.warn(
        `[LiquidityEngine] Payout tx ${payoutErr.txHash} for ${claimed.swapId} timed out awaiting receipt; locking order in PAYING_OUT (auto-refund blocked).`
      );
      const pendingConfirmOrder = await updateProxySwapOrder(claimed.swapId, {
        status: "PAYING_OUT",
        destinationTxHash: payoutErr.txHash,
        destinationExplorerUrl: getExplorerTxUrl(destDef.chain, payoutErr.txHash),
        error: `Payout broadcast (${payoutErr.txHash}) awaiting on-chain confirmation; auto-refund locked to prevent double-pay.`,
      });
      return pendingConfirmOrder || claimed;
    }

    console.error(
      `[LiquidityEngine] Payout failed before confirmation for ${claimed.swapId}, triggering automatic 100% refund:`,
      payoutErr?.message || payoutErr
    );
    const refundRes = await recoverProxyDeposit(claimed.proxyDepositAddress, {
      action: "refund",
      allowFromPayingOut: true,
    });
    if (refundRes.success && refundRes.txHash) {
      const originPrice = await getLiveTokenPriceUsd(originDef.symbol);
      const refNum = Number(formatUnits(confirmedDepositAtomic, originDef.decimals));
      await recordLiquidityTransfer({
        type: "AUTO_REFUND",
        assetKey: originDef.assetKey,
        chain: originDef.chain,
        symbol: originDef.symbol,
        amountAtomic: confirmedDepositAtomic.toString(),
        amountFormatted: formatCleanHuman(confirmedDepositAtomic, originDef.decimals, 6),
        amountUsd: Math.round(refNum * (originPrice || 0) * 10000) / 10000,
        txHash: refundRes.txHash,
        explorerUrl: getExplorerTxUrl(originDef.chain, refundRes.txHash),
        fromAddress: claimed.proxyDepositAddress,
        toAddress: claimed.refundTo,
        swapId: claimed.swapId,
        note: `Automatic 100% refund after payout error: ${payoutErr?.message || "Payout failed"}`,
      });
    }
    const refundedOrder = await updateProxySwapOrder(claimed.swapId, {
      status: refundRes.success ? "REFUNDED" : "REFUND_PENDING",
      refundTxHash: refundRes.txHash,
      error: refundRes.success
        ? `Liquidity payout could not be completed (${payoutErr?.message || "error"}); automatically refunded 100% to ${claimed.refundTo}.`
        : `Liquidity payout failed (${payoutErr?.message || "error"}); automatic refund requires attention: ${refundRes.message}`,
    });
    return refundedOrder || claimed;
  }

  const settledAmountFormatted = formatCleanHuman(actualOutAtomic, destDef.decimals, 6);
  const totalInFormatted = formatCleanHuman(confirmedDepositAtomic, originDef.decimals, 6);

  const settledOrder =
    (await updateProxySwapOrder(claimed.swapId, {
      status: "SETTLED",
      totalAmountIn: confirmedDepositAtomic.toString(),
      totalAmountFormatted: totalInFormatted,
      netSwapAmount: actualNetIn.toString(),
      feeAmount: actualTotalFee.toString(),
      fixedFeeAmount: actualFixedFee.toString(),
      zkpayFeeAmount: actualZkpayFee.toString(),
      partnerFeeAmount: actualPartnerFee.toString(),
      settledAmountFormatted,
      destinationTxHash: payoutRes.txHash,
      destinationExplorerUrl: payoutRes.explorerUrl,
      forwardTxHash: claimed.forwardTxHash || payoutRes.txHash,
      sweepStatus: "PENDING_SWEEP",
      error: undefined,
    })) || {
      ...claimed,
      status: "SETTLED" as const,
      settledAmountFormatted,
      destinationTxHash: payoutRes.txHash,
      destinationExplorerUrl: payoutRes.explorerUrl,
      sweepStatus: "PENDING_SWEEP" as const,
    };

  const destPrice = await getLiveTokenPriceUsd(destDef.symbol);
  const outNum = Number(formatUnits(actualOutAtomic, destDef.decimals));
  await recordLiquidityTransfer({
    type: "PAYOUT_OUT",
    assetKey: destDef.assetKey,
    chain: destDef.chain,
    symbol: destDef.symbol,
    amountAtomic: actualOutAtomic.toString(),
    amountFormatted: settledAmountFormatted,
    amountUsd: Math.round(outNum * (destPrice || 0) * 10000) / 10000,
    txHash: payoutRes.txHash,
    explorerUrl: payoutRes.explorerUrl,
    fromAddress: payoutRes.fromAddress,
    toAddress: claimed.recipient,
    swapId: claimed.swapId,
    note: `Direct liquidity payout for ${totalInFormatted} ${originDef.symbol} -> ${settledAmountFormatted} ${destDef.symbol}`,
  });

  // SECURITY GUARD 4: Single-sweep 100% of proxy deposit into our Origin Liquidity Hot Wallet FIRST,
  // and only credit partner withdrawable USD fee balance after the origin deposit sweep succeeds.
  if (settledOrder.paylinkId) {
    import("./paylinkStore")
      .then((m) => m.markPaylinkPaidIfSingleUse(settledOrder.paylinkId!, settledOrder.swapId))
      .catch(() => {});
  }
  const sweepRes = await sweepInternalProxyToLiquidityWallet(settledOrder);
  const refreshed = (await getProxyOrderBySwapId(claimed.swapId)) || settledOrder;
  if (sweepRes.swept) {
    await creditPartnerFeeOnSettlement(refreshed).catch((e) =>
      console.warn("[LiquidityEngine] Partner fee settlement credit warning:", e)
    );
  }

  return refreshed;
}
