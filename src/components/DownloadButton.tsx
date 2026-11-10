"use client";

import { useState } from "react";

/**
 * Asks the server to build an Excel workbook from the model as it stands on
 * the page, then saves it. `getPayload` is called at click time so the file
 * always reflects the visitor's latest edits.
 */
export default function DownloadButton({ kind, getPayload, label }: { kind: "dcf" | "comps"; getPayload: () => unknown; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function download() {
    setState("busy");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload: getPayload() }),
      });
      if (!res.ok) throw new Error("export failed");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${kind}.xlsx`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={state === "busy"}
      className="inline-flex items-center gap-2 rounded border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy-soft disabled:opacity-60"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {state === "busy" ? "Building the file…" : state === "error" ? "Could not build the file. Try again" : label}
    </button>
  );
}
