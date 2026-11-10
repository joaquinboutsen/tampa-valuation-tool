/**
 * Server-side caching.
 *
 * Why cache: SEC filings only change when a company files something new
 * (roughly every 90 days), and the free market-data tier has rate limits.
 * Caching makes pages fast and keeps the site far below both limits.
 *
 *  - Company package (SEC data): 6 hours.
 *  - Market data (price etc.):  15 minutes (set inside the Finnhub client).
 */
import { unstable_cache } from "next/cache";
import { buildCompanyPackage } from "./company";
import { fetchMarketData, fetchPeers, MarketDataError, QUOTE_TTL_SECONDS, unavailable } from "./market/finnhub";
import { fetchRiskFreeRate, type RiskFreeRate } from "./market/treasury";
import type { CompanyPackage, MarketData } from "./types";
import { normalizeTicker } from "./sec/tickers";

export const COMPANY_TTL_SECONDS = 6 * 3600;

export function getCompanyPackage(rawTicker: string): Promise<CompanyPackage> {
  const ticker = normalizeTicker(rawTicker);
  return unstable_cache(() => buildCompanyPackage(ticker), ["company-package-v1", ticker], {
    revalidate: COMPANY_TTL_SECONDS,
  })();
}

/**
 * Market data, cached for 15 minutes per ticker. A failure (rate limit, outage)
 * is returned as "not available" for this one request and is NOT cached, so the
 * next visitor triggers a fresh attempt.
 */
export async function getMarketData(rawTicker: string): Promise<MarketData> {
  const ticker = normalizeTicker(rawTicker);
  try {
    return await unstable_cache(() => fetchMarketData(ticker), ["market-data-v1", ticker], { revalidate: QUOTE_TTL_SECONDS })();
  } catch (e) {
    return unavailable(e instanceof MarketDataError ? e.message : "The market data provider could not be reached.");
  }
}

/** Lighter company package for peers (no description or segments). Cached 6 hours. */
export function getPeerPackage(rawTicker: string): Promise<CompanyPackage> {
  const ticker = normalizeTicker(rawTicker);
  return unstable_cache(() => buildCompanyPackage(ticker, { light: true }), ["company-light-v1", ticker], {
    revalidate: COMPANY_TTL_SECONDS,
  })();
}

/** Provider-suggested peers, cached for a day. Returns [] if unavailable. */
export async function getSuggestedPeers(rawTicker: string): Promise<string[]> {
  const ticker = normalizeTicker(rawTicker);
  try {
    return await unstable_cache(() => fetchPeers(ticker), ["peers-v1", ticker], { revalidate: 86_400 })();
  } catch {
    return [];
  }
}

/** 10-year Treasury yield, cached 6 hours. Null if the Treasury site cannot be reached. */
export async function getRiskFreeRate(): Promise<RiskFreeRate | null> {
  try {
    return await unstable_cache(() => fetchRiskFreeRate(), ["treasury-v2"], { revalidate: 6 * 3600 })();
  } catch {
    return null;
  }
}

export const PEER_QUOTE_TTL_SECONDS = 3600;

/**
 * Market data for a peer in a comps table: two requests instead of three, and
 * cached for an hour. Peer multiples do not need minute-level freshness, and
 * this keeps a table of ten peers inside the provider's free-tier limit.
 */
export async function getPeerMarketData(rawTicker: string): Promise<MarketData> {
  const ticker = normalizeTicker(rawTicker);
  try {
    return await unstable_cache(() => fetchMarketData(ticker, { light: true }), ["market-data-light-v1", ticker], { revalidate: PEER_QUOTE_TTL_SECONDS })();
  } catch (e) {
    return unavailable(e instanceof MarketDataError ? e.message : "The market data provider could not be reached.");
  }
}
