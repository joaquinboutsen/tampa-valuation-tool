"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { impliedRanges, MULTIPLE_LABELS, peerStats, type CompRow, type MultipleKey, type TargetBasis } from "@/lib/finance/comps";
import { positionInSet, type Stats } from "@/lib/finance/stats";
import { peersKey, readSession, writeSession } from "@/lib/clientStore";
import DownloadButton from "../DownloadButton";
import { fmtM, fmtMultiple, fmtPct, fmtPrice } from "@/lib/format";

interface CompsResponse {
  target: CompRow;
  basis: TargetBasis;
  targetIsFinancial: boolean;
  peers: CompRow[];
  suggested: string[];
  peerSource: string;
  maxPeers: number;
  provider: string;
  missingPrices?: string[];
  error?: string;
}

const KEYS: MultipleKey[] = ["evRevenue", "evEbitda", "peLtm", "peForward"];
const STAT_ROWS: { key: keyof Stats; label: string }[] = [
  { key: "max", label: "Maximum" },
  { key: "p75", label: "75th percentile" },
  { key: "median", label: "Median" },
  { key: "p25", label: "25th percentile" },
  { key: "min", label: "Minimum" },
];

function ordinal(p: number): string {
  if (p >= 1) return "at or above every peer";
  if (p <= 0) return "below every peer";
  return `above ${Math.round(p * 100)}% of peers`;
}

export default function CompsPanel({ ticker, initialPeers }: { ticker: string; initialPeers: string | null }) {
  const [data, setData] = useState<CompsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [addText, setAddText] = useState("");

  const load = useCallback(
    async (peers: string[] | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ ticker });
        if (peers !== null) qs.set("peers", peers.join(","));
        const res = await fetch(`/api/comps?${qs.toString()}`);
        const json = (await res.json()) as CompsResponse;
        if (!res.ok || json.error) throw new Error(json.error ?? "The comps could not be loaded.");
        setData(json);
        // Keep the peer set in the address bar so the page can be shared or bookmarked.
        const url = new URL(window.location.href);
        const chosen = peers !== null ? json.peers.map((p) => p.ticker).join(",") : null;
        if (chosen !== null) url.searchParams.set("peers", chosen);
        else url.searchParams.delete("peers");
        // Remembered so the football field uses the same peer set.
        writeSession(peersKey(ticker), chosen);
        window.history.replaceState(null, "", url.toString());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [ticker],
  );

  useEffect(() => {
    const remembered = initialPeers ?? readSession(peersKey(ticker));
    load(remembered ? remembered.split(",").filter(Boolean) : null);
  }, [load, initialPeers]);

  const included = useMemo(() => (data ? data.peers.filter((p) => !p.error && !excluded.has(p.ticker)) : []), [data, excluded]);
  const stats = useMemo(() => peerStats(included), [included]);
  const implied = useMemo(() => (data ? impliedRanges(included, data.basis) : []), [included, data]);

  if (loading && !data) {
    return (
      <div className="card p-6 text-sm text-muted">
        Loading the peer set. Each peer is built from its own SEC filings, so the first load can take 5 to 15 seconds…
        <div className="mt-4 space-y-2 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 rounded bg-line-soft" />
          ))}
        </div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="card border-l-4 !border-l-fail p-4 text-sm">
        <span className="font-semibold">Comps not available.</span> {error}{" "}
        <button className="link" onClick={() => load(null)}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;

  const fin = data.targetIsFinancial;
  const cols = fin ? (["peLtm", "peForward"] as MultipleKey[]) : KEYS;
  const peerTickers = data.peers.map((p) => p.ticker);

  function toggle(t: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function remove(t: string) {
    load(peerTickers.filter((x) => x !== t));
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = addText.trim().toUpperCase();
    if (!t || t === ticker || peerTickers.includes(t)) {
      setAddText("");
      return;
    }
    if (peerTickers.length >= data!.maxPeers) {
      setError(`The table is limited to ${data!.maxPeers} peers to stay within the data providers' rate limits. Remove one first.`);
      return;
    }
    setAddText("");
    load([...peerTickers, t]);
  }

  const cell = (v: number | null, kind: "x" | "m" | "pct" | "price") =>
    kind === "x" ? fmtMultiple(v) : kind === "m" ? fmtM(v) : kind === "pct" ? (v === null ? "n/a" : fmtPct(v)) : fmtPrice(v);

  const Row = ({ r, isTarget }: { r: CompRow; isTarget?: boolean }) => {
    const off = !isTarget && (excluded.has(r.ticker) || Boolean(r.error));
    return (
      <tr className={`${isTarget ? "total" : ""} ${off ? "opacity-45" : ""}`} style={isTarget ? { background: "var(--color-navy-soft)" } : undefined}>
        <td style={isTarget ? { background: "var(--color-navy-soft)" } : undefined}>
          <div className="flex items-center gap-2">
            {!isTarget && (
              <input
                type="checkbox"
                checked={!off}
                disabled={Boolean(r.error)}
                onChange={() => toggle(r.ticker)}
                aria-label={`Include ${r.ticker} in the statistics`}
                className="accent-[var(--color-navy)]"
              />
            )}
            <a href={`/company/${r.ticker}`} className="link font-semibold">
              {r.ticker}
            </a>
            <span className="text-muted truncate max-w-[120px] hidden md:inline text-[12.5px]" title={r.name}>
              {r.name !== r.ticker ? r.name : ""}
            </span>
            {isTarget && <span className="text-[10px] uppercase tracking-wide bg-navy text-white rounded px-1.5 py-0.5">Target</span>}
          </div>
          {r.error && <div className="text-[11.5px] text-fail font-normal leading-snug max-w-xs whitespace-normal">{r.error}</div>}
        </td>
        <td className="num">{cell(r.price, "price")}</td>
        <td className="num">{cell(r.marketCap, "m")}</td>
        {!fin && <td className="num">{cell(r.enterpriseValue, "m")}</td>}
        <td className="num">{cell(r.revenue, "m")}</td>
        {!fin && <td className="num">{cell(r.ebitda, "m")}</td>}
        {!fin && <td className="num">{cell(r.ebitdaMargin, "pct")}</td>}
        {cols.map((k) => (
          <td key={k} className="num" title={r.notes.join("\n") || undefined}>
            {cell(r[k], "x")}
          </td>
        ))}
        <td className="num">
          {!isTarget && (
            <button onClick={() => remove(r.ticker)} className="text-muted hover:text-fail px-1" aria-label={`Remove ${r.ticker}`} title="Remove from the peer set">
              ×
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="card border-l-4 !border-l-fail px-4 py-3 text-sm">
          {error}{" "}
          <button className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {(data.missingPrices?.length || data.target.price === null) && (
        <div className="card border-l-4 !border-l-gold px-4 py-3 text-sm leading-relaxed">
          <span className="font-semibold text-navy">Some share prices did not load.</span>{" "}
          {data.missingPrices?.length ? `Missing for ${data.missingPrices.join(", ")}. ` : ""}
          The free market-data tier allows about 60 requests a minute across all visitors, and that limit was reached. Those companies are
          left out of the statistics below. Wait a minute, then{" "}
          <button className="link" onClick={() => load(peerTickers.length && data.peerSource === "custom" ? peerTickers : null)}>
            reload the prices
          </button>
          .
        </div>
      )}

      <div className="card p-2 sm:p-4">
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="fin-table compact">
            <thead>
              <tr>
                <th>$ in millions, except per share</th>
                <th>Price</th>
                <th>Market cap</th>
                {!fin && <th>Enterprise value</th>}
                <th>LTM revenue</th>
                {!fin && <th>LTM EBITDA</th>}
                {!fin && <th>EBITDA margin</th>}
                {cols.map((k) => (
                  <th key={k}>{MULTIPLE_LABELS[k].replace(" (LTM)", "").replace(" (forward)", " fwd")}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              <Row r={data.target} isTarget />
              {data.peers.map((p) => (
                <Row key={p.ticker} r={p} />
              ))}
              {STAT_ROWS.map((s, i) => (
                <tr key={s.key} className={`${i === 0 ? "rule" : ""} ${s.key === "median" ? "total" : ""}`}>
                  <td className={s.key === "median" ? "" : "text-muted"}>{s.label}</td>
                  <td colSpan={fin ? 3 : 6} />
                  {cols.map((k) => (
                    <td key={k} className="num">
                      {stats[k] ? fmtMultiple(stats[k]![s.key] as number) : "n/m"}
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
              <tr className="rule">
                <td className="text-muted">Peers counted</td>
                <td colSpan={fin ? 3 : 6} />
                {cols.map((k) => (
                  <td key={k} className="num text-muted">
                    {stats[k]?.count ?? 0}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2 px-2 pb-1 text-sm">
          <label htmlFor="add-peer" className="text-muted">
            Add a peer:
          </label>
          <input
            id="add-peer"
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="Ticker"
            maxLength={10}
            className="w-28 rounded border border-line px-2 py-1 uppercase"
          />
          <button type="submit" disabled={loading} className="rounded bg-navy text-white px-3 py-1 disabled:opacity-60">
            {loading ? "Loading…" : "Add"}
          </button>
          <button type="button" className="link" onClick={() => { setExcluded(new Set()); load(null); }}>
            Reset to suggested peers
          </button>
          <span className="sm:ml-auto">
            <DownloadButton
              kind="comps"
              label="Download as Excel"
              getPayload={() => ({
                ticker,
                target: data.target,
                peers: included,
                excluded: data.peers.filter((p) => !p.error && excluded.has(p.ticker)),
                basis: data.basis,
                provider: data.provider,
              })}
            />
          </span>
        </form>
      </div>

      {/* Where the target sits */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-lg font-semibold text-navy mb-2">Where {data.target.ticker} sits</h3>
          <div className="card p-4 text-sm space-y-2">
            {cols.map((k) => {
              const tv = data.target[k];
              const pos = positionInSet(tv, included.map((p) => p[k]));
              const s = stats[k];
              return (
                <div key={k} className="flex justify-between gap-4 border-b border-line-soft pb-2 last:border-0 last:pb-0">
                  <span>{MULTIPLE_LABELS[k]}</span>
                  <span className="text-right">
                    <span className="font-semibold num">{fmtMultiple(tv)}</span>
                    <span className="text-muted">
                      {" "}
                      vs median {s ? fmtMultiple(s.median) : "n/m"}
                      {tv !== null && pos !== null ? ` · ${ordinal(pos)}` : tv === null ? " · not meaningful for the target" : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-navy mb-2">Implied share price at peer multiples</h3>
          <div className="card p-2 sm:p-4">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Multiple applied to {data.target.ticker}</th>
                  <th>25th pct.</th>
                  <th>Median</th>
                  <th>75th pct.</th>
                </tr>
              </thead>
              <tbody>
                {implied
                  .filter((r) => cols.includes(r.key))
                  .map((r) => (
                    <tr key={r.key}>
                      <td>
                        {r.label}
                        <div className="text-[11.5px] text-muted">
                          {r.peerCount ? `${fmtMultiple(r.lowMultiple)} / ${fmtMultiple(r.midMultiple)} / ${fmtMultiple(r.highMultiple)}` : "No meaningful peer multiples"}
                        </div>
                      </td>
                      <td className="num">{fmtPrice(r.low)}</td>
                      <td className="num font-semibold">{fmtPrice(r.mid)}</td>
                      <td className="num">{fmtPrice(r.high)}</td>
                    </tr>
                  ))}
                <tr className="rule total">
                  <td>Current share price</td>
                  <td />
                  <td className="num">{fmtPrice(data.target.price)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Peer set: {data.peerSource === "custom" ? "chosen on this page" : data.peerSource === "none" ? "no suggestions available; add tickers above" : `suggested by ${data.provider} from its industry classification`}.
        Suggested peers are a starting point and are often imperfect: untick or remove any company that is not a true comparable and add better
        ones. Every company&rsquo;s multiples are calculated the same way, from its own SEC filings and the {data.provider} share price. Forward
        P/E is the figure published by {data.provider} (based on analyst estimates) and is not recalculated here. Forward EV / EBITDA is not
        shown because consensus EBITDA estimates are not available from a free, licensed source. n/m = not meaningful (negative or zero earnings, or a multiple above 100x because earnings are close to zero).
        Statistics use Excel&rsquo;s inclusive percentile method.
      </p>
    </div>
  );
}
