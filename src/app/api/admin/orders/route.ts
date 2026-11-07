import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/server/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }
  return NextResponse.json({ success: true, orders: [], count: 0 });
}
