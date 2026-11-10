import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology",
  description: "Every formula, data source and limitation behind the valuation toolkit, in plain English.",
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-4">
      <h2 className="section-title">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="card px-4 py-3 font-mono text-[13px] leading-relaxed overflow-x-auto whitespace-pre">{children}</div>;
}

export default function Methodology() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="text-3xl sm:text-4xl font-semibold text-navy">Methodology</h1>
      <p className="mt-3 text-muted leading-relaxed">
        How every number on this site is sourced and calculated, and where the approach falls short. The methods are deliberately the
        standard textbook ones, so each can be explained and defended without notes.
      </p>
      <nav className="mt-4 text-sm flex flex-wrap gap-x-4 gap-y-1">
        {[
          ["sources", "Data sources"],
          ["statements", "Financial statements"],
          ["ltm", "LTM"],
          ["ebitda", "EBITDA"],
          ["ev", "Enterprise value"],
          ["multiples", "Multiples"],
          ["quality", "Data quality checks"],
          ["financials", "Financial institutions"],
          ["limits", "Limitations"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="link">
            {label}
          </a>
        ))}
      </nav>

      <Section id="sources" title="Data sources">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Financial statements: SEC EDGAR.</span> Public companies file their statements with the SEC in a
            structured format (XBRL) in which every line carries a standard label, or &ldquo;tag&rdquo;. This site reads that data directly from
            the SEC&rsquo;s official, free interface. Requests identify the site owner and stay under the SEC&rsquo;s limit of 10 requests per
            second, as its fair-access policy requires.
          </li>
          <li>
            <span className="font-semibold">Market data: Finnhub.</span> Share price, 52-week high and low, beta and the provider&rsquo;s share
            count come from Finnhub, a commercial market-data service, through an official API key. Quotes on the free tier can be delayed.
          </li>
          <li>
            <span className="font-semibold">Business description.</span> A short excerpt quoted word for word from Item 1 of the latest 10-K. It
            is not summarized or rewritten.
          </li>
          <li>
            <span className="font-semibold">Caching.</span> SEC data for a company is stored for 6 hours and market data for 15 minutes. Filings
            change roughly every 90 days, so this keeps pages fast and well inside each provider&rsquo;s limits without making the numbers stale.
          </li>
        </ul>
        <p>
          No figure is typed in by hand. Where the data does not exist or cannot be read reliably, the page shows &ldquo;n/a&rdquo; and says why.
        </p>
      </Section>

      <Section id="statements" title="Building the financial statements">
        <p>
          Companies may choose between several standard tags for the same idea. Revenue, for instance, may be tagged
          &ldquo;Revenues&rdquo; or &ldquo;RevenueFromContractWithCustomerExcludingAssessedTax&rdquo;. For each line item the tool holds an ordered
          list of acceptable tags and applies three rules:
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Fiscal years are the roughly twelve-month periods reported in the company&rsquo;s 10-K filings. The latest five are shown.</li>
          <li>
            If a period was reported more than once (the prior year appears again in each new 10-K, sometimes restated), the most recently filed
            figure is used.
          </li>
          <li>If two acceptable tags both have a value filed on the same date, the one higher in the priority list is used.</li>
        </ol>
        <p>
          Columns are labelled by the month the fiscal year ends (for example &ldquo;FY Aug-2026&rdquo; for Jabil), because companies number
          their fiscal years inconsistently.
        </p>
      </Section>

      <Section id="ltm" title="Last twelve months (LTM)">
        <p>LTM brings annual figures up to the latest quarter, so that companies with different year-ends can be compared on the same footing.</p>
        <Formula>{`LTM = latest fiscal year
    + current year-to-date (from the latest 10-Q)
    − the same year-to-date period one year earlier`}</Formula>
        <p>
          All three pieces must come from the same tag, otherwise the LTM figure is shown as not available. If no 10-Q has been filed since the
          latest 10-K, LTM simply equals the fiscal year. LTM earnings per share is built the same way, which is the usual approximation.
          Balance sheet items are not flows, so the latest balance sheet is used as is.
        </p>
      </Section>

      <Section id="ebitda" title="EBITDA">
        <Formula>{`EBITDA = operating income (EBIT) + depreciation and amortization`}</Formula>
        <p>
          Operating income is taken from the income statement and depreciation and amortization from the cash flow statement. If a company
          does not report a combined D&amp;A figure, depreciation and amortization of intangibles are added together and the line is marked as
          derived.
        </p>
        <p>
          <span className="font-semibold">This is unadjusted EBITDA.</span> It does not add back restructuring charges, impairments,
          stock-based compensation or other items that companies and analysts often exclude. It will therefore usually be lower than a
          company&rsquo;s own &ldquo;adjusted EBITDA&rdquo;, and lower than figures on Bloomberg or FactSet. The trade-off is deliberate:
          adjustments require judgment and are not available as structured data, while this definition is fully reproducible from the filing.
        </p>
      </Section>

      <Section id="ev" title="Equity value to enterprise value">
        <Formula>{`Equity value (market cap) = share price × shares outstanding

Enterprise value = equity value
                 + total debt
                 + preferred stock
                 + noncontrolling interests
                 − cash and short-term investments`}</Formula>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Shares outstanding</span> come from the cover page of the latest 10-K or 10-Q, which states the count
            on a specific recent date. This is a basic share count: dilution from options and restricted stock is not added, because option
            tables are not available as structured data. If the cover-page count is missing or more than 5% away from the market-data
            provider&rsquo;s count (typical of companies with several share classes), the provider&rsquo;s total is used and the page says so.
          </li>
          <li>
            <span className="font-semibold">Debt</span> is the sum of the debt lines on the face of the latest balance sheet: short-term
            borrowings, current portion of long-term debt, long-term debt and, where the company shows them as debt, finance leases. Each line
            is listed in the bridge with the company&rsquo;s own label. Reading the face of the balance sheet avoids double counting, because
            lines there never overlap. Debt is at book value, the usual approximation of market value.
          </li>
          <li>
            <span className="font-semibold">Operating leases are excluded</span> from debt. Under US accounting rules, rent on operating leases
            is an operating expense, so EBITDA is already stated after it. Adding the lease liability to enterprise value would count the same
            obligation twice.
          </li>
          <li>
            <span className="font-semibold">Cash</span> is cash and equivalents plus short-term investments. Long-term investments are not
            deducted.
          </li>
          <li>
            <span className="font-semibold">Timing.</span> Market cap is as of the quote; balance sheet items are as of the latest filed quarter.
            This mismatch is standard practice.
          </li>
        </ul>
      </Section>

      <Section id="multiples" title="Multiples">
        <Formula>{`EV / Revenue = enterprise value ÷ LTM revenue
EV / EBITDA  = enterprise value ÷ LTM EBITDA
EV / EBIT    = enterprise value ÷ LTM operating income
P / E        = share price ÷ LTM diluted EPS`}</Formula>
        <p>
          Enterprise value is paired with measures earned before interest (revenue, EBITDA, EBIT), which belong to all capital providers.
          Share price is paired with EPS, which belongs to shareholders only. A multiple is shown as &ldquo;n/m&rdquo; (not meaningful) when the
          earnings measure is zero or negative.
        </p>
      </Section>

      <Section id="quality" title="Data quality checks">
        <p>Each company page runs these tie-outs on the filing data and shows the exact figures on both sides:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Total assets equal total liabilities and equity (latest balance sheet and the last three year-ends).</li>
          <li>Total liabilities plus equity components add up to total assets, when the company reports a total liabilities line.</li>
          <li>Operating, investing and financing cash flows plus the currency effect equal the reported change in cash.</li>
          <li>Cash at the start of the year plus the change in cash equals cash at the end of the year.</li>
          <li>Revenue less cost of revenue equals gross profit, when all three are reported.</li>
          <li>Segment revenues, plus eliminations and corporate items, sum to consolidated revenue.</li>
          <li>The share count on the SEC cover page agrees with the market-data provider&rsquo;s within 5%.</li>
          <li>The latest balance sheet is less than 200 days old.</li>
        </ul>
        <p>
          A check passes when the two sides agree within three rounding units (filings are rounded to thousands or millions of dollars) or
          0.1%, whichever is larger. A flag does not mean the filing is wrong. It means the numbers this tool reads do not reconcile, most often
          because of discontinued operations or an unusual line item, and should be checked against the filing before being relied on.
        </p>
      </Section>

      <Section id="financials" title="Banks, brokers and insurers">
        <p>
          Companies with SEC industry codes 6000 to 6499 and 6700 to 6799 are shown in an equity-only view. For a financial institution, debt
          and deposits are the raw material of the business, and interest is an operating cost. That means there is no clean line between
          operating and financing activities, so enterprise value, EBITDA and unlevered free cash flow lose their meaning. Such companies are
          normally valued on equity measures such as P/E and price-to-book, or with a dividend discount model.
        </p>
      </Section>

      <Section id="limits" title="Limitations">
        <ul className="list-disc pl-5 space-y-2">
          <li>Only US companies filing a 10-K under US GAAP are covered. Foreign filers (20-F, 40-F) are not.</li>
          <li>EBITDA is unadjusted, and market cap uses basic rather than fully diluted shares, so multiples will differ from broker research.</li>
          <li>Debt is at book value, and pension deficits and other debt-like items are not included in enterprise value.</li>
          <li>
            Line items rely on the tags a company chose. Unusual tagging can leave a line &ldquo;not available&rdquo; even though it appears in
            the filing.
          </li>
          <li>Segment data is read from each 10-K&rsquo;s data file and depends on standard segment tagging; coverage is not universal.</li>
          <li>Companies that have recently listed may have fewer than five years of history, or none.</li>
          <li>This is an educational tool. It is not investment advice.</li>
        </ul>
      </Section>

      <p className="mt-10 text-sm">
        <Link href="/" className="link">
          Back to the home page
        </Link>
      </p>
    </div>
  );
}
