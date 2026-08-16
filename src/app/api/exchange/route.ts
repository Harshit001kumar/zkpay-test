import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const API_BASE_URL = "https://sideshift.ai/api/v2";

export async function POST(req: Request) {
  try {
    const SIDESHIFT_AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID;
    const body = await req.json();
    const { depositCoin, depositNetwork, settleCoin, settleNetwork, settleAddress } = body;

    if (!SIDESHIFT_AFFILIATE_ID) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    if (!depositCoin || !settleCoin || !depositNetwork || !settleNetwork || !settleAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
      depositCoin,
      depositNetwork,
      settleCoin,
      settleNetwork,
      settleAddress,
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

    const response = await fetch(`${API_BASE_URL}/shifts/variable`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || data.message || "Failed to create shift" }, { status: response.status });
    }

    // Map SideShift response to frontend expectations
    return NextResponse.json({
      id: data.id,
      payinAddress: data.depositAddress,
    });
  } catch (error: any) {
    console.error("SideShift Exchange Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
