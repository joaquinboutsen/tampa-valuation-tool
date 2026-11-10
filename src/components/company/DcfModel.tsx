"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeWacc,
  equityFromEnterpriseValue,
  runDcf,
  sensitivityGrowth,
  sensitivityMultiple,
  type DcfAssumptions,
  type SensitivityTable,
  type TerminalValue,
  type WaccInputs,
} from "@/lib/finance/dcf";
import type { DcfDefaults } from "@/lib/finance/dcfDefaults";
import { peerStats, type CompRow } from "@/lib/finance/comps";
import { fmtDate, fmtM, fmtMultiple, fmtPct, fmtPrice, fmtShares } from "@/lib/format";

/* ------------------------------- inputs --------------------------------- */

/** A number box that shows a decimal (0.074) as a percentage (7.4) or a plain number. */
function NumInput({
  value,
  onChange,
  percent = true,
  decimals = 1,
  label,
  width = "w-20",
  suffix,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  percent?: boolean;
  decimals?: number;
  label: string;
  width?: string;
  /** Unit shown after the box; defaults to % or x. */
  suffix?: string;
}) {
  const scale = percent ? 100 : 1;
  const show = (v: number | null) => (v === null || !Number.isFinite(v) ? "" : (v * scale).toFixed(decimals));
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
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") return onChange(null);
          const n = Number(t.replace(/[%x,]/g, ""));
          if (Number.isFinite(n)) onChange(n / scale);
        }}
        className={`${width} rounded border border-line bg-white px-2 py-1 text-right text-[13px] num focus:outline-none focus:ring-2 focus:ring-navy/40`}
      />
      <span className="text-muted text-xs w-3">{suffix ?? (percent ? "%" : "x")}</span>
    </span>
  );
}

function How({ children, judgment }: { children: React.ReactNode; judgment?: boolean }) {
  return (
    <div className="text-[11.5px] text-muted leading-snug mt-0.5">
      {judgment ? <span className="text-gold font-semibold">Judgment. </span> : null}
      {children}
    </div>
  );
}

/* ------------------------------ the model ------------------------------- */

export default function DcfModel({ defaults, ticker, provider }: { defaults: DcfDefaults; ticker: string; provider: string }) {
  const d0 = defaults.assumptions as DcfAssumptions;
  const w0 = defaults.waccInputs as WaccInputs;
  const [a, setA] = useState<DcfAssumptions>(d0);
  const [w, setW] = useState<WaccInputs>(w0);
  const [peerMedian, setPeerMedian] = useState<{ value: number; count: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [peerState, setPeerState] = useState<"idle" | "loading" | "none">("idle");

  // Peer median EV/EBITDA for the exit multiple. Loaded only on request, because
  // building a peer table uses a large share of the free market-data allowance.
  function loadPeerMedian() {
    setPeerState("loading");
    fetch(`/api/comps?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { peers?: CompRow[] } | null) => {
        const s = j?.peers ? peerStats(j.peers.filter((p) => !p.error)).evEbitda : null;
        if (s) {
          setPeerMedian({ value: s.median, count: s.count });
          setA((p) => ({ ...p, exitMultiple: Number(s.median.toFixed(1)) }));
          setPeerState("idle");
        } else setPeerState("none");
      })
      .catch(() => setPeerState("none"));
  }

  const wacc = useMemo(() => computeWacc({ ...w, taxRate: a.taxRate }), [w, a.taxRate]);
  const model = useMemo(() => ({ ...a, wacc: wacc?.wacc ?? NaN }), [a, wacc]);
  const result = useMemo(() => (wacc ? runDcf(model) : null), [model, wacc]);
  const sensG = useMemo(() => (wacc ? sensitivityGrowth(model, defaults.bridge) : null), [model, wacc, defaults.bridge]);
  const sensM = useMemo(() => (wacc ? sensitivityMultiple(model, defaults.bridge) : null), [model, wacc, defaults.bridge]);

  const b = defaults.bridge;
  const price = defaults.currentPrice;
  const dec = d0.baseRevenue < 1e9 ? 1 : 0;
  const m = (v: number | null | undefined) => fmtM(v ?? null, dec);
  const der = defaults.derivations;
  const edited = JSON.stringify(a) !== JSON.stringify(d0) || JSON.stringify(w) !== JSON.stringify(w0);

  const setArr = (key: "growth" | "ebitdaMargin", i: number, v: number | null) =>
    setA((prev) => ({ ...prev, [key]: prev[key].map((x, j) => (j === i ? (v ?? 0) : x)) }));
  const setNum = (key: "daPctRevenue" | "capexPctRevenue" | "nwcPctRevenue" | "taxRate" | "terminalGrowth", v: number | null) =>
    setA((prev) => ({ ...prev, [key]: v ?? 0 }));
  const setWacc = (key: keyof WaccInputs, v: number | null) => setW((prev) => ({ ...prev, [key]: v ?? 0 }));

  const perShare = (tv: TerminalValue | null) => (tv ? equityFromEnterpriseValue(tv.enterpriseValue, b).perShare : null);
  const psG = perShare(result?.perpetuity ?? null);
  const psM = perShare(result?.exit ?? null);
  const vsPrice = (ps: number | null) => (ps !== null && price ? ps / price - 1 : null);
  const updown = (ps: number | null) => {
    const v = vsPrice(ps);
    if (v === null) return "";
    return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}% vs current price`;
  };

  const yearShort = defaults.yearLabels.map((l) => {
    const mth = /\(to (.+)\)/.exec(l)?.[1];
    return { top: l.split(" (")[0], sub: mth ?? "" };
  });

  /* Sanity warnings an interviewer would raise. */
  const warnings: string[] = [];
  if (result?.exit && result.exit.impliedGrowth !== null && result.exit.impliedGrowth > 0.04) {
    warnings.push(
      `The exit multiple of ${fmtMultiple(a.exitMultiple)} implies free cash flow growing ${fmtPct(result.exit.impliedGrowth)} a year forever, faster than the economy can sustain. The multiple is probably too high (often because current EBITDA is temporarily depressed or elevated).`,
    );
  }
  if (result?.exit && result.exit.impliedGrowth !== null && result.exit.impliedGrowth < 0) {
    warnings.push(`The exit multiple of ${fmtMultiple(a.exitMultiple)} implies free cash flow shrinking ${fmtPct(Math.abs(result.exit.impliedGrowth))} a year forever. The multiple may be too low.`);
  }
  for (const tv of [result?.perpetuity, result?.exit]) {
    if (tv && tv.shareOfEv > 0.85) {
      warnings.push(`Terminal value is ${fmtPct(tv.shareOfEv, 0)} of enterprise value in one of the methods. That is high: the answer depends mostly on assumptions about the distant future.`);
      break;
    }
  }
  if (wacc && a.terminalGrowth >= wacc.wacc) warnings.push("Terminal growth is at or above WACC, so the perpetuity method cannot be calculated.");
  if (result && result.years.some((y) => y.ufcf < 0)) warnings.push("Free cash flow is negative in at least one projected year.");

  return (
    <div className="space-y-8">
      {/* Headline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Implied value per share · perpetuity growth</div>
          <div className="font-serif text-2xl font-semibold text-navy">{fmtPrice(psG)}</div>
          <div className="text-xs text-muted">{psG !== null ? updown(psG) : result?.perpetuityIssue}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Implied value per share · exit multiple</div>
          <div className="font-serif text-2xl font-semibold text-navy">{fmtPrice(psM)}</div>
          <div className="text-xs text-muted">{psM !== null ? updown(psM) : result?.exitIssue}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Current share price</div>
          <div className="font-serif text-2xl font-semibold text-navy">{fmtPrice(price)}</div>
          <div className="text-xs text-muted">
            WACC {wacc ? fmtPct(wacc.wacc, 2) : "n/a"} · {provider}
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card border-l-4 !border-l-gold px-4 py-3 text-sm">
          <div className="font-semibold text-navy mb-1">Sense checks</div>
          <ul className="list-disc pl-5 space-y-1 text-muted leading-relaxed">
            {warnings.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Assumptions */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-gold pb-1 mb-3">
          <h2 className="font-serif text-xl font-semibold text-navy">1. Operating assumptions</h2>
          <div className="flex gap-4 text-sm">
            <button className="link" onClick={() => setShowHistory((s) => !s)}>
              {showHistory ? "Hide" : "Show"} historical basis
            </button>
            <button className={`link ${edited ? "" : "opacity-40 pointer-events-none"}`} onClick={() => { setA(d0); setW(w0); }}>
              Reset to defaults
            </button>
          </div>
        </div>

        {showHistory && (
          <div className="card p-2 sm:p-4 mb-4">
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Historical ratios (from SEC filings)</th>
                    {defaults.history.labels.map((l) => (
                      <th key={l}>{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Revenue ($M)", defaults.history.revenue, "m"],
                      ["Revenue growth", defaults.history.growth, "p"],
                      ["EBITDA margin", defaults.history.ebitdaMargin, "p"],
                      ["D&A as % of revenue", defaults.history.daPct, "p"],
                      ["Capex as % of revenue", defaults.history.capexPct, "p"],
                      ["Net working capital as % of revenue", defaults.history.nwcPct, "p"],
                      ["Effective tax rate", defaults.history.taxRate, "p"],
                    ] as [string, (number | null)[], string][]
                  ).map(([label, series, kind]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {series.map((v, i) => (
                        <td key={i} className="num">
                          {v === null ? "n/a" : kind === "m" ? m(v) : fmtPct(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card p-2 sm:p-4">
          <div className="overflow-x-auto">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Edit any assumption</th>
                  {yearShort.map((y) => (
                    <th key={y.top}>
                      {y.top}
                      <div className="font-normal text-muted text-[11px]">{y.sub}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-normal">
                    Revenue growth
                    <How judgment={der.growth?.judgment}>{der.growth?.how}</How>
                  </td>
                  {a.growth.map((g, i) => (
                    <td key={i} className="num align-top">
                      <NumInput value={g} onChange={(v) => setArr("growth", i, v)} label={`Revenue growth year ${i + 1}`} width="w-16" />
                    </td>
                  ))}
                </tr>
                <tr className="rule">
                  <td className="whitespace-normal">
                    EBITDA margin
                    <How judgment={der.ebitdaMargin?.judgment}>{der.ebitdaMargin?.how}</How>
                  </td>
                  {a.ebitdaMargin.map((g, i) => (
                    <td key={i} className="num align-top">
                      <NumInput value={g} onChange={(v) => setArr("ebitdaMargin", i, v)} label={`EBITDA margin year ${i + 1}`} width="w-16" />
                    </td>
                  ))}
                </tr>
                {(
                  [
                    ["daPctRevenue", "D&A as % of revenue", der.da],
                    ["capexPctRevenue", "Capital expenditures as % of revenue", der.capex],
                    ["nwcPctRevenue", "Net working capital as % of revenue", der.nwc],
                    ["taxRate", "Tax rate", der.tax],
                  ] as const
                ).map(([key, label, drv]) => (
                  <tr key={key} className="rule">
                    <td className="whitespace-normal" colSpan={4}>
                      {label}
                      <How judgment={drv?.judgment}>{drv?.how}</How>
                    </td>
                    <td className="num align-top" colSpan={2}>
                      <NumInput value={a[key]} onChange={(v) => setNum(key, v)} label={label} />
                      <span className="text-[11px] text-muted ml-1">all years</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* WACC */}
      <section>
        <h2 className="section-title">2. Cost of capital (WACC)</h2>
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 card p-4">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1.5 pr-3 align-top">
                    Risk-free rate
                    <How>
                      {der.riskFree?.how}{" "}
                      {defaults.riskFree ? (
                        <a className="link" href={defaults.riskFree.url} target="_blank" rel="noopener noreferrer">
                          U.S. Treasury
                        </a>
                      ) : null}
                    </How>
                  </td>
                  <td className="py-1.5 num align-top">
                    <NumInput value={w.riskFreeRate} onChange={(v) => setWacc("riskFreeRate", v)} decimals={2} label="Risk-free rate" />
                  </td>
                </tr>
                <tr className="border-t border-line-soft">
                  <td className="py-1.5 pr-3 align-top">
                    Beta
                    <How judgment={der.beta?.judgment}>{der.beta?.how}</How>
                  </td>
                  <td className="py-1.5 num align-top">
                    <NumInput value={w.beta} onChange={(v) => setWacc("beta", v)} percent={false} decimals={2} label="Beta" suffix="" />
                  </td>
                </tr>
                <tr className="border-t border-line-soft">
                  <td className="py-1.5 pr-3 align-top">
                    Equity risk premium
                    <How judgment>{der.erp?.how}</How>
                  </td>
                  <td className="py-1.5 num align-top">
                    <NumInput value={w.equityRiskPremium} onChange={(v) => setWacc("equityRiskPremium", v)} decimals={2} label="Equity risk premium" />
                  </td>
                </tr>
                <tr className="border-t border-navy font-semibold">
                  <td className="py-1.5 pr-3">
                    Cost of equity <span className="font-normal text-muted text-xs">= risk-free + beta × premium</span>
                  </td>
                  <td className="py-1.5 num pr-5">{wacc ? fmtPct(wacc.costOfEquity, 2) : "n/a"}</td>
                </tr>
                <tr className="border-t border-line-soft">
                  <td className="py-1.5 pr-3 align-top">
                    Pre-tax cost of debt
                    <How judgment={der.costOfDebt?.judgment}>{der.costOfDebt?.how}</How>
                  </td>
                  <td className="py-1.5 num align-top">
                    <NumInput value={w.preTaxCostOfDebt} onChange={(v) => setWacc("preTaxCostOfDebt", v)} decimals={2} label="Pre-tax cost of debt" />
                  </td>
                </tr>
                <tr className="border-t border-navy font-semibold">
                  <td className="py-1.5 pr-3">
                    After-tax cost of debt <span className="font-normal text-muted text-xs">= pre-tax × (1 − {fmtPct(a.taxRate)} tax)</span>
                  </td>
                  <td className="py-1.5 num pr-5">{wacc ? fmtPct(wacc.afterTaxCostOfDebt, 2) : "n/a"}</td>
                </tr>
                <tr className="border-t border-line-soft">
                  <td className="py-1.5 pr-3 align-top">
                    Weights
                    <How>{der.weights?.how}</How>
                  </td>
                  <td className="py-1.5 num align-top pr-5 whitespace-nowrap">
                    {wacc ? `${fmtPct(wacc.weightEquity, 0)} / ${fmtPct(wacc.weightDebt, 0)}` : "n/a"}
                  </td>
                </tr>
                <tr className="border-t-2 border-navy font-semibold text-navy">
                  <td className="py-2 pr-3">WACC</td>
                  <td className="py-2 num pr-5 text-base">{wacc ? fmtPct(wacc.wacc, 2) : "n/a"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 text-sm text-muted leading-relaxed space-y-3">
            <p>
              <span className="font-semibold text-ink">What WACC is.</span> The return the company must earn to satisfy everyone who funds it:
              shareholders (cost of equity) and lenders (cost of debt), weighted by how much of each it uses. It is the discount rate because
              the cash flows being discounted belong to both groups.
            </p>
            <p>
              <span className="font-semibold text-ink">Cost of equity</span> comes from the Capital Asset Pricing Model: investors want the
              risk-free rate, plus extra return for taking stock-market risk, scaled by how much the stock moves with the market (beta).
            </p>
            <p>
              <span className="font-semibold text-ink">Debt is cheaper</span> because interest is tax-deductible, which is why the cost of debt
              is multiplied by (1 − tax rate).
            </p>
          </div>
        </div>
      </section>

      {/* Projection */}
      {result && (
        <section>
          <h2 className="section-title">3. Unlevered free cash flow</h2>
          <div className="card p-2 sm:p-4">
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>$ in millions</th>
                    <th>
                      Base
                      <div className="font-normal text-muted text-[11px]">{defaults.baseLabel}</div>
                    </th>
                    {yearShort.map((y) => (
                      <th key={y.top}>
                        {y.top}
                        <div className="font-normal text-muted text-[11px]">{y.sub}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="total">
                    <td>Revenue</td>
                    <td className="num">{m(a.baseRevenue)}</td>
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.revenue)}</td>
                    ))}
                  </tr>
                  <tr className="sub">
                    <td>% growth</td>
                    <td className="num">–</td>
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{fmtPct(y.growth)}</td>
                    ))}
                  </tr>
                  <tr className="rule">
                    <td>EBITDA</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.ebitda)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Less: D&amp;A</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(-y.da)}</td>
                    ))}
                  </tr>
                  <tr className="rule">
                    <td>EBIT</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.ebit)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Less: taxes on EBIT at {fmtPct(a.taxRate)}</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(-y.taxes)}</td>
                    ))}
                  </tr>
                  <tr className="rule">
                    <td>After-tax operating profit (NOPAT)</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.nopat)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Plus: D&amp;A</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.da)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Less: capital expenditures</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(-y.capex)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>(Increase) / decrease in net working capital</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(-y.increaseInNwc)}</td>
                    ))}
                  </tr>
                  <tr className="total rule">
                    <td>Unlevered free cash flow</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.ufcf)}</td>
                    ))}
                  </tr>
                  <tr className="rule">
                    <td>Discount factor at {wacc ? fmtPct(wacc.wacc, 2) : ""}</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{y.discountFactor.toFixed(3)}</td>
                    ))}
                  </tr>
                  <tr className="total">
                    <td>Present value of free cash flow</td>
                    <td />
                    {result.years.map((y) => (
                      <td key={y.year} className="num">{m(y.pv)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            Year 1 is the twelve months after the latest reported quarter ({defaults.baseLabel}), so the cash flows, the balance sheet used for
            net debt and the valuation date all line up. Cash flows are discounted as if received at the end of each year. Stock-based
            compensation is not added back: it is treated as a real cost. No tax benefit is assumed in a loss-making year.
          </p>
        </section>
      )}

      {/* Terminal value and valuation */}
      {result && (
        <section>
          <h2 className="section-title">4. Terminal value and valuation</h2>
          <div className="card p-2 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 pb-3 border-b border-line-soft text-sm">
              <label className="flex items-center gap-2">
                <span>
                  Terminal growth
                  <span className="text-gold font-semibold text-[11px]"> · judgment</span>
                </span>
                <NumInput value={a.terminalGrowth} onChange={(v) => setNum("terminalGrowth", v)} decimals={2} label="Terminal growth" />
              </label>
              <label className="flex items-center gap-2">
                <span>Exit multiple (EV / EBITDA)</span>
                <NumInput value={a.exitMultiple} onChange={(v) => setA((p) => ({ ...p, exitMultiple: v }))} percent={false} label="Exit multiple" />
              </label>
              {peerMedian ? (
                <button className="link" onClick={() => setA((p) => ({ ...p, exitMultiple: Number(peerMedian.value.toFixed(1)) }))}>
                  Use peer median ({fmtMultiple(peerMedian.value)}, {peerMedian.count} peers)
                </button>
              ) : peerState === "none" ? (
                <span className="text-muted">Peer median not available right now; see the Trading comps tab.</span>
              ) : (
                <button className="link" disabled={peerState === "loading"} onClick={loadPeerMedian}>
                  {peerState === "loading" ? "Loading peers…" : "Use the peer median instead"}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>$ in millions, except per share</th>
                    <th>Perpetuity growth</th>
                    <th>Exit multiple</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const g = result.perpetuity;
                    const x = result.exit;
                    const eqG = g ? equityFromEnterpriseValue(g.enterpriseValue, b) : null;
                    const eqX = x ? equityFromEnterpriseValue(x.enterpriseValue, b) : null;
                    const last = result.years[result.years.length - 1];
                    const row = (label: React.ReactNode, vg: string, vx: string, cls = "") => (
                      <tr className={cls}>
                        <td className="whitespace-normal">{label}</td>
                        <td className="num">{vg}</td>
                        <td className="num">{vx}</td>
                      </tr>
                    );
                    return (
                      <>
                        {row(
                          <>
                            Terminal value at end of year 5
                            <div className="text-[11.5px] text-muted">
                              Growth: {m(last.ufcf)} × (1 + {fmtPct(a.terminalGrowth, 2)}) ÷ ({wacc ? fmtPct(wacc.wacc, 2) : ""} − {fmtPct(a.terminalGrowth, 2)}). Multiple: year 5 EBITDA {m(last.ebitda)} × {fmtMultiple(a.exitMultiple)}.
                            </div>
                          </>,
                          g ? m(g.value) : "n/m",
                          x ? m(x.value) : "n/m",
                        )}
                        {row(`Present value of terminal value (× ${last.discountFactor.toFixed(3)})`, g ? m(g.pv) : "n/m", x ? m(x.pv) : "n/m")}
                        {row("Plus: present value of free cash flows, years 1 to 5", m(result.sumPvUfcf), m(result.sumPvUfcf))}
                        {row("Enterprise value", g ? m(g.enterpriseValue) : "n/m", x ? m(x.enterpriseValue) : "n/m", "total rule")}
                        {row("Terminal value as % of enterprise value", g ? fmtPct(g.shareOfEv, 0) : "n/m", x ? fmtPct(x.shareOfEv, 0) : "n/m", "sub")}
                        {row("Less: total debt", m(-b.debt), m(-b.debt), "rule")}
                        {row("Less: preferred stock", m(-b.preferred), m(-b.preferred))}
                        {row("Less: noncontrolling interests", m(-b.noncontrollingInterest), m(-b.noncontrollingInterest))}
                        {row("Plus: cash and short-term investments", m(b.cash), m(b.cash))}
                        {row("Equity value", eqG ? m(eqG.equityValue) : "n/m", eqX ? m(eqX.equityValue) : "n/m", "total rule")}
                        {row("Shares outstanding (millions)", fmtShares(b.shares), fmtShares(b.shares))}
                        {row("Implied value per share", fmtPrice(eqG?.perShare ?? null), fmtPrice(eqX?.perShare ?? null), "total rule")}
                        {row("Current share price", fmtPrice(price), fmtPrice(price))}
                        {row(
                          "Premium / (discount) to current price",
                          vsPrice(eqG?.perShare ?? null) === null ? "n/m" : fmtPct(vsPrice(eqG?.perShare ?? null)),
                          vsPrice(eqX?.perShare ?? null) === null ? "n/m" : fmtPct(vsPrice(eqX?.perShare ?? null)),
                          "sub",
                        )}
                        {row(
                          <>
                            Cross-check
                            <div className="text-[11.5px] text-muted">Each method&rsquo;s answer, expressed in the other method&rsquo;s terms.</div>
                          </>,
                          g ? `implies ${fmtMultiple(g.impliedExitMultiple)} exit multiple` : "n/m",
                          x && x.impliedGrowth !== null ? `implies ${fmtPct(x.impliedGrowth, 2)} growth` : "n/m",
                          "rule",
                        )}
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            {result.perpetuityIssue ? `Perpetuity growth method: ${result.perpetuityIssue} ` : ""}
            {result.exitIssue ? `Exit multiple method: ${result.exitIssue} ` : ""}
            {der.terminalGrowth?.how} {der.exitMultiple?.how} Debt, cash and other bridge items are from the balance sheet dated{" "}
            {fmtDate(defaults.balanceDate)}. Shares are the basic count; option dilution is not included.
          </p>
        </section>
      )}

      {/* Sensitivity */}
      {result && (
        <section>
          <h2 className="section-title">5. Sensitivity: implied value per share</h2>
          <div className="grid lg:grid-cols-2 gap-5">
            {sensG && <Sensitivity t={sensG} price={price} colFmt={(v) => fmtPct(v, 2)} />}
            {sensM ? (
              <Sensitivity t={sensM} price={price} colFmt={(v) => fmtMultiple(v)} />
            ) : (
              <div className="card p-4 text-sm text-muted">Enter an exit multiple to see this table.</div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted leading-relaxed">
            The outlined cell is the base case. Shaded cells are above the current share price of {fmtPrice(price)}. A small change in WACC or
            terminal assumptions moves the answer a great deal, which is why a DCF is presented as a range rather than a single number.
          </p>
        </section>
      )}
    </div>
  );
}

function Sensitivity({ t, price, colFmt }: { t: SensitivityTable; price: number | null; colFmt: (v: number) => string }) {
  const mid = Math.floor(t.rows.length / 2);
  return (
    <div className="card p-2 sm:p-4">
      <div className="text-sm font-semibold text-navy px-2 pb-2">
        WACC (down) × {t.colLabel.toLowerCase()} (across)
      </div>
      <div className="overflow-x-auto">
        <table className="fin-table tight">
          <thead>
            <tr>
              <th>WACC</th>
              {t.cols.map((c, j) => (
                <th key={j}>{colFmt(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                <td className="font-semibold text-navy">{fmtPct(r, 2)}</td>
                {t.values[i].map((v, j) => {
                  const above = v !== null && price !== null && v > price;
                  const base = i === mid && j === mid;
                  return (
                    <td
                      key={j}
                      className={`num ${base ? "font-semibold" : ""}`}
                      style={{
                        background: above ? "var(--color-pass-soft)" : undefined,
                        outline: base ? "2px solid var(--color-navy)" : undefined,
                        outlineOffset: base ? "-2px" : undefined,
                      }}
                    >
                      {v === null ? "n/m" : fmtPrice(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
