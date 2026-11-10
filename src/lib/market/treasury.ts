/**
 * Risk-free rate: the 10-year U.S. Treasury par yield, from the Treasury
 * Department's official "Daily Treasury Par Yield Curve Rates" file.
 * No API key is needed.
 */

export interface RiskFreeRate {
  /** Yield as a decimal (0.0488 = 4.88%). */
  tenYear: number;
  /** 20-year yield, kept for reference. */
  twentyYear: number | null;
  /** Date of the observation (YYYY-MM-DD). */
  date: string;
  source: string;
  url: string;
}

export const TREASURY_PAGE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve";

function csvUrl(year: number): string {
  return `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

/** Parses the Treasury CSV and returns the most recent observation. Pure, so it is unit-tested. */
export function parseTreasuryCsv(csv: string): RiskFreeRate | null {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]);
  const iDate = header.indexOf("Date");
  const i10 = header.indexOf("10 Yr");
  const i20 = header.indexOf("20 Yr");
  if (iDate < 0 || i10 < 0) return null;

  let bestRow: { date: string; ten: number; twenty: number | null } | null = null;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[iDate] ?? "");
    const ten = Number(cells[i10]);
    if (!m || !Number.isFinite(ten) || cells[i10] === "" || ten <= 0) continue;
    const date = `${m[3]}-${m[1]}-${m[2]}`;
    const twenty = i20 >= 0 && cells[i20] !== "" && Number.isFinite(Number(cells[i20])) ? Number(cells[i20]) : null;
    if (!bestRow || date > bestRow.date) bestRow = { date, ten, twenty };
  }
  if (!bestRow) return null;
  return {
    tenYear: bestRow.ten / 100,
    twentyYear: bestRow.twenty === null ? null : bestRow.twenty / 100,
    date: bestRow.date,
    source: "U.S. Department of the Treasury, Daily Treasury Par Yield Curve Rates (10-year)",
    url: TREASURY_PAGE,
  };
}

/** Throws if the Treasury site cannot be reached or returns no data (so failures are not cached). */
export async function fetchRiskFreeRate(now: Date = new Date()): Promise<RiskFreeRate> {
  const year = now.getUTCFullYear();
  // In the first days of January the current-year file can still be empty.
  for (const y of [year, year - 1]) {
    const res = await fetch(csvUrl(y), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) continue;
    const parsed = parseTreasuryCsv(await res.text());
    if (parsed) return parsed;
  }
  throw new Error("Treasury yield data is unavailable.");
}
