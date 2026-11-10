import type { Metadata } from "next";
import ChecksPanel from "@/components/company/ChecksPanel";
import EvBridgeCard from "@/components/company/EvBridgeCard";
import FinancialTable, { SourceList } from "@/components/company/FinancialTable";
import { RangeBar, Tile } from "@/components/company/Tiles";
import { getMarketData } from "@/lib/cached";
import { sharesCheck } from "@/lib/finance/checks";
import { buildValuationSnapshot } from "@/lib/finance/snapshot";
import { buildSummary } from "@/lib/finance/summary";
import { autoDecimals, fmtCompact, fmtDate, fmtM, fmtMultiple, fmtPct, fmtPrice } from "@/lib/format";
import { normalizeTicker } from "@/lib/sec/tickers";
import { CompanyHeader, resolveCompany } from "./shared";

/**
 * Rendered on each visit from cached data (SEC data: 6 hours; market data:
 * 15 minutes). The page itself is not cached, so a temporary data-source
 * failure is never frozen into it.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ticker } = await params;
  const t = normalizeTicker(decodeURIComponent(ticker));
  return { title: `${t} valuation`, description: `Company snapshot, enterprise value bridge and data-quality checks for ${t}, built from SEC filings.` };
}

export default async function CompanyPage({ params }: Params) {
  const { ticker: raw } = await params;
  const resolved = await resolveCompany(raw);
  if (!resolved.ok) return resolved.notice;
  const { ticker, pkg } = resolved;

  const market = await getMarketData(ticker);
  const snap = buildValuationSnapshot(pkg, market);
  const { profile, financials: fin } = pkg;
  const summary = buildSummary(fin, { financial: profile.isFinancial });
  const revenueRow = fin.income.find((r) => r.key === "revenue");
  const decimals = autoDecimals([...(revenueRow?.values.map((c) => c.value) ?? []), snap.bridge.marketCap]);
  const checks = [...pkg.checks];
  if (market.available) checks.push(sharesCheck(fin.coverShares.value, fin.coverShares.asOf, market.providerShares, market.provider));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <CompanyHeader pkg={pkg} active="snapshot" />

      {/* Description */}
      <div className="mt-5 border-l-2 border-gold pl-4">
        {profile.description.text ? (
          <p className="text-[15px] leading-relaxed">&ldquo;{profile.description.text}&rdquo;</p>
        ) : (
          <p className="text-sm text-muted">Business description not available.</p>
        )}
        <p className="mt-1 text-xs text-muted">
          {profile.description.url ? (
            <a className="link" href={profile.description.url} target="_blank" rel="noopener noreferrer">
              {profile.description.source}
            </a>
          ) : (
            profile.description.source
          )}
          {profile.latest10Q ? (
            <>
              {" · "}
              <a className="link" href={profile.latest10Q.url} target="_blank" rel="noopener noreferrer">
                Latest 10-Q (filed {fmtDate(profile.latest10Q.filed)})
              </a>
            </>
          ) : null}
        </p>
      </div>

      {profile.isFinancial && (
        <div className="mt-5 card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
          <span className="font-semibold text-navy">Financial institution: equity-only view.</span> For banks, brokers and insurers, debt is a raw
          material of the business rather than a financing choice, and interest is an operating cost. Enterprise value, EBITDA and an unlevered
          DCF therefore do not have a clear meaning, so this page shows equity-based measures (P/E and price-to-book) instead.
        </div>
      )}
      {!market.available && (
        <div className="mt-5 card border-l-4 !border-l-fail px-4 py-3 text-sm">
          <span className="font-semibold">Market data not available.</span> {market.reason} Financial statements below are unaffected; price-based
          figures show as n/a.
        </div>
      )}
      {fin.warnings.map((w) => (
        <div key={w} className="mt-5 card border-l-4 !border-l-fail px-4 py-3 text-sm">
          {w}
        </div>
      ))}

      {/* Headline tiles */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Share price"
          value={fmtPrice(market.price)}
          sub={
            market.available ? (
              <>
                {market.provider}, {market.priceTime ? fmtDate(market.priceTime) : "latest"}
                <RangeBar low={market.low52} high={market.high52} price={market.price} />
                {market.low52 !== null && market.high52 !== null ? <span className="text-[11px]">52-week range</span> : null}
              </>
            ) : (
              "Not available"
            )
          }
        />
        <Tile label="Market cap" value={fmtCompact(snap.bridge.marketCap)} sub="Price × shares outstanding" />
        {profile.isFinancial ? (
          <>
            <Tile label="P / E (LTM)" value={fmtMultiple(snap.multiples.pe)} sub={snap.ltm.eps !== null ? `LTM diluted EPS $${snap.ltm.eps.toFixed(2)}` : "EPS not available"} />
            <Tile label="Price / book" value={fmtMultiple(snap.multiples.priceToBook, 2)} sub={`Book equity ${fmtCompact(snap.bookEquity)}`} />
          </>
        ) : (
          <>
            <Tile label="Enterprise value" value={fmtCompact(snap.bridge.enterpriseValue)} sub={`Net debt ${fmtCompact(snap.bridge.netDebt)}`} />
            <Tile
              label="EV / LTM EBITDA"
              value={fmtMultiple(snap.multiples.evEbitda)}
              sub={snap.ltm.ebitda !== null && snap.ltm.ebitda <= 0 ? "Not meaningful: EBITDA is negative" : `EV / LTM revenue ${fmtMultiple(snap.multiples.evRevenue)}`}
            />
          </>
        )}
        <Tile label={`Revenue (${fin.ltm?.label ?? "LTM"})`} value={fmtCompact(snap.ltm.revenue)} />
        {profile.isFinancial ? (
          <Tile label="Net income (LTM)" value={fmtCompact(snap.ltm.netIncome)} />
        ) : (
          <Tile label="EBITDA (LTM)" value={fmtCompact(snap.ltm.ebitda)} sub={snap.ltm.ebitdaMargin !== null ? `${fmtPct(snap.ltm.ebitdaMargin)} margin, unadjusted` : undefined} />
        )}
        {!profile.isFinancial && (
          <Tile label="P / E (LTM)" value={fmtMultiple(snap.multiples.pe)} sub={snap.ltm.eps !== null ? `LTM diluted EPS ${snap.ltm.eps < 0 ? "−" : ""}$${Math.abs(snap.ltm.eps).toFixed(2)}` : "EPS not available"} />
        )}
        <Tile label="Beta" value={market.beta !== null ? market.beta.toFixed(2) : "n/a"} sub={market.beta !== null ? `Per ${market.provider}` : "Not available"} />
      </div>

      {/* Section links */}
      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm border-y border-line py-2">
        {!profile.isFinancial && (
          <a href="#bridge" className="link">
            Enterprise value bridge
          </a>
        )}
        <a href="#financials" className="link">
          Financial summary
        </a>
        {pkg.segments.available && (
          <a href="#segments" className="link">
            Segments
          </a>
        )}
        <a href="#quality" className="link">
          Data quality
        </a>
      </nav>

      {/* EV bridge */}
      {!profile.isFinancial && (
        <section id="bridge" className="mt-8 scroll-mt-4">
          <h2 className="section-title">Equity value to enterprise value</h2>
          <div className="grid lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <EvBridgeCard pkg={pkg} market={market} bridge={snap.bridge} shares={snap.shares} decimals={decimals} />
            </div>
            <div className="lg:col-span-2 text-sm text-muted leading-relaxed space-y-3">
              <p>
                <span className="font-semibold text-ink">Why bridge to enterprise value?</span> Market cap is what the equity is worth. Enterprise
                value is what the whole operating business is worth to everyone who funds it, so claims that rank ahead of common shareholders
                (debt, preferred stock, minority interests) are added and cash is subtracted.
              </p>
              <p>
                Multiples built on revenue, EBITDA or EBIT use enterprise value, because those figures are earned before interest is paid to
                lenders. P/E uses equity value, because net income belongs to shareholders only.
              </p>
              <table className="w-full text-sm text-ink">
                <tbody>
                  <tr className="border-t border-line">
                    <td className="py-1.5">EV / LTM revenue</td>
                    <td className="num py-1.5">{fmtMultiple(snap.multiples.evRevenue)}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="py-1.5">EV / LTM EBITDA</td>
                    <td className="num py-1.5">{fmtMultiple(snap.multiples.evEbitda)}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="py-1.5">EV / LTM EBIT</td>
                    <td className="num py-1.5">{fmtMultiple(snap.multiples.evEbit)}</td>
                  </tr>
                  <tr className="border-y border-line">
                    <td className="py-1.5">P / E (LTM)</td>
                    <td className="num py-1.5">{fmtMultiple(snap.multiples.pe)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs">n/m = not meaningful (the earnings measure is zero or negative).</p>
            </div>
          </div>
        </section>
      )}

      {/* Financial summary */}
      <section id="financials" className="mt-10 scroll-mt-4">
        <h2 className="section-title">Financial summary</h2>
        <div className="card p-2 sm:p-4">
          <FinancialTable rows={summary.income} years={fin.fiscalYears} ltm={fin.ltm} decimals={decimals} />
        </div>
        <SourceList rows={summary.income} />
        <h3 className="mt-6 mb-2 text-lg font-semibold text-navy">Cash flow</h3>
        <div className="card p-2 sm:p-4">
          <FinancialTable rows={summary.cashflow} years={fin.fiscalYears} ltm={fin.ltm} decimals={decimals} />
        </div>
        <SourceList rows={summary.cashflow} />
        <p className="mt-3 text-xs text-muted leading-relaxed">
          Source: SEC EDGAR XBRL data from the company&rsquo;s 10-K and 10-Q filings. Where a period has been restated, the most recently filed
          figure is shown. {fin.ltm ? `LTM basis: ${fin.ltm.basis}` : ""} EBITDA is operating income plus depreciation and amortization, with no
          adjustments, so it will differ from a company&rsquo;s own &ldquo;adjusted EBITDA&rdquo;. Hover over any figure to see its tag and filing.
        </p>
      </section>

      {/* Segments */}
      {pkg.segments.available && (
        <section id="segments" className="mt-10 scroll-mt-4">
          <h2 className="section-title">Segment revenue</h2>
          <div className="card p-2 sm:p-4 max-w-2xl">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>{fin.fiscalYears[fin.fiscalYears.length - 1]?.label}, $ in millions</th>
                  <th>Revenue</th>
                  <th>% of total</th>
                </tr>
              </thead>
              <tbody>
                {[...pkg.segments.segments, ...pkg.segments.reconciling].map((s) => (
                  <tr key={s.member}>
                    <td>{s.label}</td>
                    <td className="num">{fmtM(s.value, decimals)}</td>
                    <td className="num">{pkg.segments.total ? fmtPct(s.value / pkg.segments.total) : "–"}</td>
                  </tr>
                ))}
                <tr className="total rule">
                  <td>Consolidated revenue</td>
                  <td className="num">{fmtM(pkg.segments.total, decimals)}</td>
                  <td className="num">{pkg.segments.total ? "100.0%" : "–"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted leading-relaxed">
            Source: XBRL segment data in the{" "}
            {pkg.segments.filingUrl ? (
              <a className="link" href={pkg.segments.filingUrl} target="_blank" rel="noopener noreferrer">
                latest 10-K
              </a>
            ) : (
              "latest 10-K"
            )}
            . Segment names are the company&rsquo;s own data labels, lightly reformatted.
          </p>
        </section>
      )}

      {/* Data quality */}
      <section id="quality" className="mt-10 scroll-mt-4">
        <h2 className="section-title">Data quality checks</h2>
        <p className="text-sm text-muted mb-3 max-w-3xl leading-relaxed">
          Before trusting any spread, an analyst ties it out. These checks run automatically on the filing data behind this page and show the
          exact figures, so anything that does not reconcile is visible rather than hidden.
        </p>
        <ChecksPanel checks={checks} />
      </section>

      <p className="mt-8 text-xs text-muted">
        SEC data retrieved {fmtDate(pkg.generatedAt)} and refreshed every 6 hours; market data refreshed every 15 minutes. Educational use only,
        not investment advice.
      </p>
    </div>
  );
}
