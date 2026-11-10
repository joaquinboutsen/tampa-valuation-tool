/**
 * Reads the face of a financial statement from a filing.
 *
 * Every XBRL filing includes SEC-rendered pages (R1.htm, R2.htm, ...) for each
 * statement, listing every line exactly as it appears in the filing together
 * with its tag. We use the balance sheet page to find the debt lines, because
 * companies label debt in many different ways and the face of the balance
 * sheet is the one place where lines are guaranteed not to overlap.
 */
import type { DebtComponent } from "../types";

export interface ReportRow {
  prefix: string;
  name: string;
  label: string;
  values: (number | null)[];
  isAbstract: boolean;
  isTotal: boolean;
}

export interface ReportTable {
  title: string;
  /** Multiplier to convert displayed dollar values to dollars. */
  scale: number;
  columns: string[];
  rows: ReportRow[];
}

function stripTags(s: string): string {
  return s
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#39;/g, "'")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDisplayedNumber(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseScale(title: string): number {
  const m = /\$\s*in\s*(Thousands|Millions|Billions)/i.exec(title);
  if (!m) return 1;
  const w = m[1].toLowerCase();
  return w === "thousands" ? 1e3 : w === "millions" ? 1e6 : 1e9;
}

export function parseReportTable(html: string): ReportTable | null {
  const tStart = html.search(/<table[^>]*class="report"/i);
  if (tStart < 0) return null;
  const tEnd = html.indexOf("</table>", tStart);
  const table = html.slice(tStart, tEnd < 0 ? undefined : tEnd);
  const trs = table.split(/<tr[\s>]/i).slice(1);
  if (!trs.length) return null;

  let title = "";
  const columns: string[] = [];
  const rows: ReportRow[] = [];
  for (const tr of trs) {
    const classAttr = /^[^>]*class="([^"]*)"/.exec(tr)?.[1] ?? "";
    if (/<th[\s>]/i.test(tr)) {
      const ths = [...tr.matchAll(/<th[^>]*class="(tl|th)"[^>]*>([\s\S]*?)<\/th>/gi)];
      for (const th of ths) {
        if (th[1] === "tl") title = title || stripTags(th[2]);
        else {
          const txt = stripTags(th[2]);
          // Skip span headers such as "12 Months Ended".
          if (/\d{4}/.test(txt)) columns.push(txt);
        }
      }
      continue;
    }
    const ref = /defref_([A-Za-z0-9\-]+?)_([A-Za-z0-9_]+)'/.exec(tr);
    if (!ref) continue;
    const labelHtml = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(tr)?.[1] ?? "";
    const tds = [...tr.matchAll(/<td[^>]*class="(nump|num|text)"[^>]*>([\s\S]*?)<\/td>/gi)];
    const values = tds.map((td) => (td[1] === "text" ? null : parseDisplayedNumber(stripTags(td[2]))));
    rows.push({
      prefix: ref[1],
      name: ref[2],
      label: stripTags(labelHtml).replace(/:$/, ""),
      values,
      isAbstract: /Abstract$/.test(ref[2]) || values.every((v) => v === null),
      isTotal: /u$/.test(classAttr.trim()),
    });
  }
  return { title, scale: parseScale(title), columns, rows };
}

export interface ReportIndexEntry {
  shortName: string;
  file: string;
  category: string;
}

export function parseFilingSummary(xml: string): ReportIndexEntry[] {
  const out: ReportIndexEntry[] = [];
  for (const m of xml.matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g)) {
    const body = m[1];
    const get = (t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(body)?.[1]?.trim() ?? "";
    const file = get("HtmlFileName");
    if (!file) continue;
    out.push({ shortName: stripTags(get("ShortName")), file, category: get("MenuCategory") });
  }
  return out;
}

export function findBalanceSheetReport(reports: ReportIndexEntry[]): ReportIndexEntry | null {
  const re = /(balance sheet|financial position|financial condition|statements? of condition)/i;
  const candidates = reports.filter((r) => re.test(r.shortName) && !/parenthetical/i.test(r.shortName));
  return candidates.find((r) => r.category === "Statements") ?? candidates[0] ?? null;
}

const DEBT_RE =
  /(Debt|Borrowing|NotesPayable|LoansPayable|NotesAndLoansPayable|CommercialPaper|LineOfCredit|LinesOfCredit|ConvertibleNotes|SeniorNotes|SubordinatedNotes|BankLoans|TermLoan|Debentures|CreditFacilit|FinanceLeaseLiabilit|CapitalLeaseObligation|BankOverdraft)/i;
const NOT_DEBT_RE =
  /(OperatingLease|Interest|IssuanceCost|Derivative|Receivable|Deferred|Unamortized|DebtSecurities|Investment|Asset|Restricted|Accrued|HeldForSale|AvailableForSale|Extinguishment|Deposit|Guarantee|Abstract)/i;

/** Lines on the face of the balance sheet that represent interest-bearing debt. */
export function extractDebtFromBalanceSheet(table: ReportTable, columnIndex = 0): DebtComponent[] {
  const rows = table.rows;
  const assetsIdx = rows.findIndex((r) => r.name === "Assets");
  const liabStart = assetsIdx >= 0 ? assetsIdx + 1 : Math.max(0, rows.findIndex((r) => /^Liabilities/.test(r.name)));
  // Stop where the liabilities section ends, so equity lines are never read as debt.
  const SECTION_END = /^(Liabilities|LiabilitiesAndStockholdersEquity|CommitmentsAndContingencies|MinorityInterest)$|^(StockholdersEquity|TemporaryEquity|RedeemableNoncontrolling|CommonStock|PreferredStock|PartnersCapital|MembersEquity)|EquityAbstract$/;
  let liabEnd = rows.length;
  for (let i = liabStart; i < rows.length; i++) {
    if (SECTION_END.test(rows[i].name)) {
      liabEnd = i;
      break;
    }
  }
  const picked: DebtComponent[] = [];
  for (let i = liabStart; i < liabEnd; i++) {
    const r = rows[i];
    if (r.isAbstract) continue;
    if (!DEBT_RE.test(r.name) || NOT_DEBT_RE.test(r.name)) continue;
    const v = r.values[columnIndex];
    if (v === null || v === undefined) continue;
    picked.push({ label: r.label, tag: `${r.prefix}:${r.name}`, value: v * table.scale });
  }
  // Remove totals that duplicate their own components.
  const names = new Set(picked.map((p) => p.tag.split(":")[1]));
  const drop = new Set<string>();
  if (names.has("LongTermDebt") && (names.has("LongTermDebtNoncurrent") || names.has("LongTermDebtCurrent"))) drop.add("LongTermDebt");
  if (names.has("DebtCurrent") && names.has("LongTermDebtCurrent") && names.has("ShortTermBorrowings")) drop.add("DebtCurrent");
  if (names.has("DebtLongtermAndShorttermCombinedAmount") && names.size > 1) drop.add("DebtLongtermAndShorttermCombinedAmount");
  return picked.filter((p) => !drop.has(p.tag.split(":")[1]));
}

/** Converts an SEC column header such as "Aug. 31, 2026" to "2026-08-31". */
export function parseHeaderDate(text: string): string | null {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})/.exec(text);
  if (!m) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mi = months.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
