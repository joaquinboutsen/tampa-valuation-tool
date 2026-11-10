/**
 * Market data from Finnhub (https://finnhub.io), an official keyed API.
 *
 * Free tier: about 60 requests per minute. Each company page needs 3 requests
 * (quote, profile, metrics), and results are cached for 15 minutes, so a
 * ticker costs at most 12 requests per hour no matter how many people view it.
 *
 * The API key lives in the FINNHUB_API_KEY environment variable on the server
 * and is never sent to the browser.
 */
import type { MarketData } from "../types";

const BASE = "https://finnhub.io/api/v1";
export const PROVIDER = "Finnhub";
export const QUOTE_TTL_SECONDS = 15 * 60;

export interface Quote {
  c?: number;
  t?: number;
}
export interface Profile2 {
  shareOutstanding?: number;
  marketCapitalization?: number;
  finnhubIndustry?: string;
  name?: string;
}
export interface Metrics {
  metric?: Record<string, number | string | null>;
}

export class MarketDataError extends Error {}

async function call<T>(path: string, key: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "X-Finnhub-Token": key },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new MarketDataError("The market data provider could not be reached.");
  }
  if (res.status === 429) throw new MarketDataError("The market data provider's free-tier limit was reached. Try again in a minute.");
  if (res.status === 401 || res.status === 403) throw new MarketDataError("The market data provider rejected the API key.");
  if (!res.ok) throw new MarketDataError(`The market data provider returned an error (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function unavailable(reason: string): MarketData {
  return {
    available: false,
    reason,
    provider: PROVIDER,
    price: null,
    priceTime: null,
    high52: null,
    low52: null,
    beta: null,
    providerShares: null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Converts raw Finnhub responses into our shape. Pure, so it is unit-tested. */
export function shapeMarketData(quote: Quote, profile: Profile2, metrics: Metrics, nowIso: string): MarketData {
  const price = num(quote.c);
  if (price === null || price <= 0) {
    return { ...unavailable("The data provider has no current price for this ticker."), fetchedAt: nowIso };
  }
  const m = metrics.metric ?? {};
  const sharesM = num(profile.shareOutstanding);
  return {
    available: true,
    provider: PROVIDER,
    price,
    priceTime: quote.t ? new Date(quote.t * 1000).toISOString() : null,
    high52: num(m["52WeekHigh"]),
    low52: num(m["52WeekLow"]),
    high52Date: typeof m["52WeekHighDate"] === "string" ? (m["52WeekHighDate"] as string) : null,
    low52Date: typeof m["52WeekLowDate"] === "string" ? (m["52WeekLowDate"] as string) : null,
    beta: num(m["beta"]),
    forwardPE: (() => {
      const f = num(m["forwardPE"]);
      return f !== null && f > 0 ? f : null;
    })(),
    providerShares: sharesM !== null && sharesM > 0 ? sharesM * 1e6 : null,
    industry: profile.finnhubIndustry ?? null,
    fetchedAt: nowIso,
  };
}

export function isConfigured(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY);
}

/**
 * Fetches live market data. Throws MarketDataError on any failure, so that
 * failures are never stored in the cache (see src/lib/cached.ts).
 */
export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new MarketDataError("Market data is not configured on this deployment (no API key).");
  const symbol = encodeURIComponent(ticker.replace(/-/g, "."));
  const [quote, profile, metrics] = await Promise.all([
    call<Quote>(`/quote?symbol=${symbol}`, key),
    call<Profile2>(`/stock/profile2?symbol=${symbol}`, key),
    // Metrics (52-week range, beta) are optional: the price still shows without them.
    call<Metrics>(`/stock/metric?symbol=${symbol}&metric=all`, key).catch(() => ({}) as Metrics),
  ]);
  const shaped = shapeMarketData(quote, profile, metrics, new Date().toISOString());
  if (!shaped.available) throw new MarketDataError(shaped.reason ?? "No price available.");
  return shaped;
}

/** Peer tickers suggested by the provider (same industry classification). Includes the company itself. */
export async function fetchPeers(ticker: string): Promise<string[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new MarketDataError("Market data is not configured on this deployment (no API key).");
  const list = await call<unknown>(`/stock/peers?symbol=${encodeURIComponent(ticker.replace(/-/g, "."))}`, key);
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is string => typeof x === "string").map((x) => x.toUpperCase());
}
