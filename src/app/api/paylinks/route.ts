import { NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/server/userAuth";
import {
  createPaylink,
  listPaylinksForUser,
  listSavedAddressesForUser,
  getPaylinkPaymentsByIds,
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
    const [paylinks, addresses] = await Promise.all([
      listPaylinksForUser(auth.userId),
      listSavedAddressesForUser(auth.userId),
    ]);

    const statsById = await getPaylinkPaymentsByIds(paylinks.map((p) => p.id));
    const enriched = paylinks.map((p) => ({
      ...p,
      stats: statsById[p.id] || {
        totalCount: 0,
        settledCount: 0,
        pendingCount: 0,
        payments: [],
      },
    }));

    return NextResponse.json({
      success: true,
      paylinks: enriched,
      addresses,
    });
  } catch (err: any) {
    console.error("[Paylinks] GET error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load Paylinks" },
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
    const receiveAsset = body.receiveAssetId || body.receiveSymbol || "";
    const recipientAddress = body.recipientAddress || "";

    if (!receiveAsset || !recipientAddress) {
      return NextResponse.json(
        {
          success: false,
          error: "MISSING_REQUIRED_FIELDS",
          message: "Receiving currency and wallet address are required.",
        },
        { status: 400 }
      );
    }

    const paylink = await createPaylink({
      creatorUserId: auth.userId,
      title: typeof body.title === "string" ? body.title : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      receiveAssetId: String(receiveAsset),
      receiveChain: typeof body.receiveChain === "string" ? body.receiveChain : undefined,
      recipientAddress: String(recipientAddress),
      amountMode: body.amountMode === "FIXED" ? "FIXED" : "OPEN",
      fixedAmount: body.fixedAmount !== undefined ? String(body.fixedAmount) : undefined,
      fixedCurrency: body.fixedCurrency === "ASSET" ? "ASSET" : "USD",
      singleUse: Boolean(body.singleUse),
      customSlug: typeof body.customSlug === "string" ? body.customSlug : undefined,
      addressLabel: typeof body.addressLabel === "string" ? body.addressLabel : undefined,
    });

    return NextResponse.json({
      success: true,
      paylink: {
        ...paylink,
        stats: { totalCount: 0, settledCount: 0, pendingCount: 0, payments: [] },
      },
      url: `/pay/${paylink.slug}`,
    });
  } catch (err: any) {
    const status = err?.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    return NextResponse.json(
      {
        success: false,
        error: err?.code || "CREATE_PAYLINK_FAILED",
        message: err?.message || "Failed to create Paylink",
      },
      { status }
    );
  }
}
