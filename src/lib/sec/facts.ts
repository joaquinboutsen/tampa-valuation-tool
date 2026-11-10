/**
 * Turns the SEC's raw "company facts" file into clean financial statements.
 *
 * Pure functions only (no network), so everything here is unit-tested.
 *
 * Key rules, in plain English:
 *  1. Fiscal years are the ~12-month periods reported in the company's 10-Ks.
 *  2. When the same period was reported more than once (e.g. restated in a
 *     later filing), the most recently filed number is used.
 *  3. LTM (last twelve months) = latest fiscal year
 *                               + current year-to-date
 *                               − same year-to-date period one year earlier.
 *  4. Nothing is estimated. If a tag is missing the cell is "not available".
 */
import type { BalanceSnapshot, Cell, FactSource, Financials, PeriodCol, Row, Unit } from "../types";
import type { DebtComponent } from "../types";
import { DEBT_TAGS, FLOW_CONCEPTS, INSTANT_CONCEPTS, type FlowKey, type InstantKey } from "./concepts";

export interface RawFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label?: string | null; units: Record<string, RawFact[]> }>>;
}

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "10-KT/A"]);
const ALLOWED_FORMS = new Set([...ANNUAL_FORMS, "10-Q", "10-Q/A", "10-QT"]);
const MAX_YEARS = 5;
const MS_DAY = 86_400_000;

/* ----------------------------- date helpers ----------------------------- */

export function toTime(iso: string): number {
  return Date.parse(iso + "T00:00:00Z");
}
export function dayDiff(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / MS_DAY);
}
export function addDays(iso: string, n: number): string {
  return new Date(toTime(iso) + n * MS_DAY).toISOString().slice(0, 10);
}
export function durationDays(f: { start?: string; end: string }): number {
  return f.start ? dayDiff(f.start, f.end) + 1 : 0;
}
export function isAnnualDuration(days: number): boolean {
  return days >= 350 && days <= 380;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthYear(iso: string): string {
  // Fiscal periods that end in the first days of a month (52/53-week calendars)
  // are labelled by the month they effectively cover.
  const d = new Date(toTime(iso));
  if (d.getUTCDate() <= 7) d.setUTCDate(0);
  return `${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/* ----------------------------- fact access ------------------------------ */

export function filingIndexUrl(cik: number, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
}

function unitKey(unit: Unit): string {
  if (unit === "USD/share") return "USD/shares";
  return unit;
}

function tagFacts(cf: CompanyFacts, tag: string, unit: Unit, taxonomy = "us-gaap"): RawFact[] {
  const arr = cf.facts?.[taxonomy]?.[tag]?.units?.[unitKey(unit)];
  if (!arr) return [];
  return arr.filter((f) => ALLOWED_FORMS.has(f.form));
}

function toSource(cf: CompanyFacts, tag: string, f: RawFact, taxonomy = "us-gaap"): FactSource {
  return {
    tag: `${taxonomy}:${tag}`,
    form: f.form,
    accn: f.accn,
    filed: f.filed,
    start: f.start,
    end: f.end,
    url: filingIndexUrl(cf.cik, f.accn),
  };
}

const NA = (note: string): Cell => ({ value: null, sources: [], note });

interface Picked {
  fact: RawFact;
  tag: string;
}

/** Latest-filed fact wins; tag priority breaks ties. */
function best(cands: { fact: RawFact; tag: string; prio: number }[]): Picked | null {
  if (!cands.length) return null;
  cands.sort(
    (a, b) => b.fact.filed.localeCompare(a.fact.filed) || a.prio - b.prio || b.fact.accn.localeCompare(a.fact.accn),
  );
  return cands[0];
}

function pickAnnual(cf: CompanyFacts, tags: readonly string[], unit: Unit, end: string): Picked | null {
  const cands: { fact: RawFact; tag: string; prio: number }[] = [];
  tags.forEach((tag, prio) => {
    for (const f of tagFacts(cf, tag, unit)) {
      if (f.end === end && f.start && isAnnualDuration(durationDays(f))) cands.push({ fact: f, tag, prio });
    }
  });
  return best(cands);
}

/** A sub-annual period (e.g. year-to-date) that starts near `start` and ends near `end`. */
function pickPeriod(
  cf: CompanyFacts,
  tag: string,
  unit: Unit,
  start: string,
  end: string,
  tolDays = 0,
): RawFact | null {
  const cands = tagFacts(cf, tag, unit)
    .filter(
      (f) =>
        f.start !== undefined &&
        !isAnnualDuration(durationDays(f)) &&
        Math.abs(dayDiff(f.end, end)) <= tolDays &&
        Math.abs(dayDiff(f.start, start)) <= Math.max(tolDays, 7),
    )
    .map((fact) => ({ fact, tag, prio: 0 }));
  return best(cands)?.fact ?? null;
}

function pickInstant(cf: CompanyFacts, tags: readonly string[], unit: Unit, date: string): Picked | null {
  const cands: { fact: RawFact; tag: string; prio: number }[] = [];
  tags.forEach((tag, prio) => {
    for (const f of tagFacts(cf, tag, unit)) {
      if (!f.start && f.end === date) cands.push({ fact: f, tag, prio });
    }
  });
  return best(cands);
}

function cellFrom(cf: CompanyFacts, p: Picked | null, missingNote: string): Cell {
  if (!p) return NA(missingNote);
  return { value: p.fact.val, sources: [toSource(cf, p.tag, p.fact)] };
}

/* --------------------------- cell arithmetic ---------------------------- */

/** Adds/subtracts cells. Returns "not available" if any required input is missing. */
export function combine(
  parts: { cell: Cell; sign: 1 | -1 }[],
  note: string,
): Cell {
  if (parts.some((p) => p.cell.value === null)) {
    return { value: null, sources: [], note: `Not available: ${note} needs inputs the company does not report.`, derived: true };
  }
  return {
    value: parts.reduce((s, p) => s + p.sign * (p.cell.value as number), 0),
    sources: parts.flatMap((p) => p.cell.sources),
    note,
    derived: true,
  };
}

/* --------------------------- fiscal periods ----------------------------- */

interface FiscalYear {
  start: string;
  end: string;
}

export function findFiscalYears(cf: CompanyFacts): FiscalYear[] {
  const anchors = [...FLOW_CONCEPTS.revenue, ...FLOW_CONCEPTS.netIncome, ...FLOW_CONCEPTS.netIncomeInclNci];
  const byEnd = new Map<string, string>();
  for (const tag of anchors) {
    for (const f of tagFacts(cf, tag, "USD")) {
      if (!ANNUAL_FORMS.has(f.form) || !f.start) continue;
      if (!isAnnualDuration(durationDays(f))) continue;
      if (!byEnd.has(f.end)) byEnd.set(f.end, f.start);
    }
  }
  const years = [...byEnd.entries()].map(([end, start]) => ({ start, end })).sort((a, b) => a.end.localeCompare(b.end));
  // Guard against stray tagging: fiscal years must be at least ~11 months apart.
  const clean: FiscalYear[] = [];
  for (const y of years) {
    const prev = clean[clean.length - 1];
    if (prev && dayDiff(prev.end, y.end) < 330) continue;
    clean.push(y);
  }
  return clean.slice(-MAX_YEARS);
}

function latestBalanceFact(cf: CompanyFacts): RawFact | null {
  let bestFact: RawFact | null = null;
  for (const tag of ["Assets", "LiabilitiesAndStockholdersEquity"]) {
    for (const f of tagFacts(cf, tag, "USD")) {
      if (f.start) continue;
      if (
        !bestFact ||
        f.end > bestFact.end ||
        (f.end === bestFact.end && f.filed > bestFact.filed)
      ) {
        bestFact = f;
      }
    }
    if (bestFact) break;
  }
  return bestFact;
}

interface LtmWindow {
  fy: FiscalYear;
  ytdStart: string;
  ytdEnd: string;
  priorStart: string;
  priorEnd: string;
}

/* ------------------------------ row builder ----------------------------- */

interface Ctx {
  cf: CompanyFacts;
  years: FiscalYear[];
  ltmMode: "none" | "equalsFY" | "rollForward";
  win: LtmWindow | null;
}

function flowAnnual(ctx: Ctx, key: FlowKey, unit: Unit, label: string): Cell[] {
  return ctx.years.map((y) =>
    cellFrom(ctx.cf, pickAnnual(ctx.cf, FLOW_CONCEPTS[key], unit, y.end), `Not available: no "${label}" tag in the 10-K for this year.`),
  );
}

function flowLtm(ctx: Ctx, key: FlowKey, unit: Unit, label: string, annual: Cell[]): Cell | null {
  if (ctx.ltmMode === "none") return null;
  if (ctx.ltmMode === "equalsFY") {
    const last = annual[annual.length - 1];
    return { ...last, note: last.value === null ? last.note : "Equals the latest fiscal year (no later 10-Q has been filed)." };
  }
  const w = ctx.win as LtmWindow;
  for (const tag of FLOW_CONCEPTS[key]) {
    const fy = pickAnnual(ctx.cf, [tag], unit, w.fy.end);
    if (!fy) continue;
    const ytd = pickPeriod(ctx.cf, tag, unit, w.ytdStart, w.ytdEnd);
    if (!ytd) continue;
    const prior = pickPeriod(ctx.cf, tag, unit, w.priorStart, w.priorEnd, 10);
    if (!prior) continue;
    // The two year-to-date windows must cover the same span (within ~10 days).
    if (Math.abs(durationDays(ytd) - durationDays(prior)) > 10) continue;
    return {
      value: fy.fact.val + ytd.val - prior.val,
      sources: [toSource(ctx.cf, tag, fy.fact), toSource(ctx.cf, tag, ytd), toSource(ctx.cf, tag, prior)],
      note: "LTM = latest fiscal year + current year-to-date − prior-year year-to-date.",
      derived: true,
    };
  }
  return NA(`Not available: "${label}" is not reported in both the 10-K and the latest 10-Q under the same tag.`);
}

function flowRow(ctx: Ctx, key: FlowKey, label: string, unit: Unit = "USD", emphasis = false): Row {
  const values = flowAnnual(ctx, key, unit, label);
  return { key, label, unit, values, ltm: flowLtm(ctx, key, unit, label, values), emphasis };
}

function derivedRow(key: string, label: string, parts: { row: Row; sign: 1 | -1 }[], note: string, emphasis = false): Row {
  const n = parts[0].row.values.length;
  const values: Cell[] = [];
  for (let i = 0; i < n; i++) values.push(combine(parts.map((p) => ({ cell: p.row.values[i], sign: p.sign })), note));
  const ltm = parts.every((p) => p.row.ltm) ? combine(parts.map((p) => ({ cell: p.row.ltm as Cell, sign: p.sign })), note) : null;
  return { key, label, unit: "USD", values, ltm, derived: true, emphasis };
}

/** Uses `primary` where available, otherwise `fallback` (cell by cell). */
function coalesceRows(key: string, label: string, primary: Row, fallback: Row): Row {
  const pickCell = (a: Cell | null, b: Cell | null): Cell | null => (a && a.value !== null ? a : b ?? a);
  return {
    key,
    label,
    unit: primary.unit,
    values: primary.values.map((c, i) => pickCell(c, fallback.values[i]) as Cell),
    ltm: pickCell(primary.ltm, fallback.ltm),
  };
}

function negateRow(row: Row, note: string): Row {
  const neg = (c: Cell | null): Cell | null =>
    c === null ? null : c.value === null ? c : { ...c, value: -c.value, note, derived: true };
  return { ...row, values: row.values.map((c) => neg(c) as Cell), ltm: neg(row.ltm) };
}

function snapshot(cf: CompanyFacts, date: string, form: string, accn: string): BalanceSnapshot {
  const items: Record<string, Cell> = {};
  for (const key of Object.keys(INSTANT_CONCEPTS) as InstantKey[]) {
    items[key] = cellFrom(cf, pickInstant(cf, INSTANT_CONCEPTS[key], "USD", date), "Not reported as a separate tagged line on this date.");
  }
  return { date, form, accn, url: filingIndexUrl(cf.cik, accn), items };
}

/* --------------------------------- main --------------------------------- */

export function buildFinancials(cf: CompanyFacts): Financials {
  const warnings: string[] = [];
  const years = findFiscalYears(cf);
  if (!cf.facts?.["us-gaap"]) {
    warnings.push("This company does not file US GAAP financial data with the SEC (it may be a foreign filer reporting under IFRS).");
  }
  if (!years.length) {
    warnings.push("No annual (10-K) periods were found in the SEC data for this company.");
  }

  const lastFY = years[years.length - 1];
  const latestBS = latestBalanceFact(cf);

  let ltmMode: Ctx["ltmMode"] = "none";
  let win: LtmWindow | null = null;
  let ltmCol: Financials["ltm"] = null;
  if (lastFY && latestBS) {
    if (latestBS.end > lastFY.end && dayDiff(lastFY.end, latestBS.end) < 300) {
      const prevFY = years[years.length - 2];
      const ytdStart = addDays(lastFY.end, 1);
      const span = dayDiff(ytdStart, latestBS.end);
      const priorStart = prevFY ? addDays(prevFY.end, 1) : addDays(lastFY.start, 0);
      win = { fy: lastFY, ytdStart, ytdEnd: latestBS.end, priorStart, priorEnd: addDays(priorStart, span) };
      ltmMode = "rollForward";
      ltmCol = {
        label: `LTM ${monthYear(latestBS.end)}`,
        kind: "LTM",
        end: latestBS.end,
        basis: `Fiscal year ended ${lastFY.end} + year-to-date through ${latestBS.end} − the same year-to-date period one year earlier.`,
      };
    } else {
      ltmMode = "equalsFY";
      ltmCol = {
        label: `LTM ${monthYear(lastFY.end)}`,
        kind: "LTM",
        end: lastFY.end,
        basis: `Equals the fiscal year ended ${lastFY.end}: no 10-Q has been filed since the latest 10-K.`,
      };
    }
  }

  const ctx: Ctx = { cf, years, ltmMode, win };

  const revenue = flowRow(ctx, "revenue", "Revenue", "USD", true);
  const costOfRevenue = flowRow(ctx, "costOfRevenue", "Cost of revenue");
  const grossProfit = flowRow(ctx, "grossProfit", "Gross profit");
  const interestGross = flowRow(ctx, "interestExpense", "Interest expense");
  const interestNet = negateRow(
    flowRow(ctx, "interestNet", "Net interest"),
    "Net of interest income: the company tags only net interest, shown here as a positive expense.",
  );
  const interestExpense = coalesceRows("interestExpense", "Interest expense", interestGross, interestNet);
  const pretaxIncome = flowRow(ctx, "pretaxIncome", "Pre-tax income");
  // Some companies do not report an operating income line. For them EBIT is built the
  // textbook way: pre-tax income + interest expense. It then includes non-operating items.
  const operatingIncomeReported = flowRow(ctx, "operatingIncome", "Operating income (EBIT)");
  const operatingIncomeDerived = derivedRow(
    "operatingIncomeDerived",
    "Operating income (EBIT)",
    [{ row: pretaxIncome, sign: 1 }, { row: interestExpense, sign: 1 }],
    "The company does not report an operating income line, so EBIT is calculated as pre-tax income + interest expense. This includes any non-operating income or expense.",
  );
  const operatingIncome = coalesceRows("operatingIncome", "Operating income (EBIT)", operatingIncomeReported, operatingIncomeDerived);
  const daReported = flowRow(ctx, "da", "Depreciation & amortization");
  const dep = flowRow(ctx, "depreciation", "Depreciation");
  const amort = flowRow(ctx, "amortization", "Amortization of intangibles");
  const daSummed = derivedRow("daSummed", "Depreciation & amortization", [{ row: dep, sign: 1 }, { row: amort, sign: 1 }], "Depreciation + amortization of intangibles (the company does not report a combined D&A tag).");
  const da = coalesceRows("da", "Depreciation & amortization", daReported, daSummed);
  const ebitda = derivedRow("ebitda", "EBITDA", [{ row: operatingIncome, sign: 1 }, { row: da, sign: 1 }], "EBITDA = operating income + depreciation & amortization. Unadjusted: no add-backs for one-time items or stock compensation.", true);
  const incomeTax = flowRow(ctx, "incomeTax", "Income tax expense");
  const netIncome = flowRow(ctx, "netIncome", "Net income to common", "USD", true);
  const epsDiluted = flowRow(ctx, "epsDiluted", "Diluted EPS", "USD/share");
  if (epsDiluted.ltm && epsDiluted.ltm.derived && epsDiluted.ltm.value !== null) {
    epsDiluted.ltm.note = "LTM EPS = fiscal-year EPS + current year-to-date EPS − prior-year year-to-date EPS (standard approximation).";
  }
  // Weighted-average shares are averages, not flows, so no LTM is computed.
  const dilutedShares: Row = { key: "dilutedShares", label: "Diluted weighted-average shares", unit: "shares", values: flowAnnual(ctx, "dilutedShares", "shares", "Diluted shares"), ltm: null };

  const cfo = flowRow(ctx, "cfo", "Cash flow from operations", "USD", true);
  const cfi = flowRow(ctx, "cfi", "Cash flow from investing");
  const cff = flowRow(ctx, "cff", "Cash flow from financing");
  const fxOnCash = flowRow(ctx, "fxOnCash", "Effect of exchange rates on cash");
  const netChangeInCash = flowRow(ctx, "netChangeInCash", "Net change in cash");
  const netChangeInCashExFx = flowRow(ctx, "netChangeInCashExFx", "Net change in cash (before FX)");
  const capex = flowRow(ctx, "capex", "Capital expenditures");
  const sbc = flowRow(ctx, "sbc", "Stock-based compensation");
  const fcf = derivedRow("fcf", "Free cash flow (CFO − capex)", [{ row: cfo, sign: 1 }, { row: capex, sign: -1 }], "Simple free cash flow = cash flow from operations − capital expenditures.", true);

  const fiscalYears: PeriodCol[] = years.map((y) => ({ label: `FY ${monthYear(y.end)}`, kind: "FY", start: y.start, end: y.end }));

  const balanceByYear = years.map((y) => {
    const src = pickInstant(cf, ["Assets", "LiabilitiesAndStockholdersEquity"], "USD", y.end);
    return snapshot(cf, y.end, src?.fact.form ?? "10-K", src?.fact.accn ?? "");
  });
  const latestBalance = latestBS ? snapshot(cf, latestBS.end, latestBS.form, latestBS.accn) : null;

  return {
    cik: cf.cik,
    entityName: cf.entityName,
    fiscalYears,
    ltm: ltmCol,
    income: [revenue, costOfRevenue, grossProfit, ebitda, da, operatingIncome, interestExpense, pretaxIncome, incomeTax, netIncome, epsDiluted, dilutedShares],
    cashflow: [cfo, capex, fcf, sbc, cfi, cff, fxOnCash, netChangeInCash, netChangeInCashExFx],
    balanceByYear,
    latestBalance,
    coverShares: coverShares(cf),
    warnings,
  };
}

/** Shares outstanding from the cover page of the most recent 10-K / 10-Q. */
export function coverShares(cf: CompanyFacts): Financials["coverShares"] {
  const facts = tagFacts(cf, "EntityCommonStockSharesOutstanding", "shares", "dei");
  if (!facts.length) {
    return { value: null, sources: [], note: "Not available: the filing cover page does not report a single share count (common for multi-class companies)." };
  }
  const latest = facts.reduce((a, b) => (b.filed > a.filed || (b.filed === a.filed && b.end > a.end) ? b : a));
  // Only trust a share count that comes from the company's most recent filing.
  const bs = latestBalanceFact(cf);
  if (bs && latest.filed < bs.filed) {
    return { value: null, sources: [], note: "Not available: recent filings do not report a single share count on the cover page (common for multi-class companies)." };
  }
  return {
    value: latest.val,
    sources: [toSource(cf, "EntityCommonStockSharesOutstanding", latest, "dei")],
    asOf: latest.end,
  };
}

/**
 * Fallback debt calculation from standard tags, used only when the face of
 * the balance sheet cannot be read. Tags are grouped so overlapping totals are
 * never added together.
 */
export function debtFromTags(cf: CompanyFacts, date: string): DebtComponent[] {
  const first = (tags: readonly string[], label: string): DebtComponent | null => {
    for (const tag of tags) {
      const p = pickInstant(cf, [tag], "USD", date);
      if (p) return { label, tag: `us-gaap:${tag}`, value: p.fact.val };
    }
    return null;
  };
  const out: DebtComponent[] = [];
  const currentCombined = first(DEBT_TAGS.currentCombined, "Current debt");
  if (currentCombined) out.push(currentCombined);
  else {
    const st = first(DEBT_TAGS.shortTerm, "Short-term borrowings");
    const cm = first(DEBT_TAGS.currentMaturities, "Current portion of long-term debt");
    if (st) out.push(st);
    if (cm) out.push(cm);
  }
  const nc = first(DEBT_TAGS.noncurrent, "Long-term debt");
  if (nc) {
    out.push(nc);
    return out;
  }
  // No current/non-current split: use a long-term total (which already includes
  // the current portion), then a grand total as a last resort.
  const lt = first(DEBT_TAGS.longTermTotal, "Long-term debt (including current portion)");
  if (lt) return [...out.filter((c) => c.label === "Short-term borrowings"), lt];
  if (!out.length) {
    const all = first(DEBT_TAGS.grandTotal, "Total debt");
    if (all) return [all];
  }
  return out;
}

export function rowByKey(rows: Row[], key: string): Row | undefined {
  return rows.find((r) => r.key === key);
}
