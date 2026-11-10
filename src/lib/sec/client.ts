/**
 * All traffic to sec.gov goes through here.
 *
 * SEC fair-access rules: identify yourself in the User-Agent header and stay
 * at or below 10 requests per second. We space requests ~125 ms apart
 * (8 per second) to leave a margin.
 */

const MIN_GAP_MS = 125;
let chain: Promise<void> = Promise.resolve();
let lastStart = 0;

function throttle(): Promise<void> {
  const next = chain.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
  });
  chain = next.catch(() => undefined);
  return next;
}

export class SecError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
  }
}

function userAgent(): string {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) {
    throw new SecError(
      "SEC_USER_AGENT is not set. The SEC requires a contact name and email on every request.",
      500,
      "",
    );
  }
  return ua;
}

export interface SecFetchOptions {
  /** Seconds to keep the response in Next.js' cache. Omit for large files (>2 MB cannot be cached). */
  revalidate?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function secFetch(url: string, opts: SecFetchOptions = {}): Promise<Response> {
  await throttle();
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { "User-Agent": userAgent(), "Accept-Encoding": "gzip, deflate", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  };
  if (opts.revalidate !== undefined) init.next = { revalidate: opts.revalidate };
  else init.cache = "no-store";

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new SecError(`Could not reach the SEC (${(e as Error).message}).`, 503, url);
  }
  if (res.status === 429 || res.status === 403) {
    throw new SecError("The SEC is rate-limiting requests right now. Please try again in a minute.", 429, url);
  }
  if (!res.ok) {
    throw new SecError(`SEC returned HTTP ${res.status}.`, res.status, url);
  }
  return res;
}

export async function secJson<T>(url: string, opts: SecFetchOptions = {}): Promise<T> {
  const res = await secFetch(url, opts);
  return (await res.json()) as T;
}

export async function secText(url: string, opts: SecFetchOptions = {}): Promise<string> {
  const res = await secFetch(url, opts);
  return await res.text();
}

export function pad10(cik: number | string): string {
  return String(cik).padStart(10, "0");
}

export function archiveBase(cik: number, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
}
