import { NextResponse } from "next/server";

const CHANGENOW_API_KEY = process.env.CHANGENOW_API_KEY;
const API_BASE_URL = "https://api.changenow.io/v2";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fromCurrency = searchParams.get("fromCurrency");
    const toCurrency = searchParams.get("toCurrency");
    const fromAmount = searchParams.get("fromAmount");
    const fromNetwork = searchParams.get("fromNetwork");
    const toNetwork = searchParams.get("toNetwork");

    if (!CHANGENOW_API_KEY) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    if (!fromCurrency || !toCurrency || !fromAmount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let url = `${API_BASE_URL}/exchange/estimated-amount?fromCurrency=${fromCurrency}&toCurrency=${toCurrency}&fromAmount=${fromAmount}`;
    if (fromNetwork) url += `&fromNetwork=${fromNetwork}`;
    if (toNetwork) url += `&toNetwork=${toNetwork}`;
    url += `&flow=standard`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-changenow-api-key": CHANGENOW_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("ChangeNOW Estimate Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
