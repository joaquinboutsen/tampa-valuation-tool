import { buildCompsWorkbook, buildDcfWorkbook, type CompsExport, type DcfExport } from "@/lib/export/workbook";
import type { CompRow } from "@/lib/finance/comps";
import { PROJECTION_YEARS } from "@/lib/finance/dcf";
import { SITE } from "@/lib/site";

/**
 * Builds an Excel workbook from the model as it currently stands on the page
 * (including any edits the visitor made) and returns it as a download.
 * Nothing is stored: the request is turned into a file and forgotten.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 200_000;

class BadRequest extends Error {}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function num(v: unknown, name: string): number {
  if (!isNum(v)) throw new BadRequest(`"${name}" must be a number.`);
  return v;
}
const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);
function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function numArray(v: unknown, name: string, length: number): number[] {
  if (!Array.isArray(v) || v.length !== length) throw new BadRequest(`"${name}" must have ${length} values.`);
  return v.map((x, i) => num(x, `${name}[${i}]`));
}
function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadRequest(`"${name}" is missing.`);
  return v as Record<string, unknown>;
}

function parseDcf(p: Record<string, unknown>): DcfExport {
  const a = obj(p.assumptions, "assumptions");
  const w = obj(p.waccInputs, "waccInputs");
  const b = obj(p.bridge, "bridge");
  const derivations = Array.isArray(p.derivations) ? p.derivations.slice(0, 30) : [];
  return {
    ticker: str(p.ticker, 12).toUpperCase(),
    companyName: str(p.companyName),
    baseLabel: str(p.baseLabel, 40),
    yearLabels: Array.isArray(p.yearLabels) ? p.yearLabels.slice(0, PROJECTION_YEARS).map((x) => str(x, 40)) : [],
    assumptions: {
      baseRevenue: num(a.baseRevenue, "baseRevenue"),
      growth: numArray(a.growth, "growth", PROJECTION_YEARS),
      ebitdaMargin: numArray(a.ebitdaMargin, "ebitdaMargin", PROJECTION_YEARS),
      daPctRevenue: num(a.daPctRevenue, "daPctRevenue"),
      capexPctRevenue: num(a.capexPctRevenue, "capexPctRevenue"),
      nwcPctRevenue: num(a.nwcPctRevenue, "nwcPctRevenue"),
      taxRate: num(a.taxRate, "taxRate"),
      wacc: isNum(a.wacc) ? a.wacc : 0,
      terminalGrowth: num(a.terminalGrowth, "terminalGrowth"),
      exitMultiple: numOrNull(a.exitMultiple),
    },
    waccInputs: {
      riskFreeRate: num(w.riskFreeRate, "riskFreeRate"),
      beta: num(w.beta, "beta"),
      equityRiskPremium: num(w.equityRiskPremium, "equityRiskPremium"),
      preTaxCostOfDebt: num(w.preTaxCostOfDebt, "preTaxCostOfDebt"),
      taxRate: num(a.taxRate, "taxRate"),
      equityValue: num(w.equityValue, "equityValue"),
      debtValue: num(w.debtValue, "debtValue"),
    },
    bridge: {
      debt: num(b.debt, "debt"),
      preferred: num(b.preferred, "preferred"),
      noncontrollingInterest: num(b.noncontrollingInterest, "noncontrollingInterest"),
      cash: num(b.cash, "cash"),
      shares: numOrNull(b.shares),
    },
    currentPrice: numOrNull(p.currentPrice),
    derivations: derivations.map((d) => {
      const o = obj(d, "derivation");
      return { label: str(o.label, 80), how: str(o.how, 1500), judgment: o.judgment === true };
    }),
    riskFreeDate: str(p.riskFreeDate, 12) || null,
    balanceDate: str(p.balanceDate, 12) || null,
    generatedAt: new Date().toISOString(),
    siteUrl: SITE.url,
  };
}

function parseRow(v: unknown): CompRow {
  const o = obj(v, "company");
  return {
    ticker: str(o.ticker, 12).toUpperCase(),
    name: str(o.name),
    isFinancial: o.isFinancial === true,
    price: numOrNull(o.price),
    marketCap: numOrNull(o.marketCap),
    enterpriseValue: numOrNull(o.enterpriseValue),
    ltmLabel: str(o.ltmLabel, 40) || null,
    revenue: numOrNull(o.revenue),
    ebitda: numOrNull(o.ebitda),
    ebitdaMargin: numOrNull(o.ebitdaMargin),
    eps: numOrNull(o.eps),
    evRevenue: numOrNull(o.evRevenue),
    evEbitda: numOrNull(o.evEbitda),
    peLtm: numOrNull(o.peLtm),
    peForward: numOrNull(o.peForward),
    balanceDate: str(o.balanceDate, 12) || null,
    notes: [],
  };
}

function parseComps(p: Record<string, unknown>): CompsExport {
  const b = obj(p.basis, "basis");
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map(parseRow) : []);
  return {
    ticker: str(p.ticker, 12).toUpperCase(),
    target: parseRow(p.target),
    peers: list(p.peers),
    excluded: list(p.excluded),
    basis: {
      debt: num(b.debt, "debt"),
      preferred: num(b.preferred, "preferred"),
      noncontrollingInterest: num(b.noncontrollingInterest, "noncontrollingInterest"),
      cash: num(b.cash, "cash"),
      shares: numOrNull(b.shares),
    },
    provider: str(p.provider, 40) || "Finnhub",
    generatedAt: new Date().toISOString(),
    siteUrl: SITE.url,
  };
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new BadRequest("The request is too large.");
    const body = obj(JSON.parse(text), "body");
    const payload = obj(body.payload, "payload");
    const kind = body.kind;
    if (kind !== "dcf" && kind !== "comps") throw new BadRequest('"kind" must be "dcf" or "comps".');

    const wb = kind === "dcf" ? buildDcfWorkbook(parseDcf(payload)) : buildCompsWorkbook(parseComps(payload));
    const ticker = (str(payload.ticker, 12).toUpperCase().replace(/[^A-Z0-9-]/g, "") || "company").slice(0, 12);
    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${ticker}_${kind === "dcf" ? "DCF" : "trading_comps"}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const bad = e instanceof BadRequest || e instanceof SyntaxError;
    return Response.json({ error: bad ? (e as Error).message : "The file could not be created." }, { status: bad ? 400 : 500 });
  }
}
