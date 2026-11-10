/** Number formatting, banker style: negatives in parentheses. */

export const NA = "n/a";
export const NM = "n/m";

function paren(n: number, body: string): string {
  return n < 0 ? `(${body})` : body;
}

/** Dollars → "$ millions" with thousands separators. */
export function fmtM(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const m = v / 1e6;
  const body = Math.abs(m).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return paren(m, body);
}

/** One decimal place for companies under $1 billion, so small figures do not round away. */
export function autoDecimals(values: (number | null | undefined)[]): number {
  const nums = values.filter((v): v is number => typeof v === "number").map((v) => Math.abs(v));
  const max = nums.length ? Math.max(...nums) : 0;
  return max > 0 && max < 1e9 ? 1 : 0;
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const body = `${Math.abs(v * 100).toFixed(decimals)}%`;
  return paren(v, body);
}

export function fmtMultiple(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NM;
  return `${v.toFixed(decimals)}x`;
}

export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const body = `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return paren(v, body);
}

export function fmtShares(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Large dollar amounts for headline tiles: "$24.6B", "$812M". */
export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const a = Math.abs(v);
  const body = a >= 1e12 ? `$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : `$${(a / 1e6).toFixed(0)}M`;
  return paren(v, body);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
