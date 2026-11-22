import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import {
  listSavedAddressesForUser,
  upsertSavedAddressForUser,
  deleteSavedAddressForUser,
} from "@/lib/server/paylinkStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const addresses = await listSavedAddressesForUser(auth.userId);
    return NextResponse.json({ success: true, addresses });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load saved addresses" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const saved = await upsertSavedAddressForUser({
      userId: auth.userId,
      chain: String(body.chain || ""),
      address: String(body.address || ""),
      label: typeof body.label === "string" ? body.label : undefined,
    });
    return NextResponse.json({ success: true, address: saved });
  } catch (err: any) {
    const status = err?.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    return NextResponse.json(
      {
        success: false,
        error: err?.code || "SAVE_ADDRESS_FAILED",
        message: err?.message || "Failed to save receiving address",
      },
      { status }
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json(
      { success: false, error: auth.error || "Unauthorized" },
      { status: auth.status }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing address id" }, { status: 400 });
    }
    const deleted = await deleteSavedAddressForUser(auth.userId, id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Saved address not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete address" },
      { status: 500 }
    );
  }
}
