import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Create a new URL for li.quest, preserving the path and query string
  // The widget might call things like /api/lifi/quote, so we should map that to li.quest/v1/quote
  // But wait, the standard proxy setup for the widget is usually just replacing the base URL.
  // Actually, LI.FI widget expects a specific apiUrl to act as the base.
  // If we set apiUrl to `/api/lifi`, it will make requests to `/api/lifi/quote?fromChain...`
  // So we need a dynamic catch-all route instead. Let's make it route.ts and just forward the exact URL.
  
  const pathname = new URL(request.url).pathname;
  // pathname will be /api/lifi/quote or similar.
  // We want to map /api/lifi/* to https://li.quest/v1/*
  const endpoint = pathname.replace('/api/lifi', '');
  
  const queryStr = searchParams.toString();
  const url = `https://li.quest/v1${endpoint}${queryStr ? '?' + queryStr : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-lifi-api-key': process.env.LIFI_API_KEY || '',
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("LI.FI Proxy Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const pathname = new URL(request.url).pathname;
  const endpoint = pathname.replace('/api/lifi', '');
  const queryStr = searchParams.toString();
  const url = `https://li.quest/v1${endpoint}${queryStr ? '?' + queryStr : ''}`;

  try {
    const body = await request.text();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lifi-api-key': process.env.LIFI_API_KEY || '',
      },
      body: body || undefined,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("LI.FI Proxy Error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
