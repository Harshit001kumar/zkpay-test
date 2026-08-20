import { corsJson, corsOptions } from "@/lib/server/cors";

export const dynamic = "force-dynamic";

export async function GET() {
  return corsJson({
    status: "ok",
    service: "ZkPay API",
    version: "1.0.0",
    network: "Base Mainnet",
    chainId: 8453,
    timestamp: Date.now(),
  });
}

export async function OPTIONS() {
  return corsOptions();
}
