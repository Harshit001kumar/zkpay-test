import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const ONECLICK_API = "https://1click.chaindefuser.com/v0";

// Map NEAR Intents statuses → frontend-friendly statuses
function mapStatus(nearStatus: string): string {
  switch (nearStatus) {
    case "PENDING_DEPOSIT":
    case "KNOWN_DEPOSIT_TX":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "SUCCESS":
      return "settled";
    case "FAILED":
      return "failed";
    case "REFUNDED":
      return "refunded";
    case "INCOMPLETE_DEPOSIT":
      return "expired";
    default:
      return nearStatus.toLowerCase();
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const depositAddress = searchParams.get("depositAddress");

    if (!depositAddress) {
      return NextResponse.json({ error: "Missing depositAddress parameter" }, { status: 400 });
    }

    // 1. Check if depositAddress is an ephemeral proxy address
    try {
      const { getProxyOrderByAddress } = await import("@/lib/server/proxySwapStore");
      const { checkAndForwardProxyDeposit } = await import("@/lib/server/proxyForwarder");

      const proxyOrder = await getProxyOrderByAddress(depositAddress);
      if (proxyOrder) {
        let currentOrder = proxyOrder;

        if (proxyOrder.status === "PENDING_DEPOSIT" || proxyOrder.status === "FORWARDING") {
          try {
            currentOrder = await checkAndForwardProxyDeposit(proxyOrder);
          } catch (forwardErr) {
            console.warn("[ExchangeStatus] Auto-forward check warning:", forwardErr);
          }
        }

        if (currentOrder.status === "FORWARDED" || currentOrder.status === "SETTLED") {
          // Query upstream solver using solverDepositAddress
          const solverAddress = currentOrder.solverDepositAddress;
          const solverUrl = new URL(`${ONECLICK_API}/status`);
          solverUrl.searchParams.set("depositAddress", solverAddress);

          const solverHeaders: Record<string, string> = {};
          if (process.env.NEAR_INTENTS_API_KEY) {
            solverHeaders["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
          }

          const solverRes = await fetch(solverUrl.toString(), {
            method: "GET",
            headers: solverHeaders,
          });

          if (solverRes.ok) {
            const solverData = await solverRes.json();
            const swapDetails = solverData.swapDetails || {};
            const finalStatus = mapStatus(solverData.status);

            return NextResponse.json({
              status: finalStatus === "pending" ? "processing" : finalStatus,
              rawStatus: solverData.status,
              depositAmount: currentOrder.totalAmountFormatted,
              settleAmount: swapDetails.amountOutFormatted || null,
              txId: swapDetails.destinationChainTxHashes?.[0]?.hash || null,
              txExplorerUrl: swapDetails.destinationChainTxHashes?.[0]?.explorerUrl || null,
              splitFeeTxHash: currentOrder.feeTxHash || null,
              forwardTxHash: currentOrder.forwardTxHash || null,
            });
          }
        }

        return NextResponse.json({
          status: currentOrder.status === "PENDING_DEPOSIT" ? "pending" : "processing",
          rawStatus: currentOrder.status,
          depositAmount: currentOrder.totalAmountFormatted,
          settleAmount: null,
          txId: null,
          txExplorerUrl: null,
          splitFeeTxHash: currentOrder.feeTxHash || null,
          forwardTxHash: currentOrder.forwardTxHash || null,
        });
      }
    } catch (proxyLookupErr) {
      console.warn("[ExchangeStatus] Proxy lookup warning:", proxyLookupErr);
    }

    const headers: Record<string, string> = {};
    if (process.env.NEAR_INTENTS_API_KEY) {
      headers["X-API-Key"] = process.env.NEAR_INTENTS_API_KEY;
    }

    const url = new URL(`${ONECLICK_API}/status`);
    url.searchParams.set("depositAddress", depositAddress);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
    });

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: `API returned non-JSON: ${responseText.slice(0, 200)}` }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: data.message || "Status lookup failed" }, { status: response.status });
    }

    const swapDetails = data.swapDetails || {};

    return NextResponse.json({
      status: mapStatus(data.status),
      rawStatus: data.status,
      depositAmount: swapDetails.depositedAmountFormatted || null,
      settleAmount: swapDetails.amountOutFormatted || null,
      txId: swapDetails.destinationChainTxHashes?.[0]?.hash || null,
      txExplorerUrl: swapDetails.destinationChainTxHashes?.[0]?.explorerUrl || null,
    });
  } catch (error: any) {
    console.error("[NEAR Intents Status] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
