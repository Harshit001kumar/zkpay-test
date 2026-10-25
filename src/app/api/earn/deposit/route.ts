import { NextResponse } from "next/server";
import {
  getPrivyClient,
  getPrivyAuthPrivateKey,
  resolveEmbeddedWalletId,
  verifyUserOwnsWalletId,
  parsePrivyEarnError,
} from "@/lib/server/privyEarn";

export const dynamic = "force-dynamic";

const VAULT_ID = process.env.PRIVY_EARN_VAULT_ID;

// ──────────────────────────────────────────────
// POST /api/earn/deposit
// Deposits USDC from the authenticated user's
// embedded wallet into the configured Privy Earn vault.
// ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // ── 1. Verify the caller is authenticated ──
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized — no access token provided" },
        { status: 401 }
      );
    }

    let verifiedClaims;
    try {
      verifiedClaims = await getPrivyClient().utils().auth().verifyAccessToken(accessToken);
    } catch (authErr: any) {
      console.error("[Earn Deposit] Token verification failed:", authErr?.message);
      return NextResponse.json(
        { error: "Unauthorized — invalid or expired token" },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    // ── 2. Validate environment is configured ──
    if (!VAULT_ID) {
      console.error("[Earn Deposit] PRIVY_EARN_VAULT_ID is not configured");
      return NextResponse.json(
        { error: "Privy Earn Vault ID is not configured on the server (missing PRIVY_EARN_VAULT_ID)." },
        { status: 400 }
      );
    }

    // ── 3. Parse and validate input ──
    const body = await request.json();
    const { amount, walletId: rawWalletId } = body;

    const parsedAmount = Number(amount);
    if (
      !amount ||
      isNaN(parsedAmount) ||
      !isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      parsedAmount > 1_000_000 // Safety cap
    ) {
      return NextResponse.json(
        { error: "Invalid amount. Must be a positive number up to 1,000,000." },
        { status: 400 }
      );
    }

    // Validate USDC decimal precision (max 6 decimals)
    const decimalParts = String(amount).split(".");
    if (decimalParts[1] && decimalParts[1].length > 6) {
      return NextResponse.json(
        { error: "USDC supports a maximum of 6 decimal places." },
        { status: 400 }
      );
    }

    // ── 4. Resolve Target Privy Embedded Wallet ID ──
    let targetWalletId = rawWalletId;
    if (targetWalletId) {
      const isOwned = await verifyUserOwnsWalletId(userId, targetWalletId);
      if (!isOwned) {
        return NextResponse.json(
          { error: "Forbidden — specified wallet does not belong to the authenticated user." },
          { status: 403 }
        );
      }
    } else {
      targetWalletId = await resolveEmbeddedWalletId(userId);
    }

    if (!targetWalletId || targetWalletId.startsWith("0x")) {
      targetWalletId = await resolveEmbeddedWalletId(userId);
    }

    if (
      !targetWalletId ||
      targetWalletId.startsWith("0x") ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(targetWalletId)
    ) {
      return NextResponse.json(
        {
          error:
            "No Privy embedded wallet ID found. Privy Earn requires a Privy-managed embedded wallet.",
        },
        { status: 400 }
      );
    }

    const safeWalletId = encodeURIComponent(targetWalletId);

    // ── 5. Calculate upfront platform fee (L2 USDC fee in USDC, enforced server-side) ──
    const feeBps = 50; // 50 bps (0.5%) enforced server-side
    const feeAmount = (parsedAmount * feeBps) / 10000;
    const netVaultAmount = Number((parsedAmount - feeAmount).toFixed(6));

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
    const appSecret = process.env.PRIVY_APP_SECRET!;
    const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const authKey = getPrivyAuthPrivateKey();

    // ── 6. Transfer fee to ZkPay Treasury if feeAmount > 0 ──
    let feeTxResult: any = null;
    if (feeAmount > 0) {
      try {
        const { encodeFunctionData, parseUnits } = await import("viem");
        const { CONTRACTS } = await import("@/lib/constants");

        const feeUnits = parseUnits(feeAmount.toFixed(6), 6);
        const transferData = encodeFunctionData({
          abi: [
            {
              type: "function",
              name: "transfer",
              inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
              ],
              outputs: [{ name: "", type: "bool" }],
              stateMutability: "nonpayable",
            },
          ],
          functionName: "transfer",
          args: [CONTRACTS.TREASURY, feeUnits],
        });

        const rpcEndpoint = `https://api.privy.io/api/v1/wallets/${safeWalletId}/rpc`;
        const rpcBody = {
          method: "eth_sendTransaction",
          caip2: "eip155:8453",
          params: {
            transaction: {
              to: CONTRACTS.USDC,
              data: transferData,
              value: "0x0",
            },
          },
        };

        const rpcHeaders: Record<string, string> = {
          "privy-app-id": appId,
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        };

        if (authKey) {
          const { createPrivyAuthorizationSignature } = await import("@/lib/server/privyEarn");
          const sig = createPrivyAuthorizationSignature({
            method: "POST",
            url: rpcEndpoint,
            body: rpcBody,
            appId,
            privateKeyRaw: authKey,
          });
          if (sig) rpcHeaders["privy-authorization-signature"] = sig;
        }

        const feeRes = await fetch(rpcEndpoint, {
          method: "POST",
          headers: rpcHeaders,
          body: JSON.stringify(rpcBody),
        });

        if (feeRes.ok) {
          feeTxResult = await feeRes.json();
        } else {
          console.warn("[Earn Deposit] Upfront fee transfer response:", await feeRes.text());
        }
      } catch (feeErr: any) {
        console.warn("[Earn Deposit] Upfront fee deduction warning:", feeErr?.message || feeErr);
      }
    }

    // ── 7. Call Privy Earn deposit API for Net Amount ──
    // Attempt SDK call with authorization_context first
    const privy = getPrivyClient() as any;
    if (typeof privy?.wallets === "function" && typeof privy.wallets()?.earn === "function") {
      try {
        const sdkContext: Record<string, any> = { user_jwts: [accessToken] };
        if (authKey) sdkContext.authorization_private_keys = [authKey];

        const sdkResult = await privy.wallets().earn().ethereum().deposit(targetWalletId, {
          vault_id: VAULT_ID,
          amount: String(netVaultAmount),
          authorization_context: sdkContext,
        });

        return NextResponse.json({
          success: true,
          actionId: sdkResult?.id,
          status: sdkResult?.status || "pending",
          fee: {
            feeBps,
            feeAmount: feeAmount.toFixed(6),
            feeAsset: "USDC",
            treasuryAddress: process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0xb856b24fb054135deba5e0309edd31ed6a8afbe2",
            feeTxHash: feeTxResult?.data?.hash || feeTxResult?.hash || null,
            netDepositedAmount: netVaultAmount.toFixed(6),
          },
        });
      } catch (sdkErr: any) {
        console.warn("[Earn Deposit SDK call failed, falling back to REST]:", sdkErr?.message);
      }
    }

    // Fallback: REST API with computed privy-authorization-signature
    const endpointUrl = `https://api.privy.io/api/v1/wallets/${safeWalletId}/earn/ethereum/deposit`;
    const requestBody = {
      vault_id: VAULT_ID,
      amount: String(netVaultAmount),
    };

    const headers: Record<string, string> = {
      "privy-app-id": appId,
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    };

    if (authKey) {
      const { createPrivyAuthorizationSignature } = await import("@/lib/server/privyEarn");
      const signature = createPrivyAuthorizationSignature({
        method: "POST",
        url: endpointUrl,
        body: requestBody,
        appId,
        privateKeyRaw: authKey,
      });
      if (signature) {
        headers["privy-authorization-signature"] = signature;
      }
    }

    const restResponse = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    const earnData = await restResponse.json();

    if (!restResponse.ok) {
      console.error("[Earn Deposit REST Error]:", earnData);
      const errMsg = earnData.error || earnData.message || earnData.details || "Deposit failed";
      return NextResponse.json(
        { error: errMsg },
        { status: restResponse.status }
      );
    }

    return NextResponse.json(
      {
        success: true,
        actionId: earnData.id,
        status: earnData.status,
        fee: {
          feeBps,
          feeAmount: feeAmount.toFixed(6),
          feeAsset: "USDC",
          treasuryAddress: process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "0xb856b24fb054135deba5e0309edd31ed6a8afbe2",
          feeTxHash: feeTxResult?.data?.hash || feeTxResult?.hash || null,
          netDepositedAmount: netVaultAmount.toFixed(6),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Earn Deposit Error]:", error?.message || error);
    const detailedMessage = parsePrivyEarnError(error);
    return NextResponse.json(
      { error: detailedMessage },
      { status: 400 }
    );
  }
}
