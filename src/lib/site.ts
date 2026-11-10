/** Site-wide constants: author details and featured companies. */

export const SITE = {
  name: "Valuation Toolkit",
  tagline: "Investment-banking style valuation for any US public company, built on SEC filings.",
  author: "Joaquin Boutsen",
  authorLine: "Master's in Finance candidate, University of Tampa",
  linkedin: "https://www.linkedin.com/in/joaquin-boutsen-37554a226",
  repo: "https://github.com/joaquinboutsen/tampa-valuation-tool",
};

export interface Featured {
  ticker: string;
  name: string;
  hq: string;
  blurb: string;
  /** Banks, brokers and insurers get an equity-only view (no EV / DCF). */
  financial?: boolean;
}

/**
 * Tampa Bay companies. Each was verified against its SEC filing record
 * (business address and active 10-K filings) in November 2026.
 */
export const TAMPA_BAY: Featured[] = [
  { ticker: "JBL", name: "Jabil", hq: "St. Petersburg", blurb: "Electronics manufacturing services" },
  { ticker: "CCK", name: "Crown Holdings", hq: "Tampa", blurb: "Beverage cans and packaging" },
  { ticker: "MOS", name: "Mosaic", hq: "Tampa", blurb: "Phosphate and potash fertilizer" },
  { ticker: "BLMN", name: "Bloomin' Brands", hq: "Tampa", blurb: "Casual dining restaurants" },
  { ticker: "SNX", name: "TD SYNNEX", hq: "Clearwater", blurb: "Technology distribution" },
  { ticker: "RJF", name: "Raymond James", hq: "St. Petersburg", blurb: "Wealth management and investment banking", financial: true },
];

export const LARGE_CAPS: Featured[] = [
  { ticker: "KO", name: "Coca-Cola", hq: "Atlanta", blurb: "Beverages" },
  { ticker: "HD", name: "Home Depot", hq: "Atlanta", blurb: "Home improvement retail" },
  { ticker: "MSFT", name: "Microsoft", hq: "Redmond", blurb: "Software and cloud" },
  { ticker: "WMT", name: "Walmart", hq: "Bentonville", blurb: "Retail" },
];
