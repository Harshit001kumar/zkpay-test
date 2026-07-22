import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const SIDESHIFT_AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID;
const API_BASE_URL = "https://sideshift.ai/api/v2";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const depositCoin = searchParams.get("depositCoin");
    const depositNetwork = searchParams.get("depositNetwork");
    const settleCoin = searchParams.get("settleCoin");
    const settleNetwork = searchParams.get("settleNetwork");
    const depositAmount = searchParams.get("depositAmount");

    if (!SIDESHIFT_AFFILIATE_ID) {
      return NextResponse.json({ error: "API key is missing. Set SIDESHIFT_AFFILIATE_ID in .env" }, { status: 500 });
    }

    if (!depositCoin || !depositNetwork || !settleCoin || !settleNetwork || !depositAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
      depositCoin,
      depositNetwork,
      settleCoin,
      settleNetwork,
      depositAmount,
      affiliateId: SIDESHIFT_AFFILIATE_ID,
    };

    console.log("[SideShift Estimate] Calling Quote API:", payload);

    const response = await fetch(`${API_BASE_URL}/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("[SideShift Estimate] Status:", response.status, "Body:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: `API returned non-JSON: ${responseText.slice(0, 200)}` }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || data.message || JSON.stringify(data) }, { status: response.status });
    }

    // SideShift returns `settleAmount` when `depositAmount` is provided.
    // Map it to `estimatedAmount` for the frontend.
    return NextResponse.json({ estimatedAmount: data.settleAmount });
  } catch (error: any) {
    console.error("[SideShift Estimate] Exception:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
