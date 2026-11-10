import { describe, expect, it } from "vitest";
import { buildCompRow, impliedRanges, impliedSharePrice, peerStats, type CompRow, type TargetBasis } from "../src/lib/finance/comps";
import {
  computeWacc,
  costOfEquity,
  equityFromEnterpriseValue,
  projectCashFlows,
  runDcf,
  sensitivityGrowth,
  sensitivityMultiple,
  type BridgeItems,
  type DcfAssumptions,
} from "../src/lib/finance/dcf";
import { buildDcfDefaults, buildHistory } from "../src/lib/finance/dcfDefaults";
import { multiple } from "../src/lib/finance/ev";
import { percentile, positionInSet, summarize } from "../src/lib/finance/stats";
import { parseTreasuryCsv, type RiskFreeRate } from "../src/lib/market/treasury";
import { buildFinancials } from "../src/lib/sec/facts";
import type { CompanyPackage, MarketData } from "../src/lib/types";
import { M, testCoFacts } from "./helpers";

/* ============================ DCF worked example ============================
 *
 * Hand-checked. Base revenue $1,000M. Every year: growth 5%, EBITDA margin 20%,
 * D&A 4% of revenue, capex 5%, net working capital 10% of revenue, tax 25%.
 * WACC 10%, terminal growth 2%, exit multiple 8.0x.
 *
 * Year 1:  revenue 1,050.0 | EBITDA 210.0 | D&A 42.0 | EBIT 168.0 | tax 42.0
 *          NOPAT 126.0 | capex 52.5 | NWC 105.0 vs 100.0 → increase 5.0
 *          UFCF = 126.0 + 42.0 − 52.5 − 5.0 = 110.5
 * Every line grows 5% a year, so UFCF = 110.5, 116.025, 121.826, 127.918, 134.313.
 * PV at 10%:  100.455 + 95.888 + 91.530 + 87.369 + 83.398 = 458.640
 *
 * Perpetuity: TV = 134.313 × 1.02 ÷ (0.10 − 0.02) = 1,712.496; PV = × 0.62092 = 1,063.325
 *             EV = 458.640 + 1,063.325 = 1,521.965
 * Exit:       year 5 EBITDA = 255.256; TV = × 8 = 2,042.050; PV = 1,267.953
 *             EV = 458.640 + 1,267.953 = 1,726.593
 * Bridge:     debt 300, NCI 20, cash 100, 50M shares
 *             perpetuity equity = 1,521.965 − 300 − 20 + 100 = 1,301.965 → $26.04 a share
 */
const A: DcfAssumptions = {
  baseRevenue: M(1000),
  growth: [0.05, 0.05, 0.05, 0.05, 0.05],
  ebitdaMargin: [0.2, 0.2, 0.2, 0.2, 0.2],
  daPctRevenue: 0.04,
  capexPctRevenue: 0.05,
  nwcPctRevenue: 0.1,
  taxRate: 0.25,
  wacc: 0.1,
  terminalGrowth: 0.02,
  exitMultiple: 8,
};
const BRIDGE: BridgeItems = { debt: M(300), preferred: 0, noncontrollingInterest: M(20), cash: M(100), shares: 50_000_000 };
const mm = (v: number) => v / 1e6;

describe("DCF: projected cash flows (hand-checked)", () => {
  const y = projectCashFlows(A);
  it("builds year 1 line by line", () => {
    expect(mm(y[0].revenue)).toBeCloseTo(1050, 6);
    expect(mm(y[0].ebitda)).toBeCloseTo(210, 6);
    expect(mm(y[0].da)).toBeCloseTo(42, 6);
    expect(mm(y[0].ebit)).toBeCloseTo(168, 6);
    expect(mm(y[0].taxes)).toBeCloseTo(42, 6);
    expect(mm(y[0].nopat)).toBeCloseTo(126, 6);
    expect(mm(y[0].capex)).toBeCloseTo(52.5, 6);
    expect(mm(y[0].increaseInNwc)).toBeCloseTo(5, 6);
    expect(mm(y[0].ufcf)).toBeCloseTo(110.5, 6);
  });
  it("UFCF for years 2 to 5", () => {
    expect(y.map((v) => Number(mm(v.ufcf).toFixed(3)))).toEqual([110.5, 116.025, 121.826, 127.918, 134.313]);
  });
  it("discounts at the end of each year", () => {
    expect(y[0].discountFactor).toBeCloseTo(1 / 1.1, 10);
    expect(y[4].discountFactor).toBeCloseTo(0.620921, 6);
    expect(y.map((v) => Number(mm(v.pv).toFixed(3)))).toEqual([100.455, 95.888, 91.53, 87.369, 83.398]);
  });
  it("charges no tax in a loss-making year", () => {
    const loss = projectCashFlows({ ...A, ebitdaMargin: [0.02, 0.2, 0.2, 0.2, 0.2] });
    expect(loss[0].ebit).toBeLessThan(0);
    expect(loss[0].taxes).toBe(0);
  });
  it("shrinking working capital releases cash", () => {
    const shrinking = projectCashFlows({ ...A, growth: [-0.1, 0, 0, 0, 0] });
    expect(mm(shrinking[0].increaseInNwc)).toBeCloseTo(-10, 6);
  });
});

describe("DCF: terminal value and enterprise value (hand-checked)", () => {
  const r = runDcf(A);
  it("sum of discounted cash flows = 458.640", () => expect(mm(r.sumPvUfcf)).toBeCloseTo(458.64, 2));
  it("perpetuity growth: TV 1,712.50, PV 1,063.32, EV 1,521.96", () => {
    expect(mm(r.perpetuity!.value)).toBeCloseTo(1712.496, 2);
    expect(mm(r.perpetuity!.pv)).toBeCloseTo(1063.325, 2);
    expect(mm(r.perpetuity!.enterpriseValue)).toBeCloseTo(1521.965, 2);
  });
  it("exit multiple: TV 2,042.05, PV 1,267.95, EV 1,726.59", () => {
    expect(mm(r.exit!.value)).toBeCloseTo(2042.05, 2);
    expect(mm(r.exit!.pv)).toBeCloseTo(1267.953, 2);
    expect(mm(r.exit!.enterpriseValue)).toBeCloseTo(1726.593, 2);
  });
  it("cross-checks: perpetuity implies 6.71x; the 8.0x multiple implies 3.21% growth", () => {
    expect(r.perpetuity!.impliedExitMultiple).toBeCloseTo(6.709, 3);
    expect(r.exit!.impliedGrowth).toBeCloseTo(0.032114, 5);
  });
  it("the implied growth rate reproduces the exit terminal value", () => {
    const g = r.exit!.impliedGrowth as number;
    const last = r.years[4];
    expect((last.ufcf * (1 + g)) / (A.wacc - g)).toBeCloseTo(r.exit!.value, 0);
  });
  it("terminal value share of EV: 69.9% and 73.4%", () => {
    expect(r.perpetuity!.shareOfEv).toBeCloseTo(0.6987, 3);
    expect(r.exit!.shareOfEv).toBeCloseTo(0.7344, 3);
  });
  it("bridges to equity: 1,301.96 and $26.04 a share", () => {
    const e = equityFromEnterpriseValue(r.perpetuity!.enterpriseValue, BRIDGE);
    expect(mm(e.equityValue)).toBeCloseTo(1301.965, 2);
    expect(e.perShare).toBeCloseTo(26.039, 2);
  });
});

describe("DCF: edge cases", () => {
  it("perpetuity method is unavailable when growth is not below WACC", () => {
    const r = runDcf({ ...A, terminalGrowth: 0.1 });
    expect(r.perpetuity).toBeNull();
    expect(r.perpetuityIssue).toMatch(/below WACC/);
    expect(r.exit).not.toBeNull();
  });
  it("neither method gives a number when final-year cash flow and EBITDA are negative", () => {
    const r = runDcf({ ...A, ebitdaMargin: [-0.05, -0.05, -0.05, -0.05, -0.05] });
    expect(r.perpetuity).toBeNull();
    expect(r.exit).toBeNull();
    expect(r.exitIssue).toMatch(/negative/);
  });
  it("skips the exit method when no multiple is entered", () => {
    expect(runDcf({ ...A, exitMultiple: null }).exit).toBeNull();
  });
  it("per-share value is unavailable without a share count", () => {
    expect(equityFromEnterpriseValue(M(1000), { ...BRIDGE, shares: null }).perShare).toBeNull();
  });
  it("equity value can be negative when debt exceeds enterprise value", () => {
    expect(equityFromEnterpriseValue(M(200), BRIDGE).equityValue).toBe(M(-20));
  });
});

describe("WACC (hand-checked)", () => {
  /**
   * Cost of equity = 4% + 1.2 × 5% = 10.0%
   * After-tax cost of debt = 6% × (1 − 25%) = 4.5%
   * Weights: equity 800 / 1,000 = 80%, debt 20%
   * WACC = 80% × 10.0% + 20% × 4.5% = 8.9%
   */
  const w = computeWacc({ riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05, preTaxCostOfDebt: 0.06, taxRate: 0.25, equityValue: M(800), debtValue: M(200) })!;
  it("CAPM cost of equity", () => {
    expect(costOfEquity(0.04, 1.2, 0.05)).toBeCloseTo(0.1, 10);
    expect(w.costOfEquity).toBeCloseTo(0.1, 10);
  });
  it("after-tax cost of debt", () => expect(w.afterTaxCostOfDebt).toBeCloseTo(0.045, 10));
  it("weights", () => {
    expect(w.weightEquity).toBeCloseTo(0.8, 10);
    expect(w.weightDebt).toBeCloseTo(0.2, 10);
  });
  it("WACC = 8.9%", () => expect(w.wacc).toBeCloseTo(0.089, 10));
  it("with no debt, WACC equals the cost of equity", () => {
    const x = computeWacc({ riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05, preTaxCostOfDebt: 0.06, taxRate: 0.25, equityValue: M(800), debtValue: 0 })!;
    expect(x.wacc).toBeCloseTo(0.1, 10);
  });
  it("is unavailable without a market value of equity", () => {
    expect(computeWacc({ riskFreeRate: 0.04, beta: 1, equityRiskPremium: 0.05, preTaxCostOfDebt: 0.06, taxRate: 0.25, equityValue: 0, debtValue: M(200) })).toBeNull();
  });
});

describe("sensitivity tables", () => {
  const g = sensitivityGrowth(A, BRIDGE);
  const x = sensitivityMultiple(A, BRIDGE)!;
  it("are 5 × 5 with the base case in the centre", () => {
    expect(g.values).toHaveLength(5);
    expect(g.values[0]).toHaveLength(5);
    expect(g.rows[2]).toBeCloseTo(0.1, 10);
    expect(g.cols[2]).toBeCloseTo(0.02, 10);
    expect(g.values[2][2]).toBeCloseTo(26.039, 2);
    expect(x.cols).toEqual([6, 7, 8, 9, 10]);
    expect(x.values[2][2]).toBeCloseTo((1726.593 - 300 - 20 + 100) / 50, 2);
  });
  it("value falls as WACC rises and rises with growth or the multiple", () => {
    expect(g.values[0][2]!).toBeGreaterThan(g.values[4][2]!);
    expect(g.values[2][4]!).toBeGreaterThan(g.values[2][0]!);
    expect(x.values[2][4]!).toBeGreaterThan(x.values[2][0]!);
  });
  it("is absent for the multiple table when no multiple is set", () => {
    expect(sensitivityMultiple({ ...A, exitMultiple: null }, BRIDGE)).toBeNull();
  });
});

/* ================================ statistics =============================== */

describe("peer statistics (Excel PERCENTILE.INC method, hand-checked)", () => {
  it("odd count: 2, 4, 6, 8, 10 → 25th 4, median 6, 75th 8", () => {
    const s = summarize([10, 2, 8, 4, 6])!;
    expect([s.min, s.p25, s.median, s.p75, s.max]).toEqual([2, 4, 6, 8, 10]);
    expect(s.mean).toBe(6);
  });
  it("even count interpolates: 1, 2, 3, 4 → 25th 1.75, median 2.5, 75th 3.25", () => {
    const s = summarize([1, 2, 3, 4])!;
    expect([s.p25, s.median, s.p75]).toEqual([1.75, 2.5, 3.25]);
  });
  it("ignores not-meaningful values", () => {
    const s = summarize([12, null, 8, undefined, NaN])!;
    expect(s.count).toBe(2);
    expect(s.median).toBe(10);
  });
  it("returns null for an empty set, and the value itself for a single peer", () => {
    expect(summarize([null, null])).toBeNull();
    expect(percentile([7], 0.75)).toBe(7);
  });
  it("positions a value within the peer set", () => {
    expect(positionInSet(9, [8, 10, 12, 14])).toBe(0.25);
    expect(positionInSet(20, [8, 10, 12, 14])).toBe(1);
    expect(positionInSet(1, [8, 10])).toBe(0);
    expect(positionInSet(null, [8, 10])).toBeNull();
  });
});

describe("multiples", () => {
  it("treats a multiple above 100x as not meaningful (earnings near zero)", () => {
    expect(multiple(M(2160), M(0.7))).toBeNull();
    expect(multiple(M(2160), M(100))).toBeCloseTo(21.6, 10);
  });
});

/* ================================== comps ================================== */

const basis: TargetBasis = { revenue: M(2000), ebitda: M(200), eps: 2, forwardEps: 2.5, debt: M(300), preferred: 0, noncontrollingInterest: M(20), cash: M(100), shares: 50_000_000 };
const peer = (ticker: string, evRevenue: number | null, evEbitda: number | null, peLtm: number | null, peForward: number | null): CompRow => ({
  ticker,
  name: ticker,
  isFinancial: false,
  price: 10,
  marketCap: M(100),
  enterpriseValue: M(120),
  ltmLabel: "LTM",
  revenue: M(100),
  ebitda: M(10),
  ebitdaMargin: 0.1,
  eps: 1,
  evRevenue,
  evEbitda,
  peLtm,
  peForward,
  balanceDate: "2025-06-30",
  notes: [],
});

describe("comps: implied share price (hand-checked)", () => {
  it("EV / EBITDA: 10.0x × 200 = 2,000 EV − 300 debt − 20 NCI + 100 cash = 1,780 ÷ 50M = $35.60", () => {
    expect(impliedSharePrice("evEbitda", 10, basis)).toBeCloseTo(35.6, 10);
  });
  it("EV / Revenue: 1.0x × 2,000 = 2,000 EV → $35.60", () => {
    expect(impliedSharePrice("evRevenue", 1, basis)).toBeCloseTo(35.6, 10);
  });
  it("P / E: 15.0x × $2.00 EPS = $30.00; forward 12.0x × $2.50 = $30.00", () => {
    expect(impliedSharePrice("peLtm", 15, basis)).toBe(30);
    expect(impliedSharePrice("peForward", 12, basis)).toBe(30);
  });
  it("is not available when the target's own metric is negative or missing", () => {
    expect(impliedSharePrice("evEbitda", 10, { ...basis, ebitda: M(-5) })).toBeNull();
    expect(impliedSharePrice("peLtm", 15, { ...basis, eps: -1 })).toBeNull();
    expect(impliedSharePrice("evEbitda", null, basis)).toBeNull();
  });
});

describe("comps: peer statistics and ranges", () => {
  const peers = [peer("A", 1, 8, 12, 10), peer("B", 2, 10, 16, 12), peer("C", 3, 12, null, 14), peer("D", 4, 14, 20, null)];
  it("summarizes each multiple over the peers that have one", () => {
    const s = peerStats(peers);
    expect(s.evEbitda!.median).toBe(11);
    expect(s.evEbitda!.p25).toBe(9.5);
    expect(s.peLtm!.count).toBe(3);
    expect(s.peLtm!.median).toBe(16);
  });
  it("turns the 25th / median / 75th multiples into a share price range", () => {
    const r = impliedRanges(peers, basis).find((x) => x.key === "evEbitda")!;
    // 9.5x → (1,900 − 220) ÷ 50 = 33.60; 11.0x → 39.60; 12.5x → 45.60
    expect(r.low).toBeCloseTo(33.6, 10);
    expect(r.mid).toBeCloseTo(39.6, 10);
    expect(r.high).toBeCloseTo(45.6, 10);
    expect(r.peerCount).toBe(4);
  });
  it("gives an empty range when no peer has a meaningful multiple", () => {
    const r = impliedRanges([peer("A", null, null, null, null)], basis).find((x) => x.key === "peLtm")!;
    expect(r.mid).toBeNull();
    expect(r.peerCount).toBe(0);
  });
});

/* ============================ Treasury risk-free ============================ */

describe("Treasury yield file", () => {
  const csv = `Date,"1 Mo","2 Mo","10 Yr","20 Yr","30 Yr"\n11/06/2026,4.02,4.15,4.86,5.29,5.26\n11/09/2026,4.04,4.19,4.88,5.29,5.26\n11/05/2026,4.03,4.15,4.84,5.27,5.25\n`;
  it("takes the most recent day's 10-year yield", () => {
    const r = parseTreasuryCsv(csv)!;
    expect(r.date).toBe("2026-11-09");
    expect(r.tenYear).toBeCloseTo(0.0488, 10);
    expect(r.twentyYear).toBeCloseTo(0.0529, 10);
  });
  it("skips days with no 10-year figure", () => {
    const r = parseTreasuryCsv(`Date,"10 Yr"\n11/10/2026,\n11/09/2026,4.88\n`)!;
    expect(r.date).toBe("2026-11-09");
  });
  it("returns null rather than guessing when the file is empty or malformed", () => {
    expect(parseTreasuryCsv("")).toBeNull();
    expect(parseTreasuryCsv(`Date,"5 Yr"\n11/09/2026,4.67\n`)).toBeNull();
    expect(parseTreasuryCsv(`Date,"10 Yr"\n`)).toBeNull();
  });
});

/* ============================== DCF defaults ============================== */

function testCoPackage(overrides: Partial<CompanyPackage["profile"]> = {}): CompanyPackage {
  const financials = buildFinancials(testCoFacts());
  return {
    profile: {
      ticker: "TEST",
      cik: 1,
      name: "TestCo Inc",
      sic: "3672",
      sicDescription: "Test",
      exchanges: ["NYSE"],
      city: "Tampa",
      state: "FL",
      fiscalYearEnd: "1231",
      stateOfIncorporation: "DE",
      category: "",
      isFinancial: false,
      description: { text: null, source: "" },
      latest10K: null,
      latest10Q: null,
      ...overrides,
    },
    financials,
    debt: { total: M(440), components: [], method: "face", asOf: "2025-06-30", source: null, note: "" },
    segments: { available: false, segments: [], reconciling: [], total: null },
    checks: [],
    generatedAt: "2025-08-15T00:00:00Z",
  };
}
const market: MarketData = { available: true, provider: "Finnhub", price: 40, priceTime: null, high52: 50, low52: 30, beta: 1.1, forwardPE: 16, providerShares: 50_000_000, fetchedAt: "2025-08-15T00:00:00Z" };
const rf: RiskFreeRate = { tenYear: 0.0488, twentyYear: 0.0529, date: "2026-11-09", source: "Treasury", url: "https://home.treasury.gov" };

describe("DCF defaults derived from the filings (hand-checked on TestCo)", () => {
  const d = buildDcfDefaults(testCoPackage(), market, rf);
  const a = d.assumptions!;
  it("is available and starts from LTM revenue of 1,290", () => {
    expect(d.available).toBe(true);
    expect(a.baseRevenue).toBe(M(1290));
    expect(d.baseLabel).toBe("LTM Jun-2025");
    expect(d.yearLabels[0]).toBe("Year 1 (to Jun-2026)");
  });
  it("growth: 1,200 ÷ 990 − 1 = 21.2%, limited to 15%, fading in a straight line to 2.5%", () => {
    expect(a.growth.map((g) => Number(g.toFixed(5)))).toEqual([0.15, 0.11875, 0.0875, 0.05625, 0.025]);
    expect(d.derivations.growth.how).toMatch(/limited to 15\.0%/);
  });
  it("EBITDA margin: FY2024 190 ÷ 1,200 = 15.8% (the only year with EBITDA)", () => {
    expect(a.ebitdaMargin[0]).toBeCloseTo(190 / 1200, 10);
  });
  it("D&A 40 ÷ 1,200 = 3.3%; capex 70 ÷ 1,200 = 5.8%", () => {
    expect(a.daPctRevenue).toBeCloseTo(40 / 1200, 10);
    expect(a.capexPctRevenue).toBeCloseTo(70 / 1200, 10);
  });
  it("falls back to the 21% statutory tax rate when no effective rate can be calculated, and says so", () => {
    expect(a.taxRate).toBe(0.21);
    expect(d.derivations.tax.judgment).toBe(true);
  });
  it("cost of debt: 20 ÷ 440 = 4.5%, below the risk-free rate, so floored at 4.88%", () => {
    expect(d.waccInputs!.preTaxCostOfDebt).toBeCloseTo(0.0488, 10);
    expect(d.derivations.costOfDebt.how).toMatch(/floor/);
  });
  it("WACC: equity 2,000 (40 × 50M) and debt 440 → 82.0% × 10.38% + 18.0% × 3.86% = 9.20%", () => {
    const w = computeWacc(d.waccInputs!)!;
    expect(w.costOfEquity).toBeCloseTo(0.0488 + 1.1 * 0.05, 10);
    expect(w.weightEquity).toBeCloseTo(2000 / 2440, 10);
    expect(a.wacc).toBeCloseTo((2000 / 2440) * 0.1038 + (440 / 2440) * 0.0488 * 0.79, 6);
    expect(a.wacc).toBeCloseTo(0.092, 3);
  });
  it("exit multiple defaults to the current EV / LTM EBITDA: (2,000 + 440 + 12 − 350) ÷ 212 = 9.9x", () => {
    expect(a.exitMultiple).toBeCloseTo(2102 / 212, 6);
  });
  it("records how every default was derived", () => {
    for (const k of ["growth", "ebitdaMargin", "da", "capex", "nwc", "tax", "beta", "riskFree", "erp", "costOfDebt", "weights", "terminalGrowth", "exitMultiple"]) {
      expect(d.derivations[k]?.how.length, k).toBeGreaterThan(20);
    }
  });
  it("history table lines up with the fiscal years", () => {
    const h = buildHistory(testCoPackage());
    expect(h.labels).toEqual(["FY Dec-2023", "FY Dec-2024"]);
    expect(h.growth[1]).toBeCloseTo(1200 / 990 - 1, 10);
    expect(h.ebitdaMargin[0]).toBeNull();
  });
});

describe("DCF defaults: when a DCF should not be shown", () => {
  it("explains why for a financial institution", () => {
    const d = buildDcfDefaults(testCoPackage({ isFinancial: true }), market, rf);
    expect(d.available).toBe(false);
    expect(d.reason).toMatch(/banks, brokers and insurers/);
  });
  it("needs a share price", () => {
    const d = buildDcfDefaults(testCoPackage(), { ...market, available: false, price: null, providerShares: null }, rf);
    expect(d.available).toBe(false);
  });
  it("needs the risk-free rate rather than inventing one", () => {
    const d = buildDcfDefaults(testCoPackage(), market, null);
    expect(d.available).toBe(false);
    expect(d.reason).toMatch(/Treasury/);
  });
  it("assumes a market beta of 1.0, flagged as a judgment, when none is published", () => {
    const d = buildDcfDefaults(testCoPackage(), { ...market, beta: null }, rf);
    expect(d.waccInputs!.beta).toBe(1);
    expect(d.derivations.beta.judgment).toBe(true);
  });
});

describe("comps row", () => {
  it("computes the same multiples as the snapshot and carries the forward P/E", () => {
    const r = buildCompRow(testCoPackage(), market);
    expect(r.marketCap).toBe(M(2000));
    expect(r.enterpriseValue).toBe(M(2102));
    expect(r.evEbitda).toBeCloseTo(2102 / 212, 6);
    expect(r.evRevenue).toBeCloseTo(2102 / 1290, 6);
    expect(r.peForward).toBe(16);
  });
  it("shows no enterprise value multiples for a financial institution", () => {
    const r = buildCompRow(testCoPackage({ isFinancial: true }), market);
    expect(r.enterpriseValue).toBeNull();
    expect(r.evEbitda).toBeNull();
    expect(r.notes.join(" ")).toMatch(/Financial institution/);
  });
});
