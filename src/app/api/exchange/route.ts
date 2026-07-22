import { NextResponse } from "next/server";

const SIDESHIFT_AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID;
const API_BASE_URL = "https://sideshift.ai/api/v2";

export async function POST(req: Request) {
  try {
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

    const response = await fetch(`${API_BASE_URL}/shifts/variable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
