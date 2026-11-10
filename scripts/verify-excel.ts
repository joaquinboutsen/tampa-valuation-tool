/**
 * Developer tool: writes the example workbooks WITHOUT cached results, so a
 * spreadsheet program has to calculate every formula itself. Used to check the
 * exported formulas against the tool's own numbers:
 *
 *   npx tsx scripts/verify-excel.ts <output-folder>
 *   soffice --headless --convert-to csv --outdir <output-folder> <output-folder>/dcf.xlsx
 */
import { buildCompsWorkbook, buildDcfWorkbook, type DcfExport } from "../src/lib/export/workbook";
import { peerStats, impliedRanges, type CompRow } from "../src/lib/finance/comps";
import { computeWacc, equityFromEnterpriseValue, runDcf } from "../src/lib/finance/dcf";

const M = 1e6;
const out = process.argv[2];

const dcf: DcfExport = {
  ticker: "TEST",
  companyName: "TestCo Inc",
  baseLabel: "LTM Jun-2025",
  yearLabels: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"],
  assumptions: { baseRevenue: 1000 * M, growth: [0.08, 0.07, 0.06, 0.05, 0.04], ebitdaMargin: [0.2, 0.205, 0.21, 0.21, 0.21], daPctRevenue: 0.04, capexPctRevenue: 0.05, nwcPctRevenue: 0.1, taxRate: 0.25, wacc: 0, terminalGrowth: 0.025, exitMultiple: 8.5 },
  waccInputs: { riskFreeRate: 0.0488, beta: 1.2, equityRiskPremium: 0.05, preTaxCostOfDebt: 0.065, taxRate: 0.25, equityValue: 1600 * M, debtValue: 400 * M },
  bridge: { debt: 400 * M, preferred: 10 * M, noncontrollingInterest: 20 * M, cash: 150 * M, shares: 50 * M },
  currentPrice: 32,
  derivations: [{ label: "Revenue growth", how: "Example." }],
  generatedAt: "2026-11-10T00:00:00Z",
  siteUrl: "https://example.com",
};

const peer = (ticker: string, price: number, mcap: number, ev: number, rev: number, ebitda: number, eps: number, fwd: number | null): CompRow => ({
  ticker, name: `${ticker} Corp`, isFinancial: false, price, marketCap: mcap * M, enterpriseValue: ev * M, ltmLabel: "LTM", revenue: rev * M, ebitda: ebitda * M,
  ebitdaMargin: ebitda / rev, eps, evRevenue: ev / rev, evEbitda: ebitda > 0 && ev / ebitda <= 100 ? ev / ebitda : null, peLtm: eps > 0 && price / eps <= 100 ? price / eps : null, peForward: fwd, balanceDate: null, notes: [],
});
const target = peer("TEST", 32, 1600, 1880, 1000, 200, 2, 14);
const peers = [peer("AAA", 50, 5000, 6000, 4000, 500, 2.5, 15), peer("BBB", 20, 800, 1200, 1500, 100, 1.6, 11), peer("CCC", 75, 9000, 9500, 5000, 1000, 5, 13), peer("DDD", 10, 300, 450, 600, -20, -0.5, null), peer("EEE", 40, 2000, 2600, 1300, 2, 0.1, 30)];

async function main() {
  await buildDcfWorkbook(dcf, { cacheResults: false }).xlsx.writeFile(`${out}/dcf.xlsx`);
  const basis = { debt: 400 * M, preferred: 10 * M, noncontrollingInterest: 20 * M, cash: 150 * M, shares: 50 * M };
  await buildCompsWorkbook({ ticker: "TEST", target, peers, excluded: [], basis, provider: "Finnhub", generatedAt: dcf.generatedAt, siteUrl: dcf.siteUrl }, { cacheResults: false }).xlsx.writeFile(`${out}/comps.xlsx`);

  const w = computeWacc({ ...dcf.waccInputs, taxRate: dcf.assumptions.taxRate })!;
  const r = runDcf({ ...dcf.assumptions, wacc: w.wacc });
  const eqG = equityFromEnterpriseValue(r.perpetuity!.enterpriseValue, dcf.bridge);
  const eqX = equityFromEnterpriseValue(r.exit!.enterpriseValue, dcf.bridge);
  const s = peerStats(peers);
  const ir = impliedRanges(peers, { revenue: target.revenue, ebitda: target.ebitda, eps: target.eps, forwardEps: null, ...basis });
  console.log(
    JSON.stringify({
      dcf: { C24: w.wacc, C36: r.years[0].ufcf / M, G36: r.years[4].ufcf / M, B46: r.sumPvUfcf / M, B47: r.perpetuity!.enterpriseValue / M, C47: r.exit!.enterpriseValue / M, B55: eqG.perShare, C55: eqX.perShare, B58: r.perpetuity!.impliedExitMultiple, C58: r.exit!.impliedGrowth },
      comps: { evRevenue: s.evRevenue, evEbitda: s.evEbitda, peLtm: s.peLtm, implied: ir.filter((x) => x.key !== "peForward").map((x) => [x.label, x.low, x.mid, x.high]) },
    }),
  );
}
main();
