import { NextResponse } from "next/server";
import { parseAbi, formatUnits } from "viem";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { getMongoDb } from "@/lib/server/mongodb";
import { listAllApiKeys } from "@/lib/server/apiKeysStore";
import {
  reconcilePartnerSwaps,
  listAdminPayoutRequests,
  PartnerBalanceRecord,
  PartnerFeeCreditRecord,
} from "@/lib/server/partnerBalanceStore";
import { ProxySwapOrder, getRecentProxyOrders } from "@/lib/server/proxySwapStore";
import { getLiveTokenPriceUsd } from "@/lib/server/priceService";
import { CONTRACTS, SWAP_ALLOWED_TOKENS, getTreasuryAddressForChain } from "@/lib/constants";
import { getResilientPublicClientForChain, fetchResilientSolanaRpc } from "@/lib/server/rpcConfig";

export const dynamic = "force-dynamic";

const ERC20_BALANCE_ABI = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

const EVM_TREASURY_TOKENS: Record<
  string,
  Array<{ symbol: string; address: `0x${string}`; decimals: number }>
> = {
  base: [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
  ],
  polygon: [
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
  ],
  arb: [
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
  ],
  bsc: [
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  ],
};

function resolveCanonicalAsset(order: { fromAsset?: string; originAssetId?: string }): {
  symbol: string;
  decimals: number;
} {
  const found = SWAP_ALLOWED_TOKENS.find(
    (t) => t.assetId.toLowerCase() === (order.originAssetId || "").toLowerCase()
  );
  if (found) {
    return { symbol: found.symbol.toUpperCase(), decimals: found.decimals };
  }
  let sym = (order.fromAsset || "").toUpperCase();
  if (sym === "BASE" || sym === "ARB") sym = "ETH";
  else if (sym === "BSC") sym = "BNB";
  else if (sym === "POLYGON") sym = "POL";
  else if (sym === "V2_1") {
    sym = order.originAssetId?.includes("3hpYoaLtt8MP1Z2GH1U473DMRKgr") ? "USDT" : "USDC";
  }
  const decimals =
    sym.includes("USDC") || sym.includes("USDT")
      ? 6
      : sym.includes("SOL")
      ? 9
      : sym.includes("BTC") || sym.includes("LTC")
      ? 8
      : 18;
  return { symbol: sym || "USDC", decimals };
}

function getTxExplorerUrl(chain: string, txHash?: string | null): string | null {
  if (!txHash) return null;
  const c = (chain || "").toLowerCase();
  if (c.includes("sol")) return `https://solscan.io/tx/${txHash}`;
  if (c.includes("ltc") || c.includes("lite")) return `https://litecoinspace.org/tx/${txHash}`;
  if (c.includes("poly") || c.includes("matic")) return `https://polygonscan.com/tx/${txHash}`;
  if (c.includes("arb")) return `https://arbiscan.io/tx/${txHash}`;
  if (c.includes("bsc") || c.includes("bnb")) return `https://bscscan.com/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

async function fetchLiveTreasuryHoldings(prices: Record<string, number>) {
  const evmTreasury = getTreasuryAddressForChain("base") as `0x${string}`;
  const solTreasury = getTreasuryAddressForChain("sol");
  const ltcTreasury = getTreasuryAddressForChain("ltc");

  const holdings: Array<{
    chain: string;
    symbol: string;
    address: string;
    balanceFormatted: string;
    usdValue: number;
    explorerUrl: string;
  }> = [];

  const evmChains: Array<{
    key: "base" | "polygon" | "arb" | "bsc";
    label: string;
    nativeSymbol: string;
    explorerBase: string;
  }> = [
    { key: "base", label: "Base", nativeSymbol: "ETH", explorerBase: "https://basescan.org/address/" },
    { key: "polygon", label: "Polygon", nativeSymbol: "POL", explorerBase: "https://polygonscan.com/address/" },
    { key: "arb", label: "Arbitrum", nativeSymbol: "ETH", explorerBase: "https://arbiscan.io/address/" },
    { key: "bsc", label: "BSC", nativeSymbol: "BNB", explorerBase: "https://bscscan.com/address/" },
  ];

  await Promise.all([
    ...evmChains.map(async (c) => {
      try {
        const chainTreasury = (getTreasuryAddressForChain(c.key) || evmTreasury) as `0x${string}`;
        const client = getResilientPublicClientForChain(c.key);
        const tokens = EVM_TREASURY_TOKENS[c.key] || [];
        const [nativeWei, ...tokenBals] = await Promise.all([
          client.getBalance({ address: chainTreasury }).catch(() => 0n),
          ...tokens.map((t) =>
            client
              .readContract({
                address: t.address,
                abi: ERC20_BALANCE_ABI,
                functionName: "balanceOf",
                args: [chainTreasury],
              })
              .catch(() => 0n)
          ),
        ]);

        const nativeNum = Number(formatUnits(nativeWei, 18));
        const nativeUsd = nativeNum * (prices[c.nativeSymbol] || 0);
        if (nativeNum > 0.000001 || c.key === "base") {
          holdings.push({
            chain: c.label,
            symbol: c.nativeSymbol,
            address: chainTreasury,
            balanceFormatted: nativeNum.toFixed(6).replace(/\.?0+$/, "") || "0",
            usdValue: Math.round(nativeUsd * 10000) / 10000,
            explorerUrl: `${c.explorerBase}${chainTreasury}`,
          });
        }

        tokens.forEach((t, idx) => {
          const rawBal = (tokenBals[idx] as bigint) || 0n;
          const num = Number(formatUnits(rawBal, t.decimals));
          const usd = num * (prices[t.symbol] || 1);
          if (num > 0.0001 || (c.key === "base" && t.symbol === "USDC") || (c.key === "polygon" && t.symbol === "USDT")) {
            holdings.push({
              chain: c.label,
              symbol: t.symbol,
              address: chainTreasury,
              balanceFormatted: num.toFixed(4).replace(/\.?0+$/, "") || "0",
              usdValue: Math.round(usd * 10000) / 10000,
              explorerUrl: `${c.explorerBase}${chainTreasury}`,
            });
          }
        });
      } catch {
        // non-fatal
      }
    }),
    (async () => {
      try {
        const solRes = await fetchResilientSolanaRpc("getBalance", [solTreasury]);
        const lamports = BigInt(solRes?.value || 0);
        const solNum = Number(lamports) / 1e9;
        const solUsd = solNum * (prices.SOL || 0);
        holdings.push({
          chain: "Solana",
          symbol: "SOL",
          address: solTreasury,
          balanceFormatted: solNum.toFixed(6).replace(/\.?0+$/, "") || "0",
          usdValue: Math.round(solUsd * 10000) / 10000,
          explorerUrl: `https://solscan.io/account/${solTreasury}`,
        });
      } catch {
        // non-fatal
      }
    })(),
    (async () => {
      try {
        const { getLtcBalanceAndUtxos } = await import("@/lib/server/ltcClient");
        const { balanceSatoshis } = await getLtcBalanceAndUtxos(ltcTreasury);
        const ltcNum = Number(balanceSatoshis) / 1e8;
        const ltcUsd = ltcNum * (prices.LTC || 0);
        holdings.push({
          chain: "Litecoin",
          symbol: "LTC",
          address: ltcTreasury,
          balanceFormatted: ltcNum.toFixed(6).replace(/\.?0+$/, "") || "0",
          usdValue: Math.round(ltcUsd * 10000) / 10000,
          explorerUrl: `https://litecoinspace.org/address/${ltcTreasury}`,
        });
      } catch {
        // non-fatal
      }
    })(),
  ]);

  holdings.sort((a, b) => b.usdValue - a.usdValue);
  const totalTreasuryHoldingsUsd =
    Math.round(holdings.reduce((acc, h) => acc + h.usdValue, 0) * 10000) / 10000;

  return {
    evmTreasuryAddress: evmTreasury,
    solanaTreasuryAddress: solTreasury,
    ltcTreasuryAddress: ltcTreasury,
    totalTreasuryHoldingsUsd,
    holdings,
  };
}

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const db = await getMongoDb();
    const allApiKeys = await listAllApiKeys();
    const allPayouts = await listAdminPayoutRequests("ALL");

    // Map keyId -> ApiKeyRecord and walletAddress -> userId
    const keyById = new Map(allApiKeys.map((k) => [k.id, k]));
    const userIdByWallet = new Map<string, string>();
    for (const k of allApiKeys) {
      if (k.walletAddress && k.userId) {
        userIdByWallet.set(k.walletAddress.toLowerCase(), k.userId);
      }
    }

    // Collect all partner userIds
    const partnerUserIds = new Set<string>();
    for (const k of allApiKeys) {
      if (k.userId) partnerUserIds.add(k.userId);
    }

    // Reconcile partner swaps so all settled partner swaps are credited & repaired
    for (const uid of partnerUserIds) {
      await reconcilePartnerSwaps(uid).catch(() => {});
    }

    // Load all proxy swap orders, partner balances, and partner fee credits
    let allOrders: ProxySwapOrder[] = [];
    let balanceRecords: PartnerBalanceRecord[] = [];
    let creditRecords: PartnerFeeCreditRecord[] = [];

    if (db) {
      const [ordersDocs, balDocs, credDocs] = await Promise.all([
        db
          .collection<ProxySwapOrder>("proxy_swap_orders")
          .find({})
          .sort({ createdAt: -1 })
          .limit(500)
          .toArray(),
        db.collection<PartnerBalanceRecord>("partner_balances").find({}).toArray(),
        db
          .collection<PartnerFeeCreditRecord>("partner_fee_credits")
          .find({})
          .sort({ settledAt: -1 })
          .limit(500)
          .toArray(),
      ]);
      allOrders = ordersDocs as ProxySwapOrder[];
      balanceRecords = balDocs as PartnerBalanceRecord[];
      creditRecords = credDocs as PartnerFeeCreditRecord[];
    } else {
      allOrders = await getRecentProxyOrders(200);
    }

    for (const b of balanceRecords) {
      if (b.userId) partnerUserIds.add(b.userId);
    }
    for (const o of allOrders) {
      if (o.partnerUserId) partnerUserIds.add(o.partnerUserId);
    }

    // Pre-fetch live USD prices for all supported assets
    const symbols = ["USDC", "USDT", "SOL", "ETH", "BNB", "POL", "LTC", "BTC"];
    const priceEntries = await Promise.all(
      symbols.map(async (sym) => [sym, await getLiveTokenPriceUsd(sym)] as const)
    );
    const livePrices: Record<string, number> = Object.fromEntries(priceEntries);

    // Map credit by swapId for exact historical USD rate lookup
    const creditBySwapId = new Map<string, PartnerFeeCreditRecord>();
    for (const c of creditRecords) {
      creditBySwapId.set(c.swapId, c);
    }

    // Aggregate Global Revenue & Per-Partner Metrics
    let grossFeesCollectedUsd = 0;
    let totalPartnerFeeShareUsd = 0;
    let zkpayNetProfitUsd = 0;
    let totalSettledVolumeUsd = 0;
    let settledSwapsCount = 0;
    let settledPartnerSwapsCount = 0;
    let settledInAppSwapsCount = 0;
    let totalPartnerSwapsCount = 0;
    let totalInAppSwapsCount = 0;

    const feesByAssetMap = new Map<
      string,
      {
        symbol: string;
        settledCount: number;
        grossFeeToken: number;
        grossFeeUsd: number;
        partnerShareUsd: number;
        zkpayProfitUsd: number;
      }
    >();

    // Per-partner accumulator
    interface PartnerAcc {
      userId: string;
      walletAddress: string | null;
      apiKeys: typeof allApiKeys;
      swaps: {
        total: number;
        settled: number;
        forwarded: number;
        pending: number;
        expiredOrFailed: number;
        settledVolumeUsd: number;
      };
      fees: {
        grossFeesGeneratedUsd: number;
        partnerShareEarnedUsd: number;
        zkpayProfitFromPartnerUsd: number;
      };
      balance: {
        availableBalanceUsd: number;
        pendingPayoutUsd: number;
        totalEarnedUsd: number;
        totalWithdrawnUsd: number;
      };
      recentSwaps: any[];
      recentCredits: PartnerFeeCreditRecord[];
      payouts: any[];
    }

    const partnerMap = new Map<string, PartnerAcc>();
    const ensurePartner = (userId: string): PartnerAcc => {
      let existing = partnerMap.get(userId);
      if (!existing) {
        const bal = balanceRecords.find((b) => b.userId === userId);
        const keys = allApiKeys.filter((k) => k.userId === userId);
        const wallet =
          keys.find((k) => k.walletAddress)?.walletAddress ||
          allPayouts.find((p) => p.partnerUserId === userId && p.partnerWalletAddress)
            ?.partnerWalletAddress ||
          null;
        existing = {
          userId,
          walletAddress: wallet,
          apiKeys: keys,
          swaps: {
            total: 0,
            settled: 0,
            forwarded: 0,
            pending: 0,
            expiredOrFailed: 0,
            settledVolumeUsd: 0,
          },
          fees: {
            grossFeesGeneratedUsd: 0,
            partnerShareEarnedUsd: 0,
            zkpayProfitFromPartnerUsd: 0,
          },
          balance: {
            availableBalanceUsd: Math.max(0, Math.round((bal?.availableBalanceUsd || 0) * 10000) / 10000),
            pendingPayoutUsd: Math.max(0, Math.round((bal?.pendingPayoutUsd || 0) * 10000) / 10000),
            totalEarnedUsd: Math.max(0, Math.round((bal?.totalEarnedUsd || 0) * 10000) / 10000),
            totalWithdrawnUsd: Math.max(0, Math.round((bal?.totalWithdrawnUsd || 0) * 10000) / 10000),
          },
          recentSwaps: [],
          recentCredits: creditRecords.filter((c) => c.partnerUserId === userId).slice(0, 25),
          payouts: allPayouts.filter((p) => p.partnerUserId === userId).slice(0, 25),
        };
        partnerMap.set(userId, existing);
      }
      return existing;
    };

    for (const uid of partnerUserIds) {
      ensurePartner(uid);
    }

    const recentFeeLedger: any[] = [];

    for (const ord of allOrders) {
      // Identify partner if any
      let pUserId = ord.partnerUserId || null;
      if (!pUserId && ord.apiKeyId) {
        pUserId = keyById.get(ord.apiKeyId)?.userId || null;
      }
      if (!pUserId && ord.partnerFeeRecipient) {
        pUserId = userIdByWallet.get(ord.partnerFeeRecipient.toLowerCase()) || null;
      }

      const isPartnerSwap = Boolean(pUserId || ord.apiKeyId || ord.source === "api");
      if (isPartnerSwap) {
        totalPartnerSwapsCount++;
      } else {
        totalInAppSwapsCount++;
      }

      const { symbol, decimals } = resolveCanonicalAsset(ord);
      const credit = creditBySwapId.get(ord.swapId);
      const tokenPriceUsd =
        credit?.usdRate && credit.usdRate > 0 ? credit.usdRate : livePrices[symbol] || 0;

      const isRefunded = Boolean(ord.error && ord.error.toLowerCase().includes("refund"));
      const isSettled = ord.status === "SETTLED" && !isRefunded;

      let totalInHuman = 0;
      let grossFeeHuman = 0;
      let partnerFeeHuman = 0;
      try {
        totalInHuman = Number(BigInt(ord.totalAmountIn || "0")) / Math.pow(10, decimals);
        grossFeeHuman = Number(BigInt(ord.feeAmount || "0")) / Math.pow(10, decimals);
        partnerFeeHuman = Number(BigInt(ord.partnerFeeAmount || "0")) / Math.pow(10, decimals);
      } catch {
        // ignore
      }

      const swapVolumeUsd = Math.round(totalInHuman * tokenPriceUsd * 100) / 100;
      const grossFeeUsd = isSettled ? Math.round(grossFeeHuman * tokenPriceUsd * 10000) / 10000 : 0;
      const partnerFeeUsd = isSettled
        ? credit?.feeUsd !== undefined
          ? credit.feeUsd
          : ord.partnerFeeUsd !== undefined
          ? ord.partnerFeeUsd
          : isPartnerSwap
          ? Math.round(partnerFeeHuman * tokenPriceUsd * 10000) / 10000
          : 0
        : 0;
      const netZkpayProfitUsd = isSettled
        ? Math.max(0, Math.round((grossFeeUsd - partnerFeeUsd) * 10000) / 10000)
        : 0;

      if (isSettled) {
        settledSwapsCount++;
        if (isPartnerSwap) settledPartnerSwapsCount++;
        else settledInAppSwapsCount++;

        totalSettledVolumeUsd += swapVolumeUsd;
        grossFeesCollectedUsd += grossFeeUsd;
        totalPartnerFeeShareUsd += partnerFeeUsd;
        zkpayNetProfitUsd += netZkpayProfitUsd;

        const assetStat = feesByAssetMap.get(symbol) || {
          symbol,
          settledCount: 0,
          grossFeeToken: 0,
          grossFeeUsd: 0,
          partnerShareUsd: 0,
          zkpayProfitUsd: 0,
        };
        assetStat.settledCount += 1;
        assetStat.grossFeeToken += grossFeeHuman;
        assetStat.grossFeeUsd += grossFeeUsd;
        assetStat.partnerShareUsd += partnerFeeUsd;
        assetStat.zkpayProfitUsd += netZkpayProfitUsd;
        feesByAssetMap.set(symbol, assetStat);

        if (recentFeeLedger.length < 50) {
          recentFeeLedger.push({
            swapId: ord.swapId,
            source: isPartnerSwap ? "Partner API" : "In-App",
            partnerUserId: pUserId,
            apiKeyId: ord.apiKeyId || null,
            chain: ord.chain,
            fromAsset: symbol,
            toAsset: ord.toAsset,
            destinationChain: ord.destinationChain,
            amountFormatted: ord.totalAmountFormatted,
            swapVolumeUsd,
            grossFeeToken: grossFeeHuman.toFixed(6).replace(/\.?0+$/, "") || "0",
            grossFeeUsd,
            partnerFeeUsd,
            zkpayProfitUsd: netZkpayProfitUsd,
            tokenPriceUsd,
            feeTxHash: ord.feeTxHash || ord.forwardTxHash || null,
            explorerUrl: getTxExplorerUrl(ord.chain, ord.feeTxHash || ord.forwardTxHash),
            createdAt: ord.createdAt,
          });
        }
      }

      if (pUserId) {
        const pAcc = ensurePartner(pUserId);
        pAcc.swaps.total += 1;
        if (isSettled) {
          pAcc.swaps.settled += 1;
          pAcc.swaps.settledVolumeUsd =
            Math.round((pAcc.swaps.settledVolumeUsd + swapVolumeUsd) * 100) / 100;
          pAcc.fees.grossFeesGeneratedUsd =
            Math.round((pAcc.fees.grossFeesGeneratedUsd + grossFeeUsd) * 10000) / 10000;
          pAcc.fees.partnerShareEarnedUsd =
            Math.round((pAcc.fees.partnerShareEarnedUsd + partnerFeeUsd) * 10000) / 10000;
          pAcc.fees.zkpayProfitFromPartnerUsd =
            Math.round((pAcc.fees.zkpayProfitFromPartnerUsd + netZkpayProfitUsd) * 10000) / 10000;
        } else if (ord.status === "FORWARDED" || ord.status === "FORWARDING") {
          pAcc.swaps.forwarded += 1;
        } else if (ord.status === "PENDING_DEPOSIT" || ord.status === "DETECTED") {
          pAcc.swaps.pending += 1;
        } else {
          pAcc.swaps.expiredOrFailed += 1;
        }

        if (pAcc.recentSwaps.length < 25) {
          pAcc.recentSwaps.push({
            swapId: ord.swapId,
            chain: ord.chain,
            fromAsset: symbol,
            toAsset: ord.toAsset,
            destinationChain: ord.destinationChain,
            amountFormatted: ord.totalAmountFormatted,
            status: isRefunded ? "EXPIRED" : ord.status,
            grossFeeUsd,
            partnerFeeUsd,
            zkpayProfitUsd: netZkpayProfitUsd,
            feeTxHash: ord.feeTxHash || ord.forwardTxHash || null,
            explorerUrl: getTxExplorerUrl(ord.chain, ord.feeTxHash || ord.forwardTxHash),
            createdAt: ord.createdAt,
          });
        }
      }
    }

    const partnersList = Array.from(partnerMap.values()).map((p) => {
      // Ensure partnerShareEarnedUsd reflects at least the ledger balance totalEarnedUsd
      if (p.balance.totalEarnedUsd > p.fees.partnerShareEarnedUsd) {
        p.fees.partnerShareEarnedUsd = p.balance.totalEarnedUsd;
      }
      return p;
    });

    // Sort partners by total swaps & gross fees generated descending
    partnersList.sort(
      (a, b) =>
        b.fees.grossFeesGeneratedUsd - a.fees.grossFeesGeneratedUsd ||
        b.swaps.total - a.swaps.total
    );

    const partnerBalancesTotal = {
      availableBalanceUsd:
        Math.round(
          partnersList.reduce((acc, p) => acc + p.balance.availableBalanceUsd, 0) * 10000
        ) / 10000,
      pendingPayoutUsd:
        Math.round(partnersList.reduce((acc, p) => acc + p.balance.pendingPayoutUsd, 0) * 10000) /
        10000,
      totalWithdrawnUsd:
        Math.round(partnersList.reduce((acc, p) => acc + p.balance.totalWithdrawnUsd, 0) * 10000) /
        10000,
    };

    const feesByAsset = Array.from(feesByAssetMap.values())
      .map((a) => ({
        ...a,
        grossFeeToken: a.grossFeeToken.toFixed(6).replace(/\.?0+$/, "") || "0",
        grossFeeUsd: Math.round(a.grossFeeUsd * 10000) / 10000,
        partnerShareUsd: Math.round(a.partnerShareUsd * 10000) / 10000,
        zkpayProfitUsd: Math.round(a.zkpayProfitUsd * 10000) / 10000,
      }))
      .sort((a, b) => b.grossFeeUsd - a.grossFeeUsd);

    const onChainTreasury = await fetchLiveTreasuryHoldings(livePrices);

    return NextResponse.json({
      success: true,
      summary: {
        totalPartners: partnersList.length,
        activeApiKeys: allApiKeys.filter((k) => k.status === "ACTIVE").length,
        totalApiKeys: allApiKeys.length,
        totalSwapsCount: allOrders.length,
        totalPartnerSwapsCount,
        totalInAppSwapsCount,
        settledSwapsCount,
        settledPartnerSwapsCount,
        settledInAppSwapsCount,
        totalSettledVolumeUsd: Math.round(totalSettledVolumeUsd * 100) / 100,
        grossFeesCollectedUsd: Math.round(grossFeesCollectedUsd * 10000) / 10000,
        partnerFeeShareUsd: Math.round(totalPartnerFeeShareUsd * 10000) / 10000,
        zkpayNetProfitUsd: Math.round(zkpayNetProfitUsd * 10000) / 10000,
        partnerBalancesTotal,
        feesByAsset,
      },
      onChainTreasury,
      partners: partnersList,
      recentFeeLedger,
      livePrices,
    });
  } catch (err: any) {
    console.error("[AdminPartners] GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load partner & revenue analytics" },
      { status: 500 }
    );
  }
}
