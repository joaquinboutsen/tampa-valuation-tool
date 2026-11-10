/**
 * Excel export. Builds real, working spreadsheets: inputs are in blue and
 * every calculated cell is a live Excel formula, so a reader can change an
 * assumption in Excel and trace every number (the banking convention).
 */
import ExcelJS from "exceljs";
import type { CompRow } from "../finance/comps";
import { computeWacc, runDcf, sensitivityGrowth, sensitivityMultiple, type BridgeItems, type DcfAssumptions, type WaccInputs } from "../finance/dcf";

const BLUE = "FF0000FF";
const NAVY = "FF12284B";
const FMT_M = '#,##0.0;(#,##0.0);"–"';
const FMT_PCT = "0.0%;(0.0%)";
const FMT_PCT2 = "0.00%;(0.00%)";
const FMT_X = '0.0"x"';
const FMT_PRICE = '"$"#,##0.00;("$"#,##0.00)';
const FMT_FACTOR = "0.000";
const M = 1e6;

type Ws = ExcelJS.Worksheet;

function input(ws: Ws, addr: string, value: number | null, numFmt: string) {
  const c = ws.getCell(addr);
  c.value = value;
  c.numFmt = numFmt;
  c.font = { color: { argb: BLUE } };
}
function formula(ws: Ws, addr: string, f: string, numFmt: string, result?: number | null, bold = false) {
  const c = ws.getCell(addr);
  c.value = result === undefined || result === null || !Number.isFinite(result) ? { formula: f } : { formula: f, result };
  c.numFmt = numFmt;
  if (bold) c.font = { bold: true };
}
function label(ws: Ws, addr: string, text: string, opts: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}) {
  const c = ws.getCell(addr);
  c.value = text;
  c.font = { bold: opts.bold, italic: opts.italic, color: opts.color ? { argb: opts.color } : undefined, size: opts.size };
}
function header(ws: Ws, row: number, text: string, lastCol = "H") {
  label(ws, `A${row}`, text, { bold: true, color: "FFFFFFFF" });
  for (const col of "ABCDEFGH".slice(0, "ABCDEFGH".indexOf(lastCol) + 1)) {
    ws.getCell(`${col}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  }
}
function note(ws: Ws, addr: string, text: string) {
  const c = ws.getCell(addr);
  c.value = text;
  c.font = { italic: true, color: { argb: "FF5B6676" }, size: 9 };
  c.alignment = { wrapText: false };
}

export interface DcfExport {
  ticker: string;
  companyName: string;
  baseLabel: string;
  yearLabels: string[];
  assumptions: DcfAssumptions;
  waccInputs: WaccInputs;
  bridge: BridgeItems;
  currentPrice: number | null;
  /** Plain-English derivation for each default, shown on a separate sheet. */
  derivations: { label: string; how: string; judgment?: boolean }[];
  riskFreeDate?: string | null;
  balanceDate?: string | null;
  generatedAt: string;
  siteUrl: string;
}

const YEAR_COLS = ["C", "D", "E", "F", "G"];

/** Cell addresses of the key outputs, exported so tests can check them. */
export const DCF_CELLS = {
  wacc: "C24",
  ufcfYear1: "C36",
  ufcfYear5: "G36",
  sumPv: "B46",
  evPerpetuity: "B47",
  evExit: "C47",
  perSharePerpetuity: "B55",
  perShareExit: "C55",
  impliedMultiple: "B58",
  impliedGrowth: "C58",
};

export function buildDcfWorkbook(d: DcfExport, opts: { cacheResults?: boolean } = {}): ExcelJS.Workbook {
  const cache = opts.cacheResults ?? true;
  const a = d.assumptions;
  const w = computeWacc({ ...d.waccInputs, taxRate: a.taxRate });
  const model = runDcf({ ...a, wacc: w?.wacc ?? a.wacc });
  const r = <T extends number | null | undefined>(v: T) => (cache ? v : undefined);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Valuation Toolkit";
  wb.created = new Date(d.generatedAt);
  const ws = wb.addWorksheet("DCF", { views: [{ state: "frozen", xSplit: 1, ySplit: 5 }] });
  ws.columns = [{ width: 44 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 70 }];

  label(ws, "A1", `${d.companyName} (${d.ticker}): discounted cash flow`, { bold: true, size: 14, color: NAVY });
  note(ws, "A2", `$ in millions, except per share. Blue cells are inputs; black cells are formulas. Generated ${d.generatedAt.slice(0, 10)} by ${d.siteUrl}. Educational use, not investment advice.`);

  /* ---- Operating assumptions ---- */
  header(ws, 4, "Operating assumptions");
  label(ws, "B5", `Base (${d.baseLabel})`, { bold: true });
  YEAR_COLS.forEach((c, i) => label(ws, `${c}5`, d.yearLabels[i] ?? `Year ${i + 1}`, { bold: true }));
  label(ws, "H5", "Notes", { bold: true });
  label(ws, "A6", "Revenue growth");
  label(ws, "A7", "EBITDA margin");
  YEAR_COLS.forEach((c, i) => {
    input(ws, `${c}6`, a.growth[i], FMT_PCT);
    input(ws, `${c}7`, a.ebitdaMargin[i], FMT_PCT);
  });
  const single: [number, string, number, string][] = [
    [8, "D&A as % of revenue", a.daPctRevenue, "Applies to every projected year."],
    [9, "Capital expenditures as % of revenue", a.capexPctRevenue, "Applies to every projected year."],
    [10, "Net working capital as % of revenue", a.nwcPctRevenue, "Current assets excluding cash, less current liabilities excluding debt."],
    [11, "Tax rate", a.taxRate, "Applied to EBIT; no tax benefit is assumed in a loss-making year."],
  ];
  for (const [row, text, value, n] of single) {
    label(ws, `A${row}`, text);
    input(ws, `C${row}`, value, FMT_PCT);
    note(ws, `H${row}`, n);
  }

  /* ---- Cost of capital ---- */
  header(ws, 13, "Cost of capital (WACC)");
  label(ws, "A14", "Risk-free rate");
  input(ws, "C14", d.waccInputs.riskFreeRate, FMT_PCT2);
  note(ws, "H14", `10-year U.S. Treasury par yield${d.riskFreeDate ? ` on ${d.riskFreeDate}` : ""} (U.S. Department of the Treasury).`);
  label(ws, "A15", "Beta");
  input(ws, "C15", d.waccInputs.beta, "0.00");
  label(ws, "A16", "Equity risk premium");
  input(ws, "C16", d.waccInputs.equityRiskPremium, FMT_PCT2);
  label(ws, "A17", "Cost of equity (CAPM)", { bold: true });
  formula(ws, "C17", "C14+C15*C16", FMT_PCT2, r(w?.costOfEquity), true);
  note(ws, "H17", "Risk-free rate + beta × equity risk premium.");
  label(ws, "A18", "Pre-tax cost of debt");
  input(ws, "C18", d.waccInputs.preTaxCostOfDebt, FMT_PCT2);
  label(ws, "A19", "After-tax cost of debt", { bold: true });
  formula(ws, "C19", "C18*(1-C11)", FMT_PCT2, r(w?.afterTaxCostOfDebt), true);
  label(ws, "A20", "Equity value (market capitalization)");
  input(ws, "C20", d.waccInputs.equityValue / M, FMT_M);
  label(ws, "A21", "Total debt");
  input(ws, "C21", d.waccInputs.debtValue / M, FMT_M);
  note(ws, "H21", `Book value from the balance sheet${d.balanceDate ? ` dated ${d.balanceDate}` : ""}, used as a stand-in for market value.`);
  label(ws, "A22", "Weight of equity");
  formula(ws, "C22", "C20/(C20+C21)", FMT_PCT, r(w?.weightEquity));
  label(ws, "A23", "Weight of debt");
  formula(ws, "C23", "C21/(C20+C21)", FMT_PCT, r(w?.weightDebt));
  label(ws, "A24", "WACC", { bold: true });
  formula(ws, "C24", "C22*C17+C23*C19", FMT_PCT2, r(w?.wacc), true);

  /* ---- Free cash flow ---- */
  header(ws, 26, "Unlevered free cash flow");
  const rows: [number, string, boolean][] = [
    [27, "Revenue", true],
    [28, "EBITDA", false],
    [29, "Less: D&A", false],
    [30, "EBIT", false],
    [31, "Less: taxes on EBIT", false],
    [32, "After-tax operating profit (NOPAT)", false],
    [33, "Less: capital expenditures", false],
    [34, "Net working capital (balance)", false],
    [35, "Less: increase in net working capital", false],
    [36, "Unlevered free cash flow", true],
    [37, "Year", false],
    [38, "Discount factor", false],
    [39, "Present value of free cash flow", true],
  ];
  for (const [row, text, bold] of rows) label(ws, `A${row}`, text, { bold });
  input(ws, "B27", a.baseRevenue / M, FMT_M);
  formula(ws, "B34", "B27*$C$10", FMT_M, r((a.baseRevenue * a.nwcPctRevenue) / M));
  YEAR_COLS.forEach((c, i) => {
    const prev = i === 0 ? "B" : YEAR_COLS[i - 1];
    const y = model.years[i];
    formula(ws, `${c}27`, `${prev}27*(1+${c}6)`, FMT_M, r(y.revenue / M), true);
    formula(ws, `${c}28`, `${c}27*${c}7`, FMT_M, r(y.ebitda / M));
    formula(ws, `${c}29`, `${c}27*$C$8`, FMT_M, r(y.da / M));
    formula(ws, `${c}30`, `${c}28-${c}29`, FMT_M, r(y.ebit / M));
    formula(ws, `${c}31`, `MAX(${c}30,0)*$C$11`, FMT_M, r(y.taxes / M));
    formula(ws, `${c}32`, `${c}30-${c}31`, FMT_M, r(y.nopat / M));
    formula(ws, `${c}33`, `${c}27*$C$9`, FMT_M, r(y.capex / M));
    formula(ws, `${c}34`, `${c}27*$C$10`, FMT_M, r(y.nwc / M));
    formula(ws, `${c}35`, `${c}34-${prev}34`, FMT_M, r(y.increaseInNwc / M));
    formula(ws, `${c}36`, `${c}32+${c}29-${c}33-${c}35`, FMT_M, r(y.ufcf / M), true);
    ws.getCell(`${c}37`).value = i + 1;
    formula(ws, `${c}38`, `1/(1+$C$24)^${c}37`, FMT_FACTOR, r(y.discountFactor));
    formula(ws, `${c}39`, `${c}36*${c}38`, FMT_M, r(y.pv / M), true);
  });
  note(ws, "H36", "EBIT after tax + D&A − capital expenditures − increase in net working capital.");
  note(ws, "H38", "End-of-year convention: 1 ÷ (1 + WACC) ^ year.");

  /* ---- Terminal value and valuation ---- */
  header(ws, 41, "Terminal value and valuation");
  label(ws, "B42", "Perpetuity growth", { bold: true });
  label(ws, "C42", "Exit multiple", { bold: true });
  label(ws, "A43", "Terminal growth rate / exit multiple (EV / EBITDA)");
  input(ws, "B43", a.terminalGrowth, FMT_PCT2);
  const hasExit = a.exitMultiple !== null && a.exitMultiple > 0;
  input(ws, "C43", hasExit ? a.exitMultiple : null, FMT_X);
  const g = model.perpetuity;
  const x = model.exit;
  const bridgeEq = (ev: number | undefined) => (ev === undefined ? undefined : (ev - d.bridge.debt - d.bridge.preferred - d.bridge.noncontrollingInterest + d.bridge.cash) / M);
  const perShare = (ev: number | undefined) => (ev === undefined || !d.bridge.shares ? undefined : (bridgeEq(ev) as number) / (d.bridge.shares / M));

  const vrows: [number, string, string, string, string, number | undefined, number | undefined, boolean][] = [
    [44, "Terminal value at end of year 5", "G36*(1+B43)/(C24-B43)", "G28*C43", FMT_M, g ? g.value / M : undefined, x ? x.value / M : undefined, false],
    [45, "Present value of terminal value", "B44*G38", "C44*G38", FMT_M, g ? g.pv / M : undefined, x ? x.pv / M : undefined, false],
    [46, "Plus: present value of free cash flows, years 1 to 5", "SUM(C39:G39)", "B46", FMT_M, model.sumPvUfcf / M, model.sumPvUfcf / M, false],
    [47, "Enterprise value", "B45+B46", "C45+C46", FMT_M, g ? g.enterpriseValue / M : undefined, x ? x.enterpriseValue / M : undefined, true],
    [48, "Terminal value as % of enterprise value", "B45/B47", "C45/C47", FMT_PCT, g?.shareOfEv, x?.shareOfEv, false],
  ];
  for (const [row, text, fB, fC, fmt, rB, rC, bold] of vrows) {
    label(ws, `A${row}`, text, { bold });
    formula(ws, `B${row}`, fB, fmt, r(rB), bold);
    if (hasExit) formula(ws, `C${row}`, fC, fmt, r(rC), bold);
    else ws.getCell(`C${row}`).value = "n/a";
  }
  label(ws, "A49", "Less: total debt");
  formula(ws, "B49", "C21", FMT_M, r(d.bridge.debt / M));
  label(ws, "A50", "Less: preferred stock");
  input(ws, "B50", d.bridge.preferred / M, FMT_M);
  label(ws, "A51", "Less: noncontrolling interests");
  input(ws, "B51", d.bridge.noncontrollingInterest / M, FMT_M);
  label(ws, "A52", "Plus: cash and short-term investments");
  input(ws, "B52", d.bridge.cash / M, FMT_M);
  label(ws, "A53", "Equity value", { bold: true });
  formula(ws, "B53", "B47-B49-B50-B51+B52", FMT_M, r(bridgeEq(g?.enterpriseValue)), true);
  label(ws, "A54", "Shares outstanding (millions)");
  input(ws, "B54", d.bridge.shares ? d.bridge.shares / M : null, FMT_M);
  label(ws, "A55", "Implied value per share", { bold: true });
  formula(ws, "B55", "B53/B54", FMT_PRICE, r(perShare(g?.enterpriseValue)), true);
  label(ws, "A56", "Current share price");
  input(ws, "B56", d.currentPrice, FMT_PRICE);
  label(ws, "A57", "Premium / (discount) to current price");
  formula(ws, "B57", "B55/B56-1", FMT_PCT, r(d.currentPrice && perShare(g?.enterpriseValue) !== undefined ? (perShare(g?.enterpriseValue) as number) / d.currentPrice - 1 : undefined));
  label(ws, "A58", "Cross-check: implied exit multiple / implied perpetual growth");
  formula(ws, "B58", "B44/G28", FMT_X, r(g?.impliedExitMultiple ?? undefined));
  if (hasExit) {
    formula(ws, "C49", "B49", FMT_M, r(d.bridge.debt / M));
    formula(ws, "C50", "B50", FMT_M, r(d.bridge.preferred / M));
    formula(ws, "C51", "B51", FMT_M, r(d.bridge.noncontrollingInterest / M));
    formula(ws, "C52", "B52", FMT_M, r(d.bridge.cash / M));
    formula(ws, "C53", "C47-C49-C50-C51+C52", FMT_M, r(bridgeEq(x?.enterpriseValue)), true);
    formula(ws, "C54", "B54", FMT_M, r(d.bridge.shares ? d.bridge.shares / M : undefined));
    formula(ws, "C55", "C53/C54", FMT_PRICE, r(perShare(x?.enterpriseValue)), true);
    formula(ws, "C56", "B56", FMT_PRICE, r(d.currentPrice ?? undefined));
    formula(ws, "C57", "C55/C56-1", FMT_PCT, r(d.currentPrice && perShare(x?.enterpriseValue) !== undefined ? (perShare(x?.enterpriseValue) as number) / d.currentPrice - 1 : undefined));
    formula(ws, "C58", "(C44*C24-G36)/(C44+G36)", FMT_PCT2, r(x?.impliedGrowth ?? undefined));
  }
  note(ws, "H44", "Growth: final-year cash flow × (1 + g) ÷ (WACC − g). Multiple: final-year EBITDA × exit multiple.");
  note(ws, "H54", "Basic share count; option dilution is not included.");
  note(ws, "H58", "Each method's answer expressed in the other's terms. A large gap means one assumption is off.");

  /* ---- Sensitivity (values) ---- */
  const ss = wb.addWorksheet("Sensitivity");
  ss.columns = [{ width: 12 }, ...Array(5).fill({ width: 13 })];
  label(ss, "A1", "Sensitivity: implied value per share", { bold: true, size: 13, color: NAVY });
  note(ss, "A2", "These tables hold values calculated when the file was downloaded. They do not update if inputs on the DCF sheet are changed.");
  const base = { ...a, wacc: w?.wacc ?? a.wacc };
  const tables = [sensitivityGrowth(base, d.bridge), sensitivityMultiple(base, d.bridge)];
  let top = 4;
  for (const t of tables) {
    if (!t) continue;
    label(ss, `A${top}`, `WACC (down) × ${t.colLabel.toLowerCase()} (across)`, { bold: true });
    t.cols.forEach((c, j) => {
      const cell = ss.getCell(top + 1, j + 2);
      cell.value = c;
      cell.numFmt = t.colLabel === "Terminal growth" ? FMT_PCT2 : FMT_X;
      cell.font = { bold: true };
    });
    t.rows.forEach((rw, i) => {
      const rc = ss.getCell(top + 2 + i, 1);
      rc.value = rw;
      rc.numFmt = FMT_PCT2;
      rc.font = { bold: true };
      t.values[i].forEach((v, j) => {
        const cell = ss.getCell(top + 2 + i, j + 2);
        cell.value = v === null ? "n/m" : v;
        cell.numFmt = FMT_PRICE;
      });
    });
    top += 9;
  }

  /* ---- How each default was derived ---- */
  const ds = wb.addWorksheet("Derivations");
  ds.columns = [{ width: 30 }, { width: 14 }, { width: 120 }];
  label(ds, "A1", "How each default assumption was derived", { bold: true, size: 13, color: NAVY });
  ["Assumption", "Type", "Derivation"].forEach((h, i) => {
    const c = ds.getCell(3, i + 1);
    c.value = h;
    c.font = { bold: true };
  });
  d.derivations.forEach((x2, i) => {
    ds.getCell(4 + i, 1).value = x2.label;
    ds.getCell(4 + i, 2).value = x2.judgment ? "Judgment" : "From data";
    ds.getCell(4 + i, 3).value = x2.how;
  });
  const end = 5 + d.derivations.length;
  note(ds, `A${end}`, "If you changed an input on the website before downloading, the DCF sheet holds your value, not the default described here.");
  note(ds, `A${end + 1}`, "Sources: financial statements from SEC EDGAR (10-K and 10-Q XBRL data); market data from Finnhub; risk-free rate from the U.S. Treasury.");
  return wb;
}

/* ================================= comps ================================= */

export interface CompsExport {
  ticker: string;
  target: CompRow;
  /** Peers included in the statistics. */
  peers: CompRow[];
  /** Peers shown on the page but left out of the statistics. */
  excluded: CompRow[];
  /** Target bridge items for implied share prices, in dollars. */
  basis: { debt: number; preferred: number; noncontrollingInterest: number; cash: number; shares: number | null };
  provider: string;
  generatedAt: string;
  siteUrl: string;
}

export function buildCompsWorkbook(d: CompsExport, opts: { cacheResults?: boolean } = {}): ExcelJS.Workbook {
  const cache = opts.cacheResults ?? true;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Valuation Toolkit";
  wb.created = new Date(d.generatedAt);
  const ws = wb.addWorksheet("Comps", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });
  ws.columns = [{ width: 10 }, { width: 34 }, { width: 11 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 11 }, { width: 13 }];
  label(ws, "A1", `${d.target.name} (${d.ticker}): trading comparables`, { bold: true, size: 14, color: NAVY });
  note(ws, "A2", `$ in millions, except per share. Blue cells are data; black cells are formulas. Financials: SEC filings (LTM). Prices and forward P/E: ${d.provider}. Generated ${d.generatedAt.slice(0, 10)} by ${d.siteUrl}.`);
  const heads = ["Ticker", "Company", "Price", "Market cap", "Enterprise value", "LTM revenue", "LTM EBITDA", "LTM EPS", "EBITDA margin", "EV / Revenue", "EV / EBITDA", "P / E", "P / E forward"];
  heads.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });

  const res = (v: number | null) => (cache && v !== null ? v : undefined);
  const writeRow = (row: number, c: CompRow, bold = false) => {
    ws.getCell(`A${row}`).value = c.ticker;
    ws.getCell(`B${row}`).value = c.name;
    if (bold) ws.getRow(row).font = { bold: true };
    input(ws, `C${row}`, c.price, FMT_PRICE);
    input(ws, `D${row}`, c.marketCap === null ? null : c.marketCap / M, FMT_M);
    input(ws, `E${row}`, c.enterpriseValue === null ? null : c.enterpriseValue / M, FMT_M);
    input(ws, `F${row}`, c.revenue === null ? null : c.revenue / M, FMT_M);
    input(ws, `G${row}`, c.ebitda === null ? null : c.ebitda / M, FMT_M);
    input(ws, `H${row}`, c.eps, FMT_PRICE);
    // "n/m" when the inputs are missing, not positive, or the multiple is above 100x.
    formula(ws, `I${row}`, `IF(AND(ISNUMBER(F${row}),ISNUMBER(G${row}),F${row}>0),G${row}/F${row},"n/a")`, FMT_PCT, res(c.ebitdaMargin));
    formula(ws, `J${row}`, `IF(AND(ISNUMBER(E${row}),ISNUMBER(F${row}),E${row}>0,F${row}>0),IF(E${row}/F${row}<=100,E${row}/F${row},"n/m"),"n/m")`, FMT_X, res(c.evRevenue));
    formula(ws, `K${row}`, `IF(AND(ISNUMBER(E${row}),ISNUMBER(G${row}),E${row}>0,G${row}>0),IF(E${row}/G${row}<=100,E${row}/G${row},"n/m"),"n/m")`, FMT_X, res(c.evEbitda));
    formula(ws, `L${row}`, `IF(AND(ISNUMBER(C${row}),ISNUMBER(H${row}),C${row}>0,H${row}>0),IF(C${row}/H${row}<=100,C${row}/H${row},"n/m"),"n/m")`, FMT_X, res(c.peLtm));
    const fwd = ws.getCell(`M${row}`);
    fwd.value = c.peForward ?? "n/m";
    fwd.numFmt = FMT_X;
    fwd.font = { color: { argb: BLUE }, bold };
  };

  const targetRow = 5;
  writeRow(targetRow, d.target, true);
  ws.getCell(`B${targetRow}`).value = `${d.target.name} (target)`;
  const first = 6;
  d.peers.forEach((p, i) => writeRow(first + i, p));
  const last = first + Math.max(d.peers.length, 1) - 1;

  const statTop = last + 2;
  const stats: [string, (col: string) => string][] = [
    ["Maximum", (c) => `MAX(${c}${first}:${c}${last})`],
    ["75th percentile", (c) => `QUARTILE(${c}${first}:${c}${last},3)`],
    ["Median", (c) => `MEDIAN(${c}${first}:${c}${last})`],
    ["25th percentile", (c) => `QUARTILE(${c}${first}:${c}${last},1)`],
    ["Minimum", (c) => `MIN(${c}${first}:${c}${last})`],
    ["Peers counted", (c) => `COUNT(${c}${first}:${c}${last})`],
  ];
  stats.forEach(([name, f], i) => {
    const row = statTop + i;
    label(ws, `B${row}`, name, { bold: name === "Median" });
    for (const col of ["J", "K", "L", "M"]) {
      const cell = ws.getCell(`${col}${row}`);
      cell.value = { formula: name === "Peers counted" ? f(col) : `IF(COUNT(${col}${first}:${col}${last})>0,${f(col)},"n/m")` };
      cell.numFmt = name === "Peers counted" ? "0" : FMT_X;
      if (name === "Median") cell.font = { bold: true };
    }
  });
  const q3 = statTop + 1;
  const med = statTop + 2;
  const q1 = statTop + 3;

  /* Implied share price at peer multiples */
  const it = statTop + 8;
  label(ws, `B${it}`, "Target bridge items", { bold: true });
  const b = d.basis;
  const bridge: [string, number | null][] = [
    ["Total debt", b.debt / M],
    ["Preferred stock", b.preferred / M],
    ["Noncontrolling interests", b.noncontrollingInterest / M],
    ["Cash and short-term investments", b.cash / M],
    ["Shares outstanding (millions)", b.shares ? b.shares / M : null],
  ];
  bridge.forEach(([name, v], i) => {
    label(ws, `B${it + 1 + i}`, name);
    input(ws, `C${it + 1 + i}`, v, FMT_M);
  });
  const [rDebt, rPref, rNci, rCash, rSh] = [it + 1, it + 2, it + 3, it + 4, it + 5];
  const ip = it + 8;
  label(ws, `B${ip}`, "Implied share price at peer multiples", { bold: true });
  ["25th percentile", "Median", "75th percentile"].forEach((h, i) => label(ws, `${["C", "D", "E"][i]}${ip}`, h, { bold: true }));
  const implied: [string, string, string][] = [
    ["EV / Revenue", "J", `F${targetRow}`],
    ["EV / EBITDA", "K", `G${targetRow}`],
    ["P / E", "L", `H${targetRow}`],
  ];
  implied.forEach(([name, col, metric], i) => {
    const row = ip + 1 + i;
    label(ws, `B${row}`, name);
    [q1, med, q3].forEach((statRow, j) => {
      const m = `${col}${statRow}`;
      const f =
        name === "P / E"
          ? `IF(AND(ISNUMBER(${m}),ISNUMBER(${metric}),${metric}>0),${m}*${metric},"n/m")`
          : `IF(AND(ISNUMBER(${m}),ISNUMBER(${metric}),${metric}>0,ISNUMBER($C$${rSh})),(${m}*${metric}-$C$${rDebt}-$C$${rPref}-$C$${rNci}+$C$${rCash})/$C$${rSh},"n/m")`;
      formula(ws, `${["C", "D", "E"][j]}${row}`, f, FMT_PRICE);
    });
  });
  note(ws, `B${ip + 5}`, "EV multiples: (multiple × target metric − debt − preferred − noncontrolling interests + cash) ÷ shares. P/E: multiple × target EPS.");
  note(ws, `B${ip + 6}`, "n/m = not meaningful (missing or negative earnings, or a multiple above 100x). Percentiles use the inclusive method (Excel QUARTILE, the same as QUARTILE.INC).");

  if (d.excluded.length) {
    const ex = ip + 9;
    label(ws, `B${ex}`, "Shown on the site but left out of the statistics", { bold: true });
    d.excluded.forEach((p, i) => writeRow(ex + 1 + i, p));
  }
  return wb;
}
