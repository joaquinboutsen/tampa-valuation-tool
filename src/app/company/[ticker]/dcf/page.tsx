import type { Metadata } from "next";
import DcfModel from "@/components/company/DcfModel";
import { getMarketData, getRiskFreeRate } from "@/lib/cached";
import { buildDcfDefaults } from "@/lib/finance/dcfDefaults";
import { normalizeTicker } from "@/lib/sec/tickers";
import { CompanyHeader, resolveCompany } from "../shared";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ticker: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const t = normalizeTicker(decodeURIComponent(ticker));
  return { title: `${t} DCF`, description: `Discounted cash flow valuation of ${t} with editable assumptions, WACC build and sensitivity tables.` };
}

export default async function DcfPage({ params }: Props) {
  const { ticker: raw } = await params;
  const resolved = await resolveCompany(raw);
  if (!resolved.ok) return resolved.notice;
  const { pkg, ticker } = resolved;
  const [market, riskFree] = await Promise.all([getMarketData(ticker), getRiskFreeRate()]);
  const defaults = buildDcfDefaults(pkg, market, riskFree);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <CompanyHeader pkg={pkg} active="dcf" />
      <section className="mt-8">
        <h2 className="section-title">Discounted cash flow</h2>
        <p className="text-sm text-muted mb-5 max-w-3xl leading-relaxed">
          A DCF values a company by the cash it is expected to generate, brought back to today&rsquo;s dollars. Every default below is derived
          from {pkg.profile.name}&rsquo;s own filings or a cited market source, with the derivation shown. Change any input and the valuation
          updates immediately.
        </p>
        {defaults.available && defaults.assumptions && defaults.waccInputs ? (
          <DcfModel defaults={defaults} ticker={ticker} provider={market.provider} />
        ) : (
          <div className="card border-l-4 !border-l-gold px-4 py-4 text-sm leading-relaxed max-w-3xl">
            <div className="font-semibold text-navy mb-1">DCF not shown for {pkg.profile.name}</div>
            {defaults.reason}
            {!market.available ? <div className="mt-2 text-muted">Market data: {market.reason}</div> : null}
          </div>
        )}
      </section>
    </div>
  );
}
