import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { getPartnerTransactions } from "@/lib/server/partnerLedger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const apiKeyId = searchParams.get("apiKeyId") || undefined;
  const type = searchParams.get("type") || "all";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  try {
    const result = await getPartnerTransactions({
      userId: auth.userId,
      apiKeyId,
      type,
      status,
      search,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      ...result,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error("[PartnerTransactions] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load partner transactions" },
      { status: 500 }
    );
  }
}
