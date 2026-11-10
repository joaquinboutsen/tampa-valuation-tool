export function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-serif text-2xl font-semibold text-navy leading-tight mt-0.5 num !text-left">{value}</div>
      {sub ? <div className="text-xs text-muted mt-0.5 leading-snug">{sub}</div> : null}
    </div>
  );
}

/** Where today's price sits between the 52-week low and high. */
export function RangeBar({ low, high, price }: { low: number | null; high: number | null; price: number | null }) {
  if (low === null || high === null || price === null || !(high > low)) return null;
  const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded bg-line">
        <div className="absolute top-1/2 h-3 w-1 -translate-y-1/2 -translate-x-1/2 rounded-sm bg-navy" style={{ left: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted mt-1 num">
        <span>${low.toFixed(2)}</span>
        <span>${high.toFixed(2)}</span>
      </div>
    </div>
  );
}
