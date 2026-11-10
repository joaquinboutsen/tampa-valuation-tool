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
          ["comps", "Trading comps"],
          ["dcf", "DCF"],
          ["wacc", "WACC"],
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
          earnings measure is zero or negative, or when the result is above 100x, which only happens when earnings are close to zero.
        </p>
      </Section>

      <Section id="comps" title="Trading comparables">
        <p>
          Comps estimate value from what investors currently pay for similar companies. The target and every peer are run through exactly
          the same calculation, from their own SEC filings and the same price source, so the multiples are like for like.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Peer set.</span> The starting list comes from Finnhub&rsquo;s industry classification. It is a
            starting point only and is often imperfect: peers can be unticked, removed or added on the page, up to ten at a time.
          </li>
          <li>
            <span className="font-semibold">Statistics.</span> Minimum, 25th percentile, median, 75th percentile and maximum, using
            Excel&rsquo;s inclusive percentile method (linear interpolation between ranked values). Not-meaningful multiples are left out
            rather than counted as zero.
          </li>
          <li>
            <span className="font-semibold">Forward P/E</span> is the figure Finnhub publishes from analyst estimates. It is shown as
            provided and is not recalculated. Forward EV / EBITDA is not shown, because consensus EBITDA estimates are not available from a
            free, licensed source.
          </li>
          <li>
            <span className="font-semibold">Implied share price.</span> The peer 25th percentile, median and 75th percentile multiples are
            applied to the target&rsquo;s own figures:
          </li>
        </ul>
        <Formula>{`From an EV multiple:  (multiple × target metric − debt − preferred − noncontrolling interests + cash) ÷ shares
From a P/E multiple:  multiple × target EPS`}</Formula>
        <p>
          The median is used as the central figure rather than the mean because one outlier can distort an average of eight or ten
          companies.
        </p>
      </Section>

      <Section id="dcf" title="Discounted cash flow">
        <p>
          A DCF values a company by the cash it is expected to generate, discounted back to today. This is an unlevered DCF: it values the
          whole business before financing, then subtracts net debt to reach equity value.
        </p>
        <Formula>{`Unlevered free cash flow = EBIT × (1 − tax rate)
                         + depreciation and amortization
                         − capital expenditures
                         − increase in net working capital

Terminal value (perpetuity growth) = final-year cash flow × (1 + g) ÷ (WACC − g)
Terminal value (exit multiple)     = final-year EBITDA × EV / EBITDA multiple

Enterprise value = sum of each year's cash flow ÷ (1 + WACC)^year
                 + terminal value ÷ (1 + WACC)^5

Equity value = enterprise value − debt − preferred − noncontrolling interests + cash
Value per share = equity value ÷ shares outstanding`}</Formula>
        <p className="font-semibold">Default assumptions and how each is derived</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Starting point.</span> LTM revenue. Year 1 is the twelve months after the latest reported
            quarter, so the cash flows, the balance sheet used for net debt and the valuation date all line up.
          </li>
          <li>
            <span className="font-semibold">Revenue growth.</span> Year 1 uses the compound annual growth rate of revenue over the last
            three fiscal years, kept between −5% and +15%. Growth then moves in a straight line to the terminal rate by year 5.
          </li>
          <li>
            <span className="font-semibold">EBITDA margin, D&amp;A, capital expenditures and working capital.</span> Each is the average of
            the last three fiscal years, as a percentage of revenue, held flat.
          </li>
          <li>
            <span className="font-semibold">Net working capital</span> is current assets excluding cash, less current liabilities excluding
            debt. Each year&rsquo;s investment is the change in that balance as revenue grows.
          </li>
          <li>
            <span className="font-semibold">Tax rate.</span> Total income tax divided by total pre-tax income over the last three fiscal
            years. If that falls outside 10% to 35%, or cannot be calculated, the 21% U.S. federal statutory rate is used.
          </li>
          <li>
            <span className="font-semibold">Terminal growth.</span> 2.5% by default: roughly long-run inflation plus modest real growth.
            This is a judgment and is labelled as one.
          </li>
          <li>
            <span className="font-semibold">Exit multiple.</span> The company&rsquo;s own current EV / LTM EBITDA by default, with one click
            to switch to the peer median from the comps.
          </li>
        </ul>
        <p>
          The page shows each method&rsquo;s answer in the other&rsquo;s terms: the exit multiple implied by the growth method, and the
          perpetual growth rate implied by the exit multiple. If the two disagree badly, one of the assumptions is wrong, and the page says
          so. Two sensitivity tables show the value per share across WACC and terminal growth, and across WACC and the exit multiple.
        </p>
        <p className="font-semibold">Simplifications</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Cash flows are discounted as if received at the end of each year. A mid-year convention would give a slightly higher value.</li>
          <li>Stock-based compensation is not added back. It is treated as a real cost of running the business.</li>
          <li>No tax benefit is assumed in a loss-making year.</li>
          <li>The share count is basic, so the value per share is slightly overstated for companies with many options outstanding.</li>
          <li>A DCF is not produced for banks, brokers and insurers (see below).</li>
        </ul>
      </Section>

      <Section id="wacc" title="Cost of capital (WACC)">
        <Formula>{`Cost of equity = risk-free rate + beta × equity risk premium        (CAPM)
After-tax cost of debt = pre-tax cost of debt × (1 − tax rate)

WACC = equity ÷ (equity + debt) × cost of equity
     + debt ÷ (equity + debt) × after-tax cost of debt`}</Formula>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Risk-free rate.</span> The 10-year U.S. Treasury par yield, from the Treasury Department&rsquo;s
            daily yield curve file. The date is shown next to the figure.
          </li>
          <li>
            <span className="font-semibold">Beta.</span> The levered beta published by Finnhub. The provider does not disclose its exact
            calculation window, and price history is not available on the free tier to recalculate it. Betas below 0.5 or above 2.0 are
            flagged for a cross-check.
          </li>
          <li>
            <span className="font-semibold">Equity risk premium.</span> 5.0%, the figure recommended by Kroll (reaffirmed September 2026).
            It is an assumption, not something that can be observed; common estimates range from about 4% to 6%. Kroll pairs its premium
            with a 20-year Treasury yield; this tool uses the 10-year, which is the more common convention in banking.
          </li>
          <li>
            <span className="font-semibold">Cost of debt.</span> The latest fiscal year&rsquo;s interest expense divided by total debt. That
            reflects the coupons on debt issued in the past, so it is floored at the risk-free rate: a company cannot borrow today for less
            than the government. If no sensible rate can be calculated, the risk-free rate plus 2% is used as a labelled placeholder. The
            yield on the company&rsquo;s traded bonds would be the better input where known.
          </li>
          <li>
            <span className="font-semibold">Weights.</span> Equity at market value (market cap) and debt at book value as a stand-in for
            market value.
          </li>
        </ul>
        <p>Every one of these inputs can be changed on the DCF page, and the valuation updates immediately.</p>
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
          <li>Comps depend on the peer set, and automatically suggested peers are often poor matches. Review them before relying on the result.</li>
          <li>The DCF defaults extend recent history. They are a starting point, not a forecast; cyclical companies in particular need the assumptions reviewed.</li>
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
