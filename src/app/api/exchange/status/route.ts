import { NextResponse } from "next/server";

const CHANGENOW_API_KEY = process.env.CHANGENOW_API_KEY;
const API_BASE_URL = "https://api.changenow.io/v2";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!CHANGENOW_API_KEY) {
      return NextResponse.json({ error: "API key is missing" }, { status: 500 });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing exchange ID" }, { status: 400 });
    }

    const response = await fetch(`${API_BASE_URL}/exchange/by-id?id=${id}`, {
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
    console.error("ChangeNOW Status Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
