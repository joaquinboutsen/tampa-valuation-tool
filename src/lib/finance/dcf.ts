/**
 * Discounted cash flow (DCF) model. Pure functions, no data access.
 *
 * Standard unlevered DCF:
 *   1. Project unlevered free cash flow (UFCF) for five years.
 *        UFCF = EBIT × (1 − tax rate) + D&A − capex − increase in net working capital
 *   2. Estimate a terminal value two ways:
 *        Perpetuity growth:  TV = UFCF₅ × (1 + g) ÷ (WACC − g)
 *        Exit multiple:      TV = EBITDA₅ × multiple
 *   3. Discount everything at WACC (end-of-year convention) to get enterprise value.
 *   4. Enterprise value − debt − preferred − noncontrolling interests + cash
 *        = equity value; ÷ shares = implied value per share.
 */

export const PROJECTION_YEARS = 5;

export interface DcfAssumptions {
  /** Revenue of the base period (last twelve months), in dollars. */
  baseRevenue: number;
  /** Revenue growth for each projected year (0.05 = 5%). */
  growth: number[];
  /** EBITDA as a share of revenue for each projected year. */
  ebitdaMargin: number[];
  daPctRevenue: number;
  capexPctRevenue: number;
  /** Operating net working capital as a share of revenue. */
  nwcPctRevenue: number;
  taxRate: number;
  wacc: number;
  terminalGrowth: number;
  /** EV / EBITDA multiple applied to final-year EBITDA; null to skip this method. */
  exitMultiple: number | null;
}

export interface DcfYear {
  year: number;
  growth: number;
  revenue: number;
  ebitda: number;
  da: number;
  ebit: number;
  taxes: number;
  nopat: number;
  capex: number;
  nwc: number;
  increaseInNwc: number;
  ufcf: number;
  discountFactor: number;
  pv: number;
}

export interface TerminalValue {
  /** Value at the end of the final projected year. */
  value: number;
  pv: number;
  enterpriseValue: number;
  /** Share of enterprise value that comes from the terminal value. */
  shareOfEv: number;
}

export interface DcfResult {
  years: DcfYear[];
  sumPvUfcf: number;
  /** Null when WACC ≤ growth (the formula breaks down) or final-year cash flow is not positive. */
  perpetuity: (TerminalValue & { impliedExitMultiple: number | null }) | null;
  perpetuityIssue?: string;
  /** Null when no multiple is given or final-year EBITDA is not positive. */
  exit: (TerminalValue & { impliedGrowth: number | null }) | null;
  exitIssue?: string;
}

export function projectCashFlows(a: DcfAssumptions): DcfYear[] {
  const years: DcfYear[] = [];
  let prevRevenue = a.baseRevenue;
  let prevNwc = a.nwcPctRevenue * a.baseRevenue;
  for (let t = 1; t <= a.growth.length; t++) {
    const growth = a.growth[t - 1];
    const revenue = prevRevenue * (1 + growth);
    const ebitda = revenue * a.ebitdaMargin[t - 1];
    const da = revenue * a.daPctRevenue;
    const ebit = ebitda - da;
    // No tax benefit is assumed in a loss-making year.
    const taxes = ebit > 0 ? ebit * a.taxRate : 0;
    const nopat = ebit - taxes;
    const capex = revenue * a.capexPctRevenue;
    const nwc = revenue * a.nwcPctRevenue;
    const increaseInNwc = nwc - prevNwc;
    const ufcf = nopat + da - capex - increaseInNwc;
    const discountFactor = 1 / Math.pow(1 + a.wacc, t);
    years.push({ year: t, growth, revenue, ebitda, da, ebit, taxes, nopat, capex, nwc, increaseInNwc, ufcf, discountFactor, pv: ufcf * discountFactor });
    prevRevenue = revenue;
    prevNwc = nwc;
  }
  return years;
}

export function runDcf(a: DcfAssumptions): DcfResult {
  const years = projectCashFlows(a);
  const last = years[years.length - 1];
  const sumPvUfcf = years.reduce((s, y) => s + y.pv, 0);
  const result: DcfResult = { years, sumPvUfcf, perpetuity: null, exit: null };

  // Perpetuity growth (Gordon growth) method.
  if (!(a.wacc > a.terminalGrowth)) {
    result.perpetuityIssue = "Not available: the terminal growth rate must be below WACC, otherwise the formula gives an infinite or negative value.";
  } else if (!(last.ufcf > 0)) {
    result.perpetuityIssue = "Not meaningful: final-year free cash flow is zero or negative, so it cannot be grown into perpetuity.";
  } else {
    const value = (last.ufcf * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
    const pv = value * last.discountFactor;
    const ev = sumPvUfcf + pv;
    result.perpetuity = {
      value,
      pv,
      enterpriseValue: ev,
      shareOfEv: pv / ev,
      impliedExitMultiple: last.ebitda > 0 ? value / last.ebitda : null,
    };
  }

  // Exit multiple method.
  if (a.exitMultiple === null || !(a.exitMultiple > 0)) {
    result.exitIssue = "Not available: no exit multiple has been entered.";
  } else if (!(last.ebitda > 0)) {
    result.exitIssue = "Not meaningful: final-year EBITDA is zero or negative, so a multiple cannot be applied.";
  } else {
    const value = last.ebitda * a.exitMultiple;
    const pv = value * last.discountFactor;
    const ev = sumPvUfcf + pv;
    // The growth rate that would give the same terminal value under the perpetuity formula:
    //   TV = UFCF × (1 + g) ÷ (WACC − g)   ⇒   g = (TV × WACC − UFCF) ÷ (TV + UFCF)
    const impliedGrowth = value + last.ufcf !== 0 ? (value * a.wacc - last.ufcf) / (value + last.ufcf) : null;
    result.exit = { value, pv, enterpriseValue: ev, shareOfEv: pv / ev, impliedGrowth };
  }
  return result;
}

/* ------------------------- enterprise → equity -------------------------- */

export interface BridgeItems {
  debt: number;
  preferred: number;
  noncontrollingInterest: number;
  cash: number;
  shares: number | null;
}

export interface EquityValue {
  equityValue: number;
  perShare: number | null;
}

export function equityFromEnterpriseValue(ev: number, b: BridgeItems): EquityValue {
  const equityValue = ev - b.debt - b.preferred - b.noncontrollingInterest + b.cash;
  return { equityValue, perShare: b.shares && b.shares > 0 ? equityValue / b.shares : null };
}

/* --------------------------------- WACC --------------------------------- */

export interface WaccInputs {
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  preTaxCostOfDebt: number;
  taxRate: number;
  /** Market value of equity (market cap). */
  equityValue: number;
  /** Debt, at book value as a proxy for market value. */
  debtValue: number;
}

export interface WaccResult {
  costOfEquity: number;
  afterTaxCostOfDebt: number;
  weightEquity: number;
  weightDebt: number;
  wacc: number;
}

/** CAPM: cost of equity = risk-free rate + beta × equity risk premium. */
export function costOfEquity(riskFreeRate: number, beta: number, equityRiskPremium: number): number {
  return riskFreeRate + beta * equityRiskPremium;
}

export function computeWacc(i: WaccInputs): WaccResult | null {
  const total = i.equityValue + i.debtValue;
  if (!(total > 0) || !(i.equityValue > 0) || i.debtValue < 0) return null;
  const ke = costOfEquity(i.riskFreeRate, i.beta, i.equityRiskPremium);
  const kd = i.preTaxCostOfDebt * (1 - i.taxRate);
  const we = i.equityValue / total;
  const wd = i.debtValue / total;
  return { costOfEquity: ke, afterTaxCostOfDebt: kd, weightEquity: we, weightDebt: wd, wacc: we * ke + wd * kd };
}

/* ------------------------------ sensitivity ----------------------------- */

export interface SensitivityTable {
  rowLabel: "WACC";
  colLabel: "Terminal growth" | "Exit multiple";
  rows: number[];
  cols: number[];
  /** Implied value per share; null where not meaningful. */
  values: (number | null)[][];
}

export const WACC_STEPS = [-0.01, -0.005, 0, 0.005, 0.01];
export const GROWTH_STEPS = [-0.005, -0.0025, 0, 0.0025, 0.005];
export const MULTIPLE_STEPS = [-2, -1, 0, 1, 2];

export function sensitivityGrowth(a: DcfAssumptions, b: BridgeItems): SensitivityTable {
  const rows = WACC_STEPS.map((d) => a.wacc + d);
  const cols = GROWTH_STEPS.map((d) => a.terminalGrowth + d);
  const values = rows.map((wacc) =>
    cols.map((terminalGrowth) => {
      const r = runDcf({ ...a, wacc, terminalGrowth });
      return r.perpetuity ? equityFromEnterpriseValue(r.perpetuity.enterpriseValue, b).perShare : null;
    }),
  );
  return { rowLabel: "WACC", colLabel: "Terminal growth", rows, cols, values };
}

export function sensitivityMultiple(a: DcfAssumptions, b: BridgeItems): SensitivityTable | null {
  if (a.exitMultiple === null) return null;
  const rows = WACC_STEPS.map((d) => a.wacc + d);
  const cols = MULTIPLE_STEPS.map((d) => (a.exitMultiple as number) + d);
  const values = rows.map((wacc) =>
    cols.map((exitMultiple) => {
      if (!(exitMultiple > 0)) return null;
      const r = runDcf({ ...a, wacc, exitMultiple });
      return r.exit ? equityFromEnterpriseValue(r.exit.enterpriseValue, b).perShare : null;
    }),
  );
  return { rowLabel: "WACC", colLabel: "Exit multiple", rows, cols, values };
}
