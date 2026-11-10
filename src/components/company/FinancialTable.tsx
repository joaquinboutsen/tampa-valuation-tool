import type { Cell, PeriodCol } from "@/lib/types";
import type { DisplayRow } from "@/lib/finance/summary";
import { fmtDate, fmtM, fmtPct, fmtShares, NA } from "@/lib/format";

function show(kind: DisplayRow["kind"], v: number | null, decimals: number): string {
  if (v === null) return kind === "pct" ? "–" : NA;
  if (kind === "pct") return fmtPct(v);
  if (kind === "perShare") return v < 0 ? `($${Math.abs(v).toFixed(2)})` : `$${v.toFixed(2)}`;
  if (kind === "shares") return fmtShares(v);
  return fmtM(v, decimals);
}

/** Hover text: where the number came from. */
function tip(cell: Cell | null | undefined): string | undefined {
  if (!cell) return undefined;
  const src = cell.sources
    .map((s) => `${s.tag} | ${s.form} filed ${fmtDate(s.filed)}${s.start ? ` | ${s.start} to ${s.end}` : ` | as of ${s.end}`}`)
    .join("\n");
  return [cell.note, src].filter(Boolean).join("\n") || undefined;
}

export default function FinancialTable({
  rows,
  years,
  ltm,
  decimals,
}: {
  rows: DisplayRow[];
  years: PeriodCol[];
  ltm: PeriodCol | null;
  decimals: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="fin-table">
        <thead>
          <tr>
            <th>$ in millions, except per share</th>
            {years.map((y) => (
              <th key={y.end}>{y.label}</th>
            ))}
            {ltm && <th className="ltm">{ltm.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`${r.style === "total" ? "total" : r.style === "sub" ? "sub" : ""} ${r.rule ? "rule" : ""}`}>
              <td>{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="num" title={tip(r.cells?.[i])}>
                  {show(r.kind, v, decimals)}
                </td>
              ))}
              {ltm && (
                <td className="num ltm" title={tip(r.ltmCell)}>
                  {r.kind === "shares" ? "" : show(r.kind, r.ltm, decimals)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Expandable list of the tag and filing behind each line. */
export function SourceList({ rows, title = "Sources for every line" }: { rows: DisplayRow[]; title?: string }) {
  const items = rows.filter((r) => r.cells);
  return (
    <details className="mt-3 text-xs text-muted">
      <summary className="link inline-block">{title}</summary>
      <ul className="mt-2 space-y-1.5">
        {items.map((r) => {
          const last = [...(r.cells ?? [])].reverse().find((c) => c.value !== null);
          const note = r.ltmCell?.note && r.ltmCell.derived ? r.ltmCell.note : last?.note;
          return (
            <li key={r.key}>
              <span className="font-medium text-ink">{r.label}:</span>{" "}
              {last && last.sources.length ? (
                <>
                  {[...new Set(last.sources.map((s) => s.tag))].join(" + ")} from the{" "}
                  <a className="link" href={last.sources[0].url} target="_blank" rel="noopener noreferrer">
                    {last.sources[0].form} filed {fmtDate(last.sources[0].filed)}
                  </a>
                  .
                </>
              ) : (
                <>{last?.note ?? "Not reported by the company."}</>
              )}{" "}
              {note && last?.sources.length ? <span>{note}</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
