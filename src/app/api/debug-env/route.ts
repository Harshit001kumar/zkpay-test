import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Temporary debug endpoint — DELETE after fixing deposit
export async function GET() {
  // Show ALL env var keys (no values for security)
  const allKeys = Object.keys(process.env).sort();
  
  // Check specific ones we care about
  const check = {
    SIDESHIFT_AFFILIATE_ID: !!process.env.SIDESHIFT_AFFILIATE_ID,
    NEXT_PUBLIC_PRIVY_APP_ID: !!process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    NEXT_PUBLIC_DIAMOND_ADDRESS: !!process.env.NEXT_PUBLIC_DIAMOND_ADDRESS,
    NEXT_PUBLIC_CHAIN_ID: !!process.env.NEXT_PUBLIC_CHAIN_ID,
  };

  return NextResponse.json({
    message: "Debug: all env var keys on server",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    totalEnvVars: allKeys.length,
    allKeys,
    specificChecks: check,
  });
}

