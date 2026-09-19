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
