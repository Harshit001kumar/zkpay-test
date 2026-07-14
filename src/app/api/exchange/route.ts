import { NextResponse } from "next/server";

const CHANGENOW_API_KEY = process.env.CHANGENOW_API_KEY;
const API_BASE_URL = "https://api.changenow.io/v2";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fromCurrency, toCurrency, fromNetwork, toNetwork, fromAmount, address } = body;

    if (!CHANGENOW_API_KEY) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    if (!fromCurrency || !toCurrency || !fromNetwork || !toNetwork || !fromAmount || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const payload = {
      fromCurrency,
      toCurrency,
      fromNetwork,
      toNetwork,
      fromAmount,
      address,
      flow: "standard"
    };

    const response = await fetch(`${API_BASE_URL}/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-changenow-api-key": CHANGENOW_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("ChangeNOW Exchange Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
