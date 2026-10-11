import { NextRequest, NextResponse } from "next/server";

/**
 * ERC-20 Paymaster Proxy
 *
 * Privy's Dashboard sends paymaster requests with `null` context.
 * This proxy intercepts those calls and injects `{ token: USDC }`
 * so Pimlico routes to the **ERC-20 Paymaster** (permissionless on-chain contract).
 *
 * Result: Users pay gas from their USDC balance (~$0.001 per tx on Base).
 *         No developer sponsorship balance is required on Pimlico.
 *
 * Configure as the Paymaster URL in Privy Dashboard → Advanced → Base:
 *   https://[your-domain]/api/paymaster
 */

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
if (!PIMLICO_API_KEY) {
  console.warn("[Paymaster Proxy] PIMLICO_API_KEY env var is not set");
}
const PIMLICO_BASE_URL = `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`;

// USDC on Base Mainnet
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ERC-7677 paymaster methods that need the token context injected
const PAYMASTER_METHODS = new Set([
  "pm_getPaymasterStubData",
  "pm_getPaymasterData",
  "pm_sponsorUserOperation",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, params, id, jsonrpc } = body;

    let modifiedParams = params;

    if (PAYMASTER_METHODS.has(method)) {
      modifiedParams = [...(params || [])];

      if (method === "pm_sponsorUserOperation") {
        // pm_sponsorUserOperation: [userOp, entryPoint, context]
        // Replace or add context at index 2
        if (modifiedParams.length >= 3) {
          modifiedParams[2] = { token: USDC_ADDRESS };
        } else {
          while (modifiedParams.length < 2) modifiedParams.push(undefined);
          modifiedParams.push({ token: USDC_ADDRESS });
        }
      } else {
        // ERC-7677: pm_getPaymasterStubData / pm_getPaymasterData
        // [userOp, entryPoint, chainId, context]
        // Replace or add context at index 3
        if (modifiedParams.length >= 4) {
          modifiedParams[3] = { token: USDC_ADDRESS };
        } else {
          while (modifiedParams.length < 3) modifiedParams.push(undefined);
          modifiedParams.push({ token: USDC_ADDRESS });
        }
      }
    }

    const pimlicoResponse = await fetch(PIMLICO_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: jsonrpc || "2.0",
        id: id || 1,
        method,
        params: modifiedParams,
      }),
    });

    const data = await pimlicoResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Paymaster Proxy] Error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: error?.message || "Internal paymaster proxy error" },
      },
      { status: 500 }
    );
  }
}
