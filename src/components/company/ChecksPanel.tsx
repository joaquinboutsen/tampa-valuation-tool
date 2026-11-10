import type { CheckResult } from "@/lib/types";

const BADGE: Record<CheckResult["status"], { text: string; cls: string }> = {
  pass: { text: "Pass", cls: "bg-pass-soft text-pass" },
  fail: { text: "Flag", cls: "bg-fail-soft text-fail" },
  na: { text: "N/A", cls: "bg-na-soft text-na" },
};

const ORDER: Record<CheckResult["status"], number> = { fail: 0, pass: 1, na: 2 };

export default function ChecksPanel({ checks }: { checks: CheckResult[] }) {
  const sorted = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const count = (s: CheckResult["status"]) => checks.filter((c) => c.status === s).length;
  const fails = count("fail");
  return (
    <div className="card">
      <div className="px-4 sm:px-5 py-3 border-b border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className={`font-semibold ${fails ? "text-fail" : "text-pass"}`}>
          {fails ? `${fails} item${fails > 1 ? "s" : ""} flagged for review` : "All tie-outs that could be run passed"}
        </span>
        <span className="text-muted">
          {count("pass")} passed · {fails} flagged · {count("na")} not available
        </span>
      </div>
      <ul className="divide-y divide-line-soft">
        {sorted.map((c) => (
          <li key={c.id} className="px-4 sm:px-5 py-3 flex gap-3">
            <span className={`shrink-0 mt-0.5 inline-flex h-6 w-12 items-center justify-center rounded text-[11px] font-semibold uppercase tracking-wide ${BADGE[c.status].cls}`}>
              {BADGE[c.status].text}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-medium">
                {c.title} <span className="text-muted font-normal">· {c.period}</span>
              </div>
              <div className="text-muted text-[13px] leading-relaxed break-words">
                {c.detail}{" "}
                {c.filingUrl ? (
                  <a className="link whitespace-nowrap" href={c.filingUrl} target="_blank" rel="noopener noreferrer">
                    {c.filingLabel ?? "View filing"}
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 sm:px-5 py-3 border-t border-line text-xs text-muted leading-relaxed">
        A check passes when the two sides agree within three rounding units or 0.1%, whichever is larger. A flag does not mean the filing is
        wrong: it means the numbers this tool reads do not tie, and the item should be checked against the filing before relying on it.
      </div>
    </div>
  );
}
