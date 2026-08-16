import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const API_BASE_URL = "https://sideshift.ai/api/v2";

export async function GET(req: Request) {
  try {
    const SIDESHIFT_AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID;
    const { searchParams } = new URL(req.url);
    const depositCoin = searchParams.get("depositCoin");
    const depositNetwork = searchParams.get("depositNetwork");
    const settleCoin = searchParams.get("settleCoin");
    const settleNetwork = searchParams.get("settleNetwork");
    const depositAmount = searchParams.get("depositAmount");

    console.log("[SideShift Estimate] SIDESHIFT_AFFILIATE_ID present:", !!SIDESHIFT_AFFILIATE_ID, "value length:", SIDESHIFT_AFFILIATE_ID?.length || 0);

    if (!SIDESHIFT_AFFILIATE_ID) {
      return NextResponse.json({ 
        error: "Exchange service is not configured — SIDESHIFT_AFFILIATE_ID env var is missing on server" 
      }, { status: 500 });
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

    const userIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                   req.headers.get("cf-connecting-ip")?.trim() || 
                   req.headers.get("x-real-ip")?.trim() || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (userIp) {
      headers["x-user-ip"] = userIp;
    }
    if (process.env.SIDESHIFT_SECRET) {
      headers["x-sideshift-secret"] = process.env.SIDESHIFT_SECRET;
    }

    console.log("[SideShift Estimate] Calling Quote API with userIp:", userIp, "payload:", payload);

    const response = await fetch(`${API_BASE_URL}/quotes`, {
      method: "POST",
      headers,
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
