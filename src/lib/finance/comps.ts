/**
 * Trading comparables ("comps"): the same multiples for the target and for
 * each peer, calculated the same way from the same sources, so they are
 * comparable like for like.
 */
import type { CompanyPackage, MarketData } from "../types";
import { buildValuationSnapshot } from "./snapshot";
import { summarize, type Stats } from "./stats";

export interface CompRow {
  ticker: string;
  name: string;
  isFinancial: boolean;
  /** Set when the company could not be analysed (e.g. foreign filer). */
  error?: string;
  price: number | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  ltmLabel: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  eps: number | null;
  evRevenue: number | null;
  evEbitda: number | null;
  peLtm: number | null;
  /** Forward P/E as published by the market data provider. */
  peForward: number | null;
  /** Balance sheet date used for net debt. */
  balanceDate: string | null;
  notes: string[];
}

export function buildCompRow(pkg: CompanyPackage, market: MarketData): CompRow {
  const snap = buildValuationSnapshot(pkg, market);
  const fin = pkg.profile.isFinancial;
  const notes: string[] = [];
  if (!market.available) notes.push(`Market data not available: ${market.reason ?? "unknown reason"}`);
  if (fin) notes.push("Financial institution: enterprise value multiples are not meaningful.");
  if (!fin && snap.ltm.ebitda !== null && snap.ltm.ebitda <= 0) notes.push("EBITDA is negative, so EV / EBITDA is not meaningful.");
  if (snap.ltm.eps !== null && snap.ltm.eps <= 0) notes.push("Earnings are negative, so P / E is not meaningful.");
  if (snap.shares.basis === "provider") notes.push(snap.shares.note);
  return {
    ticker: pkg.profile.ticker,
    name: pkg.profile.name,
    isFinancial: fin,
    price: market.price,
    marketCap: snap.bridge.marketCap,
    enterpriseValue: fin ? null : snap.bridge.enterpriseValue,
    ltmLabel: pkg.financials.ltm?.label ?? null,
    revenue: snap.ltm.revenue,
    ebitda: fin ? null : snap.ltm.ebitda,
    ebitdaMargin: fin ? null : snap.ltm.ebitdaMargin,
    eps: snap.ltm.eps,
    evRevenue: snap.multiples.evRevenue,
    evEbitda: snap.multiples.evEbitda,
    peLtm: snap.multiples.pe,
    peForward: market.forwardPE ?? null,
    balanceDate: pkg.financials.latestBalance?.date ?? null,
    notes,
  };
}

export function errorRow(ticker: string, name: string, error: string): CompRow {
  return {
    ticker,
    name,
    isFinancial: false,
    error,
    price: null,
    marketCap: null,
    enterpriseValue: null,
    ltmLabel: null,
    revenue: null,
    ebitda: null,
    ebitdaMargin: null,
    eps: null,
    evRevenue: null,
    evEbitda: null,
    peLtm: null,
    peForward: null,
    balanceDate: null,
    notes: [],
  };
}

export type MultipleKey = "evRevenue" | "evEbitda" | "peLtm" | "peForward";

export const MULTIPLE_LABELS: Record<MultipleKey, string> = {
  evRevenue: "EV / Revenue (LTM)",
  evEbitda: "EV / EBITDA (LTM)",
  peLtm: "P / E (LTM)",
  peForward: "P / E (forward)",
};

export function peerStats(peers: CompRow[]): Record<MultipleKey, Stats | null> {
  return {
    evRevenue: summarize(peers.map((p) => p.evRevenue)),
    evEbitda: summarize(peers.map((p) => p.evEbitda)),
    peLtm: summarize(peers.map((p) => p.peLtm)),
    peForward: summarize(peers.map((p) => p.peForward)),
  };
}

/* ---------------------- implied value from a multiple -------------------- */

export interface TargetBasis {
  revenue: number | null;
  ebitda: number | null;
  /** LTM diluted EPS. */
  eps: number | null;
  /** Forward EPS implied by the provider's forward P/E (price ÷ forward P/E). */
  forwardEps: number | null;
  debt: number;
  preferred: number;
  noncontrollingInterest: number;
  cash: number;
  shares: number | null;
}

/**
 * Implied share price when the target is valued at a peer multiple.
 *   EV multiples:  (multiple × metric − debt − preferred − NCI + cash) ÷ shares
 *   P/E multiples: multiple × EPS
 * Returns null when the target's metric is missing or not positive.
 */
export function impliedSharePrice(key: MultipleKey, multiple: number | null, t: TargetBasis): number | null {
  if (multiple === null || !(multiple > 0)) return null;
  if (key === "peLtm") return t.eps !== null && t.eps > 0 ? multiple * t.eps : null;
  if (key === "peForward") return t.forwardEps !== null && t.forwardEps > 0 ? multiple * t.forwardEps : null;
  const metric = key === "evRevenue" ? t.revenue : t.ebitda;
  if (metric === null || !(metric > 0) || !t.shares || !(t.shares > 0)) return null;
  const equity = multiple * metric - t.debt - t.preferred - t.noncontrollingInterest + t.cash;
  return equity / t.shares;
}

export interface ImpliedRange {
  key: MultipleKey;
  label: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  lowMultiple: number | null;
  midMultiple: number | null;
  highMultiple: number | null;
  peerCount: number;
}

/** Implied share price at the 25th percentile, median and 75th percentile peer multiple. */
export function impliedRanges(peers: CompRow[], t: TargetBasis): ImpliedRange[] {
  const stats = peerStats(peers);
  return (Object.keys(MULTIPLE_LABELS) as MultipleKey[]).map((key) => {
    const s = stats[key];
    return {
      key,
      label: MULTIPLE_LABELS[key],
      low: impliedSharePrice(key, s?.p25 ?? null, t),
      mid: impliedSharePrice(key, s?.median ?? null, t),
      high: impliedSharePrice(key, s?.p75 ?? null, t),
      lowMultiple: s?.p25 ?? null,
      midMultiple: s?.median ?? null,
      highMultiple: s?.p75 ?? null,
      peerCount: s?.count ?? 0,
    };
  });
}

export function targetBasis(pkg: CompanyPackage, market: MarketData): TargetBasis {
  const snap = buildValuationSnapshot(pkg, market);
  const fwd = market.forwardPE ?? null;
  return {
    revenue: snap.ltm.revenue,
    ebitda: snap.ltm.ebitda,
    eps: snap.ltm.eps,
    forwardEps: market.price !== null && fwd !== null && fwd > 0 ? market.price / fwd : null,
    debt: snap.bridge.totalDebt,
    preferred: snap.bridge.preferred,
    noncontrollingInterest: snap.bridge.noncontrollingInterest,
    cash: snap.bridge.cashAndInvestments,
    shares: snap.shares.shares,
  };
}
