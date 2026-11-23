import { NextResponse } from "next/server";
import { verifyAdminRequest, recordAdminAudit } from "@/lib/server/adminAuth";
import { enforceRateLimit, getClientIp } from "@/lib/server/rateLimit";
import {
  getLiquidityPoolConfig,
  updateLiquidityPoolConfig,
  getRecentLiquidityTransfers,
  resolvePoolAsset,
} from "@/lib/server/liquidityConfig";
import { getLiquidityBalances } from "@/lib/server/liquidityWallets";
import { getMongoDb } from "@/lib/server/mongodb";
import { getRecentProxyOrders, type ProxySwapOrder } from "@/lib/server/proxySwapStore";
import { getLiveTokenPriceUsd } from "@/lib/server/priceService";
import { getExplorerTxUrl } from "@/lib/server/proxyForwarder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const [config, balances, recentTransfers, db, ltcPrice, solPrice, usdtPrice] = await Promise.all([
      getLiquidityPoolConfig(),
      getLiquidityBalances(),
      getRecentLiquidityTransfers(50),
      getMongoDb(),
      getLiveTokenPriceUsd("LTC"),
      getLiveTokenPriceUsd("SOL"),
      getLiveTokenPriceUsd("USDT"),
    ]);

    const prices: Record<string, number> = {
      LTC: ltcPrice || 0,
      SOL: solPrice || 0,
      USDT: usdtPrice || 1,
      USDC: 1,
    };

    let allOrders: ProxySwapOrder[] = [];
    if (db) {
      allOrders = (await db
        .collection<ProxySwapOrder>("proxy_swap_orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(400)
        .toArray()) as ProxySwapOrder[];
    } else {
      allOrders = await getRecentProxyOrders(200);
    }

    let poolSwapsTotal = 0;
    let poolSwapsSettled = 0;
    let poolSwapsActive = 0;
    let poolSwapsRefunded = 0;
    let pendingSweepsCount = 0;
    let solverSwapsTotal = 0;

    let totalPoolVolumeUsd = 0;
    let grossPoolFeesUsd = 0;
    let zkpayNetPoolFeesUsd = 0;
    let partnerPoolFeesUsd = 0;

    const feesByAsset: Record<
      string,
      {
        symbol: string;
        settledCount: number;
        volumeUsd: number;
        grossFeeToken: number;
        grossFeeUsd: number;
        zkpayNetUsd: number;
        partnerShareUsd: number;
      }
    > = {};

    const internalOrders: Array<{
      swapId: string;
      chain: string;
      destinationChain: string;
      fromAsset: string;
      toAsset: string;
      amountInFormatted: string;
      amountOutFormatted: string;
      amountUsd: number;
      grossFeeFormatted: string;
      grossFeeUsd: number;
      zkpayNetFeeUsd: number;
      partnerFeeUsd: number;
      status: string;
      sweepStatus: string;
      proxyDepositAddress: string;
      recipient: string;
      refundTo: string;
      depositTxHash: string | null;
      depositExplorerUrl: string | null;
      destinationTxHash: string | null;
      destinationExplorerUrl: string | null;
      sweepTxHash: string | null;
      sweepExplorerUrl: string | null;
      refundTxHash: string | null;
      refundExplorerUrl: string | null;
      error: string | null;
      createdAt: number;
    }> = [];

    for (const o of allOrders) {
      if (o.fulfillmentMode !== "INTERNAL_POOL") {
        solverSwapsTotal++;
        continue;
      }

      poolSwapsTotal++;
      const originDef = resolvePoolAsset(o.originAssetId, o.chain);
      const decimals = originDef?.decimals ?? 6;
      const sym = (originDef?.symbol || o.fromAsset || "USDT").toUpperCase();
      const priceUsd = prices[sym] || 0;

      const inTokens =
        parseFloat(o.totalAmountFormatted) ||
        Number(BigInt(o.totalAmountIn || "0")) / Math.pow(10, decimals);
      const amountUsd = Math.round(inTokens * priceUsd * 100) / 100;

      const grossFeeTokens = Number(BigInt(o.feeAmount || "0")) / Math.pow(10, decimals);
      const zkpayFeeTokens = o.zkpayFeeAmount
        ? Number(BigInt(o.zkpayFeeAmount)) / Math.pow(10, decimals)
        : grossFeeTokens;
      const partnerFeeTokens = o.partnerFeeAmount
        ? Number(BigInt(o.partnerFeeAmount)) / Math.pow(10, decimals)
        : 0;

      const grossFeeUsd = Math.round(grossFeeTokens * priceUsd * 10000) / 10000;
      const partnerFeeUsd =
        typeof o.partnerFeeUsd === "number" && o.partnerFeeUsd > 0
          ? o.partnerFeeUsd
          : Math.round(partnerFeeTokens * priceUsd * 10000) / 10000;
      const zkpayFeeUsd = Math.round(zkpayFeeTokens * priceUsd * 10000) / 10000;

      if (o.status === "SETTLED") {
        poolSwapsSettled++;
        totalPoolVolumeUsd += amountUsd;
        grossPoolFeesUsd += grossFeeUsd;
        zkpayNetPoolFeesUsd += zkpayFeeUsd;
        partnerPoolFeesUsd += partnerFeeUsd;

        if (!feesByAsset[sym]) {
          feesByAsset[sym] = {
            symbol: sym,
            settledCount: 0,
            volumeUsd: 0,
            grossFeeToken: 0,
            grossFeeUsd: 0,
            zkpayNetUsd: 0,
            partnerShareUsd: 0,
          };
        }
        feesByAsset[sym].settledCount++;
        feesByAsset[sym].volumeUsd = Math.round((feesByAsset[sym].volumeUsd + amountUsd) * 100) / 100;
        feesByAsset[sym].grossFeeToken =
          Math.round((feesByAsset[sym].grossFeeToken + grossFeeTokens) * 1000000) / 1000000;
        feesByAsset[sym].grossFeeUsd =
          Math.round((feesByAsset[sym].grossFeeUsd + grossFeeUsd) * 10000) / 10000;
        feesByAsset[sym].zkpayNetUsd =
          Math.round((feesByAsset[sym].zkpayNetUsd + zkpayFeeUsd) * 10000) / 10000;
        feesByAsset[sym].partnerShareUsd =
          Math.round((feesByAsset[sym].partnerShareUsd + partnerFeeUsd) * 10000) / 10000;

        if (o.sweepStatus === "PENDING_SWEEP") {
          pendingSweepsCount++;
        }
      } else if (o.status === "REFUNDED" || o.status === "REFUND_PENDING") {
        poolSwapsRefunded++;
      } else if (
        o.status === "PENDING_DEPOSIT" ||
        o.status === "DETECTED" ||
        o.status === "PAYING_OUT"
      ) {
        poolSwapsActive++;
      }

      if (internalOrders.length < 75) {
        const isSettled = o.status === "SETTLED";
        internalOrders.push({
          swapId: o.swapId,
          chain: o.chain,
          destinationChain: o.destinationChain,
          fromAsset: sym,
          toAsset: o.toAsset,
          amountInFormatted: o.totalAmountFormatted,
          amountOutFormatted:
            o.settledAmountFormatted || o.expectedAmountOutFormatted || "—",
          amountUsd,
          grossFeeFormatted: isSettled
            ? `${grossFeeTokens.toFixed(6).replace(/\.?0+$/, "")} ${sym}`
            : "—",
          grossFeeUsd: isSettled ? grossFeeUsd : 0,
          zkpayNetFeeUsd: isSettled ? zkpayFeeUsd : 0,
          partnerFeeUsd: isSettled ? partnerFeeUsd : 0,
          status: o.status,
          sweepStatus: o.sweepStatus || (o.status === "SETTLED" ? "PENDING_SWEEP" : "—"),
          proxyDepositAddress: o.proxyDepositAddress,
          recipient: o.recipient,
          refundTo: o.refundTo,
          depositTxHash: o.depositTxHash || null,
          depositExplorerUrl: o.depositTxHash ? getExplorerTxUrl(o.chain, o.depositTxHash) : null,
          destinationTxHash: o.destinationTxHash || null,
          destinationExplorerUrl:
            o.destinationExplorerUrl ||
            (o.destinationTxHash ? getExplorerTxUrl(o.destinationChain, o.destinationTxHash) : null),
          sweepTxHash: o.sweepTxHash || null,
          sweepExplorerUrl: o.sweepTxHash ? getExplorerTxUrl(o.chain, o.sweepTxHash) : null,
          refundTxHash: o.refundTxHash || null,
          refundExplorerUrl: o.refundTxHash ? getExplorerTxUrl(o.chain, o.refundTxHash) : null,
          error: o.error || null,
          createdAt: o.createdAt,
        });
      }
    }

    const totalLiquidityUsd = Object.values(balances).reduce(
      (acc, b) => acc + (b.totalUsd || 0),
      0
    );
    const totalAvailableUsd = Object.values(balances).reduce(
      (acc, b) => acc + (b.availableUsd || 0),
      0
    );

    return NextResponse.json({
      success: true,
      config,
      balances,
      summary: {
        totalLiquidityUsd: Math.round(totalLiquidityUsd * 100) / 100,
        totalAvailableUsd: Math.round(totalAvailableUsd * 100) / 100,
        poolSwapsTotal,
        poolSwapsSettled,
        poolSwapsActive,
        poolSwapsRefunded,
        pendingSweepsCount,
        solverSwapsTotal,
        totalPoolVolumeUsd: Math.round(totalPoolVolumeUsd * 100) / 100,
        grossPoolFeesUsd: Math.round(grossPoolFeesUsd * 10000) / 10000,
        zkpayNetPoolFeesUsd: Math.round(zkpayNetPoolFeesUsd * 10000) / 10000,
        partnerPoolFeesUsd: Math.round(partnerPoolFeesUsd * 10000) / 10000,
      },
      feesByAsset: Object.values(feesByAsset),
      swaps: internalOrders,
      transfers: recentTransfers,
    });
  } catch (err: any) {
    console.error("[AdminLiquidity] GET error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load liquidity pool telemetry" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  const { response: rateLimitResp } = enforceRateLimit(req, "admin_write", auth.userId, { cors: false });
  if (rateLimitResp) return rateLimitResp;

  try {
    const body = await req.json();
    const updated = await updateLiquidityPoolConfig(
      {
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        pausedAssets: Array.isArray(body.pausedAssets) ? body.pausedAssets : undefined,
        maxSwapUsd:
          typeof body.maxSwapUsd === "number" && body.maxSwapUsd > 0
            ? body.maxSwapUsd
            : undefined,
        maxHourlyOutflowUsd:
          typeof body.maxHourlyOutflowUsd === "number" && body.maxHourlyOutflowUsd > 0
            ? body.maxHourlyOutflowUsd
            : undefined,
        maxDailyOutflowUsd:
          typeof body.maxDailyOutflowUsd === "number" && body.maxDailyOutflowUsd > 0
            ? body.maxDailyOutflowUsd
            : undefined,
        spreadBufferBps:
          typeof body.spreadBufferBps === "number" && body.spreadBufferBps >= 0
            ? body.spreadBufferBps
            : undefined,
        minReserveByAsset:
          body.minReserveByAsset && typeof body.minReserveByAsset === "object"
            ? body.minReserveByAsset
            : undefined,
      },
      auth.walletAddress || auth.userId || "admin"
    );

    await recordAdminAudit({
      adminUserId: auth.userId,
      adminWallet: auth.walletAddress,
      clientIp: getClientIp(req),
      action: "LIQUIDITY_CONFIG_UPDATE",
      target: `enabled=${updated.enabled},paused=${updated.pausedAssets.join("|")},maxSwapUsd=${updated.maxSwapUsd}`,
      status: "SUCCESS",
    });

    return NextResponse.json({
      success: true,
      config: updated,
    });
  } catch (err: any) {
    console.error("[AdminLiquidity] PATCH error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update liquidity config" },
      { status: 500 }
    );
  }
}
