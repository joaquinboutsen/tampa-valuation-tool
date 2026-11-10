import { describe, expect, it } from "vitest";
import { extractBusinessDescription, trimToSentences } from "../src/lib/sec/description";
import { extractSegmentRevenue, prettifyMember } from "../src/lib/sec/segments";
import {
  extractDebtFromBalanceSheet,
  findBalanceSheetReport,
  parseDisplayedNumber,
  parseFilingSummary,
  parseHeaderDate,
  parseReportTable,
  parseScale,
} from "../src/lib/sec/statements";
import { isFinancialSic } from "../src/lib/sec/concepts";
import { isValidTickerFormat, normalizeTicker, rankMatches } from "../src/lib/sec/tickers";
import { shapeMarketData } from "../src/lib/market/finnhub";
import { autoDecimals, fmtCompact, fmtDate, fmtM, fmtMultiple, fmtPct, fmtPrice } from "../src/lib/format";
import { buildSummary } from "../src/lib/finance/summary";
import { buildFinancials } from "../src/lib/sec/facts";
import { M, testCoFacts } from "./helpers";

/* ------------------------- balance sheet page --------------------------- */

const row = (tag: string, label: string, cells: string[], cls = "re") =>
  `<tr class="${cls}"><td class="pl"><a class="a" href="javascript:void(0);" onclick="Show.showAR( this, 'defref_${tag}', window );">${label}</a></td>${cells
    .map((c) => (c === "" ? `<td class="text">&#160;<span></span></td>` : `<td class="${c.startsWith("(") ? "num" : "nump"}">${c}<span></span></td>`))
    .join("")}</tr>`;

const BALANCE_SHEET = `<html><body><table class="report" border="0" cellspacing="2" id="id2">
<tr><th class="tl" colspan="1" rowspan="1"><div style="width: 200px;"><strong>CONSOLIDATED BALANCE SHEETS - USD ($)<br> $ in Millions</strong></div></th><th class="th"><div>Jun. 30, 2025</div></th><th class="th"><div>Dec. 31, 2024</div></th></tr>
${row("us-gaap_AssetsCurrentAbstract", "<strong>Current assets:</strong>", ["", ""])}
${row("us-gaap_CashAndCashEquivalentsAtCarryingValue", "Cash and cash equivalents", ["$ 350", "$ 320"])}
${row("us-gaap_AvailableForSaleSecuritiesDebtSecuritiesCurrent", "Investments in debt securities", ["90", "80"])}
${row("us-gaap_Assets", "Total assets", ["2,100", "2,000"], "reu")}
${row("us-gaap_ShortTermBorrowings", "Short-term borrowings", ["15", "10"])}
${row("us-gaap_LongTermDebtCurrent", "Current portion of long-term debt", ["25", "25"])}
${row("us-gaap_OperatingLeaseLiabilityCurrent", "Operating lease liabilities", ["30", "28"])}
${row("us-gaap_InterestPayableCurrent", "Accrued interest on debt", ["4", "4"])}
${row("us-gaap_LiabilitiesOfDisposalGroupIncludingDiscontinuedOperation", "Liabilities held for sale", ["7", "0"])}
${row("us-gaap_LongTermDebtNoncurrent", "Long-term debt", ["400", "420"])}
${row("testco_ConvertibleNotesPayableNoncurrentCustom", "Convertible notes", ["60", "60"])}
${row("us-gaap_Liabilities", "Total liabilities", ["1,250", "1,200"], "reu")}
${row("testco_ReserveForEsopDebtRetirement", "Reserve for ESOP debt retirement", ["(55)", "(60)"])}
${row("us-gaap_StockholdersEquity", "Total equity", ["838", "790"], "reu")}
${row("us-gaap_LiabilitiesAndStockholdersEquity", "Total liabilities and equity", ["2,100", "2,000"], "reu")}
</table></body></html>`;

describe("balance sheet page reader", () => {
  const table = parseReportTable(BALANCE_SHEET)!;
  it("reads the title, scale and column dates", () => {
    expect(table.scale).toBe(1e6);
    expect(table.columns).toEqual(["Jun. 30, 2025", "Dec. 31, 2024"]);
    expect(parseHeaderDate(table.columns[0])).toBe("2025-06-30");
  });
  it("reads values, negatives and abstract rows", () => {
    expect(table.rows.find((r) => r.name === "Assets")!.values).toEqual([2100, 2000]);
    expect(table.rows.find((r) => r.name === "ReserveForEsopDebtRetirement")!.values).toEqual([-55, -60]);
    expect(table.rows[0].isAbstract).toBe(true);
  });
  it("debt = short-term 15 + current portion 25 + long-term 400 + convertible notes 60 = 500", () => {
    const debt = extractDebtFromBalanceSheet(table, 0);
    expect(debt.map((d) => d.label)).toEqual(["Short-term borrowings", "Current portion of long-term debt", "Long-term debt", "Convertible notes"]);
    expect(debt.reduce((s, d) => s + d.value, 0)).toBe(M(500));
  });
  it("excludes operating leases, accrued interest, assets and equity lines", () => {
    const tags = extractDebtFromBalanceSheet(table, 0).map((d) => d.tag);
    expect(tags).not.toContain("us-gaap:OperatingLeaseLiabilityCurrent");
    expect(tags).not.toContain("us-gaap:InterestPayableCurrent");
    expect(tags).not.toContain("us-gaap:AvailableForSaleSecuritiesDebtSecuritiesCurrent");
    expect(tags).not.toContain("testco:ReserveForEsopDebtRetirement");
  });
  it("keeps reading past 'liabilities held for sale' (does not mistake it for total liabilities)", () => {
    expect(extractDebtFromBalanceSheet(table, 0).some((d) => d.tag === "us-gaap:LongTermDebtNoncurrent")).toBe(true);
  });
  it("reads the prior-period column when asked", () => {
    expect(extractDebtFromBalanceSheet(table, 1).reduce((s, d) => s + d.value, 0)).toBe(M(515));
  });
  it("drops a long-term debt total when its parts are also shown", () => {
    const t = parseReportTable(BALANCE_SHEET.replace("us-gaap_ShortTermBorrowings", "us-gaap_LongTermDebt"))!;
    expect(extractDebtFromBalanceSheet(t, 0).map((d) => d.tag)).not.toContain("us-gaap:LongTermDebt");
  });
});

describe("small parsers", () => {
  it("parses displayed numbers", () => {
    expect(parseDisplayedNumber("$ 1,739")).toBe(1739);
    expect(parseDisplayedNumber("(5)")).toBe(-5);
    expect(parseDisplayedNumber("$ (1,234.5)")).toBe(-1234.5);
    expect(parseDisplayedNumber("")).toBeNull();
  });
  it("parses the reporting scale", () => {
    expect(parseScale("BALANCE SHEETS - USD ($) $ in Thousands")).toBe(1e3);
    expect(parseScale("BALANCE SHEETS - USD ($) shares in Millions, $ in Millions")).toBe(1e6);
    expect(parseScale("BALANCE SHEETS - USD ($)")).toBe(1);
  });
  it("finds the balance sheet in a filing's report list", () => {
    const xml = `<FilingSummary><MyReports>
      <Report instance="a"><HtmlFileName>R1.htm</HtmlFileName><ShortName>Cover</ShortName><MenuCategory>Cover</MenuCategory></Report>
      <Report instance="a"><HtmlFileName>R3.htm</HtmlFileName><ShortName>CONSOLIDATED BALANCE SHEETS</ShortName><MenuCategory>Statements</MenuCategory></Report>
      <Report instance="a"><HtmlFileName>R4.htm</HtmlFileName><ShortName>CONSOLIDATED BALANCE SHEETS (Parenthetical)</ShortName><MenuCategory>Statements</MenuCategory></Report>
    </MyReports></FilingSummary>`;
    expect(findBalanceSheetReport(parseFilingSummary(xml))?.file).toBe("R3.htm");
  });
  it("classifies financial institutions by SIC code", () => {
    expect(isFinancialSic("6211")).toBe(true); // broker (Raymond James)
    expect(isFinancialSic("6331")).toBe(true); // insurer
    expect(isFinancialSic("6798")).toBe(true); // REIT
    expect(isFinancialSic("3672")).toBe(false); // Jabil
    expect(isFinancialSic("6500")).toBe(false); // real estate operator
    expect(isFinancialSic(null)).toBe(false);
  });
});

/* ------------------------------ segments -------------------------------- */

const ctx = (id: string, dims: [string, string][], start = "2024-01-01", end = "2024-12-31") =>
  `<context id="${id}"><entity><identifier scheme="http://www.sec.gov/CIK">1</identifier>${
    dims.length ? `<segment>${dims.map(([d, m]) => `<xbrldi:explicitMember dimension="${d}">${m}</xbrldi:explicitMember>`).join("")}</segment>` : ""
  }</entity><period><startDate>${start}</startDate><endDate>${end}</endDate></period></context>`;
const fact = (c: string, v: number, tag = "Revenues") => `<us-gaap:${tag} contextRef="${c}" decimals="-6" unitRef="usd">${v}</us-gaap:${tag}>`;
const SEG = "us-gaap:StatementBusinessSegmentsAxis";
const CONS = "srt:ConsolidationItemsAxis";
const FY = { start: "2024-01-01", end: "2024-12-31" };

describe("segment revenue reader", () => {
  it("reads simple segments that sum to the total", () => {
    const xml = [ctx("t", []), ctx("a", [[SEG, "tc:NorthAmericaMember"]]), ctx("b", [[SEG, "tc:InternationalSegmentMember"]]), ctx("p", [[SEG, "tc:NorthAmericaMember"]], "2023-01-01", "2023-12-31"), fact("t", M(1200)), fact("a", M(700)), fact("b", M(500)), fact("p", M(640))].join("");
    const s = extractSegmentRevenue(xml, FY);
    expect(s.available).toBe(true);
    expect(s.segments.map((x) => [x.label, x.value])).toEqual([
      ["North America", M(700)],
      ["International", M(500)],
    ]);
    expect(s.total).toBe(M(1200));
  });
  it("adds eliminations and corporate, and ignores a mis-tagged segment subtotal (Coca-Cola pattern)", () => {
    const xml = [
      ctx("t", []),
      ctx("a", [[CONS, "us-gaap:OperatingSegmentsMember"], [SEG, "tc:AMember"]]),
      ctx("b", [[CONS, "us-gaap:OperatingSegmentsMember"], [SEG, "tc:BMember"]]),
      ctx("sub", [[CONS, "us-gaap:MaterialReconcilingItemsMember"]]),
      ctx("corp", [[CONS, "us-gaap:CorporateNonSegmentMember"]]),
      ctx("elim", [[CONS, "srt:ConsolidationEliminationsMember"]]),
      fact("t", M(1200)), fact("a", M(800)), fact("b", M(450)), fact("sub", M(1250)), fact("corp", M(10)), fact("elim", M(-60)),
    ].join("");
    const s = extractSegmentRevenue(xml, FY);
    expect(s.segments).toHaveLength(2);
    expect(s.reconciling.map((r) => r.value)).toEqual([M(10), M(-60)]);
    const sum = [...s.segments, ...s.reconciling].reduce((x, l) => x + l.value, 0);
    expect(sum).toBe(M(1200));
  });
  it("excludes aggregate members such as 'reportable segments total' (Crown pattern)", () => {
    const xml = [ctx("t", []), ctx("a", [[SEG, "tc:AMember"]]), ctx("b", [[SEG, "us-gaap:AllOtherSegmentsMember"]]), ctx("agg", [[SEG, "us-gaap:ReportableSegmentAggregationBeforeOtherOperatingSegmentMember"]]), fact("t", M(1200)), fact("a", M(900)), fact("b", M(300)), fact("agg", M(900))].join("");
    const s = extractSegmentRevenue(xml, FY);
    expect(s.segments.map((x) => x.value)).toEqual([M(900), M(300)]);
  });
  it("finds the total even when it uses a different revenue tag from the segments (Alphabet pattern)", () => {
    const xml = [ctx("t", []), ctx("a", [[SEG, "tc:AMember"]]), ctx("b", [[SEG, "tc:BMember"]]), fact("t", M(1200), "Revenues"), fact("a", M(700), "RevenueFromContractWithCustomerExcludingAssessedTax"), fact("b", M(500), "RevenueFromContractWithCustomerExcludingAssessedTax")].join("");
    expect(extractSegmentRevenue(xml, FY).total).toBe(M(1200));
  });
  it("reports not available for a single-segment company", () => {
    const s = extractSegmentRevenue([ctx("t", []), fact("t", M(1200))].join(""), FY);
    expect(s.available).toBe(false);
    expect(s.reason).toMatch(/single segment/);
  });
  it("tidies member names", () => {
    expect(prettifyMember("jbl:RegulatedIndustriesMember")).toBe("Regulated Industries");
    expect(prettifyMember("snx:AsiaPacificAndJapanSegmentMember")).toBe("Asia Pacific and Japan");
  });
});

/* ---------------------------- description ------------------------------- */

describe("business description reader", () => {
  const para =
    "TestCo is a leading provider of widgets to industrial customers in North America. We design, manufacture and distribute more than 4,000 products through a network of 120 distributors. Our customers include original equipment manufacturers and repair shops.";
  const toc = `<div>Item 1. Business</div><div>3</div><div>Item 1A. Risk Factors</div><div>9</div>`;
  it("skips the table of contents and quotes the first real paragraph", () => {
    const html = `<ix:header><div>Item 1. Business hidden</div></ix:header>${toc}<div>PART I</div><div>Item 1. Business</div><div>Overview</div><p>${para}</p><div>Item 1A. Risk Factors</div>`;
    expect(extractBusinessDescription(html)).toBe(para);
  });
  it("handles small-caps headings that split words apart", () => {
    const html = `${toc}<div><span>I</span><span>TEM</span> 1. <span>B</span><span>USINESS</span></div><p>${para}</p>`;
    expect(extractBusinessDescription(html)).toBe(para);
  });
  it("returns null rather than guessing when Item 1 is not found", () => {
    expect(extractBusinessDescription(`<div>Annual report</div><p>${para}</p>`)).toBeNull();
  });
  it("trims long text at a sentence boundary", () => {
    const long = `${para} ${para} ${para}`;
    const t = trimToSentences(long, 300);
    expect(t.length).toBeLessThanOrEqual(300);
    expect(t.endsWith(".")).toBe(true);
  });
});

/* ------------------------- tickers, market, format ---------------------- */

describe("ticker handling", () => {
  it("normalizes and validates tickers", () => {
    expect(normalizeTicker(" brk.b ")).toBe("BRK-B");
    expect(isValidTickerFormat("JBL")).toBe(true);
    expect(isValidTickerFormat("../etc")).toBe(false);
    expect(isValidTickerFormat("")).toBe(false);
  });
  it("ranks exact ticker, then ticker prefix, then name", () => {
    const list = [
      { ticker: "MSFT", cik: 1, name: "MICROSOFT CORP" },
      { ticker: "MOS", cik: 2, name: "MOSAIC CO" },
      { ticker: "M", cik: 3, name: "Macy's, Inc." },
      { ticker: "JBL", cik: 4, name: "JABIL INC" },
    ];
    expect(rankMatches(list, "m").map((x) => x.ticker)).toEqual(["M", "MSFT", "MOS"]);
    expect(rankMatches(list, "jabil").map((x) => x.ticker)).toEqual(["JBL"]);
    expect(rankMatches(list, "  ")).toEqual([]);
  });
});

describe("market data shaping", () => {
  it("converts provider fields and share units (millions to units)", () => {
    const m = shapeMarketData({ c: 212.5, t: 1_780_000_000 }, { shareOutstanding: 103.2 }, { metric: { "52WeekHigh": 240.1, "52WeekLow": 120.3, beta: 1.21 } }, "2026-11-10T00:00:00Z");
    expect(m.available).toBe(true);
    expect(m.price).toBe(212.5);
    expect(m.providerShares).toBeCloseTo(103_200_000, 0);
    expect(m.high52).toBe(240.1);
    expect(m.beta).toBe(1.21);
  });
  it("is unavailable, not zero, when there is no price", () => {
    const m = shapeMarketData({ c: 0 }, {}, {}, "2026-11-10T00:00:00Z");
    expect(m.available).toBe(false);
    expect(m.price).toBeNull();
  });
  it("leaves missing metrics as null rather than inventing them", () => {
    const m = shapeMarketData({ c: 10 }, {}, {}, "2026-11-10T00:00:00Z");
    expect(m.beta).toBeNull();
    expect(m.high52).toBeNull();
    expect(m.providerShares).toBeNull();
  });
});

describe("formatting", () => {
  it("formats millions with parentheses for negatives", () => {
    expect(fmtM(M(35954))).toBe("35,954");
    expect(fmtM(M(-606))).toBe("(606)");
    expect(fmtM(767_972_000, 1)).toBe("768.0");
    expect(fmtM(null)).toBe("n/a");
  });
  it("formats percentages, multiples, prices and dates", () => {
    expect(fmtPct(0.0663)).toBe("6.6%");
    expect(fmtPct(-0.168)).toBe("(16.8%)");
    expect(fmtMultiple(9.87)).toBe("9.9x");
    expect(fmtMultiple(null)).toBe("n/m");
    expect(fmtPrice(212.5)).toBe("$212.50");
    expect(fmtCompact(M(24600))).toBe("$24.6B");
    expect(fmtCompact(M(812))).toBe("$812M");
    expect(fmtDate("2026-10-23")).toBe("Oct 23, 2026");
  });
  it("uses one decimal for sub-$1bn companies", () => {
    expect(autoDecimals([M(400), M(800)])).toBe(1);
    expect(autoDecimals([M(35954)])).toBe(0);
  });
});

describe("summary table", () => {
  const s = buildSummary(buildFinancials(testCoFacts()));
  const get = (k: string) => s.income.find((r) => r.key === k)!;
  it("revenue growth: 1,200 / 990 − 1 = 21.2%; none for the first year", () => {
    expect(get("revenueGrowth").values[0]).toBeNull();
    expect(get("revenueGrowth").values[1]).toBeCloseTo(0.2121, 4);
  });
  it("EBITDA margin: 190 / 1,200 = 15.8%; LTM 212 / 1,290 = 16.4%", () => {
    expect(get("ebitdaMargin").values[1]).toBeCloseTo(0.1583, 4);
    expect(get("ebitdaMargin").ltm).toBeCloseTo(0.1643, 4);
  });
  it("margins are blank, not zero, when the item is missing", () => {
    expect(get("grossMargin").values[1]).toBeNull();
  });
});

describe("summary table for financial institutions", () => {
  it("leaves out gross profit, EBITDA and EBIT", () => {
    const keys = buildSummary(buildFinancials(testCoFacts()), { financial: true }).income.map((r) => r.key);
    expect(keys).not.toContain("ebitda");
    expect(keys).not.toContain("grossProfit");
    expect(keys).toContain("netIncome");
  });
});
