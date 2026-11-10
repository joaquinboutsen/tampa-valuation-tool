/**
 * Equity value → enterprise value bridge.
 *
 *   Enterprise value = equity value (market cap)
 *                    + total debt
 *                    + preferred stock
 *                    + noncontrolling interests
 *                    − cash and short-term investments
 *
 * Why: enterprise value is the value of the operating business to ALL capital
 * providers. Debt, preferred and minority holders have claims on the business
 * that common shareholders do not own, so they are added; cash is not part of
 * the operating business, so it is subtracted.
 */

export interface EvInputs {
  price: number | null;
  shares: number | null;
  totalDebt: number | null;
  preferred: number | null;
  noncontrollingInterest: number | null;
  cash: number | null;
  shortTermInvestments: number | null;
}

export interface EvBridge {
  marketCap: number | null;
  totalDebt: number;
  preferred: number;
  noncontrollingInterest: number;
  cashAndInvestments: number;
  netDebt: number;
  enterpriseValue: number | null;
  /** Items that were not reported and therefore treated as zero. */
  assumedZero: string[];
}

export function marketCap(price: number | null, shares: number | null): number | null {
  if (price === null || shares === null || !(price > 0) || !(shares > 0)) return null;
  return price * shares;
}

export function evBridge(i: EvInputs): EvBridge {
  const assumedZero: string[] = [];
  const z = (v: number | null, name: string): number => {
    if (v === null) {
      assumedZero.push(name);
      return 0;
    }
    return v;
  };
  const mc = marketCap(i.price, i.shares);
  const totalDebt = z(i.totalDebt, "debt");
  const preferred = z(i.preferred, "preferred stock");
  const nci = z(i.noncontrollingInterest, "noncontrolling interests");
  const cashAndInvestments = z(i.cash, "cash") + z(i.shortTermInvestments, "short-term investments");
  const netDebt = totalDebt - cashAndInvestments;
  return {
    marketCap: mc,
    totalDebt,
    preferred,
    noncontrollingInterest: nci,
    cashAndInvestments,
    netDebt,
    enterpriseValue: mc === null ? null : mc + totalDebt + preferred + nci - cashAndInvestments,
    assumedZero,
  };
}

/** A valuation multiple, or null when it is not meaningful (zero or negative inputs). */
export function multiple(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!(denominator > 0) || !(numerator > 0)) return null;
  return numerator / denominator;
}
