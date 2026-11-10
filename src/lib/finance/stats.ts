/**
 * Summary statistics for a peer set.
 *
 * Percentiles use linear interpolation between ranked values, the same method
 * as Excel's PERCENTILE.INC / QUARTILE.INC, so results match what a banker
 * would get in a spreadsheet.
 */

export interface Stats {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
}

/** p is between 0 and 1. `sorted` must be ascending and non-empty. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Ignores missing / not-meaningful values. Returns null if nothing is left. */
export function summarize(values: (number | null | undefined)[]): Stats | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  return {
    count: xs.length,
    min: xs[0],
    p25: percentile(xs, 0.25),
    median: percentile(xs, 0.5),
    p75: percentile(xs, 0.75),
    max: xs[xs.length - 1],
    mean: xs.reduce((s, x) => s + x, 0) / xs.length,
  };
}

/**
 * Where a value sits within a peer set, as the share of peers at or below it
 * (0 = below every peer, 1 = at or above every peer).
 */
export function positionInSet(value: number | null, peers: (number | null | undefined)[]): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const xs = peers.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.filter((x) => x <= value).length / xs.length;
}
