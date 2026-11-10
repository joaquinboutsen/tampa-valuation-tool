import { describe, expect, it } from "vitest";
import { buildFinancials, coverShares, debtFromTags, durationDays, findFiscalYears, isAnnualDuration, monthYear } from "../src/lib/sec/facts";
import { M, testCoFacts } from "./helpers";

const fin = buildFinancials(testCoFacts());
const row = (key: string) => [...fin.income, ...fin.cashflow].find((r) => r.key === key)!;

describe("period helpers", () => {
  it("measures durations inclusively", () => {
    expect(durationDays({ start: "2024-01-01", end: "2024-12-31" })).toBe(366);
    expect(durationDays({ start: "2025-01-01", end: "2025-06-30" })).toBe(181);
  });
  it("treats 52/53-week and calendar years as annual, but not 9 months", () => {
    expect(isAnnualDuration(364)).toBe(true);
    expect(isAnnualDuration(371)).toBe(true);
    expect(isAnnualDuration(273)).toBe(false);
  });
  it("labels periods by month, rolling early-month week-ends back", () => {
    expect(monthYear("2026-08-31")).toBe("Aug-2026");
    expect(monthYear("2026-02-01")).toBe("Jan-2026"); // e.g. a retailer's year ending Feb 1
  });
});

describe("fiscal years and restatements", () => {
  it("finds fiscal years from 10-K periods only", () => {
    expect(findFiscalYears(testCoFacts()).map((y) => y.end)).toEqual(["2023-12-31", "2024-12-31"]);
    expect(fin.fiscalYears.map((y) => y.label)).toEqual(["FY Dec-2023", "FY Dec-2024"]);
  });
  it("uses the most recently filed figure when a year was restated", () => {
    // FY2023 revenue: 1,000 originally, 990 as restated in the FY2024 10-K.
    expect(row("revenue").values[0].value).toBe(M(990));
    expect(row("revenue").values[0].sources[0].accn).toBe("0000000001-25-000001");
  });
  it("attaches the tag and filing to every value", () => {
    const src = row("revenue").values[1].sources[0];
    expect(src.tag).toBe("us-gaap:Revenues");
    expect(src.form).toBe("10-K");
    expect(src.url).toContain("/Archives/edgar/data/1/000000000125000001/");
  });
});

describe("LTM (hand-checked worked example)", () => {
  it("labels the LTM column by the latest quarter", () => {
    expect(fin.ltm?.label).toBe("LTM Jun-2025");
  });
  it("revenue: 1,200 (FY24) + 650 (YTD25) − 560 (YTD24) = 1,290", () => {
    const ltm = row("revenue").ltm!;
    expect(ltm.value).toBe(M(1290));
    expect(ltm.sources).toHaveLength(3);
    expect(ltm.derived).toBe(true);
  });
  it("ignores the 3-month quarter when looking for year-to-date", () => {
    // If the 330 quarterly figure were used, LTM would be 1,200 + 330 − 560 = 970.
    expect(row("revenue").ltm!.value).not.toBe(M(970));
  });
  it("operating income: 150 + 80 − 60 = 170", () => {
    expect(row("operatingIncome").ltm!.value).toBe(M(170));
  });
  it("is not available when the 10-Q does not report the item", () => {
    expect(row("cfo").ltm!.value).toBeNull();
    expect(row("cfo").ltm!.note).toMatch(/Not available/);
  });
  it("equals the fiscal year when no 10-Q has been filed since the 10-K", () => {
    const cf = testCoFacts();
    for (const tag of Object.values(cf.facts["us-gaap"])) {
      tag.units.USD = tag.units.USD.filter((f) => f.form === "10-K");
    }
    const f = buildFinancials(cf);
    expect(f.ltm?.label).toBe("LTM Dec-2024");
    expect(f.income.find((r) => r.key === "revenue")!.ltm!.value).toBe(M(1200));
  });
});

describe("derived lines", () => {
  it("D&A falls back to depreciation + amortization: 30 + 10 = 40", () => {
    const da = row("da");
    expect(da.values[1].value).toBe(M(40));
    expect(da.values[1].derived).toBe(true);
    // LTM: (30 + 16 − 14) + (10 + 5 − 5) = 42
    expect(da.ltm!.value).toBe(M(42));
  });
  it("EBITDA = EBIT + D&A: 150 + 40 = 190; LTM 170 + 42 = 212", () => {
    expect(row("ebitda").values[1].value).toBe(M(190));
    expect(row("ebitda").ltm!.value).toBe(M(212));
  });
  it("EBITDA is not available (never guessed) when D&A is missing", () => {
    expect(row("ebitda").values[0].value).toBeNull();
  });
  it("interest expense falls back to net interest with the sign flipped", () => {
    const c = row("interestExpense").values[1];
    expect(c.value).toBe(M(20));
    expect(c.note).toMatch(/Net of interest income/);
  });
  it("free cash flow = CFO − capex: 200 − 70 = 130", () => {
    expect(row("fcf").values[1].value).toBe(M(130));
  });
  it("gross profit is not derived when the company does not report it", () => {
    expect(row("grossProfit").values[1].value).toBeNull();
  });
});

describe("balance sheet and shares", () => {
  it("uses the latest balance sheet, from the 10-Q", () => {
    expect(fin.latestBalance?.date).toBe("2025-06-30");
    expect(fin.latestBalance?.form).toBe("10-Q");
    expect(fin.latestBalance?.items.totalAssets.value).toBe(M(2100));
  });
  it("reads cover-page shares from the latest filing", () => {
    expect(fin.coverShares.value).toBe(50_000_000);
    expect(fin.coverShares.asOf).toBe("2025-07-25");
  });
  it("rejects a stale cover-page share count", () => {
    const cf = testCoFacts();
    cf.facts.dei.EntityCommonStockSharesOutstanding.units.shares[0].filed = "2015-01-01";
    expect(coverShares(cf).value).toBeNull();
  });
  it("fallback debt: short-term 15 + current portion 25 + long-term 400 = 440", () => {
    const parts = debtFromTags(testCoFacts(), "2025-06-30");
    expect(parts.reduce((s, p) => s + p.value, 0)).toBe(M(440));
  });
  it("fallback debt never adds a combined current-debt tag to its own components", () => {
    const cf = testCoFacts();
    cf.facts["us-gaap"].DebtCurrent = { units: { USD: [{ end: "2025-06-30", val: M(40), form: "10-Q", accn: "x", filed: "2025-07-30" }] } };
    const parts = debtFromTags(cf, "2025-06-30");
    expect(parts.map((p) => p.tag)).toEqual(["us-gaap:DebtCurrent", "us-gaap:LongTermDebtNoncurrent"]);
    expect(parts.reduce((s, p) => s + p.value, 0)).toBe(M(440));
  });
});

describe("unsupported companies", () => {
  it("warns when there is no US GAAP data", () => {
    const f = buildFinancials({ cik: 2, entityName: "ForeignCo", facts: { "ifrs-full": {} } });
    expect(f.fiscalYears).toHaveLength(0);
    expect(f.warnings.join(" ")).toMatch(/IFRS/);
  });
});

describe("EBIT when no operating income line is reported", () => {
  it("falls back to pre-tax income + interest expense, flagged as derived", () => {
    const cf = testCoFacts();
    delete cf.facts["us-gaap"].OperatingIncomeLoss;
    const k24 = { form: "10-K", accn: "0000000001-25-000001", filed: "2025-02-14" };
    cf.facts["us-gaap"].IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest = {
      units: { USD: [{ start: "2024-01-01", end: "2024-12-31", val: M(125), ...k24 }] },
    };
    const f = buildFinancials(cf);
    const ebit = f.income.find((r) => r.key === "operatingIncome")!.values[1];
    // Pre-tax income 125 + interest expense 20 = 145
    expect(ebit.value).toBe(M(145));
    expect(ebit.derived).toBe(true);
    expect(ebit.note).toMatch(/pre-tax income \+ interest expense/);
    // EBITDA = 145 + D&A 40 = 185
    expect(f.income.find((r) => r.key === "ebitda")!.values[1].value).toBe(M(185));
  });
  it("prefers the reported operating income when it exists", () => {
    const ebit = fin.income.find((r) => r.key === "operatingIncome")!.values[1];
    expect(ebit.value).toBe(M(150));
    expect(ebit.derived).toBeUndefined();
  });
});
