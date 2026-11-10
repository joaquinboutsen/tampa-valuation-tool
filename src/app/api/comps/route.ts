import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getCompanyPackage, getMarketData, getPeerMarketData, getPeerPackage, getSuggestedPeers } from "@/lib/cached";
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
    const [pkg, market] = await Promise.all([getPeerPackage(ticker), getPeerMarketData(ticker)]);
    return buildCompRow(pkg, market);
  } catch (e) {
    const msg = e instanceof CompanyError ? e.message : "The data for this company could not be loaded. Try again shortly.";
    return errorRow(ticker, ticker, msg);
  }
}

interface Payload {
  target: CompRow;
  basis: ReturnType<typeof targetBasis>;
  targetIsFinancial: boolean;
  peers: CompRow[];
  suggested: string[];
  peerSource: string;
  maxPeers: number;
  provider: string;
  /** Peers whose share price could not be loaded (usually the provider's rate limit). */
  missingPrices: string[];
}

/** Thrown to hand back a table that must not be cached because prices are missing. */
class Incomplete extends Error {
  constructor(public payload: Payload) {
    super("incomplete");
  }
}

async function buildPayload(ticker: string, peersParam: string | null): Promise<Payload> {
  const [pkg, market, suggestedRaw] = await Promise.all([getCompanyPackage(ticker), getMarketData(ticker), getSuggestedPeers(ticker)]);
  const suggested = suggestedRaw.map(normalizeTicker).filter((t) => t !== ticker);
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
  const target = buildCompRow(pkg, market);
  const missingPrices = rows.filter((r) => !r.error && r.price === null).map((r) => r.ticker);
  const payload: Payload = {
    target,
    basis: targetBasis(pkg, market),
    targetIsFinancial: pkg.profile.isFinancial,
    peers: rows,
    suggested,
    peerSource: peersParam !== null ? "custom" : suggested.length ? "Finnhub industry peers" : "none",
    maxPeers: MAX_PEERS,
    provider: market.provider,
    missingPrices,
  };
  if (missingPrices.length || target.price === null) throw new Incomplete(payload);
  return payload;
}

/**
 * Trading comps for a target and its peers.
 *   /api/comps?ticker=JBL                 → provider-suggested peers
 *   /api/comps?ticker=JBL&peers=FLEX,SANM → a chosen peer set
 *
 * A complete table is cached for 15 minutes, so switching tabs or reloading
 * costs no further requests to the data providers.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawTicker = url.searchParams.get("ticker") ?? "";
  if (!isValidTickerFormat(rawTicker)) return NextResponse.json({ error: "Invalid ticker format." }, { status: 400 });
  const ticker = normalizeTicker(rawTicker);
  const peersParam = url.searchParams.get("peers");
  const cacheKey = peersParam === null ? "default" : peersParam.toUpperCase().slice(0, 200);

  try {
    let payload: Payload;
    try {
      payload = await unstable_cache(() => buildPayload(ticker, peersParam), ["comps-v1", ticker, cacheKey], { revalidate: 900 })();
    } catch (e) {
      if (e instanceof Incomplete) payload = e.payload;
      else throw e;
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CompanyError) {
      const status = e.code === "not-found" ? 404 : e.code === "unsupported" ? 422 : 503;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
