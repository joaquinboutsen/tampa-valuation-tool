import Link from "next/link";
import SearchBox from "@/components/SearchBox";
import { LARGE_CAPS, SITE, TAMPA_BAY, type Featured } from "@/lib/site";

function FeaturedCard({ f }: { f: Featured }) {
  return (
    <Link href={`/company/${f.ticker}`} className="card px-4 py-3 hover:border-navy transition-colors block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-lg font-semibold text-navy">{f.name}</span>
        <span className="text-xs font-semibold text-gold tracking-wide">{f.ticker}</span>
      </div>
      <div className="text-sm text-muted">{f.blurb}</div>
      <div className="mt-1 text-xs text-muted">
        {f.hq}
        {f.financial ? " · equity-only view (no DCF)" : ""}
      </div>
    </Link>
  );
}

const MODULES: { title: string; body: string; live: boolean }[] = [
  { title: "Company snapshot", body: "Business description, five years of financials plus LTM, and a step-by-step bridge from equity value to enterprise value.", live: true },
  { title: "Data quality checks", body: "Automatic tie-outs on the filing data: balance sheet balances, cash flow ties to cash, segments sum to total.", live: true },
  { title: "Trading comps", body: "Editable peer set with EV/Revenue, EV/EBITDA and P/E, and where the target sits in the range.", live: true },
  { title: "DCF", body: "Unlevered free cash flow, WACC from CAPM, two terminal value methods and sensitivity tables.", live: true },
  { title: "Football field", body: "Implied share price ranges from each method against the current price.", live: true },
  { title: "Merger model", body: "Pro forma EPS, accretion / dilution and breakeven synergies for any acquirer and target.", live: true },
];

export default function Home() {
  return (
    <div>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-5xl font-semibold leading-tight">
            A banker&rsquo;s valuation package for any US public company.
          </h1>
          <p className="mt-4 text-white/80 text-base sm:text-lg max-w-2xl mx-auto">
            Type a ticker. Get the snapshot, trading comps, a DCF and a football field, built directly from SEC filings with every number
            sourced.
          </p>
          <div className="mt-7 max-w-xl mx-auto">
            <SearchBox autoFocus onDark />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="mt-10">
          <h2 className="section-title">Tampa Bay companies</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TAMPA_BAY.map((f) => (
              <FeaturedCard key={f.ticker} f={f} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted leading-relaxed max-w-3xl">
            Headquarters verified against each company&rsquo;s SEC filing record. Raymond James is shown without enterprise value or a DCF: for a
            bank or broker, debt is part of operations rather than financing, so free cash flow to the firm cannot be defined in the usual way.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="section-title">Large-cap benchmarks</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {LARGE_CAPS.map((f) => (
              <FeaturedCard key={f.ticker} f={f} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="section-title">What the package includes</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map((m) => (
              <div key={m.title} className="card px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-navy">{m.title}</h3>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${m.live ? "bg-pass-soft text-pass" : "bg-na-soft text-na"}`}>
                    {m.live ? "Live" : "In build"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid lg:grid-cols-2 gap-6">
          <div>
            <h2 className="section-title">About</h2>
            <p className="text-sm leading-relaxed">
              Built by <span className="font-semibold">{SITE.author}</span>, {SITE.authorLine}. I directed the design and chose the methods; the
              code was written with an AI coding agent under my direction, and every figure links back to its SEC filing so it can be checked.
            </p>
            <p className="mt-3 text-sm">
              <a className="link" href={SITE.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
              {" · "}
              <a className="link" href={SITE.repo} target="_blank" rel="noopener noreferrer">
                Source code on GitHub
              </a>
              {" · "}
              <Link className="link" href="/methodology">
                Methodology
              </Link>
            </p>
          </div>
          <div>
            <h2 className="section-title">Where the numbers come from</h2>
            <ul className="text-sm leading-relaxed space-y-1.5 list-disc pl-5">
              <li>Financial statements: SEC EDGAR, the official filing database (10-K and 10-Q).</li>
              <li>Share price, 52-week range, beta and suggested peers: Finnhub, a licensed market-data API.</li>
              <li>Risk-free rate: the U.S. Treasury&rsquo;s daily 10-year yield.</li>
              <li>Nothing is typed in by hand or estimated. If a figure is missing, the page says &ldquo;not available&rdquo; and why.</li>
              <li>Coverage: US companies that file a 10-K. Foreign filers are not supported.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
