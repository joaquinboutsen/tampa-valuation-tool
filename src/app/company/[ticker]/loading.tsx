export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="text-sm text-muted">Reading SEC filings…</div>
      <div className="mt-4 space-y-3 animate-pulse">
        <div className="h-9 w-2/3 max-w-md rounded bg-line" />
        <div className="h-4 w-1/2 max-w-sm rounded bg-line-soft" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded bg-line-soft" />
          ))}
        </div>
        <div className="h-64 rounded bg-line-soft" />
      </div>
    </div>
  );
}
