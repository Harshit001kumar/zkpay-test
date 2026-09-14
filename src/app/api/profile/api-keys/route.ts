import { NextResponse } from "next/server";
import {
  issueApiKey,
  listApiKeysForUser,
  revokeApiKeyForUser,
} from "@/lib/server/apiKeysStore";
import { verifyUserRequest } from "@/lib/server/userAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  const keys = await listApiKeysForUser(auth.userId);
  return NextResponse.json({
    success: true,
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      maskedKey: `${k.keyPrefix}...${k.keyLast4}`,
      status: k.status,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const label = typeof body?.label === "string" ? body.label : "Default";

    const { record, plaintextKey } = await issueApiKey({
      userId: auth.userId,
      walletAddress: auth.walletAddress,
      label,
    });

    return NextResponse.json({
      success: true,
      key: {
        id: record.id,
        label: record.label,
        maskedKey: `${record.keyPrefix}...${record.keyLast4}`,
        status: record.status,
        createdAt: record.createdAt,
      },
      plaintextKey,
      warning: "Store this key now. For security, it won't be shown again.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to issue API key" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await verifyUserRequest(req);
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const keyId = typeof body?.id === "string" ? body.id.trim() : "";
    if (!keyId) {
      return NextResponse.json({ error: "Missing API key id." }, { status: 400 });
    }

    const revoked = await revokeApiKeyForUser(auth.userId, keyId);
    if (!revoked) {
      return NextResponse.json({ error: "API key not found or already revoked." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to revoke API key" }, { status: 500 });
  }
}
