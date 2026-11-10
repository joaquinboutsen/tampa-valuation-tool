"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { financingCosts, runMerger, type MergerInputs, type MergerParty, type MergerYear } from "@/lib/finance/merger";
import { fmtDate, fmtM, fmtMultiple, fmtPct, fmtPrice, fmtShares } from "@/lib/format";

interface PartyData {
  ticker: string;
  name: string;
  isFinancial: boolean;
  price: number | null;
  priceSource: string;
  shares: number | null;
  sharesNote: string;
  netIncome: number | null;
  netIncomeNote: string | null;
  ltmLabel: string | null;
  eps: number | null;
  pe: number | null;
  marketCap: number | null;
  ebitda: number | null;
  totalDebt: number;
  cash: number;
  bookEquity: number | null;
  balanceDate: string | null;
  filingUrl: string | null;
  taxRate: number;
  taxNote: string;
}
interface MergerData {
  acquirer: PartyData;
  target: PartyData;
  rates: { tenYear: number; threeMonth: number | null; date: string; url: string } | null;
  error?: string;
}

/** Default deal terms. Each is a starting assumption, labelled as such on the page. */
const DEFAULT_PREMIUM = 0.3;
const DEFAULT_FEE = 0.02;
const DEFAULT_DEBT_SPREAD = 0.02;

function Num({
  value,
  onChange,
  label,
  unit = "%",
  scale = 100,
  decimals = 1,
  width = "w-24",
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
  scale?: number;
  decimals?: number;
  width?: string;
}) {
  const show = (v: number) => (Number.isFinite(v) ? (v * scale).toFixed(decimals) : "");
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(/[%$,x]/g, ""));
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n / scale);
          else if (e.target.value.trim() === "") onChange(0);
        }}
        className={`${width} rounded border border-line bg-white px-2 py-1 text-right text-[13px] num focus:outline-none focus:ring-2 focus:ring-navy/40`}
      />
      <span className="text-muted text-xs w-6">{unit}</span>
    </span>
  );
}

function Field({ label, note, judgment, children }: { label: string; note?: React.ReactNode; judgment?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-line-soft last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {note ? (
          <div className="text-[11.5px] text-muted leading-snug">
            {judgment ? <span className="text-gold font-semibold">Assumption. </span> : null}
            {note}
          </div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const EXAMPLES: [string, string, string][] = [
  ["JBL", "SANM", "Jabil buys Sanmina"],
  ["CCK", "SLGN", "Crown buys Silgan"],
  ["HD", "BLMN", "Home Depot buys Bloomin' Brands"],
];

export default function MergerModel({ initialAcquirer, initialTarget }: { initialAcquirer: string; initialTarget: string }) {
  const [acqText, setAcqText] = useState(initialAcquirer);
  const [tgtText, setTgtText] = useState(initialTarget);
  const [data, setData] = useState<MergerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inp, setInp] = useState<MergerInputs | null>(null);

  const load = useCallback(async (a: string, t: string) => {
    const acq = a.trim().toUpperCase();
    const tgt = t.trim().toUpperCase();
    if (!acq || !tgt) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/merger?acquirer=${encodeURIComponent(acq)}&target=${encodeURIComponent(tgt)}`);
      const json = (await res.json()) as MergerData;
      if (!res.ok || json.error) throw new Error(json.error ?? "The companies could not be loaded.");
      setData(json);
      const rf = json.rates?.tenYear ?? null;
      // Default mix: half stock; the other half from cash, limited to half of the
      // acquirer's cash balance, with any remainder borrowed.
      const purchase = (json.target.price ?? 0) * (1 + DEFAULT_PREMIUM) * (json.target.shares ?? 0);
      const affordable = purchase > 0 ? (0.5 * Math.max(0, json.acquirer.cash)) / purchase : 0;
      const pctCash = Math.floor(Math.min(0.5, affordable) * 100) / 100;
      setInp({
        premium: DEFAULT_PREMIUM,
        pctCash,
        pctStock: 0.5,
        pctDebt: Number((0.5 - pctCash).toFixed(2)),
        debtRate: rf !== null ? rf + DEFAULT_DEBT_SPREAD : 0,
        cashRate: json.rates?.threeMonth ?? rf ?? 0,
        taxRate: json.acquirer.taxRate,
        synergies: 0,
        synergyPhaseIn: [0.5, 1],
        feePct: DEFAULT_FEE,
        incrementalDa: 0,
        acquirerGrowth: 0,
        targetGrowth: 0,
      });
      const url = new URL(window.location.href);
      url.searchParams.set("acquirer", acq);
      url.searchParams.set("target", tgt);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      setError((e as Error).message);
      setData(null);
      setInp(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialAcquirer && initialTarget) load(initialAcquirer, initialTarget);
  }, [initialAcquirer, initialTarget, load]);

  const ready = data && inp && data.acquirer.price && data.acquirer.shares && data.target.price && data.target.shares && data.acquirer.netIncome !== null && data.target.netIncome !== null;
  const parties = useMemo(() => {
    if (!ready || !data) return null;
    const mk = (p: PartyData): MergerParty => ({ ticker: p.ticker, name: p.name, price: p.price as number, shares: p.shares as number, netIncome: p.netIncome as number });
    return { acq: mk(data.acquirer), tgt: mk(data.target) };
  }, [ready, data]);
  const result = useMemo(() => (parties && inp ? runMerger(parties.acq, parties.tgt, inp) : null), [parties, inp]);
  const costs = useMemo(() => (parties && inp ? financingCosts(parties.acq, parties.tgt, inp) : null), [parties, inp]);

  const set = (patch: Partial<MergerInputs>) => setInp((p) => (p ? { ...p, ...patch } : p));
  const m = (v: number | null | undefined) => fmtM(v ?? null, 1);
  const signedPct = (v: number | null) => (v === null ? "n/m" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`);

  const missing: string[] = [];
  if (data) {
    for (const [role, p] of [["acquirer", data.acquirer], ["target", data.target]] as const) {
      if (!p.price || !p.shares) missing.push(`A share price or share count is not available for the ${role} (${p.ticker}): ${p.priceSource}`);
      if (p.netIncome === null) missing.push(`LTM net income is not available for the ${role} (${p.ticker}).`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Pick the companies */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(acqText, tgtText);
        }}
        className="card p-4 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <div className="text-muted text-xs mb-1">Acquirer ticker</div>
          <input value={acqText} onChange={(e) => setAcqText(e.target.value)} maxLength={10} placeholder="e.g. JBL" aria-label="Acquirer ticker" className="w-32 rounded border border-line px-3 py-2 uppercase" />
        </label>
        <span className="pb-2 text-muted">acquires</span>
        <label className="text-sm">
          <div className="text-muted text-xs mb-1">Target ticker</div>
          <input value={tgtText} onChange={(e) => setTgtText(e.target.value)} maxLength={10} placeholder="e.g. SANM" aria-label="Target ticker" className="w-32 rounded border border-line px-3 py-2 uppercase" />
        </label>
        <button type="submit" disabled={loading || !acqText.trim() || !tgtText.trim()} className="rounded bg-navy text-white px-5 py-2 font-medium hover:bg-ink disabled:opacity-60">
          {loading ? "Loading…" : "Build the model"}
        </button>
        <div className="basis-full text-sm text-muted">
          Examples:{" "}
          {EXAMPLES.map(([a, t, label], i) => (
            <span key={label}>
              {i > 0 ? " · " : ""}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setAcqText(a);
                  setTgtText(t);
                  load(a, t);
                }}
              >
                {label}
              </button>
            </span>
          ))}
          <span className="block text-xs mt-1">These pairings are illustrations of the mechanics only. They are not real or rumoured deals.</span>
        </div>
      </form>

      {error && (
        <div className="card border-l-4 !border-l-fail px-4 py-3 text-sm">
          <span className="font-semibold">Could not build the model.</span> {error}
        </div>
      )}
      {missing.length > 0 && (
        <div className="card border-l-4 !border-l-fail px-4 py-3 text-sm space-y-1">
          <div className="font-semibold">The model cannot be run with the data available.</div>
          {missing.map((t) => (
            <div key={t} className="text-muted">{t}</div>
          ))}
        </div>
      )}

      {data && inp && result && parties && costs && (
        <>
          {/* Headline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {result.years.map((y) => (
              <div key={y.year} className="card px-4 py-3">
                <div className="text-[11px] uppercase tracking-wider text-muted">Year {y.year} EPS accretion / (dilution)</div>
                <div className={`font-serif text-2xl font-semibold ${y.accretionPct === null ? "text-navy" : y.accretionPct >= 0 ? "text-pass" : "text-fail"}`}>{signedPct(y.accretionPct)}</div>
                <div className="text-xs text-muted">
                  Pro forma EPS {fmtPrice(y.proFormaEps)} vs standalone {fmtPrice(y.standaloneEps)}
                </div>
              </div>
            ))}
            <div className="card px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">Synergies needed to break even · year 1</div>
              <div className="font-serif text-2xl font-semibold text-navy">{result.years[0].breakevenSynergies > 0 ? `$${m(result.years[0].breakevenSynergies)}M` : "None"}</div>
              <div className="text-xs text-muted">
                {result.years[0].breakevenSynergies > 0 ? "Pre-tax, per year, for EPS to be unchanged" : "The deal is accretive before any synergies"}
              </div>
            </div>
          </div>

          {!result.valid && (
            <div className="card border-l-4 !border-l-fail px-4 py-3 text-sm">
              {result.issues.map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
          )}
          {result.cashUsed > data.acquirer.cash && (
            <div className="card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
              <span className="font-semibold text-navy">Check the financing.</span> The deal uses ${m(result.cashUsed)}M of cash (including fees),
              but {data.acquirer.ticker} has only ${m(data.acquirer.cash)}M of cash and short-term investments on its latest balance sheet. Shift
              some of the cash portion to debt or stock.
            </div>
          )}
          {(data.acquirer.isFinancial || data.target.isFinancial) && (
            <div className="card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
              One of these companies is a financial institution. The EPS arithmetic still works, but bank mergers are normally judged on
              tangible book value dilution and capital ratios as well, which this model does not cover.
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Inputs */}
            <div className="card p-4">
              <h3 className="text-base font-semibold text-navy mb-1">Deal terms</h3>
              <Field label="Offer premium" judgment note="Premium over the target's current share price. 30% is a common starting point; actual premiums vary widely.">
                <Num value={inp.premium} onChange={(v) => set({ premium: v })} label="Offer premium" />
              </Field>
              <Field
                label="Paid in cash"
                note={`From ${data.acquirer.ticker}'s own cash ($${m(data.acquirer.cash)}M on the latest balance sheet). Default mix: half stock, the rest from cash up to half of that balance, and any remainder borrowed. The three must add to 100% (now ${fmtPct(inp.pctCash + inp.pctStock + inp.pctDebt, 0)}).`}
              >
                <Num value={inp.pctCash} onChange={(v) => set({ pctCash: v })} label="Percent cash" decimals={0} />
              </Field>
              <Field label="Paid in stock" note={`New ${data.acquirer.ticker} shares issued to the target's shareholders at ${fmtPrice(data.acquirer.price)}.`}>
                <Num value={inp.pctStock} onChange={(v) => set({ pctStock: v })} label="Percent stock" decimals={0} />
              </Field>
              <Field label="Paid with new debt" note="Money borrowed to fund the purchase.">
                <Num value={inp.pctDebt} onChange={(v) => set({ pctDebt: v })} label="Percent debt" decimals={0} />
              </Field>
              <Field
                label="Interest rate on new debt"
                judgment
                note={data.rates ? `Default: 10-year Treasury yield of ${fmtPct(data.rates.tenYear, 2)} (${fmtDate(data.rates.date)}) plus a 2.0% spread. Replace with the acquirer's actual borrowing cost if known.` : "Enter the acquirer's borrowing cost."}
              >
                <Num value={inp.debtRate} onChange={(v) => set({ debtRate: v })} label="Interest rate on new debt" decimals={2} />
              </Field>
              <Field
                label="Interest lost on cash used"
                note={data.rates?.threeMonth ? `What the cash would have earned: the 3-month Treasury yield of ${fmtPct(data.rates.threeMonth, 2)} (${fmtDate(data.rates.date)}).` : "The rate the acquirer currently earns on its cash."}
              >
                <Num value={inp.cashRate} onChange={(v) => set({ cashRate: v })} label="Foregone interest rate on cash" decimals={2} />
              </Field>
              <Field label="Tax rate" note={`${data.acquirer.ticker}: ${data.acquirer.taxNote}`}>
                <Num value={inp.taxRate} onChange={(v) => set({ taxRate: v })} label="Tax rate" />
              </Field>
              <Field label="Annual synergies (pre-tax)" judgment note="Cost savings or extra profit from combining the companies, at full run-rate. Starts at zero so the break-even figure is easy to read.">
                <Num value={inp.synergies} onChange={(v) => set({ synergies: v })} label="Annual synergies" unit="$M" scale={1e-6} decimals={0} />
              </Field>
              <Field label="Synergies achieved in year 1 / year 2" judgment note="Synergies take time to deliver. Half in the first year and all in the second is a common planning assumption.">
                <span className="inline-flex gap-1">
                  <Num value={inp.synergyPhaseIn[0]} onChange={(v) => set({ synergyPhaseIn: [v, inp.synergyPhaseIn[1]] })} label="Synergy phase-in year 1" decimals={0} width="w-14" />
                  <Num value={inp.synergyPhaseIn[1]} onChange={(v) => set({ synergyPhaseIn: [inp.synergyPhaseIn[0], v] })} label="Synergy phase-in year 2" decimals={0} width="w-14" />
                </span>
              </Field>
              <Field label="Transaction fees" judgment note="Adviser, legal and financing fees as a share of the purchase price, paid in cash. They are one-time costs, so they reduce cash but are left out of ongoing EPS.">
                <Num value={inp.feePct} onChange={(v) => set({ feePct: v })} label="Transaction fees" />
              </Field>
              <Field label="Extra D&A from asset write-ups (pre-tax, per year)" judgment note="In a purchase, the target's assets are revalued and the increase is depreciated or amortized. Zero by default because it needs a valuation of the target's assets.">
                <Num value={inp.incrementalDa} onChange={(v) => set({ incrementalDa: v })} label="Incremental D&A" unit="$M" scale={1e-6} decimals={0} />
              </Field>
              <Field label="Standalone net income growth: acquirer / target" judgment note="Zero by default: LTM earnings are held flat because consensus forecasts are not available from a free, licensed source.">
                <span className="inline-flex gap-1">
                  <Num value={inp.acquirerGrowth} onChange={(v) => set({ acquirerGrowth: v })} label="Acquirer growth" width="w-14" />
                  <Num value={inp.targetGrowth} onChange={(v) => set({ targetGrowth: v })} label="Target growth" width="w-14" />
                </span>
              </Field>
            </div>

            {/* The two companies and the deal */}
            <div className="space-y-5">
              <div className="card p-2 sm:p-4">
                <div className="overflow-x-auto">
                  <table className="fin-table tight">
                    <thead>
                      <tr>
                        <th>$ in millions, except per share</th>
                        <th>Acquirer: {data.acquirer.ticker}</th>
                        <th>Target: {data.target.ticker}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Share price</td>
                        <td className="num" title={data.acquirer.priceSource}>{fmtPrice(data.acquirer.price)}</td>
                        <td className="num" title={data.target.priceSource}>{fmtPrice(data.target.price)}</td>
                      </tr>
                      <tr>
                        <td>Shares outstanding (millions)</td>
                        <td className="num" title={data.acquirer.sharesNote}>{fmtShares(data.acquirer.shares)}</td>
                        <td className="num" title={data.target.sharesNote}>{fmtShares(data.target.shares)}</td>
                      </tr>
                      <tr>
                        <td>Market cap</td>
                        <td className="num">{m(data.acquirer.marketCap)}</td>
                        <td className="num">{m(data.target.marketCap)}</td>
                      </tr>
                      <tr className="rule">
                        <td>Net income ({data.acquirer.ltmLabel === data.target.ltmLabel ? data.acquirer.ltmLabel : "LTM"})</td>
                        <td className="num">{m(data.acquirer.netIncome)}</td>
                        <td className="num">{m(data.target.netIncome)}</td>
                      </tr>
                      <tr>
                        <td>EPS (net income ÷ shares outstanding)</td>
                        <td className="num">{fmtPrice(parties.acq.netIncome / parties.acq.shares)}</td>
                        <td className="num">{fmtPrice(parties.tgt.netIncome / parties.tgt.shares)}</td>
                      </tr>
                      <tr>
                        <td>P / E at current price</td>
                        <td className="num">{fmtMultiple(result.acquirerPe)}</td>
                        <td className="num">{fmtMultiple(parties.tgt.netIncome > 0 ? (parties.tgt.price * parties.tgt.shares) / parties.tgt.netIncome : null)}</td>
                      </tr>
                      <tr>
                        <td>P / E at the offer price</td>
                        <td className="num">–</td>
                        <td className="num font-semibold">{fmtMultiple(result.targetPeAtOffer)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="px-2 pt-2 text-[11.5px] text-muted leading-snug">
                  Prices: {data.acquirer.priceSource}. Net income: SEC filings, {data.acquirer.ticker} {data.acquirer.ltmLabel}, {data.target.ticker}{" "}
                  {data.target.ltmLabel}. EPS here uses shares outstanding rather than the weighted-average diluted count, so it differs slightly
                  from reported EPS; the same basis is used before and after the deal.
                </p>
              </div>

              <div className="card p-2 sm:p-4">
                <table className="fin-table tight">
                  <thead>
                    <tr>
                      <th>Sources and uses of funds ($ in millions)</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        Offer price per share <span className="text-muted">({fmtPrice(data.target.price)} + {fmtPct(inp.premium, 0)})</span>
                      </td>
                      <td className="num">{fmtPrice(result.offerPrice)}</td>
                    </tr>
                    <tr className="total">
                      <td>Purchase price (equity value)</td>
                      <td className="num">{m(result.purchasePrice)}</td>
                    </tr>
                    <tr className="rule">
                      <td>Cash from the balance sheet</td>
                      <td className="num">{m(result.cashConsideration)}</td>
                    </tr>
                    <tr>
                      <td>New debt</td>
                      <td className="num">{m(result.debtConsideration)}</td>
                    </tr>
                    <tr>
                      <td>
                        New shares issued <span className="text-muted">({fmtShares(result.newShares)}M shares; target holders own {fmtPct(result.targetOwnership)} of the combined company)</span>
                      </td>
                      <td className="num">{m(result.stockConsideration)}</td>
                    </tr>
                    <tr>
                      <td>Transaction fees (cash)</td>
                      <td className="num">{m(result.fees)}</td>
                    </tr>
                    <tr className="rule">
                      <td>Goodwill created, before any asset write-ups</td>
                      <td className="num">{data.target.bookEquity === null ? "n/a" : m(result.purchasePrice - data.target.bookEquity)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="px-2 pt-2 text-[11.5px] text-muted leading-snug">
                  The target&rsquo;s existing debt of ${m(data.target.totalDebt)}M is assumed to stay in place, so its interest is already in the
                  target&rsquo;s net income. Goodwill is the purchase price less the target&rsquo;s book equity of{" "}
                  {data.target.bookEquity === null ? "n/a" : `$${m(data.target.bookEquity)}M`}; it is not amortized under US accounting rules.
                </p>
              </div>
            </div>
          </div>

          {/* Pro forma EPS */}
          <div>
            <h2 className="section-title">Pro forma earnings per share</h2>
            <div className="card p-2 sm:p-4">
              <div className="overflow-x-auto">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>$ in millions, except per share</th>
                      {result.years.map((y) => (
                        <th key={y.year}>Year {y.year}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [`${data.acquirer.ticker} net income`, (y) => m(y.acquirerNetIncome), ""],
                        [`Plus: ${data.target.ticker} net income`, (y) => m(y.targetNetIncome), ""],
                        ["Plus: synergies, after tax", (y) => m(y.afterTaxSynergies), ""],
                        ["Less: interest on new debt, after tax", (y) => m(-y.afterTaxDebtInterest), ""],
                        ["Less: interest lost on cash used, after tax", (y) => m(-y.afterTaxForegoneInterest), ""],
                        ["Less: extra D&A from write-ups, after tax", (y) => m(-y.afterTaxIncrementalDa), ""],
                        ["Pro forma net income", (y) => m(y.proFormaNetIncome), "total rule"],
                        [`${data.acquirer.ticker} shares outstanding (millions)`, () => fmtShares(parties.acq.shares), "rule"],
                        ["Plus: new shares issued (millions)", () => fmtShares(result.newShares), ""],
                        ["Pro forma shares (millions)", (y) => fmtShares(y.proFormaShares), "total rule"],
                        ["Pro forma EPS", (y) => fmtPrice(y.proFormaEps), "total rule"],
                        [`${data.acquirer.ticker} standalone EPS`, (y) => fmtPrice(y.standaloneEps), ""],
                        ["Accretion / (dilution) per share", (y) => (y.accretionPerShare >= 0 ? fmtPrice(y.accretionPerShare) : `(${fmtPrice(Math.abs(y.accretionPerShare))})`), "rule"],
                        ["Accretion / (dilution) %", (y) => signedPct(y.accretionPct), "total"],
                        ["Accretion / (dilution) % with no synergies", (y) => signedPct(y.accretionPctNoSynergies), "sub"],
                        ["Pre-tax synergies needed to break even", (y) => (y.breakevenSynergies > 0 ? m(y.breakevenSynergies) : "none needed"), "rule"],
                      ] as [string, (y: MergerYear) => string, string][]
                    ).map(([label, fn, cls]) => (
                      <tr key={label} className={cls}>
                        <td>{label}</td>
                        {result.years.map((y) => (
                          <td key={y.year} className="num">{fn(y)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Why */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="card p-4 text-sm">
              <h3 className="text-base font-semibold text-navy mb-2">Why it is {result.years[0].accretionPctNoSynergies !== null && result.years[0].accretionPctNoSynergies >= 0 ? "accretive" : "dilutive"} before synergies</h3>
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-line-soft">
                    <td className="py-1.5">What the target earns on the price paid (earnings yield)</td>
                    <td className="py-1.5 num font-semibold">{costs.targetEarningsYield === null ? "n/m" : fmtPct(costs.targetEarningsYield, 2)}</td>
                  </tr>
                  <tr className="border-b border-line-soft">
                    <td className="py-1.5 text-muted">Cost of paying with stock (acquirer earnings yield = 1 ÷ P/E)</td>
                    <td className="py-1.5 num">{costs.costOfStock === null ? "n/m" : fmtPct(costs.costOfStock, 2)}</td>
                  </tr>
                  <tr className="border-b border-line-soft">
                    <td className="py-1.5 text-muted">Cost of new debt, after tax</td>
                    <td className="py-1.5 num">{fmtPct(costs.afterTaxCostOfDebt, 2)}</td>
                  </tr>
                  <tr className="border-b border-line-soft">
                    <td className="py-1.5 text-muted">Cost of cash, after tax</td>
                    <td className="py-1.5 num">{fmtPct(costs.afterTaxCostOfCash, 2)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">Blended cost of this financing mix</td>
                    <td className="py-1.5 num font-semibold">{costs.blendedCost === null ? "n/m" : fmtPct(costs.blendedCost, 2)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-muted leading-relaxed">
                A deal adds to EPS when the target&rsquo;s earnings yield on the price paid is higher than the blended cost of the money used to
                buy it. Fees and write-up D&amp;A are outside this shortcut, so it can differ slightly from the full table above.
              </p>
            </div>
            <div className="text-sm text-muted leading-relaxed space-y-3">
              <p>
                <span className="font-semibold text-ink">The all-stock shortcut.</span> If the acquirer pays only in shares, the deal is accretive
                when the acquirer&rsquo;s P/E is higher than the P/E it pays for the target: it is swapping expensive paper for cheaper earnings.
                Here the acquirer trades at {fmtMultiple(result.acquirerPe)} and pays {fmtMultiple(result.targetPeAtOffer)}.
              </p>
              <p>
                <span className="font-semibold text-ink">Accretive does not mean good.</span> EPS accretion is arithmetic, not value creation. A
                deal can add to EPS and still destroy value if the price is too high, and a dilutive deal can be worth doing for strategic
                reasons. Bankers show it because boards and investors ask for it.
              </p>
              <p>
                <span className="font-semibold text-ink">What this model leaves out.</span> Refinancing of the target&rsquo;s debt, a full
                purchase price allocation, new share issuance costs, changes in the combined tax rate, and any timing within the year. Each of
                these would be added in a full banker&rsquo;s model.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
