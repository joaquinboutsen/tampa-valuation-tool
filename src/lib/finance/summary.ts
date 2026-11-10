/**
 * Builds the display rows of the financial summary table (values, growth and
 * margins) from the normalized statements. Pure, so it is unit-tested.
 */
import type { Cell, Financials, Row } from "../types";
import { growth, margin } from "./metrics";

export type DisplayKind = "money" | "pct" | "perShare" | "shares";

export interface DisplayRow {
  key: string;
  label: string;
  kind: DisplayKind;
  /** One value per fiscal year, oldest first. */
  values: (number | null)[];
  ltm: number | null;
  /** Underlying cells, for tooltips and the source list (absent for ratios). */
  cells?: Cell[];
  ltmCell?: Cell | null;
  style: "total" | "normal" | "sub";
  /** Draw a rule above this row. */
  rule?: boolean;
}

const vals = (r: Row | undefined, n: number): (number | null)[] => (r ? r.values.map((c) => c.value) : Array(n).fill(null));
const ltmVal = (r: Row | undefined): number | null => r?.ltm?.value ?? null;

function moneyRow(r: Row | undefined, n: number, style: DisplayRow["style"], rule = false, label?: string): DisplayRow | null {
  if (!r) return null;
  return {
    key: r.key,
    label: label ?? r.label,
    kind: r.unit === "USD/share" ? "perShare" : r.unit === "shares" ? "shares" : "money",
    values: vals(r, n),
    ltm: ltmVal(r),
    cells: r.values,
    ltmCell: r.ltm,
    style,
    rule,
  };
}

function marginRow(key: string, label: string, item: Row | undefined, revenue: Row | undefined, n: number): DisplayRow {
  const iv = vals(item, n);
  const rv = vals(revenue, n);
  return { key, label, kind: "pct", values: iv.map((v, i) => margin(v, rv[i])), ltm: margin(ltmVal(item), ltmVal(revenue)), style: "sub" };
}

function growthRow(key: string, label: string, r: Row | undefined, n: number): DisplayRow {
  const v = vals(r, n);
  return {
    key,
    label,
    kind: "pct",
    values: v.map((x, i) => (i === 0 ? null : growth(x, v[i - 1]))),
    // LTM growth is measured against the latest full fiscal year.
    ltm: null,
    style: "sub",
  };
}

/**
 * @param opts.financial  true for banks, brokers and insurers: gross profit,
 *                        EBITDA and EBIT are not meaningful and are left out.
 */
const HIDDEN_FOR_FINANCIALS = new Set(["grossProfit", "grossMargin", "ebitda", "ebitdaMargin", "operatingIncome", "ebitMargin"]);

export function buildSummary(fin: Financials, opts: { financial?: boolean } = {}): { income: DisplayRow[]; cashflow: DisplayRow[] } {
  const n = fin.fiscalYears.length;
  const get = (rows: Row[], key: string) => rows.find((r) => r.key === key);
  const rev = get(fin.income, "revenue");
  const gp = get(fin.income, "grossProfit");
  const ebitda = get(fin.income, "ebitda");
  const ebit = get(fin.income, "operatingIncome");
  const ni = get(fin.income, "netIncome");
  const eps = get(fin.income, "epsDiluted");
  const sh = get(fin.income, "dilutedShares");
  const cfo = get(fin.cashflow, "cfo");
  const capex = get(fin.cashflow, "capex");
  const fcf = get(fin.cashflow, "fcf");
  const da = get(fin.income, "da");

  const income = [
    moneyRow(rev, n, "total"),
    growthRow("revenueGrowth", "% growth", rev, n),
    moneyRow(gp, n, "normal", true),
    marginRow("grossMargin", "% margin", gp, rev, n),
    moneyRow(ebitda, n, "total", true),
    marginRow("ebitdaMargin", "% margin", ebitda, rev, n),
    moneyRow(ebit, n, "normal", true),
    marginRow("ebitMargin", "% margin", ebit, rev, n),
    moneyRow(ni, n, "total", true),
    marginRow("netMargin", "% margin", ni, rev, n),
    moneyRow(eps, n, "normal", true),
    moneyRow(sh, n, "normal", false, "Diluted shares (millions)"),
  ]
    .filter((r): r is DisplayRow => r !== null)
    .filter((r) => !(opts.financial && HIDDEN_FOR_FINANCIALS.has(r.key)));

  const cashflow = [
    moneyRow(cfo, n, "normal"),
    moneyRow(capex, n, "normal", false, "Less: capital expenditures"),
    moneyRow(fcf, n, "total", true),
    marginRow("fcfMargin", "% of revenue", fcf, rev, n),
    moneyRow(da, n, "normal", true),
    marginRow("capexPct", "Capex as % of revenue", capex, rev, n),
  ].filter((r): r is DisplayRow => r !== null);

  return { income, cashflow };
}
