import type { Metadata } from "next";
import MergerModel from "@/components/MergerModel";
import { isValidTickerFormat, normalizeTicker } from "@/lib/sec/tickers";

export const metadata: Metadata = {
  title: "Merger model",
  description: "Accretion / dilution analysis for any acquirer and target: pro forma EPS, break-even synergies and what drives the result.",
};

type Props = { searchParams: Promise<{ acquirer?: string; target?: string }> };

export default async function MergerPage({ searchParams }: Props) {
  const { acquirer, target } = await searchParams;
  const clean = (t?: string) => (t && isValidTickerFormat(t) ? normalizeTicker(t) : "");
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-3xl sm:text-4xl font-semibold text-navy">Merger model</h1>
      <p className="mt-2 text-muted leading-relaxed max-w-3xl">
        Pick an acquirer and a target, set the deal terms, and see whether the combined company&rsquo;s earnings per share would be higher
        (accretive) or lower (dilutive) than the acquirer&rsquo;s on its own, and how much in synergies the deal needs to break even.
      </p>
      <div className="mt-6">
        <MergerModel initialAcquirer={clean(acquirer)} initialTarget={clean(target)} />
      </div>
    </div>
  );
}
