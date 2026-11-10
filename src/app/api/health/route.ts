import { NextResponse } from "next/server";

/**
 * Diagnostic page: reports whether this deployment can reach each data source.
 * It never reveals secrets, only whether they are set and look well-formed.
 */
export const dynamic = "force-dynamic";

interface Probe {
  name: string;
  url: string;
  status: number | string;
  ms: number;
  hint: string;
}

function titleOf(body: string): string {
  const t = /<title>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? "";
  return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
}

async function probe(name: string, url: string, headers: Record<string, string>): Promise<Probe> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    let hint = "";
    if (!res.ok) hint = titleOf(await res.text());
    else await res.body?.cancel();
    return { name, url, status: res.status, ms: Date.now() - t0, hint };
  } catch (e) {
    return { name, url, status: "network error", ms: Date.now() - t0, hint: (e as Error).message.slice(0, 140) };
  }
}

export async function GET() {
  const ua = process.env.SEC_USER_AGENT ?? "";
  const key = process.env.FINNHUB_API_KEY ?? "";
  const sec = { "User-Agent": ua, "Accept-Encoding": "gzip, deflate" };

  const probes: Probe[] = [];
  // Run one at a time, to stay well inside the SEC's rate limit.
  probes.push(await probe("SEC ticker list (www.sec.gov)", "https://www.sec.gov/files/company_tickers.json", sec));
  probes.push(await probe("SEC company data (data.sec.gov)", "https://data.sec.gov/submissions/CIK0000898293.json", sec));
  probes.push(await probe("SEC filing archive (www.sec.gov/Archives)", "https://www.sec.gov/Archives/edgar/data/898293/000162828026067038/FilingSummary.xml", sec));
  probes.push(await probe("Finnhub quote", "https://finnhub.io/api/v1/quote?symbol=JBL", key ? { "X-Finnhub-Token": key } : {}));

  return NextResponse.json(
    {
      settings: {
        SEC_USER_AGENT: {
          set: ua.length > 0,
          length: ua.length,
          containsEmail: /\S+@\S+\.\S+/.test(ua),
          hasQuotes: /["']/.test(ua),
          wordCount: ua.trim() ? ua.trim().split(/\s+/).length : 0,
        },
        FINNHUB_API_KEY: { set: key.length > 0, length: key.length, hasSpacesOrQuotes: /[\s"']/.test(key) },
      },
      region: process.env.VERCEL_REGION ?? "local",
      probes,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
