import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/server/rateLimit";
import { getSwapStatus } from "@/lib/server/swapRouter";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { response: rateLimitResp, rateLimit } = enforceRateLimit(req, "status");
  if (rateLimitResp) return rateLimitResp;

  try {
    const { searchParams } = new URL(req.url);
    const depositAddress = searchParams.get("depositAddress")?.trim();

    if (!depositAddress) {
      return NextResponse.json(
        { error: "Missing depositAddress parameter" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const s: any = await getSwapStatus(depositAddress);
    const rawExplorer = s?.destinationExplorerUrl;
    const safeExplorerUrl =
      typeof rawExplorer === "string" && rawExplorer.startsWith("https://")
        ? rawExplorer
        : null;

    return NextResponse.json(
      {
        status: s.status,
        rawStatus: s.rawStatus || s.status,
        depositAmount: s.depositedAmount || null,
        settleAmount: s.settledAmount || null,
        txId: s.destinationTxHash || null,
        txExplorerUrl: safeExplorerUrl,
        splitFeeTxHash: s.splitFeeTxHash || null,
        forwardTxHash: s.forwardTxHash || null,
        feeNote: s.feeNote || null,
        error: s.error || null,
      },
      { headers: rateLimit.headers }
    );
  } catch (error: any) {
    console.error("[ExchangeStatus] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error?.statusCode || 500, headers: rateLimit.headers }
    );
  }
}
