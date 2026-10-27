import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import { getPartnerMetrics, getPartnerKeysContext } from "@/lib/server/partnerLedger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const apiKeyId = searchParams.get("apiKeyId") || undefined;
  const rawRange = searchParams.get("timeRange") || "all";
  const timeRange = (["24h", "7d", "30d", "all"].includes(rawRange)
    ? rawRange
    : "all") as "24h" | "7d" | "30d" | "all";

  try {
    const [{ userKeys }, metrics] = await Promise.all([
      getPartnerKeysContext(auth.userId),
      getPartnerMetrics(auth.userId, apiKeyId, timeRange),
    ]);

    return NextResponse.json({
      success: true,
      metrics,
      apiKeys: userKeys.map((k) => ({
        id: k.id,
        label: k.label,
        maskedKey: `${k.keyPrefix}...${k.keyLast4}`,
        status: k.status,
      })),
    });
  } catch (err: any) {
    console.error("[PartnerOverview] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load partner overview" },
      { status: 500 }
    );
  }
}
