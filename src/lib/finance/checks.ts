/**
 * Data-quality tie-outs. These are the same sanity checks an analyst runs
 * before trusting a spread: does the balance sheet balance, does the cash flow
 * statement explain the change in cash, do the segments add up to the total.
 *
 * A check PASSES when the two sides agree within the larger of
 *   (a) 3 rounding units (filings are rounded to $ thousands or $ millions), or
 *   (b) 0.1% of the figure being checked.
 * Otherwise it FAILS and the exact numbers are shown with a link to the filing.
 */
import type { BalanceSnapshot, Cell, CheckResult, Financials, Row, SegmentData } from "../types";

/** Infers whether the filing is rounded to dollars, thousands or millions. */
export function roundingUnit(values: number[]): number {
  const nz = values.filter((v) => v !== 0 && Number.isFinite(v));
  if (!nz.length) return 1;
  if (nz.every((v) => Math.abs(v) % 1e6 === 0)) return 1e6;
  if (nz.every((v) => Math.abs(v) % 1e3 === 0)) return 1e3;
  return 1;
}

export function tolerance(base: number, values: number[]): number {
  return Math.max(3 * roundingUnit(values), Math.abs(base) * 0.001);
}

function money(v: number): string {
  const m = v / 1e6;
  const body = Math.abs(m).toLocaleString("en-US", { maximumFractionDigits: 1 });
  return m < 0 ? `($${body}M)` : `$${body}M`;
}

interface CompareArgs {
  id: string;
  title: string;
  period: string;
  lhsLabel: string;
  lhs: number | null;
  rhsLabel: string;
  rhs: number | null;
  inputs: (number | null)[];
  naReason: string;
  passDetail?: string;
  failHint?: string;
  filingUrl?: string;
  filingLabel?: string;
}

export function compare(a: CompareArgs): CheckResult {
  const base = { id: a.id, title: a.title, period: a.period, lhsLabel: a.lhsLabel, rhsLabel: a.rhsLabel, filingUrl: a.filingUrl, filingLabel: a.filingLabel };
  if (a.lhs === null || a.rhs === null) {
    return { ...base, status: "na", lhs: a.lhs, rhs: a.rhs, diff: null, detail: a.naReason };
  }
  const diff = a.lhs - a.rhs;
  const inputs = a.inputs.filter((v): v is number => v !== null);
  const tol = tolerance(Math.max(Math.abs(a.lhs), Math.abs(a.rhs)), inputs);
  const ok = Math.abs(diff) <= tol;
  const why = diff === 0 ? "" : Math.abs(diff) <= 3 * roundingUnit(inputs) ? " (rounding)" : " (within the 0.1% tolerance)";
  const detail = ok
    ? `${a.lhsLabel} ${money(a.lhs)} vs ${a.rhsLabel} ${money(a.rhs)}; difference ${money(diff)}${why}.${a.passDetail ? " " + a.passDetail : ""}`
    : `${a.lhsLabel} ${money(a.lhs)} vs ${a.rhsLabel} ${money(a.rhs)}; unexplained difference ${money(diff)}.${a.failHint ? " " + a.failHint : ""}`;
  return { ...base, status: ok ? "pass" : "fail", lhs: a.lhs, rhs: a.rhs, diff, detail };
}

const val = (c: Cell | undefined | null): number | null => (c ? c.value : null);
const sumOrNull = (...xs: (number | null)[]): number | null => (xs.some((x) => x === null) ? null : (xs as number[]).reduce((s, x) => s + x, 0));

function balanceChecks(snap: BalanceSnapshot, label: string): CheckResult[] {
  const it = snap.items;
  const assets = val(it.totalAssets);
  const le = val(it.liabilitiesAndEquity);
  const liab = val(it.totalLiabilities);
  const equityTotal = val(it.equityTotal) ?? sumOrNull(val(it.equityParent), val(it.nci) ?? 0);
  const mezz = (val(it.redeemableNci) ?? 0) + (val(it.temporaryEquity) ?? 0);
  const filingLabel = `${snap.form} for period ended ${snap.date}`;
  const out: CheckResult[] = [
    compare({
      id: `bs-balance-${snap.date}`,
      title: "Balance sheet balances",
      period: label,
      lhsLabel: "Total assets",
      lhs: assets,
      rhsLabel: "Total liabilities and equity",
      rhs: le,
      inputs: [assets, le],
      naReason: "Not available: total assets or total liabilities and equity is not tagged in this filing.",
      filingUrl: snap.url,
      filingLabel,
    }),
  ];
  out.push(
    compare({
      id: `bs-components-${snap.date}`,
      title: "Liabilities + equity add up to total assets",
      period: label,
      lhsLabel: "Total assets",
      lhs: assets,
      rhsLabel: mezz ? "Liabilities + redeemable interests + total equity" : "Liabilities + total equity",
      rhs: liab === null || equityTotal === null ? null : liab + mezz + equityTotal,
      inputs: [assets, liab, equityTotal],
      naReason: "Not available: the company does not report a total liabilities line (it is not required), so this cross-check cannot be run.",
      failHint: "A gap here usually means the balance sheet has a line between liabilities and equity (such as redeemable stock) that this tool does not read.",
      filingUrl: snap.url,
      filingLabel,
    }),
  );
  return out;
}

function findRow(rows: Row[], key: string): Row | undefined {
  return rows.find((r) => r.key === key);
}

export interface CheckOptions {
  /** Today's date (YYYY-MM-DD), used for the freshness check. */
  today: string;
}

export function runChecks(fin: Financials, segments: SegmentData, opts: CheckOptions): CheckResult[] {
  const out: CheckResult[] = [];
  const years = fin.fiscalYears;
  const n = years.length;

  /* 1–2. Balance sheet, at the latest date and each of the last three fiscal year ends. */
  const snaps: { snap: BalanceSnapshot; label: string }[] = [];
  if (fin.latestBalance) snaps.push({ snap: fin.latestBalance, label: `As of ${fin.latestBalance.date}` });
  for (let i = n - 1; i >= Math.max(0, n - 3); i--) {
    const s = fin.balanceByYear[i];
    if (s && !snaps.some((x) => x.snap.date === s.date)) snaps.push({ snap: s, label: years[i].label });
  }
  for (const s of snaps) out.push(...balanceChecks(s.snap, s.label));

  /* 3. Cash flow statement sums to the change in cash. */
  const cfo = findRow(fin.cashflow, "cfo");
  const cfi = findRow(fin.cashflow, "cfi");
  const cff = findRow(fin.cashflow, "cff");
  const fx = findRow(fin.cashflow, "fxOnCash");
  const net = findRow(fin.cashflow, "netChangeInCash");
  const netExFx = findRow(fin.cashflow, "netChangeInCashExFx");
  for (let i = n - 1; i >= Math.max(0, n - 3); i--) {
    const o = val(cfo?.values[i]);
    const inv = val(cfi?.values[i]);
    const fin_ = val(cff?.values[i]);
    const fxv = val(fx?.values[i]);
    const reported = val(net?.values[i]);
    const reportedExFx = val(netExFx?.values[i]);
    const src = cfo?.values[i]?.sources[0];
    const useExFx = reported === null && reportedExFx !== null;
    const lhs = useExFx ? sumOrNull(o, inv, fin_) : sumOrNull(o, inv, fin_, fxv ?? 0);
    out.push(
      compare({
        id: `cf-sum-${years[i].end}`,
        title: "Cash flow statement ties to change in cash",
        period: years[i].label,
        lhsLabel: useExFx ? "Operating + investing + financing" : fxv === null ? "Operating + investing + financing (no FX line reported)" : "Operating + investing + financing + FX effect",
        lhs,
        rhsLabel: "Reported net change in cash",
        rhs: useExFx ? reportedExFx : reported,
        inputs: [o, inv, fin_, fxv, reported],
        naReason: "Not available: one of the three cash flow totals or the net change in cash is not tagged for this year.",
        failHint: "A gap here usually means cash flows from discontinued operations are reported on a separate line.",
        filingUrl: src?.url,
        filingLabel: src ? `${src.form} filed ${src.filed}` : undefined,
      }),
    );
  }

  /* 4. Beginning cash + change = ending cash. */
  for (let i = n - 1; i >= Math.max(1, n - 3); i--) {
    const begin = fin.balanceByYear[i - 1]?.items;
    const end = fin.balanceByYear[i]?.items;
    const useRestricted = val(begin?.cashInclRestricted) !== null && val(end?.cashInclRestricted) !== null;
    const b = useRestricted ? val(begin?.cashInclRestricted) : val(begin?.cash);
    const e = useRestricted ? val(end?.cashInclRestricted) : val(end?.cash);
    const change = val(net?.values[i]) ?? sumOrNull(val(netExFx?.values[i]), val(fx?.values[i]) ?? 0);
    out.push(
      compare({
        id: `cash-roll-${years[i].end}`,
        title: "Beginning cash + net change = ending cash",
        period: years[i].label,
        lhsLabel: "Beginning cash + net change in cash",
        lhs: sumOrNull(b, change),
        rhsLabel: useRestricted ? "Ending cash (incl. restricted cash)" : "Ending cash",
        rhs: e,
        inputs: [b, change, e],
        naReason: "Not available: cash at the start or end of the year is not tagged on a basis that matches the cash flow statement.",
        failHint: "A gap here usually means cash held in discontinued operations or a change in how restricted cash is presented.",
        filingUrl: fin.balanceByYear[i]?.url,
        filingLabel: `${fin.balanceByYear[i]?.form} for period ended ${years[i].end}`,
      }),
    );
  }

  /* 5. Revenue − cost of revenue = gross profit (only when all three are reported). */
  const rev = findRow(fin.income, "revenue");
  const cor = findRow(fin.income, "costOfRevenue");
  const gp = findRow(fin.income, "grossProfit");
  if (n > 0) {
    const i = n - 1;
    const r = val(rev?.values[i]);
    const c = val(cor?.values[i]);
    const g = val(gp?.values[i]);
    const src = rev?.values[i]?.sources[0];
    out.push(
      compare({
        id: `gross-profit-${years[i].end}`,
        title: "Revenue − cost of revenue = gross profit",
        period: years[i].label,
        lhsLabel: "Revenue − cost of revenue",
        lhs: sumOrNull(r, c === null ? null : -c),
        rhsLabel: "Reported gross profit",
        rhs: g,
        inputs: [r, c, g],
        naReason: "Not available: the company does not report a gross profit line (common for restaurants, services and some industrials).",
        filingUrl: src?.url,
        filingLabel: src ? `${src.form} filed ${src.filed}` : undefined,
      }),
    );
  }

  /* 6. Segment revenues sum to the consolidated total. */
  if (segments.available) {
    const parts = [...segments.segments, ...segments.reconciling];
    const sum = parts.reduce((s, l) => s + l.value, 0);
    const list = parts.map((l) => `${l.label} ${money(l.value)}`).join("; ");
    const c = compare({
      id: "segments",
      title: "Segment revenues sum to total revenue",
      period: n ? years[n - 1].label : "",
      lhsLabel: segments.reconciling.length ? "Sum of segments + reconciling items" : "Sum of segments",
      lhs: sum,
      rhsLabel: "Consolidated revenue",
      rhs: segments.total,
      inputs: [...parts.map((p) => p.value), segments.total],
      naReason: "Not available: consolidated revenue could not be matched in the filing's data file.",
      failHint: "A gap here usually means intersegment eliminations or a corporate/other line that is tagged in a non-standard way.",
      filingUrl: segments.filingUrl,
      filingLabel: "Latest 10-K",
    });
    c.detail += ` Segments: ${list}.`;
    out.push(c);
  } else {
    out.push({
      id: "segments",
      title: "Segment revenues sum to total revenue",
      period: n ? years[n - 1].label : "",
      status: "na",
      lhsLabel: "Sum of segments",
      lhs: null,
      rhsLabel: "Consolidated revenue",
      rhs: null,
      diff: null,
      detail: `Not available: ${segments.reason ?? "segment data could not be read."}`,
      filingUrl: segments.filingUrl,
      filingLabel: "Latest 10-K",
    });
  }

  /* 7. Freshness: flag stale financials. */
  if (fin.latestBalance) {
    const ageDays = Math.round((Date.parse(opts.today) - Date.parse(fin.latestBalance.date)) / 86_400_000);
    const stale = ageDays > 200;
    out.push({
      id: "freshness",
      title: "Financials are current",
      period: `As of ${fin.latestBalance.date}`,
      status: stale ? "fail" : "pass",
      lhsLabel: "Days since latest balance sheet",
      lhs: ageDays,
      rhsLabel: "Limit",
      rhs: 200,
      diff: null,
      detail: stale
        ? `The latest balance sheet is ${ageDays} days old. A current filer reports every ~90 days, so this company may be late with its filings, newly listed, or no longer reporting.`
        : `The latest balance sheet is ${ageDays} days old (from the ${fin.latestBalance.form}); companies report roughly every 90 days.`,
      filingUrl: fin.latestBalance.url,
      filingLabel: `${fin.latestBalance.form} for period ended ${fin.latestBalance.date}`,
    });
  }

  return out;
}

/** Cross-check of the SEC cover-page share count against the market data provider. */
export function sharesCheck(coverShares: number | null, coverAsOf: string | undefined, providerShares: number | null, provider: string): CheckResult {
  const base = {
    id: "shares",
    title: "Share count agrees across sources",
    period: coverAsOf ? `As of ${coverAsOf}` : "",
    lhsLabel: "Shares on SEC filing cover",
    rhsLabel: `Shares per ${provider}`,
  };
  if (coverShares === null || providerShares === null) {
    return { ...base, status: "na", lhs: coverShares, rhs: providerShares, diff: null, detail: "Not available: one of the two share counts is missing, so they cannot be compared." };
  }
  const diffPct = coverShares / providerShares - 1;
  const ok = Math.abs(diffPct) <= 0.05;
  const fmt = (v: number) => `${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  return {
    ...base,
    status: ok ? "pass" : "fail",
    lhs: coverShares,
    rhs: providerShares,
    diff: coverShares - providerShares,
    detail: ok
      ? `SEC cover page ${fmt(coverShares)} vs ${provider} ${fmt(providerShares)} (${(diffPct * 100).toFixed(1)}% apart; small gaps reflect buybacks and issuance between dates).`
      : `SEC cover page ${fmt(coverShares)} vs ${provider} ${fmt(providerShares)}: ${(diffPct * 100).toFixed(1)}% apart. This usually means multiple share classes (the cover page may list only one) or a recent stock split. Market cap on this page uses the ${provider} figure.`,
  };
}
