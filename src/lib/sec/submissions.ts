/** Company profile and list of filings, from the SEC "submissions" file. */
import type { FilingRef } from "../types";
import { archiveBase, pad10, secJson } from "./client";

export interface Submissions {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  exchanges: string[];
  fiscalYearEnd: string | null;
  stateOfIncorporation: string | null;
  category: string | null;
  website?: string | null;
  addresses?: { business?: { city?: string | null; stateOrCountry?: string | null } };
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

export async function getSubmissions(cik: number): Promise<Submissions> {
  return secJson<Submissions>(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`, { revalidate: 6 * 3600 });
}

export function listFilings(sub: Submissions, forms: string[]): FilingRef[] {
  const r = sub.filings.recent;
  const cik = Number(sub.cik);
  const out: FilingRef[] = [];
  for (let i = 0; i < r.form.length; i++) {
    if (!forms.includes(r.form[i])) continue;
    const accn = r.accessionNumber[i];
    const base = archiveBase(cik, accn);
    out.push({
      form: r.form[i],
      accn,
      filed: r.filingDate[i],
      reportDate: r.reportDate[i],
      primaryDocument: r.primaryDocument[i],
      url: `${base}/${r.primaryDocument[i]}`,
      indexUrl: `${base}/${accn}-index.htm`,
    });
  }
  return out; // newest first, as provided by the SEC
}

export function findFiling(sub: Submissions, accn: string): FilingRef | null {
  const r = sub.filings.recent;
  const i = r.accessionNumber.indexOf(accn);
  if (i < 0) return null;
  const cik = Number(sub.cik);
  const base = archiveBase(cik, accn);
  return {
    form: r.form[i],
    accn,
    filed: r.filingDate[i],
    reportDate: r.reportDate[i],
    primaryDocument: r.primaryDocument[i],
    url: `${base}/${r.primaryDocument[i]}`,
    indexUrl: `${base}/${accn}-index.htm`,
  };
}
