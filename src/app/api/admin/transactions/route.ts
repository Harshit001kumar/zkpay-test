import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";
import {
  getAdminSystemTransactions,
  exportAdminTransactionsCsv,
  GetAdminTransactionsOptions,
} from "@/lib/server/adminLedger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const channel = (searchParams.get("channel") || "all") as any;
    const category = (searchParams.get("category") || "all") as any;
    const status = (searchParams.get("status") || "all") as any;
    const chain = searchParams.get("chain") || "all";
    const timeRange = (searchParams.get("timeRange") || "all") as any;
    const search = searchParams.get("search") || "";
    const exportFormat = searchParams.get("export") || "json";

    const options: GetAdminTransactionsOptions = {
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 50 : limit,
      channel,
      category,
      status,
      chain,
      timeRange,
      search,
    };

    if (exportFormat === "csv") {
      const csv = await exportAdminTransactionsCsv(options);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="zkpay-admin-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    const result = await getAdminSystemTransactions(options);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[AdminTransactionsAPI] Error querying transactions:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to retrieve transactions" },
      { status: 500 }
    );
  }
}
