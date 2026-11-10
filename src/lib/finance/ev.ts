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

export interface ShareChoice {
  shares: number | null;
  basis: "sec-cover" | "provider" | "none";
  note: string;
}

/**
 * Which share count to use for market cap.
 *
 * Preference: the count printed on the cover of the latest SEC filing (an
 * official, dated number). If the cover count is missing, or differs from the
 * data provider's by more than 5% (typical of multi-class companies, where the
 * cover lists one class only), the provider's total is used instead.
 */
export function chooseShares(cover: number | null, provider: number | null, providerName: string): ShareChoice {
  if (cover !== null && cover > 0) {
    if (provider === null || !(provider > 0)) {
      return { shares: cover, basis: "sec-cover", note: "Shares outstanding from the cover of the latest SEC filing." };
    }
    const gap = Math.abs(cover / provider - 1);
    if (gap <= 0.05) {
      return { shares: cover, basis: "sec-cover", note: "Shares outstanding from the cover of the latest SEC filing." };
    }
    return {
      shares: provider,
      basis: "provider",
      note: `The SEC cover-page count differs from ${providerName} by ${(gap * 100).toFixed(0)}% (usually multiple share classes), so the ${providerName} total is used.`,
    };
  }
  if (provider !== null && provider > 0) {
    return {
      shares: provider,
      basis: "provider",
      note: `The filing cover does not report a single share count, so the ${providerName} total is used.`,
    };
  }
  return { shares: null, basis: "none", note: "Not available: no share count from either the SEC filing cover or the market data provider." };
}

/** A valuation multiple, or null when it is not meaningful (zero or negative inputs). */
export function multiple(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!(denominator > 0) || !(numerator > 0)) return null;
  return numerator / denominator;
}
