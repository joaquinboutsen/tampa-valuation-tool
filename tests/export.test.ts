import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildCompsWorkbook, buildDcfWorkbook, DCF_CELLS, type DcfExport } from "../src/lib/export/workbook";
import type { CompRow } from "../src/lib/finance/comps";
import { computeWacc, equityFromEnterpriseValue, runDcf } from "../src/lib/finance/dcf";
import { M } from "./helpers";

/**
 * The formulas themselves were checked by opening the exported files in
 * LibreOffice (scripts/verify-excel.ts): every formula recalculated to the
 * same value as the site's model. These tests guard the structure: the right
 * formulas are in the right cells, and the values stored alongside them match
 * the model.
 */
const dcf: DcfExport = {
  ticker: "TEST",
  companyName: "TestCo Inc",
  baseLabel: "LTM Jun-2025",
  yearLabels: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"],
  assumptions: { baseRevenue: M(1000), growth: [0.05, 0.05, 0.05, 0.05, 0.05], ebitdaMargin: [0.2, 0.2, 0.2, 0.2, 0.2], daPctRevenue: 0.04, capexPctRevenue: 0.05, nwcPctRevenue: 0.1, taxRate: 0.25, wacc: 0, terminalGrowth: 0.02, exitMultiple: 8 },
  waccInputs: { riskFreeRate: 0.04, beta: 1.2, equityRiskPremium: 0.05, preTaxCostOfDebt: 0.06, taxRate: 0.25, equityValue: M(800), debtValue: M(200) },
  bridge: { debt: M(200), preferred: 0, noncontrollingInterest: M(20), cash: M(100), shares: 50_000_000 },
  currentPrice: 20,
  derivations: [{ label: "Revenue growth", how: "Example derivation.", judgment: false }],
  generatedAt: "2026-11-10T00:00:00Z",
  siteUrl: "https://example.com",
};

type FormulaCell = { formula: string; result?: number };
const f = (ws: ExcelJS.Worksheet, addr: string) => ws.getCell(addr).value as FormulaCell;

describe("DCF workbook", () => {
  const wb = buildDcfWorkbook(dcf);
  const ws = wb.getWorksheet("DCF")!;
  const w = computeWacc(dcf.waccInputs)!;
  const model = runDcf({ ...dcf.assumptions, wacc: w.wacc });

  it("has three sheets: the model, the sensitivity tables and the derivations", () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual(["DCF", "Sensitivity", "Derivations"]);
  });
  it("stores inputs as plain numbers in blue", () => {
    expect(ws.getCell("C6").value).toBe(0.05);
    expect(ws.getCell("C6").font?.color?.argb).toBe("FF0000FF");
    expect(ws.getCell("B27").value).toBe(1000); // $ millions
    expect(ws.getCell("C15").value).toBe(1.2);
  });
  it("builds WACC with formulas: 80% × 10.0% + 20% × 4.5% = 8.9%", () => {
    expect(f(ws, "C17").formula).toBe("C14+C15*C16");
    expect(f(ws, "C19").formula).toBe("C18*(1-C11)");
    expect(f(ws, DCF_CELLS.wacc).formula).toBe("C22*C17+C23*C19");
    expect(f(ws, DCF_CELLS.wacc).result).toBeCloseTo(0.089, 10);
  });
  it("chains the projection: each year's revenue is the prior year's × (1 + growth)", () => {
    expect(f(ws, "C27").formula).toBe("B27*(1+C6)");
    expect(f(ws, "G27").formula).toBe("F27*(1+G6)");
    expect(f(ws, "C36").formula).toBe("C32+C29-C33-C35");
    expect(f(ws, "C31").formula).toBe("MAX(C30,0)*$C$11");
    expect(f(ws, DCF_CELLS.ufcfYear1).result).toBeCloseTo(110.5, 6);
  });
  it("terminal value and valuation formulas, with values that match the model", () => {
    expect(f(ws, "B44").formula).toBe("G36*(1+B43)/(C24-B43)");
    expect(f(ws, "C44").formula).toBe("G28*C43");
    expect(f(ws, DCF_CELLS.sumPv).formula).toBe("SUM(C39:G39)");
    expect(f(ws, DCF_CELLS.evPerpetuity).result).toBeCloseTo(model.perpetuity!.enterpriseValue / 1e6, 6);
    expect(f(ws, DCF_CELLS.evExit).result).toBeCloseTo(model.exit!.enterpriseValue / 1e6, 6);
    expect(f(ws, DCF_CELLS.perSharePerpetuity).result).toBeCloseTo(equityFromEnterpriseValue(model.perpetuity!.enterpriseValue, dcf.bridge).perShare!, 6);
    expect(f(ws, DCF_CELLS.impliedGrowth).formula).toBe("(C44*C24-G36)/(C44+G36)");
  });
  it("can leave results out so a spreadsheet must calculate them", () => {
    const bare = buildDcfWorkbook(dcf, { cacheResults: false }).getWorksheet("DCF")!;
    expect(f(bare, "C24").result).toBeUndefined();
    expect(f(bare, "C24").formula).toBe("C22*C17+C23*C19");
  });
  it("marks the exit method n/a when no multiple is entered", () => {
    const none = buildDcfWorkbook({ ...dcf, assumptions: { ...dcf.assumptions, exitMultiple: null } }).getWorksheet("DCF")!;
    expect(none.getCell("C47").value).toBe("n/a");
    expect(f(none, "B47").formula).toBe("B45+B46");
  });
  it("writes a real .xlsx file that can be read back", async () => {
    const buffer = await wb.xlsx.writeBuffer();
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(buffer as ArrayBuffer);
    expect((again.getWorksheet("DCF")!.getCell("C24").value as FormulaCell).formula).toBe("C22*C17+C23*C19");
    expect(again.getWorksheet("Derivations")!.getCell("C4").value).toBe("Example derivation.");
  });
});

const row = (ticker: string, ev: number, rev: number, ebitda: number, eps: number, price: number): CompRow => ({
  ticker,
  name: `${ticker} Corp`,
  isFinancial: false,
  price,
  marketCap: M(ev * 0.8),
  enterpriseValue: M(ev),
  ltmLabel: "LTM",
  revenue: M(rev),
  ebitda: M(ebitda),
  ebitdaMargin: ebitda / rev,
  eps,
  evRevenue: ev / rev,
  evEbitda: ebitda > 0 ? ev / ebitda : null,
  peLtm: eps > 0 ? price / eps : null,
  peForward: null,
  balanceDate: null,
  notes: [],
});

describe("comps workbook", () => {
  const wb = buildCompsWorkbook({
    ticker: "TEST",
    target: row("TEST", 1880, 1000, 200, 2, 32),
    peers: [row("AAA", 6000, 4000, 500, 2.5, 50), row("BBB", 1200, 1500, 100, 1.6, 20), row("CCC", 450, 600, -20, -0.5, 10)],
    excluded: [row("ZZZ", 900, 300, 30, 1, 15)],
    basis: { debt: M(400), preferred: 0, noncontrollingInterest: M(20), cash: M(150), shares: 50_000_000 },
    provider: "Finnhub",
    generatedAt: "2026-11-10T00:00:00Z",
    siteUrl: "https://example.com",
  });
  const ws = wb.getWorksheet("Comps")!;
  it("puts the target first and peers below, in $ millions", () => {
    expect(ws.getCell("A5").value).toBe("TEST");
    expect(ws.getCell("A6").value).toBe("AAA");
    expect(ws.getCell("E6").value).toBe(6000);
  });
  it("calculates each multiple with a formula that guards against negative earnings and outliers", () => {
    const k = f(ws, "K8").formula; // CCC has negative EBITDA
    expect(k).toContain("G8>0");
    expect(k).toContain('"n/m"');
    expect(k).toContain("<=100");
    expect(f(ws, "K6").result).toBeCloseTo(12, 10);
  });
  it("summarizes the peer rows only, with the widely supported QUARTILE function", () => {
    const median = f(ws, "K12").formula;
    expect(median).toContain("MEDIAN(K6:K8)");
    expect(f(ws, "K11").formula).toContain("QUARTILE(K6:K8,3)");
    expect(f(ws, "K13").formula).toContain("QUARTILE(K6:K8,1)");
  });
  it("lists excluded peers separately, outside the statistics range", () => {
    const col = ws.getColumn(1).values as unknown[];
    expect(col.indexOf("ZZZ")).toBeGreaterThan(20);
  });
});
