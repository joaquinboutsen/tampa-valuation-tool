"use client";

import { useEffect, useMemo, useState } from "react";
import { impliedRanges, type CompRow, type TargetBasis } from "@/lib/finance/comps";
import { computeWacc, sensitivityGrowth, sensitivityMultiple } from "@/lib/finance/dcf";
import type { DcfDefaults } from "@/lib/finance/dcfDefaults";
import { axisDomain, axisTicks, compsBar, dcfBar, marketBar, precedentBar, type BarGroup, type FootballBar } from "@/lib/finance/football";
import { peersKey, readSession } from "@/lib/clientStore";
import { fmtPrice } from "@/lib/format";
import { loadDcfEdits } from "./DcfModel";

interface CompsResponse {
  peers: CompRow[];
  basis: TargetBasis;
  missingPrices?: string[];
  error?: string;
}

const GROUP_COLOR: Record<BarGroup, string> = {
  Market: "#6b7280",
  "Trading comps": "#12284b",
  DCF: "#9a7b3f",
  "Precedent transactions": "#1c7448",
};

function MultipleBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="–"
        className="w-16 rounded border border-line bg-white px-2 py-1 text-right text-[13px] num focus:outline-none focus:ring-2 focus:ring-navy/40"
      />
      <span className="text-muted text-xs">x</span>
    </span>
  );
}

const toNum = (s: string): number | null => {
  const n = Number(s.replace(/[x,\s]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export default function FootballField({
  ticker,
  price,
  low52,
  high52,
  basis,
  defaults,
  isFinancial,
  initialPeers,
  provider,
}: {
  ticker: string;
  price: number | null;
  low52: number | null;
  high52: number | null;
  basis: TargetBasis;
  defaults: DcfDefaults;
  isFinancial: boolean;
  initialPeers: string | null;
  provider: string;
}) {
  const [comps, setComps] = useState<CompsResponse | null>(null);
  const [compsState, setCompsState] = useState<"loading" | "ready" | "failed">("loading");
  const [dcfEdited, setDcfEdited] = useState(false);
  const [dcf, setDcf] = useState({ a: defaults.assumptions, w: defaults.waccInputs });
  const [prec, setPrec] = useState({ ebitdaLow: "", ebitdaHigh: "", revLow: "", revHigh: "" });
  const [customPeers, setCustomPeers] = useState(Boolean(initialPeers));

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ ticker });
    // Use the peer set chosen on the Trading comps tab, if there is one.
    const peers = initialPeers ?? readSession(peersKey(ticker));
    if (peers) qs.set("peers", peers);
    setCustomPeers(Boolean(peers));
    fetch(`/api/comps?${qs.toString()}`)
      .then(async (r) => ({ ok: r.ok, json: (await r.json()) as CompsResponse }))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || json.error) setCompsState("failed");
        else {
          setComps(json);
          setCompsState("ready");
        }
      })
      .catch(() => !cancelled && setCompsState("failed"));
    return () => {
      cancelled = true;
    };
  }, [ticker, initialPeers]);

  // Use the assumptions edited on the DCF tab, if any, so the two pages agree.
  useEffect(() => {
    if (!defaults.assumptions) return;
    const saved = loadDcfEdits(ticker, defaults.assumptions.baseRevenue);
    if (saved) {
      setDcf(saved);
      setDcfEdited(JSON.stringify(saved.a) !== JSON.stringify(defaults.assumptions) || JSON.stringify(saved.w) !== JSON.stringify(defaults.waccInputs));
    }
    try {
      const p = window.sessionStorage.getItem(`precedents:${ticker}`);
      if (p) setPrec(JSON.parse(p));
    } catch {
      /* storage unavailable */
    }
  }, [ticker, defaults]);

  function updatePrec(patch: Partial<typeof prec>) {
    setPrec((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.sessionStorage.setItem(`precedents:${ticker}`, JSON.stringify(next));
      } catch {
        /* not essential */
      }
      return next;
    });
  }

  const bars = useMemo<FootballBar[]>(() => {
    const out: FootballBar[] = [marketBar(low52, high52)];

    if (comps) {
      const ranges = impliedRanges(comps.peers.filter((p) => !p.error), comps.basis);
      for (const r of ranges) {
        if (isFinancial && (r.key === "evRevenue" || r.key === "evEbitda")) continue;
        out.push(compsBar(r));
      }
    }

    if (!isFinancial) {
      if (dcf.a && dcf.w) {
        const w = computeWacc({ ...dcf.w, taxRate: dcf.a.taxRate });
        const model = w ? { ...dcf.a, wacc: w.wacc } : null;
        out.push(dcfBar("dcf-growth", "DCF: perpetuity growth", model ? sensitivityGrowth(model, defaults.bridge) : null, "Not available: the perpetuity growth method gives no meaningful value with these assumptions."));
        out.push(dcfBar("dcf-exit", "DCF: exit multiple", model ? sensitivityMultiple(model, defaults.bridge) : null, "Not available: no exit multiple is set, or final-year EBITDA is negative."));
      } else {
        out.push(dcfBar("dcf-growth", "DCF", null, defaults.reason ?? "Not available."));
      }
      out.push(precedentBar("evEbitda", "Precedents: EV / EBITDA", toNum(prec.ebitdaLow), toNum(prec.ebitdaHigh), basis));
      out.push(precedentBar("evRevenue", "Precedents: EV / Revenue", toNum(prec.revLow), toNum(prec.revHigh), basis));
    }
    return out;
  }, [comps, dcf, prec, low52, high52, basis, defaults, isFinancial]);

  const drawn = bars.filter((b) => b.low !== null && b.high !== null);
  const domain = axisDomain(drawn, price);
  const ticks = domain ? axisTicks(domain.min, domain.max) : [];
  const pos = (v: number) => (domain ? ((v - domain.min) / (domain.max - domain.min)) * 100 : 0);
  const groups: BarGroup[] = ["Market", "Trading comps", "DCF", "Precedent transactions"];

  return (
    <div className="space-y-6">
      <div className="card p-3 sm:p-5">
        {compsState === "loading" && <div className="text-sm text-muted mb-3">Loading the peer set for the trading comps bars…</div>}
        {compsState === "failed" && (
          <div className="text-sm mb-3 text-fail">The trading comps could not be loaded, so those bars are missing. Reload the page to try again.</div>
        )}
        {comps?.missingPrices?.length ? (
          <div className="text-sm mb-3 text-muted">
            Share prices for {comps.missingPrices.join(", ")} did not load (free market-data limit), so they are left out of the comps bars.
          </div>
        ) : null}

        {domain ? (
          <div>
            {groups.map((g) => {
              const rows = bars.filter((b) => b.group === g);
              if (!rows.length) return null;
              return (
                <div key={g} className="mb-2">
                  <div className="text-[11px] uppercase tracking-wider font-semibold mt-3 mb-1" style={{ color: GROUP_COLOR[g] }}>
                    {g}
                  </div>
                  {rows.map((b) => (
                    <div key={b.key} className="grid grid-cols-1 sm:grid-cols-[200px_1fr] sm:items-center gap-x-3 py-1.5">
                      <div className="text-[13px] leading-tight">{b.label}</div>
                      {/* side margins leave room for the low / high labels */}
                      <div className="relative h-9 mx-14">
                        {/* current price guide */}
                        {price !== null && <div className="absolute top-0 bottom-0 border-l border-dashed border-fail/70" style={{ left: `${pos(price)}%` }} />}
                        {b.low !== null && b.high !== null ? (
                          <>
                            <div
                              className="absolute top-2 h-5 rounded-sm"
                              style={{ left: `${pos(b.low)}%`, width: `${Math.max(0.6, pos(b.high) - pos(b.low))}%`, background: GROUP_COLOR[g], opacity: 0.88 }}
                              title={b.detail}
                            />
                            {b.mid !== null && <div className="absolute top-1.5 h-6 w-0.5 bg-white" style={{ left: `${pos(b.mid)}%` }} />}
                            <div className="absolute top-2.5 text-[11px] num text-ink -translate-x-full pr-1.5 leading-4 bg-card" style={{ left: `${pos(b.low)}%` }}>
                              {fmtPrice(b.low)}
                            </div>
                            <div className="absolute top-2.5 text-[11px] num text-ink pl-1.5 leading-4 bg-card" style={{ left: `${pos(b.high)}%` }}>
                              {fmtPrice(b.high)}
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-y-0 left-0 flex items-center text-[12px] text-muted italic">
                            {b.group === "Precedent transactions" && /^Enter/.test(b.detail) ? "enter multiples below to add this bar" : "not available"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* axis */}
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-x-3 mt-1">
              <div />
              <div className="relative h-10 border-t border-ink/60 mx-14">
                {ticks.map((t) => (
                  <div key={t} className="absolute top-0 -translate-x-1/2 text-[11px] text-muted num" style={{ left: `${pos(t)}%` }}>
                    <div className="mx-auto h-1.5 w-px bg-ink/60" />${t.toLocaleString("en-US")}
                  </div>
                ))}
                {price !== null && (
                  <div className="absolute top-5 -translate-x-1/2 text-[11px] font-semibold text-fail whitespace-nowrap" style={{ left: `${Math.min(92, Math.max(8, pos(price)))}%` }}>
                    Current {fmtPrice(price)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted">Not enough data to draw the chart.</div>
        )}
      </div>

      {!isFinancial && (
        <div className="card p-4">
          <h3 className="text-base font-semibold text-navy">Precedent transactions (optional, entered by you)</h3>
          <p className="text-sm text-muted leading-relaxed mt-1 max-w-3xl">
            Precedent transaction analysis values a company from the multiples paid in past acquisitions of similar companies. There is no free,
            reliable public database of deal multiples (they are sold by providers such as FactSet, Capital IQ and Dealogic), so this tool does
            not invent any. If you have multiples from comparable deals, for example from merger proxy statements or press releases, enter the
            low and high end here and the bar is added to the chart.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span>EV / LTM EBITDA</span>
              <MultipleBox value={prec.ebitdaLow} onChange={(v) => updatePrec({ ebitdaLow: v })} label="Precedent EV/EBITDA low" />
              <span className="text-muted">to</span>
              <MultipleBox value={prec.ebitdaHigh} onChange={(v) => updatePrec({ ebitdaHigh: v })} label="Precedent EV/EBITDA high" />
            </div>
            <div className="flex items-center gap-2">
              <span>EV / LTM revenue</span>
              <MultipleBox value={prec.revLow} onChange={(v) => updatePrec({ revLow: v })} label="Precedent EV/Revenue low" />
              <span className="text-muted">to</span>
              <MultipleBox value={prec.revHigh} onChange={(v) => updatePrec({ revHigh: v })} label="Precedent EV/Revenue high" />
            </div>
          </div>
        </div>
      )}

      <div className="card p-2 sm:p-4">
        <div className="overflow-x-auto">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Implied value per share</th>
                <th>Low</th>
                <th>Mid</th>
                <th>High</th>
                <th style={{ textAlign: "left" }}>How the range is built</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key}>
                  <td>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle" style={{ background: GROUP_COLOR[b.group] }} />
                    {b.label}
                  </td>
                  <td className="num">{b.low === null ? "n/a" : fmtPrice(b.low)}</td>
                  <td className="num">{b.mid === null ? "–" : fmtPrice(b.mid)}</td>
                  <td className="num">{b.high === null ? "n/a" : fmtPrice(b.high)}</td>
                  <td className="text-muted text-[12.5px] whitespace-normal min-w-[260px]">{b.detail}</td>
                </tr>
              ))}
              <tr className="total rule">
                <td>Current share price</td>
                <td />
                <td className="num">{fmtPrice(price)}</td>
                <td />
                <td className="text-muted text-[12.5px] font-normal">{provider}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        The white tick inside a bar is the central value (peer median or DCF base case). The dashed red line is the current share price.{" "}
        {dcfEdited ? "The DCF bars use the assumptions you edited on the DCF tab in this browser tab. " : "The DCF bars use the default assumptions; edits made on the DCF tab carry over. "}
        Comps bars use the peer set from the Trading comps tab{customPeers ? " (your edited set)" : " (suggested peers)"}. A football field is a
        summary, not a calculation: the bars are only as good as the peer set and the DCF assumptions behind them.
      </p>
    </div>
  );
}
