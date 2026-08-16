import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const API_BASE_URL = "https://sideshift.ai/api/v2";

export async function GET(req: Request) {
  try {
    const SIDESHIFT_AFFILIATE_ID = process.env.SIDESHIFT_AFFILIATE_ID;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!SIDESHIFT_AFFILIATE_ID) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing exchange ID" }, { status: 400 });
    }

    const userIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
                   req.headers.get("cf-connecting-ip")?.trim() || 
                   req.headers.get("x-real-ip")?.trim() || "";

    const headers: Record<string, string> = {};
    if (userIp) {
      headers["x-user-ip"] = userIp;
    }
    if (process.env.SIDESHIFT_SECRET) {
      headers["x-sideshift-secret"] = process.env.SIDESHIFT_SECRET;
    }

    const response = await fetch(`${API_BASE_URL}/shifts/${id}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({
      status: data.status,
      // SideShift specific fields can also be mapped here if needed
      depositAmount: data.depositAmount,
      settleAmount: data.settleAmount,
      txId: data.settleTx ? data.settleTx.txHash : null,
    });
  } catch (error: any) {
    console.error("SideShift Status Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
