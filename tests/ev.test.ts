import { describe, expect, it } from "vitest";
import { chooseShares, evBridge, marketCap, multiple } from "../src/lib/finance/ev";
import { growth, margin, ratio } from "../src/lib/finance/metrics";
import { M } from "./helpers";

describe("enterprise value bridge (hand-checked worked example)", () => {
  /**
   * Price $50.00 × 100.0M shares                = $5,000M equity value
   * + debt                                       +  1,200
   * + preferred stock                            +    100
   * + noncontrolling interests                   +     50
   * − cash 300 − short-term investments 150      −    450
   * = enterprise value                           = $5,900M
   * Net debt = 1,200 − 450 = 750
   */
  const b = evBridge({
    price: 50,
    shares: 100_000_000,
    totalDebt: M(1200),
    preferred: M(100),
    noncontrollingInterest: M(50),
    cash: M(300),
    shortTermInvestments: M(150),
  });
  it("computes market cap", () => expect(b.marketCap).toBe(M(5000)));
  it("computes enterprise value", () => expect(b.enterpriseValue).toBe(M(5900)));
  it("computes net debt", () => expect(b.netDebt).toBe(M(750)));
  it("assumes nothing when everything is reported", () => expect(b.assumedZero).toEqual([]));

  it("treats unreported preferred / NCI / investments as zero and says so", () => {
    const x = evBridge({ price: 10, shares: 10_000_000, totalDebt: M(40), preferred: null, noncontrollingInterest: null, cash: M(15), shortTermInvestments: null });
    expect(x.enterpriseValue).toBe(M(100 + 40 - 15));
    expect(x.assumedZero).toEqual(["preferred stock", "noncontrolling interests", "short-term investments"]);
  });
  it("gives no enterprise value without a price", () => {
    const x = evBridge({ price: null, shares: 10_000_000, totalDebt: M(40), preferred: null, noncontrollingInterest: null, cash: M(15), shortTermInvestments: null });
    expect(x.marketCap).toBeNull();
    expect(x.enterpriseValue).toBeNull();
  });
  it("a net-cash company has EV below market cap", () => {
    const x = evBridge({ price: 20, shares: 50_000_000, totalDebt: 0, preferred: 0, noncontrollingInterest: 0, cash: M(400), shortTermInvestments: 0 });
    expect(x.enterpriseValue).toBe(M(600));
    expect(x.netDebt).toBe(M(-400));
  });
});

describe("market cap and multiples", () => {
  it("market cap needs a positive price and share count", () => {
    expect(marketCap(25, 4_000_000)).toBe(M(100));
    expect(marketCap(0, 4_000_000)).toBeNull();
    expect(marketCap(25, null)).toBeNull();
  });
  it("EV/EBITDA: 5,900 / 590 = 10.0x", () => expect(multiple(M(5900), M(590))).toBeCloseTo(10, 10));
  it("is not meaningful for negative or zero earnings", () => {
    expect(multiple(M(5900), M(-50))).toBeNull();
    expect(multiple(M(5900), 0)).toBeNull();
    expect(multiple(50, -1.2)).toBeNull();
  });
  it("is not available when an input is missing", () => expect(multiple(null, M(10))).toBeNull());
});

describe("share count choice", () => {
  it("prefers the SEC cover page when it agrees with the provider", () => {
    const c = chooseShares(100_000_000, 101_500_000, "Finnhub");
    expect(c.shares).toBe(100_000_000);
    expect(c.basis).toBe("sec-cover");
  });
  it("uses the provider when the cover page is far off (multi-class)", () => {
    const c = chooseShares(5_800_000_000, 12_100_000_000, "Finnhub");
    expect(c.shares).toBe(12_100_000_000);
    expect(c.basis).toBe("provider");
    expect(c.note).toMatch(/share classes/);
  });
  it("uses the provider when the cover page has no count", () => {
    expect(chooseShares(null, 7_000_000, "Finnhub").basis).toBe("provider");
  });
  it("uses the cover page when the provider is unavailable", () => {
    expect(chooseShares(7_000_000, null, "Finnhub").basis).toBe("sec-cover");
  });
  it("reports none when neither exists", () => {
    expect(chooseShares(null, null, "Finnhub").shares).toBeNull();
  });
});

describe("growth and margins", () => {
  it("growth: 1,200 vs 990 = 21.2%", () => expect(growth(1200, 990)).toBeCloseTo(0.21212, 4));
  it("growth is undefined from a zero or negative base", () => {
    expect(growth(100, 0)).toBeNull();
    expect(growth(100, -50)).toBeNull();
  });
  it("margin: 190 / 1,200 = 15.8%", () => expect(margin(190, 1200)).toBeCloseTo(0.15833, 4));
  it("margin can be negative", () => expect(margin(-60, 1200)).toBeCloseTo(-0.05, 10));
  it("ratio guards against division by zero", () => expect(ratio(5, 0)).toBeNull());
});
