import type { Metadata } from "next";
import CompsPanel from "@/components/company/CompsPanel";
import { normalizeTicker } from "@/lib/sec/tickers";
import { CompanyHeader, resolveCompany } from "../shared";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ ticker: string }>; searchParams: Promise<{ peers?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const t = normalizeTicker(decodeURIComponent(ticker));
  return { title: `${t} trading comps`, description: `Trading comparables for ${t}: EV/Revenue, EV/EBITDA and P/E against an editable peer set.` };
}

export default async function CompsPage({ params, searchParams }: Props) {
  const { ticker: raw } = await params;
  const { peers } = await searchParams;
  const resolved = await resolveCompany(raw);
  if (!resolved.ok) return resolved.notice;
  const { pkg, ticker } = resolved;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <CompanyHeader pkg={pkg} active="comps" />
      <section className="mt-8">
        <h2 className="section-title">Trading comparables</h2>
        <p className="text-sm text-muted mb-4 max-w-3xl leading-relaxed">
          Comps value a company by what investors pay today for similar businesses. The multiples below are calculated identically for{" "}
          {pkg.profile.ticker} and each peer, then summarized, so you can see where {pkg.profile.ticker} trades relative to the group and what
          its shares would be worth at the group&rsquo;s multiples.
        </p>
        {pkg.profile.isFinancial && (
          <div className="mb-4 card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
            <span className="font-semibold text-navy">Financial institution.</span> Enterprise value multiples are not meaningful for banks,
            brokers and insurers, so only P/E multiples are compared.
          </div>
        )}
        <CompsPanel ticker={ticker} initialPeers={peers ?? null} />
      </section>
    </div>
  );
}
