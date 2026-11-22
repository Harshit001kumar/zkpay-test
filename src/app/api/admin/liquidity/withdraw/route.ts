import { NextResponse } from "next/server";
import { parseUnits, formatUnits } from "viem";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import {
  POOL_SUPPORTED_ASSETS,
  type PoolAssetDefinition,
  recordLiquidityTransfer,
} from "@/lib/server/liquidityConfig";
import {
  getLiquidityBalances,
  sendFromLiquidityWallet,
} from "@/lib/server/liquidityWallets";
import { sweepInternalProxyToLiquidityWallet } from "@/lib/server/liquidityEngine";
import { getProxyOrderBySwapId, getActiveReservedLiquidityByAsset } from "@/lib/server/proxySwapStore";
import { creditPartnerFeeOnSettlement } from "@/lib/server/partnerBalanceStore";
import { getTreasuryAddressForChain } from "@/lib/constants";
import { isValidAddressForOriginAsset } from "@/lib/refundAddress";
import { getLiveTokenPriceUsd } from "@/lib/server/priceService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = body.action || "withdraw";

    if (action === "retry_sweep") {
      const swapId = (body.swapId || "").trim();
      if (!swapId) {
        return NextResponse.json({ error: "Missing swapId for sweep retry." }, { status: 400 });
      }
      const order = await getProxyOrderBySwapId(swapId);
      if (!order) {
        return NextResponse.json({ error: "Swap order not found." }, { status: 404 });
      }
      const res = await sweepInternalProxyToLiquidityWallet(order);
      if (!res.swept) {
        return NextResponse.json(
          { success: false, error: res.error || "Sweep retry did not complete." },
          { status: 400 }
        );
      }
      const refreshed = (await getProxyOrderBySwapId(swapId)) || order;
      await creditPartnerFeeOnSettlement(refreshed).catch(() => {});
      return NextResponse.json({
        success: true,
        txHash: res.txHash,
        message: "Successfully swept proxy deposit into liquidity wallet.",
      });
    }

    // action: "withdraw" | "harvest_fees"
    const assetKey = (body.assetKey || "").trim() as PoolAssetDefinition["assetKey"];
    const def = POOL_SUPPORTED_ASSETS[assetKey];
    if (!def) {
      return NextResponse.json(
        { error: "Invalid assetKey. Expected ltc:LTC, sol:SOL, or polygon:USDT." },
        { status: 400 }
      );
    }

    const amountHuman = String(body.amount || "").trim();
    if (!amountHuman || isNaN(Number(amountHuman)) || Number(amountHuman) <= 0) {
      return NextResponse.json(
        { error: "Invalid withdrawal amount." },
        { status: 400 }
      );
    }

    const amountAtomic = parseUnits(amountHuman, def.decimals);
    const balances = await getLiquidityBalances();
    const status = balances[assetKey];
    if (!status || !status.configured) {
      return NextResponse.json(
        { error: `${def.name} liquidity wallet is not configured.` },
        { status: 400 }
      );
    }

    const confirmedReservedMap = await getActiveReservedLiquidityByAsset({ confirmedOnly: true });
    const confirmedReserved = confirmedReservedMap[assetKey] || 0n;
    const onChainAtomic = BigInt(status.confirmedBalanceAtomic || status.onChainBalanceAtomic || "0");
    const minResAtomic = BigInt(status.minReserveAtomic || "0");
    const availableAtomic =
      onChainAtomic > confirmedReserved + minResAtomic
        ? onChainAtomic - confirmedReserved - minResAtomic
        : 0n;
    if (amountAtomic > availableAtomic) {
      return NextResponse.json(
        {
          error: `Requested amount (${amountHuman} ${def.symbol}) exceeds confirmed unreserved liquidity (${formatUnits(availableAtomic, def.decimals)} ${def.symbol}). In-flight confirmed swaps and minimum reserve floors are protected.`,
        },
        { status: 400 }
      );
    }

    const rawDest = (body.destination || "treasury").trim();
    const destination =
      rawDest.toLowerCase() === "treasury"
        ? getTreasuryAddressForChain(def.chain)
        : rawDest;

    if (!isValidAddressForOriginAsset(def.assetId, destination)) {
      return NextResponse.json(
        { error: `Invalid destination address '${destination}' for ${def.chain.toUpperCase()}.` },
        { status: 400 }
      );
    }

    const txRes = await sendFromLiquidityWallet({
      assetKey,
      toAddress: destination,
      amountAtomic,
    });

    const priceUsd = await getLiveTokenPriceUsd(def.symbol);
    const amountNum = Number(formatUnits(amountAtomic, def.decimals));
    const transferRec = await recordLiquidityTransfer({
      type: action === "harvest_fees" ? "FEE_HARVEST" : "ADMIN_WITHDRAW",
      assetKey: def.assetKey,
      chain: def.chain,
      symbol: def.symbol,
      amountAtomic: amountAtomic.toString(),
      amountFormatted: amountHuman,
      amountUsd: Math.round(amountNum * (priceUsd || 0) * 10000) / 10000,
      txHash: txRes.txHash,
      explorerUrl: txRes.explorerUrl,
      fromAddress: txRes.fromAddress,
      toAddress: destination,
      note:
        body.note ||
        (action === "harvest_fees"
          ? "Admin fee harvest to Treasury"
          : `Admin liquidity withdrawal to ${destination}`),
    });

    return NextResponse.json({
      success: true,
      txHash: txRes.txHash,
      explorerUrl: txRes.explorerUrl,
      transfer: transferRec,
    });
  } catch (err: any) {
    console.error("[AdminLiquidityWithdraw] POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to execute liquidity withdrawal" },
      { status: 500 }
    );
  }
}
