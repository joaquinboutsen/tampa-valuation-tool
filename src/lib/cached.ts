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
import type { CompanyPackage } from "./types";
import { normalizeTicker } from "./sec/tickers";

export const COMPANY_TTL_SECONDS = 6 * 3600;

export function getCompanyPackage(rawTicker: string): Promise<CompanyPackage> {
  const ticker = normalizeTicker(rawTicker);
  return unstable_cache(() => buildCompanyPackage(ticker), ["company-package-v1", ticker], {
    revalidate: COMPANY_TTL_SECONDS,
  })();
}
