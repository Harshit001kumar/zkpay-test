/**
 * CORS utility for ZkPay public API v1 routes.
 * Allows any origin to call /api/v1/* endpoints (for Telegram bots, external websites, mobile apps).
 */

import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

/**
 * Wraps a NextResponse with CORS headers for public API routes.
 */
export function corsJson(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status || 200,
    headers: CORS_HEADERS,
  });
}

/**
 * Handles OPTIONS preflight requests for CORS.
 */
export function corsOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
