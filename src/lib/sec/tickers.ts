/** Ticker → SEC company number (CIK), from the SEC's official ticker list. */
import { secJson } from "./client";

export interface TickerEntry {
  ticker: string;
  cik: number;
  name: string;
}

const DAY = 86_400;
let memo: { at: number; list: TickerEntry[]; byTicker: Map<string, TickerEntry> } | null = null;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-");
}

export function isValidTickerFormat(raw: string): boolean {
  return /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(raw.trim());
}

async function load(): Promise<NonNullable<typeof memo>> {
  if (memo && Date.now() - memo.at < DAY * 1000) return memo;
  const raw = await secJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
    "https://www.sec.gov/files/company_tickers.json",
    { revalidate: DAY },
  );
  // The file is ordered by market value, largest first; keep that order for search ranking.
  const list = Object.values(raw).map((r) => ({ ticker: r.ticker.toUpperCase(), cik: r.cik_str, name: r.title }));
  const byTicker = new Map<string, TickerEntry>();
  for (const e of list) if (!byTicker.has(e.ticker)) byTicker.set(e.ticker, e);
  memo = { at: Date.now(), list, byTicker };
  return memo;
}

export async function lookupTicker(raw: string): Promise<TickerEntry | null> {
  if (!isValidTickerFormat(raw)) return null;
  const { byTicker } = await load();
  return byTicker.get(normalizeTicker(raw)) ?? null;
}

export function rankMatches(list: TickerEntry[], query: string, limit = 8): TickerEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const exact: TickerEntry[] = [];
  const tickerPrefix: TickerEntry[] = [];
  const namePrefix: TickerEntry[] = [];
  const nameContains: TickerEntry[] = [];
  for (const e of list) {
    const name = e.name.toUpperCase();
    if (e.ticker === q) exact.push(e);
    else if (e.ticker.startsWith(q)) tickerPrefix.push(e);
    else if (name.startsWith(q)) namePrefix.push(e);
    else if (q.length >= 3 && name.includes(q)) nameContains.push(e);
  }
  return [...exact, ...tickerPrefix, ...namePrefix, ...nameContains].slice(0, limit);
}

export async function searchTickers(query: string, limit = 8): Promise<TickerEntry[]> {
  const { list } = await load();
  return rankMatches(list, query, limit);
}
