/**
 * Default DCF assumptions, each derived from the company's own filings or a
 * cited market source, together with a plain-English note of how it was derived.
 * Every default can be overridden on the page.
 */
import type { RiskFreeRate } from "../market/treasury";
import type { CompanyPackage, MarketData, Row } from "../types";
import { computeWacc, PROJECTION_YEARS, type BridgeItems, type DcfAssumptions, type WaccInputs } from "./dcf";
import { buildValuationSnapshot } from "./snapshot";

/** Equity risk premium default. Source checked November 2026. */
export const ERP_DEFAULT = {
  value: 0.05,
  source: "Kroll recommended U.S. equity risk premium (5.0%, reaffirmed September 2026)",
  url: "https://www.kroll.com/en/reports/cost-of-capital/recommended-us-equity-risk-premium-and-corresponding-risk-free-rates",
};
/** Long-run growth default: roughly long-term inflation plus modest real growth. A judgment, not a data point. */
export const TERMINAL_GROWTH_DEFAULT = 0.025;
/** U.S. federal corporate income tax rate (Internal Revenue Code §11). */
export const STATUTORY_TAX_RATE = 0.21;
/** Spread over the risk-free rate used only when cost of debt cannot be read from filings. A placeholder. */
export const FALLBACK_DEBT_SPREAD = 0.02;

export interface Derivation {
  label: string;
  /** How the default was arrived at, with the numbers used. */
  how: string;
  /** True when the default is a fallback or judgment rather than derived from data. */
  judgment?: boolean;
}

export interface HistoryTable {
  labels: string[];
  revenue: (number | null)[];
  growth: (number | null)[];
  ebitdaMargin: (number | null)[];
  daPct: (number | null)[];
  capexPct: (number | null)[];
  nwcPct: (number | null)[];
  taxRate: (number | null)[];
}

export interface DcfDefaults {
  available: boolean;
  reason?: string;
  assumptions: DcfAssumptions | null;
  waccInputs: WaccInputs | null;
  bridge: BridgeItems;
  derivations: Record<string, Derivation>;
  history: HistoryTable;
  baseLabel: string;
  yearLabels: string[];
  currentPrice: number | null;
  riskFree: RiskFreeRate | null;
  balanceDate: string | null;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const mm = (v: number) => `$${(v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}M`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function meanOfLast(values: (number | null)[], n = 3): { mean: number; used: number } | null {
  const xs = values.slice(-n).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!xs.length) return null;
  return { mean: xs.reduce((s, x) => s + x, 0) / xs.length, used: xs.length };
}

function addYears(iso: string, n: number): string {
  const [y, m] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]}-${y + n}`;
}

export function buildHistory(pkg: CompanyPackage): HistoryTable {
  const fin = pkg.financials;
  const row = (rows: Row[], key: string) => rows.find((r) => r.key === key);
  const v = (r: Row | undefined) => (r ? r.values.map((c) => c.value) : fin.fiscalYears.map(() => null));
  const rev = v(row(fin.income, "revenue"));
  const ebitda = v(row(fin.income, "ebitda"));
  const da = v(row(fin.income, "da"));
  const capex = v(row(fin.cashflow, "capex"));
  const pretax = v(row(fin.income, "pretaxIncome"));
  const tax = v(row(fin.income, "incomeTax"));
  const div = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? a / b : null);

  const nwc = fin.balanceByYear.map((s) => {
    const it = s.items;
    const ca = it.currentAssets.value;
    const cl = it.currentLiabilities.value;
    if (ca === null || cl === null) return null;
    const cash = (it.cash.value ?? 0) + (it.shortTermInvestments.value ?? 0);
    const currentDebt = it.debtCurrentCombined.value ?? (it.debtCurrentMaturities.value ?? 0) + (it.debtShortTerm.value ?? 0);
    return ca - cash - (cl - currentDebt);
  });

  return {
    labels: fin.fiscalYears.map((y) => y.label),
    revenue: rev,
    growth: rev.map((r, i) => (i === 0 ? null : r !== null && rev[i - 1] !== null && (rev[i - 1] as number) > 0 ? r / (rev[i - 1] as number) - 1 : null)),
    ebitdaMargin: ebitda.map((e, i) => div(e, rev[i])),
    daPct: da.map((d, i) => div(d, rev[i])),
    capexPct: capex.map((c, i) => div(c, rev[i])),
    nwcPct: nwc.map((n, i) => (n !== null && rev[i] !== null && (rev[i] as number) > 0 ? n / (rev[i] as number) : null)),
    taxRate: tax.map((t, i) => (t !== null && pretax[i] !== null && (pretax[i] as number) > 0 ? t / (pretax[i] as number) : null)),
  };
}

/**
 * Default tax rate: the effective rate over the last three fiscal years (total
 * income tax ÷ total pre-tax income). If that cannot be calculated or falls
 * outside 10% to 35%, the 21% U.S. federal statutory rate is used instead.
 */
export function deriveTaxRate(pkg: CompanyPackage): { rate: number; how: string; judgment: boolean } {
  const fin = pkg.financials;
  const n = fin.fiscalYears.length;
  const pretaxRow = fin.income.find((r) => r.key === "pretaxIncome");
  const taxRow = fin.income.find((r) => r.key === "incomeTax");
  let sumTax = 0;
  let sumPretax = 0;
  let years = 0;
  for (let i = Math.max(0, n - 3); i < n; i++) {
    const p = pretaxRow?.values[i]?.value ?? null;
    const t = taxRow?.values[i]?.value ?? null;
    if (p !== null && t !== null) {
      sumPretax += p;
      sumTax += t;
      years++;
    }
  }
  const effective = years > 0 && sumPretax > 0 ? sumTax / sumPretax : null;
  if (effective !== null && effective >= 0.1 && effective <= 0.35) {
    return {
      rate: effective,
      how: `Effective rate over the last ${years} fiscal year${years > 1 ? "s" : ""}: total income tax ${mm(sumTax)} ÷ total pre-tax income ${mm(sumPretax)} = ${pct(effective)}.`,
      judgment: false,
    };
  }
  return {
    rate: STATUTORY_TAX_RATE,
    how: `${
      effective === null ? "An effective tax rate cannot be calculated (pre-tax income is negative or not reported)" : `The historical effective rate of ${pct(effective)} is outside the normal 10% to 35% range`
    }, so the U.S. federal statutory rate of 21% is used.`,
    judgment: true,
  };
}

export function buildDcfDefaults(pkg: CompanyPackage, market: MarketData, riskFree: RiskFreeRate | null): DcfDefaults {
  const fin = pkg.financials;
  const snap = buildValuationSnapshot(pkg, market);
  const history = buildHistory(pkg);
  const d: Record<string, Derivation> = {};
  const bridge: BridgeItems = {
    debt: snap.bridge.totalDebt,
    preferred: snap.bridge.preferred,
    noncontrollingInterest: snap.bridge.noncontrollingInterest,
    cash: snap.bridge.cashAndInvestments,
    shares: snap.shares.shares,
  };
  const baseLabel = fin.ltm?.label ?? "LTM";
  const baseEnd = fin.ltm?.end ?? fin.latestBalance?.date ?? "";
  const yearLabels = Array.from({ length: PROJECTION_YEARS }, (_, i) => (baseEnd ? `Year ${i + 1} (to ${addYears(baseEnd, i + 1)})` : `Year ${i + 1}`));
  const base = {
    assumptions: null,
    waccInputs: null,
    bridge,
    derivations: d,
    history,
    baseLabel,
    yearLabels,
    currentPrice: market.price,
    riskFree,
    balanceDate: fin.latestBalance?.date ?? null,
  };
  const fail = (reason: string): DcfDefaults => ({ available: false, reason, ...base });

  if (pkg.profile.isFinancial) {
    return fail(
      "A DCF of free cash flow to the firm does not work for banks, brokers and insurers. Debt and deposits are part of their operations rather than financing, so capital spending, working capital and enterprise value cannot be defined in the usual way. They are normally valued with a dividend discount model or on P/E and price-to-book.",
    );
  }
  const baseRevenue = snap.ltm.revenue;
  if (baseRevenue === null || !(baseRevenue > 0)) return fail("Not available: LTM revenue could not be read from the filings.");
  if (snap.bridge.marketCap === null) return fail("Not available: a share price and share count are needed to weight the cost of capital and to compare the result with the market price.");

  /* Revenue growth: recent compound growth, fading in a straight line to the terminal rate. */
  const terminalGrowth = TERMINAL_GROWTH_DEFAULT;
  const revs = history.revenue;
  const n = revs.length;
  const lastRev = revs[n - 1];
  let k = Math.min(3, n - 1);
  while (k > 0 && !(revs[n - 1 - k] !== null && (revs[n - 1 - k] as number) > 0)) k--;
  let g1 = terminalGrowth;
  if (k > 0 && lastRev !== null && lastRev > 0) {
    const start = revs[n - 1 - k] as number;
    const cagr = Math.pow(lastRev / start, 1 / k) - 1;
    g1 = clamp(cagr, -0.05, 0.15);
    d.growth = {
      label: "Revenue growth",
      how: `${k}-year compound growth from ${history.labels[n - 1 - k]} (${mm(start)}) to ${history.labels[n - 1]} (${mm(lastRev)}) is ${pct(cagr)}${
        g1 !== cagr ? `, limited to ${pct(g1)} (defaults are kept between −5% and +15%)` : ""
      }. Year 1 starts there and growth then moves in a straight line to the ${pct(terminalGrowth)} long-term rate by year 5.`,
    };
  } else {
    d.growth = { label: "Revenue growth", how: `Fewer than two fiscal years of revenue are available, so growth defaults to the long-term rate of ${pct(terminalGrowth)}.`, judgment: true };
  }
  const growth = Array.from({ length: PROJECTION_YEARS }, (_, i) => g1 + ((terminalGrowth - g1) * i) / (PROJECTION_YEARS - 1));

  /* EBITDA margin */
  const m = meanOfLast(history.ebitdaMargin);
  const marginDefault = m?.mean ?? snap.ltm.ebitdaMargin;
  if (marginDefault === null) return fail("Not available: EBITDA cannot be calculated because the company does not report operating income or depreciation and amortization in a readable form.");
  d.ebitdaMargin = {
    label: "EBITDA margin",
    how: m
      ? `Average of the last ${m.used} fiscal year${m.used > 1 ? "s" : ""}: ${pct(m.mean)}. LTM margin is ${snap.ltm.ebitdaMargin !== null ? pct(snap.ltm.ebitdaMargin) : "n/a"}. Held flat across the projection.`
      : `LTM margin of ${pct(marginDefault)} (no full-year history available). Held flat across the projection.`,
  };

  const simple = (key: string, label: string, series: (number | null)[], fallback: number, fallbackNote: string): number => {
    const r = meanOfLast(series);
    if (r) {
      d[key] = { label, how: `Average of the last ${r.used} fiscal year${r.used > 1 ? "s" : ""}: ${pct(r.mean)} of revenue.` };
      return r.mean;
    }
    d[key] = { label, how: fallbackNote, judgment: true };
    return fallback;
  };
  const daPct = simple("da", "D&A", history.daPct, 0, "Not reported in a readable form; set to 0%. Enter a figure to override.");
  const capexPct = simple("capex", "Capital expenditures", history.capexPct, 0, "Not reported in a readable form; set to 0%. Enter a figure to override.");
  const nwcPct = simple(
    "nwc",
    "Net working capital",
    history.nwcPct,
    0,
    "Current assets and current liabilities are not reported separately, so working capital is assumed not to change.",
  );
  if (d.nwc && !d.nwc.judgment) {
    d.nwc.how += " Working capital here is current assets excluding cash, less current liabilities excluding debt. Each year's investment is the change in that balance as revenue grows.";
  }

  /* Tax rate */
  const taxDefault = deriveTaxRate(pkg);
  const taxRate = taxDefault.rate;
  d.tax = { label: "Tax rate", how: taxDefault.how, judgment: taxDefault.judgment };

  /* Cost of capital */
  if (!riskFree) return { ...fail("Not available: the 10-year Treasury yield could not be retrieved from the Treasury Department, so the cost of capital cannot be built."), history };
  const beta = market.beta !== null && market.beta > 0 ? market.beta : 1;
  d.beta =
    market.beta !== null && market.beta > 0
      ? { label: "Beta", how: `${market.beta.toFixed(2)} as published by ${market.provider}. Levered beta measured against the market; the provider does not disclose its exact calculation window.${
          market.beta < 0.5 || market.beta > 2 ? " This is an unusually " + (market.beta < 0.5 ? "low" : "high") + " beta; cross-check it against an industry average before relying on it." : ""
        }` }
      : { label: "Beta", how: "No beta is available from the data provider, so the market beta of 1.00 is assumed.", judgment: true };
  d.riskFree = { label: "Risk-free rate", how: `10-year U.S. Treasury par yield of ${pct(riskFree.tenYear, 2)} on ${riskFree.date}.` };
  d.erp = { label: "Equity risk premium", how: `${pct(ERP_DEFAULT.value)}: ${ERP_DEFAULT.source}. An assumption, not an observable figure; academic estimates range from about 4% to 6%.`, judgment: true };

  const interestRow = fin.income.find((r) => r.key === "interestExpense");
  const interestCell = interestRow?.values[n - 1];
  const interest = interestCell?.value ?? null;
  const impliedKd = interest !== null && interest > 0 && bridge.debt > 0 ? interest / bridge.debt : null;
  let costOfDebt: number;
  if (impliedKd !== null && impliedKd >= 0.02 && impliedKd <= 0.15) {
    // Interest ÷ debt reflects the coupons on debt issued in the past. A company cannot
    // borrow today for less than the government, so the rate is floored at the risk-free rate.
    costOfDebt = Math.max(impliedKd, riskFree.tenYear);
    d.costOfDebt = {
      label: "Pre-tax cost of debt",
      how: `Interest expense of ${mm(interest as number)} (${history.labels[n - 1]}) ÷ total debt of ${mm(bridge.debt)} = ${pct(impliedKd)}.${
        interestCell?.derived ? " The company reports interest net of interest income, so this slightly understates the true rate." : ""
      }${
        impliedKd < riskFree.tenYear
          ? ` That is below today's risk-free rate because it reflects older, cheaper debt, so the risk-free rate of ${pct(riskFree.tenYear, 2)} is used as a floor. The yield on the company's bonds would be the better input.`
          : ""
      }`,
      judgment: impliedKd < riskFree.tenYear,
    };
  } else {
    costOfDebt = riskFree.tenYear + FALLBACK_DEBT_SPREAD;
    d.costOfDebt = {
      label: "Pre-tax cost of debt",
      how: `${
        bridge.debt > 0 ? "Interest expense ÷ debt does not give a sensible rate from the filings" : "The company has no debt"
      }, so a placeholder of the risk-free rate plus ${pct(FALLBACK_DEBT_SPREAD)} is used. ${bridge.debt > 0 ? "Replace it with the yield on the company's bonds if known." : "It has no effect while debt is zero."}`,
      judgment: true,
    };
  }
  const waccInputs: WaccInputs = {
    riskFreeRate: riskFree.tenYear,
    beta,
    equityRiskPremium: ERP_DEFAULT.value,
    preTaxCostOfDebt: costOfDebt,
    taxRate,
    equityValue: snap.bridge.marketCap,
    debtValue: bridge.debt,
  };
  const w = computeWacc(waccInputs);
  if (!w) return fail("Not available: the cost of capital could not be calculated from the available data.");
  d.weights = {
    label: "Capital structure weights",
    how: `Equity at market value (${mm(snap.bridge.marketCap)}) and debt at book value (${mm(bridge.debt)}) as a stand-in for market value: ${pct(w.weightEquity)} equity, ${pct(w.weightDebt)} debt.`,
  };

  d.terminalGrowth = {
    label: "Terminal growth",
    how: `${pct(terminalGrowth)}: roughly long-run inflation plus modest real growth. A judgment; it should stay below both WACC and the long-run growth of the economy.`,
    judgment: true,
  };
  const exitMultiple = snap.multiples.evEbitda;
  d.exitMultiple =
    exitMultiple !== null
      ? { label: "Exit multiple", how: `The company's current EV / LTM EBITDA of ${exitMultiple.toFixed(1)}x, which assumes it is valued in five years as it is today. The peer median from the comps tab is the usual alternative.` }
      : { label: "Exit multiple", how: "The company's current EV / EBITDA is not meaningful (EBITDA is negative or missing), so no default is set. Enter a multiple, for example the peer median.", judgment: true };

  return {
    available: true,
    ...base,
    waccInputs,
    assumptions: {
      baseRevenue,
      growth,
      ebitdaMargin: Array(PROJECTION_YEARS).fill(marginDefault),
      daPctRevenue: daPct,
      capexPctRevenue: capexPct,
      nwcPctRevenue: nwcPct,
      taxRate,
      wacc: w.wacc,
      terminalGrowth,
      exitMultiple,
    },
  };
}
