import { NextResponse } from "next/server";
import { getCompanyPackage, getMarketData, getPeerPackage, getSuggestedPeers } from "@/lib/cached";
import { CompanyError } from "@/lib/company";
import { buildCompRow, errorRow, targetBasis, type CompRow } from "@/lib/finance/comps";
import { isValidTickerFormat, normalizeTicker } from "@/lib/sec/tickers";

/** Most peers allowed in one table: keeps each load well inside the data providers' rate limits. */
const MAX_PEERS = 10;
const DEFAULT_PEERS = 8;

export const dynamic = "force-dynamic";

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function peerRow(ticker: string): Promise<CompRow> {
  try {
    const [pkg, market] = await Promise.all([getPeerPackage(ticker), getMarketData(ticker)]);
    return buildCompRow(pkg, market);
  } catch (e) {
    const msg = e instanceof CompanyError ? e.message : "The data for this company could not be loaded. Try again shortly.";
    return errorRow(ticker, ticker, msg);
  }
}

/**
 * Trading comps for a target and its peers.
 *   /api/comps?ticker=JBL                 → provider-suggested peers
 *   /api/comps?ticker=JBL&peers=FLEX,SANM → a chosen peer set
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawTicker = url.searchParams.get("ticker") ?? "";
  if (!isValidTickerFormat(rawTicker)) return NextResponse.json({ error: "Invalid ticker format." }, { status: 400 });
  const ticker = normalizeTicker(rawTicker);

  try {
    const [pkg, market, suggestedRaw] = await Promise.all([getCompanyPackage(ticker), getMarketData(ticker), getSuggestedPeers(ticker)]);
    const suggested = suggestedRaw.map(normalizeTicker).filter((t) => t !== ticker);

    const peersParam = url.searchParams.get("peers");
    const requested =
      peersParam !== null
        ? peersParam
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t && isValidTickerFormat(t))
            .map(normalizeTicker)
        : suggested.slice(0, DEFAULT_PEERS);
    const peers = [...new Set(requested)].filter((t) => t !== ticker).slice(0, MAX_PEERS);

    const rows = await mapLimit(peers, 4, peerRow);
    return NextResponse.json(
      {
        target: buildCompRow(pkg, market),
        basis: targetBasis(pkg, market),
        targetIsFinancial: pkg.profile.isFinancial,
        peers: rows,
        suggested,
        peerSource: peersParam !== null ? "custom" : suggested.length ? "Finnhub industry peers" : "none",
        maxPeers: MAX_PEERS,
        provider: market.provider,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof CompanyError) {
      const status = e.code === "not-found" ? 404 : e.code === "unsupported" ? 422 : 503;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
