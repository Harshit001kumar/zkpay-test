import crypto from "crypto";
import { Buffer } from "buffer";
import {
  createWalletClient,
  fallback,
  parseAbi,
  formatUnits,
  parseUnits,
  getAddress,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeBase58, decodeBase58 } from "./proxyWallets";
import {
  getEvmRpcConfig,
  getResilientPublicClientForChain,
  fetchResilientSolanaRpc,
} from "./rpcConfig";
import {
  getLtcBalanceAndUtxos,
  parseLtcPrivateKeyHex,
  deriveLtcAddressFromPrivKey,
  sendLtcFromLiquidityWallet,
  LTC_DUST_THRESHOLD_SATOSHIS,
} from "./ltcClient";
import {
  POOL_SUPPORTED_ASSETS,
  type PoolAssetDefinition,
  getLiquidityPoolConfig,
  resolvePoolAsset,
} from "./liquidityConfig";
import { getTreasuryAddressForChain } from "@/lib/constants";
import { getMongoDb, isMongoConfigured } from "./mongodb";
import { getActiveReservedLiquidityByAsset } from "./proxySwapStore";
import { getLiveTokenPriceUsd } from "./priceService";
import {
  sendResilientErc20Transfer,
  sendSolanaMultiTransfer,
  waitForSolanaSignature,
  getExplorerTxUrl,
} from "./proxyForwarder";

const ERC20_BALANCE_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

function cleanSecret(raw?: string): string {
  if (!raw) return "";
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function getEvmLiquidityWallet(): {
  configured: boolean;
  address: `0x${string}` | null;
  account: ReturnType<typeof privateKeyToAccount> | null;
  error?: string;
} {
  const raw = cleanSecret(process.env.LIQUIDITY_EVM_PRIVATE_KEY);
  if (!raw) {
    return { configured: false, address: null, account: null };
  }
  try {
    const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
    const account = privateKeyToAccount(hex);
    return { configured: true, address: account.address, account };
  } catch (err: any) {
    return {
      configured: false,
      address: null,
      account: null,
      error: err?.message || "Invalid LIQUIDITY_EVM_PRIVATE_KEY",
    };
  }
}

export function getSolLiquidityWallet(): {
  configured: boolean;
  address: string | null;
  privKeySeedHex: string | null;
  error?: string;
} {
  const raw = cleanSecret(process.env.LIQUIDITY_SOL_PRIVATE_KEY);
  if (!raw) {
    return { configured: false, address: null, privKeySeedHex: null };
  }
  try {
    const noPrefix = raw.replace(/^0x/i, "");
    let seed32: Buffer;
    if (/^[0-9a-fA-F]{64}$/.test(noPrefix)) {
      seed32 = Buffer.from(noPrefix, "hex");
    } else if (/^[0-9a-fA-F]{128}$/.test(noPrefix)) {
      seed32 = Buffer.from(noPrefix, "hex").subarray(0, 32);
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length < 32) {
        throw new Error("Solana JSON key array must have at least 32 bytes.");
      }
      seed32 = Buffer.from(arr.slice(0, 32));
    } else {
      const decoded = decodeBase58(raw);
      if (decoded.length !== 32 && decoded.length !== 64) {
        throw new Error("Invalid Solana Base58 private key length.");
      }
      seed32 = decoded.subarray(0, 32);
    }

    const privKeyObj = crypto.createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed32]),
      format: "der",
      type: "pkcs8",
    });
    const pubDer = crypto.createPublicKey(privKeyObj).export({ type: "spki", format: "der" }) as Buffer;
    const rawPub32 = pubDer.subarray(pubDer.length - 32);
    const address = encodeBase58(rawPub32);

    return {
      configured: true,
      address,
      privKeySeedHex: seed32.toString("hex"),
    };
  } catch (err: any) {
    return {
      configured: false,
      address: null,
      privKeySeedHex: null,
      error: err?.message || "Invalid LIQUIDITY_SOL_PRIVATE_KEY",
    };
  }
}

export function getLtcLiquidityWallet(): {
  configured: boolean;
  address: string | null;
  privKeyHex: string | null;
  error?: string;
} {
  const raw = cleanSecret(process.env.LIQUIDITY_LTC_PRIVATE_KEY);
  if (!raw) {
    return { configured: false, address: null, privKeyHex: null };
  }
  try {
    const privKeyHex = parseLtcPrivateKeyHex(raw);
    const address = deriveLtcAddressFromPrivKey(raw);
    return { configured: true, address, privKeyHex };
  } catch (err: any) {
    return {
      configured: false,
      address: null,
      privKeyHex: null,
      error: err?.message || "Invalid LIQUIDITY_LTC_PRIVATE_KEY",
    };
  }
}

export function getLiquidityWalletAddress(assetKey: PoolAssetDefinition["assetKey"]): string | null {
  if (assetKey === "polygon:USDT") return getEvmLiquidityWallet().address;
  if (assetKey === "sol:SOL") return getSolLiquidityWallet().address;
  if (assetKey === "ltc:LTC") return getLtcLiquidityWallet().address;
  return null;
}

/**
 * Resolves where platform fees from NEAR Intents Solver (non-pool) swaps are routed on-chain.
 * When `solverFeeDestination === "POOL"`, only pool-supported assets (LTC, SOL, Polygon USDT)
 * with configured hot wallets route to the pool; all other assets automatically fall back to Cold Wallet.
 */
export async function resolveSolverFeeDestination(
  originAssetId: string,
  originChain?: string | null
): Promise<{
  mode: "TREASURY" | "POOL";
  address: string;
  poolAssetKey: PoolAssetDefinition["assetKey"] | null;
}> {
  const coldAddress = getTreasuryAddressForChain(originChain);
  const config = await getLiquidityPoolConfig();

  if (config.solverFeeDestination === "POOL") {
    const poolDef = resolvePoolAsset(originAssetId, originChain);
    if (poolDef) {
      const hotAddr = getLiquidityWalletAddress(poolDef.assetKey);
      if (hotAddr && hotAddr.trim()) {
        return {
          mode: "POOL",
          address: hotAddr.trim(),
          poolAssetKey: poolDef.assetKey,
        };
      }
    }
  }

  return {
    mode: "TREASURY",
    address: coldAddress,
    poolAssetKey: null,
  };
}

export interface AssetLiquidityStatus {
  assetKey: PoolAssetDefinition["assetKey"];
  chain: string;
  symbol: string;
  name: string;
  decimals: number;
  configured: boolean;
  paused: boolean;
  address: string | null;
  explorerAddressUrl: string | null;
  onChainBalanceAtomic: string;
  onChainBalanceFormatted: string;
  confirmedBalanceAtomic: string;
  unconfirmedBalanceAtomic: string;
  reservedAtomic: string;
  reservedFormatted: string;
  minReserveAtomic: string;
  minReserveFormatted: string;
  availableAtomic: string;
  availableFormatted: string;
  priceUsd: number;
  totalUsd: number;
  availableUsd: number;
  gasSymbol: string;
  gasBalanceFormatted: string;
  gasHealthy: boolean;
  error?: string;
}

function parseHumanToAtomic(humanStr: string, decimals: number): bigint {
  try {
    const clean = (humanStr || "0").trim();
    if (!clean || Number(clean) <= 0) return 0n;
    return parseUnits(clean, decimals);
  } catch {
    return 0n;
  }
}

export async function getLiquidityBalances(): Promise<Record<PoolAssetDefinition["assetKey"], AssetLiquidityStatus>> {
  const [config, reservedByKey, ltcPrice, solPrice, usdtPrice] = await Promise.all([
    getLiquidityPoolConfig(),
    getActiveReservedLiquidityByAsset(),
    getLiveTokenPriceUsd("LTC"),
    getLiveTokenPriceUsd("SOL"),
    getLiveTokenPriceUsd("USDT"),
  ]);

  const prices: Record<string, number> = {
    LTC: ltcPrice || 0,
    SOL: solPrice || 0,
    USDT: usdtPrice || 1,
  };

  const buildStatus = async (
    def: PoolAssetDefinition
  ): Promise<AssetLiquidityStatus> => {
    const paused = !config.enabled || config.pausedAssets.includes(def.assetKey);
    const minReserveHuman =
      config.minReserveByAsset?.[def.assetKey] ?? def.defaultMinReserveHuman;
    const minReserveAtomic = parseHumanToAtomic(minReserveHuman, def.decimals);
    const reservedAtomic = reservedByKey[def.assetKey] || 0n;
    const priceUsd = prices[def.symbol] || 0;

    if (def.assetKey === "polygon:USDT") {
      const w = getEvmLiquidityWallet();
      if (!w.configured || !w.address) {
        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: false,
          paused,
          address: null,
          explorerAddressUrl: null,
          onChainBalanceAtomic: "0",
          onChainBalanceFormatted: "0.00",
          confirmedBalanceAtomic: "0",
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: formatUnits(reservedAtomic, def.decimals),
          minReserveAtomic: minReserveAtomic.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: "0",
          availableFormatted: "0.00",
          priceUsd,
          totalUsd: 0,
          availableUsd: 0,
          gasSymbol: "POL",
          gasBalanceFormatted: "0.0000",
          gasHealthy: false,
          error: w.error || "LIQUIDITY_EVM_PRIVATE_KEY not configured",
        };
      }

      try {
        const publicClient = getResilientPublicClientForChain("polygon");
        const [usdtRaw, polRaw] = await Promise.all([
          publicClient
            .readContract({
              address: def.tokenAddress!,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [w.address],
            })
            .catch(() => 0n) as Promise<bigint>,
          publicClient.getBalance({ address: w.address }).catch(() => 0n),
        ]);

        const deductions = reservedAtomic + minReserveAtomic;
        const availableAtomic = usdtRaw > deductions ? usdtRaw - deductions : 0n;
        const onChainNum = Number(formatUnits(usdtRaw, def.decimals));
        const availNum = Number(formatUnits(availableAtomic, def.decimals));
        // 0.03 POL covers multiple 90k gas Polygon transfers at 35-50 gwei
        const gasHealthy = polRaw >= parseUnits("0.03", 18);

        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: true,
          paused,
          address: w.address,
          explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
          onChainBalanceAtomic: usdtRaw.toString(),
          onChainBalanceFormatted: onChainNum.toFixed(2),
          confirmedBalanceAtomic: usdtRaw.toString(),
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: Number(formatUnits(reservedAtomic, def.decimals)).toFixed(2),
          minReserveAtomic: minReserveAtomic.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: availableAtomic.toString(),
          availableFormatted: availNum.toFixed(2),
          priceUsd,
          totalUsd: Math.round(onChainNum * priceUsd * 100) / 100,
          availableUsd: Math.round(availNum * priceUsd * 100) / 100,
          gasSymbol: "POL",
          gasBalanceFormatted: Number(formatUnits(polRaw, 18)).toFixed(4),
          gasHealthy,
        };
      } catch (err: any) {
        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: true,
          paused,
          address: w.address,
          explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
          onChainBalanceAtomic: "0",
          onChainBalanceFormatted: "0.00",
          confirmedBalanceAtomic: "0",
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: formatUnits(reservedAtomic, def.decimals),
          minReserveAtomic: minReserveAtomic.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: "0",
          availableFormatted: "0.00",
          priceUsd,
          totalUsd: 0,
          availableUsd: 0,
          gasSymbol: "POL",
          gasBalanceFormatted: "0.0000",
          gasHealthy: false,
          error: err?.message || "Failed querying Polygon RPC",
        };
      }
    }

    if (def.assetKey === "sol:SOL") {
      const w = getSolLiquidityWallet();
      if (!w.configured || !w.address) {
        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: false,
          paused,
          address: null,
          explorerAddressUrl: null,
          onChainBalanceAtomic: "0",
          onChainBalanceFormatted: "0.0000",
          confirmedBalanceAtomic: "0",
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: formatUnits(reservedAtomic, def.decimals),
          minReserveAtomic: minReserveAtomic.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: "0",
          availableFormatted: "0.0000",
          priceUsd,
          totalUsd: 0,
          availableUsd: 0,
          gasSymbol: "SOL",
          gasBalanceFormatted: "0.0000",
          gasHealthy: false,
          error: w.error || "LIQUIDITY_SOL_PRIVATE_KEY not configured",
        };
      }

      try {
        const res = await fetchResilientSolanaRpc("getBalance", [
          w.address,
          { commitment: "confirmed" },
        ]);
        const lamports = BigInt(res?.value || 0);
        // Always keep >= 0.002 SOL rent-exempt + fee reserve
        const rentFloor = 2_000_000n;
        const effectiveMinReserve = minReserveAtomic > rentFloor ? minReserveAtomic : rentFloor;
        const deductions = reservedAtomic + effectiveMinReserve;
        const availableAtomic = lamports > deductions ? lamports - deductions : 0n;
        const onChainNum = Number(formatUnits(lamports, def.decimals));
        const availNum = Number(formatUnits(availableAtomic, def.decimals));
        const gasHealthy = lamports > rentFloor + 50_000n;

        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: true,
          paused,
          address: w.address,
          explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
          onChainBalanceAtomic: lamports.toString(),
          onChainBalanceFormatted: onChainNum.toFixed(4),
          confirmedBalanceAtomic: lamports.toString(),
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: Number(formatUnits(reservedAtomic, def.decimals)).toFixed(4),
          minReserveAtomic: effectiveMinReserve.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: availableAtomic.toString(),
          availableFormatted: availNum.toFixed(4),
          priceUsd,
          totalUsd: Math.round(onChainNum * priceUsd * 100) / 100,
          availableUsd: Math.round(availNum * priceUsd * 100) / 100,
          gasSymbol: "SOL",
          gasBalanceFormatted: onChainNum.toFixed(4),
          gasHealthy,
        };
      } catch (err: any) {
        return {
          assetKey: def.assetKey,
          chain: def.chain,
          symbol: def.symbol,
          name: def.name,
          decimals: def.decimals,
          configured: true,
          paused,
          address: w.address,
          explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
          onChainBalanceAtomic: "0",
          onChainBalanceFormatted: "0.0000",
          confirmedBalanceAtomic: "0",
          unconfirmedBalanceAtomic: "0",
          reservedAtomic: reservedAtomic.toString(),
          reservedFormatted: formatUnits(reservedAtomic, def.decimals),
          minReserveAtomic: minReserveAtomic.toString(),
          minReserveFormatted: minReserveHuman,
          availableAtomic: "0",
          availableFormatted: "0.0000",
          priceUsd,
          totalUsd: 0,
          availableUsd: 0,
          gasSymbol: "SOL",
          gasBalanceFormatted: "0.0000",
          gasHealthy: false,
          error: err?.message || "Failed querying Solana RPC",
        };
      }
    }

    // Litecoin (ltc:LTC)
    const w = getLtcLiquidityWallet();
    if (!w.configured || !w.address) {
      return {
        assetKey: def.assetKey,
        chain: def.chain,
        symbol: def.symbol,
        name: def.name,
        decimals: def.decimals,
        configured: false,
        paused,
        address: null,
        explorerAddressUrl: null,
        onChainBalanceAtomic: "0",
        onChainBalanceFormatted: "0.0000",
        confirmedBalanceAtomic: "0",
        unconfirmedBalanceAtomic: "0",
        reservedAtomic: reservedAtomic.toString(),
        reservedFormatted: formatUnits(reservedAtomic, def.decimals),
        minReserveAtomic: minReserveAtomic.toString(),
        minReserveFormatted: minReserveHuman,
        availableAtomic: "0",
        availableFormatted: "0.0000",
        priceUsd,
        totalUsd: 0,
        availableUsd: 0,
        gasSymbol: "LTC",
        gasBalanceFormatted: "0.0000",
        gasHealthy: false,
        error: w.error || "LIQUIDITY_LTC_PRIVATE_KEY not configured",
      };
    }

    try {
      const ltcBal = await getLtcBalanceAndUtxos(w.address);
      const minerBuffer = 15_000n;
      const effectiveMinReserve = minReserveAtomic > minerBuffer ? minReserveAtomic : minerBuffer;
      const deductions = reservedAtomic + effectiveMinReserve;
      const availableAtomic =
        ltcBal.balanceSatoshis > deductions ? ltcBal.balanceSatoshis - deductions : 0n;
      const onChainNum = Number(formatUnits(ltcBal.balanceSatoshis, def.decimals));
      const availNum = Number(formatUnits(availableAtomic, def.decimals));
      const gasHealthy = ltcBal.balanceSatoshis > LTC_DUST_THRESHOLD_SATOSHIS + minerBuffer;

      return {
        assetKey: def.assetKey,
        chain: def.chain,
        symbol: def.symbol,
        name: def.name,
        decimals: def.decimals,
        configured: true,
        paused,
        address: w.address,
        explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
        onChainBalanceAtomic: ltcBal.balanceSatoshis.toString(),
        onChainBalanceFormatted: onChainNum.toFixed(4),
        confirmedBalanceAtomic: ltcBal.confirmedBalanceSatoshis.toString(),
        unconfirmedBalanceAtomic: ltcBal.unconfirmedBalanceSatoshis.toString(),
        reservedAtomic: reservedAtomic.toString(),
        reservedFormatted: Number(formatUnits(reservedAtomic, def.decimals)).toFixed(4),
        minReserveAtomic: effectiveMinReserve.toString(),
        minReserveFormatted: minReserveHuman,
        availableAtomic: availableAtomic.toString(),
        availableFormatted: availNum.toFixed(4),
        priceUsd,
        totalUsd: Math.round(onChainNum * priceUsd * 100) / 100,
        availableUsd: Math.round(availNum * priceUsd * 100) / 100,
        gasSymbol: "LTC",
        gasBalanceFormatted: onChainNum.toFixed(4),
        gasHealthy,
      };
    } catch (err: any) {
      return {
        assetKey: def.assetKey,
        chain: def.chain,
        symbol: def.symbol,
        name: def.name,
        decimals: def.decimals,
        configured: true,
        paused,
        address: w.address,
        explorerAddressUrl: `${def.explorerAddressPrefix}${w.address}`,
        onChainBalanceAtomic: "0",
        onChainBalanceFormatted: "0.0000",
        confirmedBalanceAtomic: "0",
        unconfirmedBalanceAtomic: "0",
        reservedAtomic: reservedAtomic.toString(),
        reservedFormatted: formatUnits(reservedAtomic, def.decimals),
        minReserveAtomic: minReserveAtomic.toString(),
        minReserveFormatted: minReserveHuman,
        availableAtomic: "0",
        availableFormatted: "0.0000",
        priceUsd,
        totalUsd: 0,
        availableUsd: 0,
        gasSymbol: "LTC",
        gasBalanceFormatted: "0.0000",
        gasHealthy: false,
        error: err?.message || "Failed querying Litecoin indexer",
      };
    }
  };

  const [ltcStatus, solStatus, usdtStatus] = await Promise.all([
    buildStatus(POOL_SUPPORTED_ASSETS["ltc:LTC"]),
    buildStatus(POOL_SUPPORTED_ASSETS["sol:SOL"]),
    buildStatus(POOL_SUPPORTED_ASSETS["polygon:USDT"]),
  ]);

  return {
    "ltc:LTC": ltcStatus,
    "sol:SOL": solStatus,
    "polygon:USDT": usdtStatus,
  };
}

/**
 * Checks the on-chain receipt status of a previously broadcasted liquidity payout transaction.
 * Used to safely reconcile PAYING_OUT orders after an RPC confirmation timeout without risking double-pay or wrongful auto-refund.
 */
export async function verifyLiquidityPayoutOnChain(
  assetKey: PoolAssetDefinition["assetKey"],
  txHash: string
): Promise<"confirmed" | "reverted" | "pending"> {
  const cleanHash = (txHash || "").trim();
  if (!cleanHash) return "pending";

  if (assetKey === "polygon:USDT") {
    try {
      const publicClient = getResilientPublicClientForChain("polygon");
      const receipt = await publicClient.getTransactionReceipt({
        hash: cleanHash as `0x${string}`,
      });
      if (!receipt) return "pending";
      return receipt.status === "success" ? "confirmed" : "reverted";
    } catch {
      return "pending";
    }
  }

  if (assetKey === "sol:SOL") {
    try {
      const res = await fetchResilientSolanaRpc("getSignatureStatuses", [
        [cleanHash],
        { searchTransactionHistory: true },
      ]);
      const st = res?.value?.[0];
      if (!st) return "pending";
      if (st.err) return "reverted";
      if (
        st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized"
      ) {
        return "confirmed";
      }
      return "pending";
    } catch {
      return "pending";
    }
  }

  // ltc:LTC — require explicit block confirmation
  try {
    const res = await fetch(`https://litecoinspace.org/api/tx/${cleanHash}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.status?.confirmed === true) return "confirmed";
    }
  } catch {}
  return "pending";
}

const hotWalletQueues = new Map<string, Promise<unknown>>();
const HOT_WALLET_LOCK_TTL_MS = 90_000;

async function withHotWalletLock<T>(
  assetKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = hotWalletQueues.get(assetKey) || Promise.resolve();
  let releaseLocal!: () => void;
  const gate = new Promise<void>((res) => {
    releaseLocal = res;
  });
  const chained = prev.then(() => gate);
  hotWalletQueues.set(assetKey, chained);

  await prev.catch(() => {});
  const lockToken = crypto.randomBytes(8).toString("hex");
  let mongoLocked = false;
  let dbRef: Awaited<ReturnType<typeof getMongoDb>> = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const strictDb = process.env.NODE_ENV === "production" || isMongoConfigured();

  try {
    dbRef = await getMongoDb();
    if (!dbRef) {
      if (strictDb) {
        throw new Error(`Database unavailable for hot wallet lock (${assetKey}).`);
      }
      return await fn();
    }

    const col = dbRef.collection("liquidity_locks");
    for (let attempt = 0; attempt < 20; attempt++) {
      const now = Date.now();
      try {
        await col.findOneAndUpdate(
          {
            _id: assetKey as any,
            $or: [{ expiresAt: { $lte: now } }, { ownerToken: lockToken }],
          } as any,
          {
            $set: {
              ownerToken: lockToken,
              expiresAt: now + HOT_WALLET_LOCK_TTL_MS,
            },
          },
          { upsert: true }
        );
        mongoLocked = true;
        break;
      } catch (err: any) {
        if (err?.code === 11000) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        break;
      }
    }
    if (!mongoLocked) {
      throw new Error(`Liquidity hot wallet busy for ${assetKey}; please retry.`);
    }

    // Renew lock TTL every 20s so slow confirmations never allow overlapping payouts
    heartbeat = setInterval(() => {
      dbRef
        ?.collection("liquidity_locks")
        .updateOne(
          { _id: assetKey as any, ownerToken: lockToken },
          { $set: { expiresAt: Date.now() + HOT_WALLET_LOCK_TTL_MS } }
        )
        .catch(() => {});
    }, 20_000);
    if (typeof (heartbeat as any).unref === "function") {
      (heartbeat as any).unref();
    }

    return await fn();
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    if (mongoLocked && dbRef) {
      await dbRef
        .collection("liquidity_locks")
        .deleteOne({ _id: assetKey as any, ownerToken: lockToken })
        .catch(() => {});
    }
    releaseLocal();
    if (hotWalletQueues.get(assetKey) === chained) {
      hotWalletQueues.delete(assetKey);
    }
  }
}

/**
 * Dispatches an on-chain payout or withdrawal from the specified Liquidity Hot Wallet.
 * Invokes `onBroadcast` immediately after RPC broadcast acceptance (before receipt wait) so crash recovery never double-pays.
 */
export async function sendFromLiquidityWallet(params: {
  assetKey: PoolAssetDefinition["assetKey"];
  toAddress: string;
  amountAtomic: bigint;
  enforceMinReserve?: boolean;
  enforceConfirmedUnreserved?: boolean;
  onBroadcast?: (txHash: string, fromAddress: string) => Promise<void>;
}): Promise<{ txHash: string; explorerUrl: string; fromAddress: string }> {
  const {
    assetKey,
    toAddress,
    amountAtomic,
    enforceMinReserve = false,
    enforceConfirmedUnreserved = false,
    onBroadcast,
  } = params;
  const def = POOL_SUPPORTED_ASSETS[assetKey];
  if (!def) {
    throw new Error(`Unsupported liquidity pool asset: ${assetKey}`);
  }
  if (amountAtomic <= 0n) {
    throw new Error("Transfer amount must be greater than zero.");
  }

  return withHotWalletLock(assetKey, async () => {
    let minReserveAtomic = 0n;
    let reservedAtomic = 0n;
    if (enforceMinReserve || enforceConfirmedUnreserved) {
      const cfg = await getLiquidityPoolConfig();
      const minReserveHuman =
        cfg.minReserveByAsset?.[def.assetKey] || def.defaultMinReserveHuman;
      minReserveAtomic = parseHumanToAtomic(minReserveHuman, def.decimals);
    }
    if (enforceConfirmedUnreserved) {
      const reservedMap = await getActiveReservedLiquidityByAsset({ confirmedOnly: true });
      reservedAtomic = reservedMap[assetKey] || 0n;
    }

    const cleanTo = (toAddress || "").trim();

    if (assetKey === "polygon:USDT") {
      const w = getEvmLiquidityWallet();
      if (!w.configured || !w.account || !w.address) {
        throw new Error("Polygon liquidity wallet is not configured.");
      }
      if (!isAddress(cleanTo)) {
        throw new Error(`Invalid Polygon recipient address: ${cleanTo}`);
      }
      const publicClient = getResilientPublicClientForChain("polygon");
      if (enforceMinReserve || enforceConfirmedUnreserved) {
        const liveBal = (await publicClient.readContract({
          address: def.tokenAddress!,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [w.address],
        })) as bigint;
        const required = amountAtomic + minReserveAtomic + reservedAtomic;
        if (liveBal < required) {
          throw new Error(
            `Polygon USDT payout would breach reserve/reservation floor (balance=${liveBal}, required=${required}).`
          );
        }
      }
      const { chain, transports } = getEvmRpcConfig("polygon");
      const walletClient = createWalletClient({
        account: w.account,
        chain,
        transport: fallback(transports, { rank: false, retryCount: 2 }),
      });

      const res = await sendResilientErc20Transfer({
        chainKey: "polygon",
        publicClient,
        walletClient,
        proxyAccount: w.account,
        tokenAddress: def.tokenAddress!,
        to: getAddress(cleanTo as `0x${string}`),
        amount: amountAtomic,
      });

      if (!res.txHash) {
        throw new Error(res.error || "Polygon USDT transfer failed to broadcast.");
      }

      if (onBroadcast) {
        await onBroadcast(res.txHash, w.address).catch(() => {});
      }

      const receipt = await publicClient
        .waitForTransactionReceipt({ hash: res.txHash, timeout: 45_000 })
        .catch(() => null);
      if (!receipt || receipt.status !== "success") {
        const isReverted = Boolean(receipt && receipt.status !== "success");
        const err: any = new Error(
          isReverted
            ? `Polygon USDT transfer ${res.txHash} reverted on-chain.`
            : `Polygon USDT transfer ${res.txHash} confirmation timed out.`
        );
        err.txHash = res.txHash;
        err.broadcasted = true;
        err.reverted = isReverted;
        throw err;
      }

      return {
        txHash: res.txHash,
        explorerUrl: getExplorerTxUrl("polygon", res.txHash),
        fromAddress: w.address,
      };
    }

    if (assetKey === "sol:SOL") {
      const w = getSolLiquidityWallet();
      if (!w.configured || !w.address || !w.privKeySeedHex) {
        throw new Error("Solana liquidity wallet is not configured.");
      }
      if (amountAtomic < 10_000n) {
        throw new Error("Solana payout amount is below minimum transfer threshold.");
      }
      if (enforceMinReserve || enforceConfirmedUnreserved) {
        const balRes = await fetchResilientSolanaRpc("getBalance", [
          w.address,
          { commitment: "confirmed" },
        ]);
        const liveLamports = BigInt(balRes?.value || 0);
        const required = amountAtomic + minReserveAtomic + reservedAtomic + 15_000n;
        if (liveLamports < required) {
          throw new Error(
            `Solana SOL payout would breach reserve/reservation floor (balance=${liveLamports}, required=${required}).`
          );
        }
      }

      const txSig = await sendSolanaMultiTransfer({
        fromPubkeyBase58: w.address,
        fromPrivKeyHex: w.privKeySeedHex,
        outputs: [{ toBase58: cleanTo, lamports: amountAtomic }],
      });

      if (onBroadcast) {
        await onBroadcast(txSig, w.address).catch(() => {});
      }

      try {
        const conf = await waitForSolanaSignature(txSig, 25_000);
        if (conf === "timeout") {
          const err: any = new Error(`Solana payout ${txSig} confirmation timed out.`);
          err.txHash = txSig;
          err.broadcasted = true;
          err.reverted = false;
          throw err;
        }
      } catch (waitErr: any) {
        if (!waitErr.broadcasted) {
          waitErr.txHash = txSig;
          waitErr.broadcasted = true;
          waitErr.reverted = true;
        }
        throw waitErr;
      }

      return {
        txHash: txSig,
        explorerUrl: getExplorerTxUrl("sol", txSig),
        fromAddress: w.address,
      };
    }

    // Litecoin (ltc:LTC)
    const w = getLtcLiquidityWallet();
    if (!w.configured || !w.address || !w.privKeyHex) {
      throw new Error("Litecoin liquidity wallet is not configured.");
    }
    if (enforceMinReserve || enforceConfirmedUnreserved) {
      const ltcBal = await getLtcBalanceAndUtxos(w.address);
      const required = amountAtomic + minReserveAtomic + reservedAtomic + 3000n;
      if (ltcBal.confirmedBalanceSatoshis < required) {
        throw new Error(
          `Litecoin LTC payout would breach reserve/reservation floor (confirmed=${ltcBal.confirmedBalanceSatoshis}, required=${required}).`
        );
      }
    }

    const txid = await sendLtcFromLiquidityWallet({
      fromAddress: w.address,
      privKeyInput: w.privKeyHex,
      toAddress: cleanTo,
      amountSatoshis: amountAtomic,
    });

    if (onBroadcast) {
      await onBroadcast(txid, w.address).catch(() => {});
    }

    return {
      txHash: txid,
      explorerUrl: getExplorerTxUrl("ltc", txid),
      fromAddress: w.address,
    };
  });
}
