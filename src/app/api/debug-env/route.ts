import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Temporary debug endpoint — DELETE after fixing deposit
export async function GET() {
  const envKeys = Object.keys(process.env).filter(
    (k) => k.includes("SIDESHIFT") || k.includes("PRIVY") || k.includes("NEXT_PUBLIC") || k.includes("CHANGE")
  );

  const envSnapshot: Record<string, string> = {};
  for (const key of envKeys) {
    const val = process.env[key] || "";
    // Show first 4 chars only for security
    envSnapshot[key] = val ? `${val.slice(0, 4)}...` : "(empty)";
  }

  return NextResponse.json({
    message: "Debug: env vars visible to the server",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    envVars: envSnapshot,
  });
}
