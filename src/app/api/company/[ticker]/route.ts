import { NextResponse } from "next/server";
import { getCompanyPackage, getMarketData } from "@/lib/cached";
import { CompanyError } from "@/lib/company";
import { buildValuationSnapshot } from "@/lib/finance/snapshot";
import { isValidTickerFormat, normalizeTicker } from "@/lib/sec/tickers";

/** The full data package behind a company page, as JSON (every value with its source). */
export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const decoded = decodeURIComponent(raw);
  if (!isValidTickerFormat(decoded)) return NextResponse.json({ error: "Invalid ticker format." }, { status: 400 });
  const ticker = normalizeTicker(decoded);
  try {
    const pkg = await getCompanyPackage(ticker);
    const market = await getMarketData(ticker);
    const valuation = buildValuationSnapshot(pkg, market);
    return NextResponse.json(
      { ...pkg, market, valuation },
      // Do not let a CDN hold on to a response that is missing market data.
      { headers: { "Cache-Control": market.available ? "public, s-maxage=900, stale-while-revalidate=3600" : "no-store" } },
    );
  } catch (e) {
    if (e instanceof CompanyError) {
      const status = e.code === "not-found" ? 404 : e.code === "unsupported" ? 422 : 503;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
