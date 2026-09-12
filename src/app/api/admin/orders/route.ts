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
    const typeFilter = searchParams.get("type")?.toLowerCase().trim() || "all";
    const statusFilter = searchParams.get("status")?.toUpperCase().trim() || "ALL";

    // Field names match the P2P.me Goldsky subgraph schema (introspected Sept 2026):
    //   orders_collection (not orders — singular requires id arg)
    //   type (not orderType), userAddress (not user), usdcRecipientAddress (not recipientAddr),
    //   usdcAmount (not amount), transactionHash (not txHash)
    const query = `
      query GetRecentOrders($first: Int!) {
        orders_collection(
          first: $first, 
          orderBy: placedAt, 
          orderDirection: desc
        ) {
          id
          orderId
          type
          userAddress
          usdcRecipientAddress
          currency
          usdcAmount
          fiatAmount
          status
          transactionHash
          placedAt
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

    // Surface GraphQL errors instead of silently returning empty
    if (subData?.errors?.length) {
      console.error("[Admin Orders] Subgraph GraphQL errors:", JSON.stringify(subData.errors));
      if (!subData?.data) {
        return NextResponse.json(
          { error: `Subgraph query error: ${subData.errors[0]?.message || "Unknown"}`, orders: [] },
          { status: 502 }
        );
      }
    }

    let orders = subData?.data?.orders_collection || [];

    // Decode bytes32 currency to human-readable string
    const decodeCurrency = (raw: string): string => {
      if (!raw || !raw.startsWith("0x")) return raw || "INR";
      try {
        const hex = raw.slice(2).replace(/0+$/, "");
        let str = "";
        for (let i = 0; i < hex.length; i += 2) {
          str += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
        }
        return str || "INR";
      } catch { return "INR"; }
    };

    if (search) {
      orders = orders.filter((o: any) =>
        o.id?.toLowerCase().includes(search) ||
        o.orderId?.toString().includes(search) ||
        o.userAddress?.toLowerCase().includes(search) ||
        o.usdcRecipientAddress?.toLowerCase().includes(search) ||
        o.transactionHash?.toLowerCase().includes(search)
      );
    }

    if (typeFilter === "pay") {
      orders = orders.filter((o: any) => o.type !== 1 && o.type !== "1");
    } else if (typeFilter === "cashout") {
      orders = orders.filter((o: any) => o.type === 1 || o.type === "1");
    }

    const formattedOrders = orders.map((o: any) => {
      const usdc = (Number(o.usdcAmount || 0) / 1_000_000).toFixed(2);
      const fiat = (Number(o.fiatAmount || 0) / 1_000_000).toFixed(2);

      let statusLabel = "PENDING";
      if (o.status === 1 || o.status === "1") statusLabel = "ACCEPTED";
      else if (o.status === 2 || o.status === "2") statusLabel = "SETTLED";
      else if (o.status === 3 || o.status === "3") statusLabel = "CANCELLED";
      else if (o.status === 4 || o.status === "4") statusLabel = "DISPUTED";

      const isSell = o.type === 1 || o.type === "1";

      return {
        id: o.orderId || o.id,
        orderType: isSell ? "SELL (Cashout)" : "PAY (Merchant)",
        user: o.userAddress,
        recipient: o.usdcRecipientAddress,
        currency: decodeCurrency(o.currency),
        usdcAmount: `${usdc} USDC`,
        fiatAmount: `₹ ${fiat}`,
        status: statusLabel,
        txHash: o.transactionHash,
        timestamp: Number(o.placedAt || o.blockTimestamp || 0) * 1000 || Date.now(),
      };
    });

    const finalOrders = statusFilter !== "ALL" 
      ? formattedOrders.filter((o: any) => o.status === statusFilter)
      : formattedOrders;

    return NextResponse.json({
      success: true,
      count: finalOrders.length,
      orders: finalOrders,
    });
  } catch (error: any) {
    console.error("[Admin Orders] Error fetching subgraph orders:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders from Subgraph", orders: [] },
      { status: 500 }
    );
  }
}
