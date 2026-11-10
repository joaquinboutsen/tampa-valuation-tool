import { describe, expect, it } from "vitest";
import type { ImpliedRange, TargetBasis } from "../src/lib/finance/comps";
import { sensitivityGrowth, type DcfAssumptions } from "../src/lib/finance/dcf";
import { axisDomain, axisTicks, compsBar, dcfBar, marketBar, precedentBar } from "../src/lib/finance/football";
import { financingCosts, runMerger, validateInputs, type MergerInputs, type MergerParty } from "../src/lib/finance/merger";
import { M } from "./helpers";

/* ========================= Merger worked example ==========================
 *
 * Hand-checked.
 * Acquirer: $50.00 share price, 100M shares, net income $500M → EPS $5.00, P/E 10.0x
 * Target:   $20.00 share price,  50M shares, net income  $80M
 *
 * Offer: 25% premium → $25.00 a share × 50M = $1,250M purchase price (15.6x target earnings)
 * Financing: 40% cash ($500M), 40% stock ($500M ÷ $50 = 10M new shares), 20% debt ($250M)
 * Fees: 2% × 1,250 = $25M, paid in cash → cash used = 500 + 25 = $525M
 * New debt at 6%, cash was earning 4%, tax rate 25%
 * Synergies: $40M a year, 50% achieved in year 1 and 100% in year 2. No growth.
 *
 * Year 1:
 *   after-tax synergies         = 20 × 0.75        =  15.00
 *   after-tax interest on debt  = 250 × 6% × 0.75  =  11.25
 *   after-tax interest lost     = 525 × 4% × 0.75  =  15.75
 *   pro forma net income        = 500 + 80 + 15 − 11.25 − 15.75 = 568.0
 *   pro forma shares            = 100 + 10 = 110M
 *   pro forma EPS               = 568 ÷ 110 = $5.1636 → +3.27% accretion
 * Year 2: synergies 40 × 0.75 = 30 → net income 583 → EPS $5.30 → +6.00%
 */
const ACQ: MergerParty = { ticker: "ACQ", name: "Acquirer", price: 50, shares: 100_000_000, netIncome: M(500) };
const TGT: MergerParty = { ticker: "TGT", name: "Target", price: 20, shares: 50_000_000, netIncome: M(80) };
const IN: MergerInputs = {
  premium: 0.25,
  pctCash: 0.4,
  pctStock: 0.4,
  pctDebt: 0.2,
  debtRate: 0.06,
  cashRate: 0.04,
  taxRate: 0.25,
  synergies: M(40),
  synergyPhaseIn: [0.5, 1],
  feePct: 0.02,
  incrementalDa: 0,
  acquirerGrowth: 0,
  targetGrowth: 0,
};
const mm = (v: number) => v / 1e6;

describe("merger model: deal terms (hand-checked)", () => {
  const r = runMerger(ACQ, TGT, IN);
  it("offer price and purchase price", () => {
    expect(r.offerPrice).toBe(25);
    expect(mm(r.purchasePrice)).toBe(1250);
  });
  it("financing split and fees", () => {
    expect(mm(r.cashConsideration)).toBe(500);
    expect(mm(r.stockConsideration)).toBe(500);
    expect(mm(r.debtConsideration)).toBe(250);
    expect(mm(r.fees)).toBe(25);
    expect(mm(r.cashUsed)).toBe(525);
  });
  it("new shares and ownership: 10M new shares = 9.1% of the combined company", () => {
    expect(r.newShares).toBe(10_000_000);
    expect(r.targetOwnership).toBeCloseTo(10 / 110, 10);
  });
  it("P/E comparison: acquirer 10.0x, target at offer 15.6x", () => {
    expect(r.acquirerPe).toBeCloseTo(10, 10);
    expect(r.targetPeAtOffer).toBeCloseTo(15.625, 10);
  });
});

describe("merger model: accretion / dilution (hand-checked)", () => {
  const r = runMerger(ACQ, TGT, IN);
  const [y1, y2] = r.years;
  it("year 1 adjustments", () => {
    expect(mm(y1.afterTaxSynergies)).toBeCloseTo(15, 10);
    expect(mm(y1.afterTaxDebtInterest)).toBeCloseTo(11.25, 10);
    expect(mm(y1.afterTaxForegoneInterest)).toBeCloseTo(15.75, 10);
  });
  it("year 1: pro forma net income 568, EPS $5.164, accretion +3.27%", () => {
    expect(mm(y1.proFormaNetIncome)).toBeCloseTo(568, 10);
    expect(y1.proFormaShares).toBe(110_000_000);
    expect(y1.standaloneEps).toBe(5);
    expect(y1.proFormaEps).toBeCloseTo(5.16364, 5);
    expect(y1.accretionPct).toBeCloseTo(0.032727, 6);
    expect(y1.accretionPerShare).toBeCloseTo(0.16364, 5);
  });
  it("year 2: full synergies → net income 583, EPS $5.30, accretion +6.00%", () => {
    expect(mm(y2.proFormaNetIncome)).toBeCloseTo(583, 10);
    expect(y2.proFormaEps).toBeCloseTo(5.3, 10);
    expect(y2.accretionPct).toBeCloseTo(0.06, 10);
  });
  it("without synergies the deal is still slightly accretive (553 ÷ 110 = $5.027), so no synergies are needed to break even", () => {
    expect(y1.accretionPctNoSynergies).toBeCloseTo(553 / 110 / 5 - 1, 10);
    expect(y1.breakevenSynergies).toBe(0);
  });
});

describe("merger model: an all-stock deal by a lower-multiple acquirer is dilutive (hand-checked)", () => {
  /**
   * All stock: $1,250M ÷ $50 = 25M new shares → 125M shares.
   * Fees still paid in cash: 25 × 4% × 0.75 = 0.75 of lost interest.
   * No synergies: net income = 500 + 80 − 0.75 = 579.25 → EPS $4.634 → −7.32%.
   * Break-even: needs 5.00 × 125 = 625 of net income; shortfall 45.75 after tax
   *             → 45.75 ÷ 0.75 = $61.0M of pre-tax synergies.
   */
  const r = runMerger(ACQ, TGT, { ...IN, pctCash: 0, pctStock: 1, pctDebt: 0, synergies: 0 });
  const y1 = r.years[0];
  it("EPS falls 7.32%", () => {
    expect(r.newShares).toBe(25_000_000);
    expect(mm(y1.proFormaNetIncome)).toBeCloseTo(579.25, 10);
    expect(y1.proFormaEps).toBeCloseTo(4.634, 10);
    expect(y1.accretionPct).toBeCloseTo(-0.0732, 10);
  });
  it("break-even synergies are $61.0M pre-tax", () => {
    expect(mm(y1.breakevenSynergies)).toBeCloseTo(61, 10);
  });
  it("adding exactly the break-even synergies brings accretion to zero", () => {
    const again = runMerger(ACQ, TGT, { ...IN, pctCash: 0, pctStock: 1, pctDebt: 0, synergies: y1.breakevenSynergies, synergyPhaseIn: [1, 1] });
    expect(again.years[0].accretionPct).toBeCloseTo(0, 10);
  });
});

describe("merger model: what drives accretion", () => {
  it("rule of thumb: target earnings yield 6.4% vs blended cost of financing 6.1% → accretive", () => {
    const c = financingCosts(ACQ, TGT, IN);
    expect(c.targetEarningsYield).toBeCloseTo(0.064, 10);
    expect(c.costOfStock).toBeCloseTo(0.1, 10);
    expect(c.afterTaxCostOfDebt).toBeCloseTo(0.045, 10);
    expect(c.afterTaxCostOfCash).toBeCloseTo(0.03, 10);
    expect(c.blendedCost).toBeCloseTo(0.061, 10);
  });
  it("a higher premium makes the deal less accretive", () => {
    const low = runMerger(ACQ, TGT, { ...IN, premium: 0.1 }).years[0].accretionPct!;
    const high = runMerger(ACQ, TGT, { ...IN, premium: 0.5 }).years[0].accretionPct!;
    expect(low).toBeGreaterThan(high);
  });
  it("cheap debt is more accretive than stock for a 10x P/E acquirer", () => {
    const debt = runMerger(ACQ, TGT, { ...IN, pctCash: 0, pctStock: 0, pctDebt: 1 }).years[0].accretionPct!;
    const stock = runMerger(ACQ, TGT, { ...IN, pctCash: 0, pctStock: 1, pctDebt: 0 }).years[0].accretionPct!;
    expect(debt).toBeGreaterThan(stock);
  });
  it("asset write-up D&A reduces EPS: 20 × 0.75 = 15 less net income", () => {
    const base = runMerger(ACQ, TGT, IN).years[0].proFormaNetIncome;
    const withDa = runMerger(ACQ, TGT, { ...IN, incrementalDa: M(20) }).years[0].proFormaNetIncome;
    expect(mm(base - withDa)).toBeCloseTo(15, 10);
  });
  it("standalone growth compounds: 500 × 1.10² = 605 in year 2", () => {
    const r = runMerger(ACQ, TGT, { ...IN, acquirerGrowth: 0.1 });
    expect(mm(r.years[1].acquirerNetIncome)).toBeCloseTo(605, 10);
    expect(r.years[1].standaloneEps).toBeCloseTo(6.05, 10);
  });
});

describe("merger model: odd cases", () => {
  it("rejects a financing mix that does not add to 100%", () => {
    expect(validateInputs({ ...IN, pctCash: 0.5 })[0]).toMatch(/100%/);
    expect(runMerger(ACQ, TGT, { ...IN, pctCash: 0.5 }).valid).toBe(false);
  });
  it("gives no accretion percentage when the acquirer is loss-making", () => {
    const r = runMerger({ ...ACQ, netIncome: M(-50) }, TGT, IN);
    expect(r.years[0].accretionPct).toBeNull();
    expect(r.acquirerPe).toBeNull();
  });
  it("gives no target P/E when the target is loss-making, but still runs", () => {
    const r = runMerger(ACQ, { ...TGT, netIncome: M(-30) }, IN);
    expect(r.targetPeAtOffer).toBeNull();
    expect(r.years[0].accretionPct!).toBeLessThan(0);
  });
  it("flags a missing share price", () => {
    expect(runMerger(ACQ, { ...TGT, price: 0 }, IN).valid).toBe(false);
  });
});

/* ============================== Football field ============================= */

const basis: TargetBasis = { revenue: M(2000), ebitda: M(200), eps: 2, forwardEps: 2.5, debt: M(300), preferred: 0, noncontrollingInterest: M(20), cash: M(100), shares: 50_000_000 };

describe("football field bars", () => {
  it("52-week range", () => {
    const b = marketBar(30, 50);
    expect([b.low, b.high]).toEqual([30, 50]);
  });
  it("comps bar carries the 25th to 75th percentile range and the median", () => {
    const r: ImpliedRange = { key: "evEbitda", label: "EV / EBITDA (LTM)", low: 33.6, mid: 39.6, high: 45.6, lowMultiple: 9.5, midMultiple: 11, highMultiple: 12.5, peerCount: 4 };
    const b = compsBar(r);
    expect([b.low, b.mid, b.high]).toEqual([33.6, 39.6, 45.6]);
    expect(b.detail).toMatch(/9\.5x to 12\.5x/);
  });
  it("DCF bar spans the centre 3 × 3 of the sensitivity table", () => {
    const a: DcfAssumptions = { baseRevenue: M(1000), growth: [0.05, 0.05, 0.05, 0.05, 0.05], ebitdaMargin: [0.2, 0.2, 0.2, 0.2, 0.2], daPctRevenue: 0.04, capexPctRevenue: 0.05, nwcPctRevenue: 0.1, taxRate: 0.25, wacc: 0.1, terminalGrowth: 0.02, exitMultiple: 8 };
    const t = sensitivityGrowth(a, { debt: M(300), preferred: 0, noncontrollingInterest: M(20), cash: M(100), shares: 50_000_000 });
    const b = dcfBar("dcf-g", "DCF: perpetuity growth", t, "n/a");
    // Lowest = highest WACC with lowest growth; highest = lowest WACC with highest growth, within ±1 step.
    expect(b.low).toBeCloseTo(t.values[3][1] as number, 10);
    expect(b.high).toBeCloseTo(t.values[1][3] as number, 10);
    expect(b.mid).toBeCloseTo(26.039, 2);
  });
  it("DCF bar explains itself when the method is unavailable", () => {
    const b = dcfBar("dcf-x", "DCF: exit multiple", null, "No exit multiple.");
    expect(b.low).toBeNull();
    expect(b.detail).toBe("No exit multiple.");
  });
  it("precedent bar: 9.0x to 11.0x EV / EBITDA → $31.60 to $39.60", () => {
    // 9 × 200 = 1,800 − 300 − 20 + 100 = 1,580 ÷ 50 = 31.60; 11 × 200 = 2,200 → 1,980 ÷ 50 = 39.60
    const b = precedentBar("evEbitda", "Precedents: EV / EBITDA", 9, 11, basis);
    expect(b.low).toBeCloseTo(31.6, 10);
    expect(b.high).toBeCloseTo(39.6, 10);
  });
  it("precedent bar is empty until both multiples are entered, and orders them", () => {
    expect(precedentBar("evEbitda", "x", null, 11, basis).low).toBeNull();
    const swapped = precedentBar("evEbitda", "x", 11, 9, basis);
    expect(swapped.low).toBeCloseTo(31.6, 10);
  });
  it("axis fits every bar and the price, and never goes below zero", () => {
    const d = axisDomain([marketBar(30, 50), marketBar(null, null)], 60)!;
    expect(d.min).toBeLessThan(30);
    expect(d.min).toBeGreaterThanOrEqual(0);
    expect(d.max).toBeGreaterThan(60);
    expect(axisDomain([marketBar(null, null)], null)).toBeNull();
  });
  it("axis ticks are round numbers", () => {
    expect(axisTicks(27.6, 62.4)).toEqual([30, 40, 50, 60]);
    expect(axisTicks(150, 260)).toEqual([160, 180, 200, 220, 240, 260]);
    expect(axisTicks(0, 1000)).toEqual([0, 200, 400, 600, 800, 1000]);
  });
});
