import { NextResponse } from "next/server";
import { searchTickers } from "@/lib/sec/tickers";

/** Ticker / company-name suggestions for the search box. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 40);
  if (!q.trim()) return NextResponse.json({ results: [] });
  try {
    const results = (await searchTickers(q, 8)).map((r) => ({ ticker: r.ticker, name: r.name }));
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return NextResponse.json({ results: [], error: "The SEC ticker list is temporarily unavailable." }, { status: 503 });
  }
}
