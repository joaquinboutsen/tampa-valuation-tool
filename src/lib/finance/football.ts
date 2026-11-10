/**
 * Football field: implied share price ranges from each valuation method,
 * side by side, against the current share price.
 */
import { impliedSharePrice, type ImpliedRange, type MultipleKey, type TargetBasis } from "./comps";
import type { SensitivityTable } from "./dcf";

export type BarGroup = "Market" | "Trading comps" | "DCF" | "Precedent transactions";

export interface FootballBar {
  key: string;
  group: BarGroup;
  label: string;
  low: number | null;
  high: number | null;
  mid: number | null;
  /** How the range was built, in plain English. */
  detail: string;
}

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

function ordered(a: number | null, b: number | null): { low: number | null; high: number | null } {
  if (!ok(a) || !ok(b)) return { low: ok(a) ? a : null, high: ok(b) ? b : null };
  return { low: Math.min(a, b), high: Math.max(a, b) };
}

export function marketBar(low52: number | null, high52: number | null): FootballBar {
  return {
    key: "52w",
    group: "Market",
    label: "52-week trading range",
    ...ordered(low52, high52),
    mid: null,
    detail: "Lowest and highest share price over the last 52 weeks.",
  };
}

export function compsBar(r: ImpliedRange): FootballBar {
  const x = (v: number | null) => (v === null ? "n/m" : `${v.toFixed(1)}x`);
  return {
    key: `comps-${r.key}`,
    group: "Trading comps",
    label: r.label,
    ...ordered(r.low, r.high),
    mid: r.mid,
    detail: r.peerCount
      ? `Peer 25th to 75th percentile multiple (${x(r.lowMultiple)} to ${x(r.highMultiple)}, median ${x(r.midMultiple)}, ${r.peerCount} peers) applied to the company's own figure.`
      : "Not available: no peer has a meaningful multiple, or the company's own figure is negative.",
  };
}

/**
 * DCF range: the lowest and highest value in the centre 3 × 3 of the
 * sensitivity table, i.e. WACC ± 0.5% combined with terminal growth ± 0.25%
 * or exit multiple ± 1.0x.
 */
export function dcfBar(key: string, label: string, t: SensitivityTable | null, unavailable: string): FootballBar {
  if (!t) return { key, group: "DCF", label, low: null, high: null, mid: null, detail: unavailable };
  const c = Math.floor(t.rows.length / 2);
  const inner: number[] = [];
  for (let i = c - 1; i <= c + 1; i++) for (let j = c - 1; j <= c + 1; j++) if (ok(t.values[i]?.[j])) inner.push(t.values[i][j] as number);
  if (!inner.length) return { key, group: "DCF", label, low: null, high: null, mid: null, detail: unavailable };
  return {
    key,
    group: "DCF",
    label,
    low: Math.min(...inner),
    high: Math.max(...inner),
    mid: ok(t.values[c][c]) ? t.values[c][c] : null,
    detail: `Base case with WACC ± 0.5% and ${t.colLabel === "Terminal growth" ? "terminal growth ± 0.25%" : "exit multiple ± 1.0x"}.`,
  };
}

/** A range from manually entered precedent-transaction multiples. */
export function precedentBar(key: MultipleKey, label: string, lowMultiple: number | null, highMultiple: number | null, basis: TargetBasis): FootballBar {
  const entered = ok(lowMultiple) && ok(highMultiple) && lowMultiple > 0 && highMultiple > 0;
  const lo = entered ? impliedSharePrice(key, lowMultiple, basis) : null;
  const hi = entered ? impliedSharePrice(key, highMultiple, basis) : null;
  return {
    key: `precedent-${key}`,
    group: "Precedent transactions",
    label,
    ...ordered(lo, hi),
    mid: null,
    detail: entered
      ? lo === null || hi === null
        ? "Not available: the company's own figure is negative or missing, so a multiple cannot be applied."
        : `Your multiples of ${(lowMultiple as number).toFixed(1)}x to ${(highMultiple as number).toFixed(1)}x applied to the company's LTM figure.`
      : "Enter a low and a high multiple from comparable deals to add this bar.",
  };
}

/** Chart axis that fits every bar and the current price, with a little padding. */
export function axisDomain(bars: FootballBar[], price: number | null): { min: number; max: number } | null {
  const xs = bars.flatMap((b) => [b.low, b.high]).filter(ok);
  if (ok(price)) xs.push(price);
  if (!xs.length) return null;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
  return { min: Math.max(0, lo - pad), max: hi + pad };
}

/** Round axis tick marks. */
export function axisTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}
