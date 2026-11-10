import type { Metadata } from "next";
import FootballField from "@/components/company/FootballField";
import { getMarketData, getRiskFreeRate } from "@/lib/cached";
import { targetBasis } from "@/lib/finance/comps";
import { buildDcfDefaults } from "@/lib/finance/dcfDefaults";
import { normalizeTicker } from "@/lib/sec/tickers";
import { CompanyHeader, resolveCompany } from "../shared";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ticker: string }>; searchParams: Promise<{ peers?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const t = normalizeTicker(decodeURIComponent(ticker));
  return { title: `${t} football field`, description: `Implied share price ranges for ${t} from its trading range, trading comps and DCF, against the current price.` };
}

export default async function FootballFieldPage({ params, searchParams }: Props) {
  const { ticker: raw } = await params;
  const { peers } = await searchParams;
  const resolved = await resolveCompany(raw);
  if (!resolved.ok) return resolved.notice;
  const { pkg, ticker } = resolved;
  const [market, riskFree] = await Promise.all([getMarketData(ticker), getRiskFreeRate()]);
  const defaults = buildDcfDefaults(pkg, market, riskFree);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <CompanyHeader pkg={pkg} active="football" />
      <section className="mt-8">
        <h2 className="section-title">Football field</h2>
        <p className="text-sm text-muted mb-4 max-w-3xl leading-relaxed">
          A football field puts every valuation method on one chart, as a range of implied share prices, so you can see where the methods
          agree, where they do not, and how the current share price compares. It is the summary page of a banker&rsquo;s valuation.
        </p>
        {!market.available && (
          <div className="mb-4 card border-l-4 !border-l-fail px-4 py-3 text-sm">
            <span className="font-semibold">Market data not available.</span> {market.reason} The chart needs a share price.
          </div>
        )}
        {pkg.profile.isFinancial && (
          <div className="mb-4 card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
            <span className="font-semibold text-navy">Financial institution.</span> Only the trading range and P/E comps are shown. Enterprise
            value multiples and a DCF are not meaningful for banks, brokers and insurers.
          </div>
        )}
        <FootballField
          ticker={ticker}
          price={market.price}
          low52={market.low52}
          high52={market.high52}
          basis={targetBasis(pkg, market)}
          defaults={defaults}
          isFinancial={pkg.profile.isFinancial}
          initialPeers={peers ?? null}
          provider={`${market.provider}${market.priceTime ? `, ${market.priceTime.slice(0, 10)}` : ""}`}
        />
      </section>
    </div>
  );
}
