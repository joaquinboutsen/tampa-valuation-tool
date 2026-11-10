"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Match {
  ticker: string;
  name: string;
}

export default function SearchBox({
  autoFocus = false,
  compact = false,
  onDark = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
  /** Use a light button when the box sits on the navy hero. */
  onDark?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Look up suggestions shortly after the user stops typing.
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setMatches([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { results: Match[] };
        setMatches(data.results);
        setActive(-1);
      } catch {
        /* typing ahead cancels earlier lookups */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    setOpen(false);
    router.push(`/company/${encodeURIComponent(t)}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const typed = q.trim().toUpperCase();
    if (active >= 0 && matches[active]) go(matches[active].ticker);
    else if (matches.some((m) => m.ticker === typed)) go(typed);
    else if (matches.length) go(matches[0].ticker);
    else go(typed);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={onSubmit} className="flex gap-2" role="search">
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Ticker or company name"
          placeholder={compact ? "Ticker or company" : "Enter a ticker or company name (e.g. JBL)"}
          className={`w-full rounded border border-line bg-white text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-navy/40 ${
            compact ? "px-3 py-1.5 text-sm" : "px-4 py-3 text-base"
          }`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`rounded font-medium disabled:opacity-60 whitespace-nowrap ${onDark ? "bg-white text-navy hover:bg-navy-soft" : "bg-navy text-white hover:bg-ink"} ${
            compact ? "px-3 py-1.5 text-sm" : "px-5 py-3"
          }`}
        >
          {busy ? "Loading…" : "Value it"}
        </button>
      </form>
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded border border-line bg-white shadow-lg overflow-hidden text-left" role="listbox">
          {matches.map((m, i) => (
            <li key={m.ticker} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(m.ticker)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-baseline gap-3 px-4 py-2 text-sm text-left ${i === active ? "bg-navy-soft" : ""}`}
              >
                <span className="font-semibold text-navy w-16 shrink-0">{m.ticker}</span>
                <span className="text-muted truncate">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
