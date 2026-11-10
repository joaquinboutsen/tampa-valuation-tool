/**
 * Assembles everything the site shows for one company from SEC filings:
 * profile, financial statements, debt, segments and data-quality checks.
 * Market data (price etc.) is fetched separately because it changes faster.
 */
import type { CompanyPackage, CompanyProfile, DebtSummary, FilingRef, Financials, SegmentData } from "./types";
import { archiveBase, pad10, secFetch, secJson, secText, SecError } from "./sec/client";
import { isFinancialSic } from "./sec/concepts";
import { extractBusinessDescription } from "./sec/description";
import { buildFinancials, debtFromTags, filingIndexUrl, type CompanyFacts } from "./sec/facts";
import { extractSegmentRevenue } from "./sec/segments";
import {
  extractDebtFromBalanceSheet,
  findBalanceSheetReport,
  parseFilingSummary,
  parseHeaderDate,
  parseReportTable,
} from "./sec/statements";
import { findFiling, getSubmissions, listFilings, type Submissions } from "./sec/submissions";
import { lookupTicker, normalizeTicker } from "./sec/tickers";
import { runChecks } from "./finance/checks";

export type CompanyErrorCode = "not-found" | "unsupported" | "upstream";

export class CompanyError extends Error {
  constructor(
    public code: CompanyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/* --------------------------------- debt --------------------------------- */

async function loadDebt(cf: CompanyFacts, fin: Financials): Promise<DebtSummary> {
  const bs = fin.latestBalance;
  if (!bs) return { total: null, components: [], method: "none", asOf: null, source: null, note: "No balance sheet was found in the SEC data." };
  const source = {
    tag: "Balance sheet (face of statement)",
    form: bs.form,
    accn: bs.accn,
    filed: "",
    end: bs.date,
    url: bs.url,
  };
  try {
    const base = archiveBase(cf.cik, bs.accn);
    const reports = parseFilingSummary(await secText(`${base}/FilingSummary.xml`, { revalidate: 86_400 }));
    const report = findBalanceSheetReport(reports);
    if (!report) throw new Error("no balance sheet report");
    const table = parseReportTable(await secText(`${base}/${report.file}`, { revalidate: 86_400 }));
    if (!table) throw new Error("unreadable balance sheet");
    const col = table.columns.findIndex((c) => parseHeaderDate(c) === bs.date);
    if (col < 0) throw new Error("balance sheet date not found");
    const components = extractDebtFromBalanceSheet(table, col);
    return {
      total: components.reduce((s, c) => s + c.value, 0),
      components,
      method: "face",
      asOf: bs.date,
      source: { ...source, url: `${base}/${report.file}` },
      note: components.length
        ? "Sum of the debt lines shown on the face of the balance sheet. Finance leases are included only if the company shows them as a debt line; operating leases are excluded."
        : "No debt lines appear on the face of the balance sheet, so debt is treated as zero.",
    };
  } catch {
    const components = debtFromTags(cf, bs.date);
    if (!components.length) {
      return {
        total: null,
        components: [],
        method: "none",
        asOf: bs.date,
        source,
        note: "Not available: the balance sheet page could not be read and no standard debt tags were found.",
      };
    }
    return {
      total: components.reduce((s, c) => s + c.value, 0),
      components,
      method: "tags",
      asOf: bs.date,
      source,
      note: "The balance sheet page could not be read, so debt is built from standard XBRL debt tags. Treat with more caution than usual.",
    };
  }
}

/* ------------------------------- segments ------------------------------- */

interface FilingIndex {
  directory: { item: { name: string; size?: string }[] };
}

async function loadSegments(cik: number, tenK: FilingRef | null, fin: Financials): Promise<SegmentData> {
  const none = (reason: string): SegmentData => ({ available: false, reason, segments: [], reconciling: [], total: null, filingUrl: tenK?.indexUrl });
  const fy = fin.fiscalYears[fin.fiscalYears.length - 1];
  if (!tenK || !fy || !fy.start) return none("No 10-K was found for this company.");
  try {
    const base = archiveBase(cik, tenK.accn);
    const idx = await secJson<FilingIndex>(`${base}/index.json`, { revalidate: 86_400 });
    const inst = idx.directory.item.find((i) => /_htm\.xml$/i.test(i.name));
    if (!inst) return none("The 10-K does not include a readable XBRL data file.");
    if (Number(inst.size ?? 0) > 30_000_000) return none("The 10-K's data file is too large to read on this free hosting plan.");
    const xml = await secText(`${base}/${inst.name}`, { timeoutMs: 25_000 });
    const result = extractSegmentRevenue(xml, { start: fy.start, end: fy.end });
    return { ...result, filingUrl: tenK.indexUrl };
  } catch {
    return none("The 10-K's data file could not be downloaded from the SEC.");
  }
}

/* ----------------------------- description ------------------------------ */

/** Downloads only as much of the 10-K as needed to reach Item 1. */
async function readPartial(url: string, maxBytes: number): Promise<string> {
  const res = await secFetch(url, { timeoutMs: 25_000 });
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const decoder = new TextDecoder();
  let text = "";
  let headerEnd = -1;
  while (text.length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (headerEnd < 0) headerEnd = text.indexOf("</ix:header>");
    // Item 1 normally begins within ~1 MB of HTML after the hidden XBRL header.
    if (headerEnd >= 0 && text.length - headerEnd > 1_500_000) break;
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

async function loadDescription(tenK: FilingRef | null): Promise<CompanyProfile["description"]> {
  if (!tenK) return { text: null, source: "Not available: no 10-K found." };
  try {
    const html = await readPartial(tenK.url, 12_000_000);
    const text = extractBusinessDescription(html);
    if (!text) return { text: null, source: "Not available: the Item 1 business description could not be located in the 10-K.", url: tenK.url };
    return { text, source: `Excerpt from Item 1 of the 10-K filed ${tenK.filed}`, url: tenK.url };
  } catch {
    return { text: null, source: "Not available: the 10-K document could not be downloaded.", url: tenK.url };
  }
}

/* --------------------------------- main --------------------------------- */

function pickTenK(sub: Submissions, fin: Financials): FilingRef | null {
  const tenKs = listFilings(sub, ["10-K", "10-KT"]);
  const fy = fin.fiscalYears[fin.fiscalYears.length - 1];
  return tenKs.find((f) => fy && f.reportDate === fy.end) ?? tenKs[0] ?? null;
}

export interface BuildOptions {
  /**
   * Light mode skips the business description and segment data (two large
   * downloads). Used for peers in the comps table, where only the financials,
   * debt and share count are needed.
   */
  light?: boolean;
}

export async function buildCompanyPackage(rawTicker: string, opts: BuildOptions = {}): Promise<CompanyPackage> {
  let entry;
  try {
    entry = await lookupTicker(rawTicker);
  } catch (e) {
    throw new CompanyError("upstream", e instanceof SecError ? e.message : "Could not load the SEC ticker list.");
  }
  if (!entry) {
    throw new CompanyError("not-found", `"${normalizeTicker(rawTicker)}" is not in the SEC's list of US-listed company tickers.`);
  }
  const cik = entry.cik;

  let sub: Submissions;
  let cf: CompanyFacts;
  try {
    [sub, cf] = await Promise.all([
      getSubmissions(cik),
      secJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`, { timeoutMs: 30_000 }),
    ]);
  } catch (e) {
    if (e instanceof SecError && e.status === 404) {
      throw new CompanyError("unsupported", `${entry.name} has no structured financial data on file with the SEC (it may be a fund, a trust, or a very recent listing).`);
    }
    throw new CompanyError("upstream", e instanceof SecError ? e.message : "The SEC data service could not be reached.");
  }

  const fin = buildFinancials(cf);
  if (!fin.fiscalYears.length) {
    const foreign = !cf.facts?.["us-gaap"];
    throw new CompanyError(
      "unsupported",
      foreign
        ? `${entry.name} is a foreign filer that reports under IFRS (forms 20-F / 40-F). This tool only supports companies that file a US GAAP annual report (10-K).`
        : `${entry.name} has not filed an annual report (10-K) with US GAAP financial data yet, so there is nothing to analyze. This is common for recent IPOs.`,
    );
  }

  const latest10K = pickTenK(sub, fin);
  const latest10Q = listFilings(sub, ["10-Q"])[0] ?? null;
  // Point the balance sheet source at the filing itself where we can.
  if (fin.latestBalance) {
    const f = findFiling(sub, fin.latestBalance.accn);
    fin.latestBalance.url = f?.indexUrl ?? filingIndexUrl(cik, fin.latestBalance.accn);
  }

  const skipped = "Not loaded for peer companies.";
  const [debt, segments, description] = await Promise.all([
    loadDebt(cf, fin),
    opts.light
      ? Promise.resolve<SegmentData>({ available: false, reason: skipped, segments: [], reconciling: [], total: null })
      : loadSegments(cik, latest10K, fin),
    opts.light ? Promise.resolve<CompanyProfile["description"]>({ text: null, source: skipped }) : loadDescription(latest10K),
  ]);

  const profile: CompanyProfile = {
    ticker: entry.ticker,
    cik,
    name: sub.name || entry.name,
    sic: sub.sic ?? "",
    sicDescription: sub.sicDescription ?? "",
    exchanges: (sub.exchanges ?? []).filter(Boolean),
    city: sub.addresses?.business?.city ?? "",
    state: sub.addresses?.business?.stateOrCountry ?? "",
    fiscalYearEnd: sub.fiscalYearEnd ?? "",
    stateOfIncorporation: sub.stateOfIncorporation ?? "",
    category: sub.category ?? "",
    website: sub.website || undefined,
    isFinancial: isFinancialSic(sub.sic),
    description,
    latest10K,
    latest10Q,
  };

  const today = new Date().toISOString().slice(0, 10);
  const checks = runChecks(fin, segments, { today });

  return { profile, financials: fin, debt, segments, checks, generatedAt: new Date().toISOString() };
}
