/**
 * Combines SEC financials with market data into the headline valuation
 * figures: market cap, enterprise value and LTM trading multiples.
 */
import type { CompanyPackage, MarketData } from "../types";
import { chooseShares, evBridge, multiple, type EvBridge, type ShareChoice } from "./ev";
import { margin, ratio } from "./metrics";

export interface ValuationSnapshot {
  shares: ShareChoice;
  bridge: EvBridge;
  ltm: {
    revenue: number | null;
    ebitda: number | null;
    ebit: number | null;
    netIncome: number | null;
    eps: number | null;
    ebitdaMargin: number | null;
  };
  multiples: {
    evRevenue: number | null;
    evEbitda: number | null;
    evEbit: number | null;
    pe: number | null;
    priceToBook: number | null;
  };
  bookEquity: number | null;
}

const addNullable = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a === null || a === undefined ? (b ?? null) : b === null || b === undefined ? a : a + b;

export function buildValuationSnapshot(pkg: CompanyPackage, market: MarketData): ValuationSnapshot {
  const fin = pkg.financials;
  const it = fin.latestBalance?.items;
  const ltmOf = (key: string): number | null => fin.income.find((r) => r.key === key)?.ltm?.value ?? null;

  const shares = chooseShares(fin.coverShares.value, market.providerShares, market.provider);
  const bridge = evBridge({
    price: market.price,
    shares: shares.shares,
    totalDebt: pkg.debt.total,
    preferred: it?.preferred.value ?? null,
    noncontrollingInterest: addNullable(it?.nci.value, it?.redeemableNci.value),
    cash: it?.cash.value ?? null,
    shortTermInvestments: it?.shortTermInvestments.value ?? null,
  });

  const revenue = ltmOf("revenue");
  const ebitda = ltmOf("ebitda");
  const ebit = ltmOf("operatingIncome");
  const netIncome = ltmOf("netIncome");
  const eps = ltmOf("epsDiluted");
  // Book equity attributable to common shareholders. Some companies only tag total
  // equity including noncontrolling interests, so those are stripped out.
  const totalEquity = it?.equityTotal.value ?? null;
  const bookEquity = it?.equityParent.value ?? (totalEquity !== null ? totalEquity - (it?.nci.value ?? 0) : null);
  const ev = pkg.profile.isFinancial ? null : bridge.enterpriseValue;

  return {
    shares,
    bridge,
    ltm: { revenue, ebitda, ebit, netIncome, eps, ebitdaMargin: margin(ebitda, revenue) },
    multiples: {
      evRevenue: multiple(ev, revenue),
      evEbitda: multiple(ev, ebitda),
      evEbit: multiple(ev, ebit),
      pe: multiple(market.price, eps),
      priceToBook: bookEquity !== null && bookEquity > 0 ? ratio(bridge.marketCap, bookEquity) : null,
    },
    bookEquity,
  };
}
