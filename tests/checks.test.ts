import { describe, expect, it } from "vitest";
import { compare, roundingUnit, runChecks, sharesCheck, tolerance } from "../src/lib/finance/checks";
import { buildFinancials } from "../src/lib/sec/facts";
import type { SegmentData } from "../src/lib/types";
import { M, testCoFacts } from "./helpers";

const noSegments: SegmentData = { available: false, reason: "single segment", segments: [], reconciling: [], total: null };
const today = "2025-08-15";

describe("rounding and tolerance", () => {
  it("detects filings rounded to millions, thousands or dollars", () => {
    expect(roundingUnit([M(27435), M(1613)])).toBe(1e6);
    expect(roundingUnit([767_972_000, 3_131_000])).toBe(1e3);
    expect(roundingUnit([1_234_567])).toBe(1);
  });
  it("tolerance is the larger of 3 rounding units and 0.1%", () => {
    expect(tolerance(M(500), [M(500)])).toBe(M(3)); // 0.1% = 0.5M < 3M
    expect(tolerance(M(27435), [M(27435)])).toBeCloseTo(M(27.435), 0); // 0.1% > 3M
  });
});

describe("compare", () => {
  const base = { id: "t", title: "T", period: "FY", lhsLabel: "A", rhsLabel: "B", naReason: "missing" };
  it("passes on an exact tie", () => {
    const r = compare({ ...base, lhs: M(100), rhs: M(100), inputs: [M(100)] });
    expect(r.status).toBe("pass");
    expect(r.diff).toBe(0);
  });
  it("passes on a rounding difference and labels it", () => {
    const r = compare({ ...base, lhs: M(101), rhs: M(100), inputs: [M(101), M(100)] });
    expect(r.status).toBe("pass");
    expect(r.detail).toMatch(/rounding/);
  });
  it("fails with the exact difference when it does not tie", () => {
    const r = compare({ ...base, lhs: M(150), rhs: M(100), inputs: [M(150), M(100)] });
    expect(r.status).toBe("fail");
    expect(r.diff).toBe(M(50));
    expect(r.detail).toContain("$50M");
  });
  it("is not available when a side is missing", () => {
    const r = compare({ ...base, lhs: null, rhs: M(100), inputs: [M(100)] });
    expect(r.status).toBe("na");
    expect(r.detail).toBe("missing");
  });
});

describe("tie-outs on TestCo (hand-checked)", () => {
  const checks = runChecks(buildFinancials(testCoFacts()), noSegments, { today });
  const get = (id: string) => checks.find((c) => c.id === id)!;

  it("balance sheet balances: 2,100 = 2,100", () => {
    expect(get("bs-balance-2025-06-30").status).toBe("pass");
  });
  it("liabilities 1,250 + equity 838 + NCI 12 = assets 2,100", () => {
    const c = get("bs-components-2025-06-30");
    expect(c.status).toBe("pass");
    expect(c.rhs).toBe(M(2100));
  });
  it("components check is n/a when total liabilities is not reported", () => {
    expect(get("bs-components-2023-12-31").status).toBe("na");
  });
  it("cash flow: 200 − 120 − 50 − 5 = 25", () => {
    const c = get("cf-sum-2024-12-31");
    expect(c.status).toBe("pass");
    expect(c.lhs).toBe(M(25));
  });
  it("cash roll: 300 + 25 = 325", () => {
    expect(get("cash-roll-2024-12-31").status).toBe("pass");
  });
  it("gross profit check is n/a when the company reports none", () => {
    expect(get("gross-profit-2024-12-31").status).toBe("na");
  });
  it("segments check is n/a with the reason", () => {
    expect(get("segments").status).toBe("na");
    expect(get("segments").detail).toContain("single segment");
  });
  it("financials are current (46 days old)", () => {
    expect(get("freshness").status).toBe("pass");
    expect(get("freshness").lhs).toBe(46);
  });
  it("links each check to a filing", () => {
    expect(get("bs-balance-2025-06-30").filingUrl).toContain("sec.gov/Archives/edgar/data/1/");
  });
});

describe("tie-outs catch real problems", () => {
  it("flags a balance sheet that does not balance, with the numbers", () => {
    const cf = testCoFacts();
    cf.facts["us-gaap"].LiabilitiesAndStockholdersEquity.units.USD.find((f) => f.end === "2025-06-30")!.val = M(2040);
    const c = runChecks(buildFinancials(cf), noSegments, { today }).find((x) => x.id === "bs-balance-2025-06-30")!;
    expect(c.status).toBe("fail");
    expect(c.diff).toBe(M(60));
  });
  it("flags a cash flow statement that does not explain the change in cash", () => {
    const cf = testCoFacts();
    cf.facts["us-gaap"].NetCashProvidedByUsedInInvestingActivities.units.USD[0].val = M(-160);
    const c = runChecks(buildFinancials(cf), noSegments, { today }).find((x) => x.id === "cf-sum-2024-12-31")!;
    expect(c.status).toBe("fail");
    expect(c.diff).toBe(M(-40));
  });
  it("flags stale financials", () => {
    const c = runChecks(buildFinancials(testCoFacts()), noSegments, { today: "2026-06-30" }).find((x) => x.id === "freshness")!;
    expect(c.status).toBe("fail");
  });
  it("segments: passes when they sum, flags when they do not", () => {
    const seg: SegmentData = {
      available: true,
      segments: [
        { member: "a", label: "A", value: M(700) },
        { member: "b", label: "B", value: M(520) },
      ],
      reconciling: [{ member: "e", label: "Eliminations", value: M(-20) }],
      total: M(1200),
    };
    const fin = buildFinancials(testCoFacts());
    expect(runChecks(fin, seg, { today }).find((x) => x.id === "segments")!.status).toBe("pass");
    seg.reconciling = [];
    const failed = runChecks(fin, seg, { today }).find((x) => x.id === "segments")!;
    expect(failed.status).toBe("fail");
    expect(failed.diff).toBe(M(20));
  });
});

describe("share count cross-check", () => {
  it("passes within 5%", () => expect(sharesCheck(100e6, "2025-07-25", 102e6, "Finnhub").status).toBe("pass"));
  it("flags a large gap", () => expect(sharesCheck(100e6, "2025-07-25", 200e6, "Finnhub").status).toBe("fail"));
  it("is n/a when one side is missing", () => expect(sharesCheck(null, undefined, 200e6, "Finnhub").status).toBe("na"));
});
