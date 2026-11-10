import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { getCompanyPackage } from "@/lib/cached";
import { CompanyError } from "@/lib/company";
import { isValidTickerFormat, normalizeTicker } from "@/lib/sec/tickers";
import type { CompanyPackage } from "@/lib/types";

export type TabKey = "snapshot" | "comps" | "dcf";

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <h1 className="text-2xl font-semibold text-navy">{title}</h1>
      <div className="mt-3 text-muted leading-relaxed">{children}</div>
      <div className="mt-6">
        <SearchBox autoFocus />
      </div>
      <p className="mt-4 text-sm">
        <Link href="/" className="link">
          Back to the home page
        </Link>
      </p>
    </div>
  );
}

type Resolved = { ok: true; ticker: string; pkg: CompanyPackage } | { ok: false; notice: React.ReactElement };

/** Loads the company for a page, or returns a plain-English notice to show instead. */
export async function resolveCompany(rawParam: string): Promise<Resolved> {
  const decoded = decodeURIComponent(rawParam);
  if (!isValidTickerFormat(decoded)) {
    return {
      ok: false,
      notice: (
        <Notice title="That does not look like a ticker">
          Tickers are 1 to 5 letters, such as JBL or MSFT. Try searching by company name instead.
        </Notice>
      ),
    };
  }
  const ticker = normalizeTicker(decoded);
  try {
    return { ok: true, ticker, pkg: await getCompanyPackage(ticker) };
  } catch (e) {
    if (e instanceof CompanyError && e.code === "not-found") {
      return {
        ok: false,
        notice: (
          <Notice title={`No US-listed company found for "${ticker}"`}>
            {e.message} Check the spelling, or search by company name below.
          </Notice>
        ),
      };
    }
    if (e instanceof CompanyError && e.code === "unsupported") {
      return { ok: false, notice: <Notice title={`${ticker} is not supported`}>{e.message}</Notice> };
    }
    // Temporary upstream problems are not cached: the error page offers a retry.
    throw e;
  }
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 2 && w !== "st" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\bSt\b/, "St.");
}

const TABS: { key: TabKey; label: string; path: string }[] = [
  { key: "snapshot", label: "Snapshot", path: "" },
  { key: "comps", label: "Trading comps", path: "/comps" },
  { key: "dcf", label: "DCF", path: "/dcf" },
];

/** Company name, key facts, search box and the tab bar shared by every company page. */
export function CompanyHeader({ pkg, active }: { pkg: CompanyPackage; active: TabKey }) {
  const p = pkg.profile;
  const fye = p.fiscalYearEnd && p.fiscalYearEnd.length === 4 ? `${p.fiscalYearEnd.slice(0, 2)}/${p.fiscalYearEnd.slice(2)}` : null;
  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted">
            {p.exchanges[0] ? `${p.exchanges[0]}: ` : ""}
            {p.ticker}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold text-navy leading-tight">{p.name}</h1>
          <div className="mt-1 text-sm text-muted">
            {[p.city && `${titleCase(p.city)}, ${p.state}`, p.sicDescription, fye && `Fiscal year ends ${fye}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="w-full lg:w-80 shrink-0">
          <SearchBox compact />
        </div>
      </div>
      <nav className="mt-5 flex gap-1 border-b border-line overflow-x-auto" aria-label="Valuation sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/company/${p.ticker}${t.path}`}
            aria-current={t.key === active ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              t.key === active ? "border-gold text-navy" : "border-transparent text-muted hover:text-navy"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <span className="px-4 py-2 text-sm text-muted/70 whitespace-nowrap">Football field · Merger model (next release)</span>
      </nav>
    </>
  );
}
