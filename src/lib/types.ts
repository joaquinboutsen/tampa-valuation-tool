/**
 * Shared data shapes. Every number the site shows travels inside a `Cell`
 * so that its source (filing, period, tag) is never separated from the value.
 */

/** Where a single reported number came from. */
export interface FactSource {
  /** XBRL tag, e.g. "us-gaap:Revenues". */
  tag: string;
  /** Filing type, e.g. "10-K" or "10-Q". */
  form: string;
  /** SEC accession number of the filing, e.g. "0001628280-26-067038". */
  accn: string;
  /** Date the filing was submitted to the SEC (YYYY-MM-DD). */
  filed: string;
  /** Period start for flow items (income statement / cash flow). */
  start?: string;
  /** Period end (or balance sheet date). */
  end: string;
  /** Link to the filing on sec.gov. */
  url: string;
}

/** A value plus its provenance. `value === null` means "not available". */
export interface Cell {
  value: number | null;
  sources: FactSource[];
  /** Plain-English explanation when the value is derived or missing. */
  note?: string;
  /** True when computed by this tool rather than reported directly. */
  derived?: boolean;
}

export type Unit = "USD" | "USD/share" | "shares" | "pure";

export interface PeriodCol {
  /** e.g. "FY Aug-2026" or "LTM Sep-2026". */
  label: string;
  kind: "FY" | "LTM";
  start?: string;
  end: string;
}

export interface Row {
  key: string;
  label: string;
  unit: Unit;
  /** One cell per fiscal year, oldest first. */
  values: Cell[];
  /** Last-twelve-months value (flow items only). */
  ltm: Cell | null;
  derived?: boolean;
  /** Visual emphasis for totals. */
  emphasis?: boolean;
}

export interface BalanceSnapshot {
  /** Balance sheet date. */
  date: string;
  /** Filing type the balance sheet comes from. */
  form: string;
  accn: string;
  url: string;
  items: Record<string, Cell>;
}

export interface Financials {
  cik: number;
  entityName: string;
  fiscalYears: PeriodCol[];
  ltm: (PeriodCol & { basis: string }) | null;
  income: Row[];
  cashflow: Row[];
  /** Balance sheets at each fiscal year end (oldest first). */
  balanceByYear: BalanceSnapshot[];
  /** Most recent balance sheet (latest 10-Q or 10-K). */
  latestBalance: BalanceSnapshot | null;
  /** Shares on the cover of the latest filing. */
  coverShares: Cell & { asOf?: string };
  warnings: string[];
}

export interface DebtComponent {
  label: string;
  tag: string;
  value: number;
}

export interface DebtSummary {
  total: number | null;
  components: DebtComponent[];
  /** "face" = read from the face of the balance sheet; "tags" = fallback. */
  method: "face" | "tags" | "none";
  asOf: string | null;
  source: FactSource | null;
  note: string;
}

export type CheckStatus = "pass" | "fail" | "na";

export interface CheckResult {
  id: string;
  title: string;
  period: string;
  status: CheckStatus;
  /** Left-hand side description and value, e.g. "Total assets". */
  lhsLabel: string;
  lhs: number | null;
  rhsLabel: string;
  rhs: number | null;
  diff: number | null;
  detail: string;
  filingUrl?: string;
  filingLabel?: string;
}

export interface SegmentLine {
  member: string;
  label: string;
  value: number;
}

export interface SegmentData {
  available: boolean;
  reason?: string;
  axis?: string;
  period?: { start: string; end: string };
  revenueTag?: string;
  segments: SegmentLine[];
  reconciling: SegmentLine[];
  total: number | null;
  filingUrl?: string;
}

export interface FilingRef {
  form: string;
  accn: string;
  filed: string;
  reportDate: string;
  primaryDocument: string;
  url: string;
  indexUrl: string;
}

export interface CompanyProfile {
  ticker: string;
  cik: number;
  name: string;
  sic: string;
  sicDescription: string;
  exchanges: string[];
  city: string;
  state: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  category: string;
  website?: string;
  isFinancial: boolean;
  /** Short excerpt from Item 1 of the latest 10-K, quoted verbatim. */
  description: { text: string | null; source: string; url?: string };
  latest10K: FilingRef | null;
  latest10Q: FilingRef | null;
}

export interface MarketData {
  available: boolean;
  reason?: string;
  provider: string;
  price: number | null;
  /** ISO timestamp of the quote. */
  priceTime: string | null;
  high52: number | null;
  low52: number | null;
  high52Date?: string | null;
  low52Date?: string | null;
  beta: number | null;
  /** Shares outstanding per the data provider (units, not millions). */
  providerShares: number | null;
  industry?: string | null;
  fetchedAt: string;
}

export interface CompanyPackage {
  profile: CompanyProfile;
  financials: Financials;
  debt: DebtSummary;
  segments: SegmentData;
  checks: CheckResult[];
  generatedAt: string;
}
