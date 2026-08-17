import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);

  if (!auth.authorized) {
    return NextResponse.json(
      { authorized: false, error: auth.error },
      { status: auth.status }
    );
  }

  return NextResponse.json({
    authorized: true,
    userId: auth.userId,
    walletAddress: auth.walletAddress,
    timestamp: Date.now(),
  });
}
