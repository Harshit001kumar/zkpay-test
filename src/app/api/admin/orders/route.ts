import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import { SUBGRAPH_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);

  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    const query = `
      query GetRecentOrders($first: Int!) {
        orders(
          first: $first, 
          orderBy: blockTimestamp, 
          orderDirection: desc
        ) {
          id
          orderType
          user
          recipientAddr
          currency
          amount
          fiatAmount
          status
          txHash
          blockTimestamp
        }
      }
    `;

    const subRes = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { first: limit },
      }),
      cache: "no-store",
    });

    if (!subRes.ok) {
      const errText = await subRes.text();
      return NextResponse.json(
        { error: `Subgraph returned ${subRes.status}: ${errText.slice(0, 150)}`, orders: [] },
        { status: 502 }
      );
    }

    const subData = await subRes.json();
    let orders = subData?.data?.orders || [];

    if (search) {
      orders = orders.filter((o: any) =>
        o.id?.toLowerCase().includes(search) ||
        o.user?.toLowerCase().includes(search) ||
        o.recipientAddr?.toLowerCase().includes(search) ||
        o.txHash?.toLowerCase().includes(search)
      );
    }

    const formattedOrders = orders.map((o: any) => {
      const usdcAmount = (Number(o.amount || 0) / 1_000_000).toFixed(2);
      const fiat = (Number(o.fiatAmount || 0) / 1_000_000).toFixed(2);

      let statusLabel = "PENDING";
      if (o.status === "1" || o.status === 1) statusLabel = "ACCEPTED";
      else if (o.status === "2" || o.status === 2) statusLabel = "SETTLED";
      else if (o.status === "3" || o.status === 3) statusLabel = "CANCELLED";
      else if (o.status === "4" || o.status === 4) statusLabel = "DISPUTED";

      return {
        id: o.id,
        orderType: o.orderType === "1" || o.orderType === 1 ? "SELL (Cashout)" : "PAY (Merchant)",
        user: o.user,
        recipient: o.recipientAddr,
        currency: o.currency || "INR",
        usdcAmount: `${usdcAmount} USDC`,
        fiatAmount: `₹ ${fiat}`,
        status: statusLabel,
        txHash: o.txHash,
        timestamp: Number(o.blockTimestamp || 0) * 1000 || Date.now(),
      };
    });

    return NextResponse.json({
      success: true,
      count: formattedOrders.length,
      orders: formattedOrders,
    });
  } catch (error: any) {
    console.error("[Admin Orders] Error fetching subgraph orders:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders from Subgraph", orders: [] },
      { status: 500 }
    );
  }
}
