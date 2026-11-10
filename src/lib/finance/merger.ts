/**
 * Merger model: accretion / dilution. Pure functions, no data access.
 *
 * Question it answers: if the acquirer buys the target on these terms, is the
 * combined company's earnings per share (EPS) higher or lower than the
 * acquirer's EPS on its own?
 *
 *   Offer price          = target share price × (1 + premium)
 *   Purchase price       = offer price × target shares            (equity value)
 *   Funded by            cash on hand + new debt + new acquirer shares
 *   New shares issued    = stock portion ÷ acquirer share price
 *
 *   Pro forma net income = acquirer net income
 *                        + target net income
 *                        + synergies × (1 − tax)
 *                        − interest on new debt × (1 − tax)
 *                        − interest no longer earned on cash used × (1 − tax)
 *                        − extra D&A from asset write-ups × (1 − tax)
 *
 *   Pro forma EPS        = pro forma net income ÷ (acquirer shares + new shares)
 *   Accretion (dilution) = pro forma EPS ÷ acquirer standalone EPS − 1
 */

export interface MergerParty {
  ticker: string;
  name: string;
  price: number;
  /** Shares outstanding (basic). */
  shares: number;
  /** Last-twelve-months net income to common shareholders. */
  netIncome: number;
}

export interface MergerInputs {
  /** Premium to the target's current share price (0.30 = 30%). */
  premium: number;
  /** Financing mix as shares of the purchase price. Must sum to 1. */
  pctCash: number;
  pctStock: number;
  pctDebt: number;
  /** Pre-tax interest rate on new acquisition debt. */
  debtRate: number;
  /** Pre-tax rate the acquirer currently earns on the cash it will spend. */
  cashRate: number;
  /** Tax rate applied to synergies and financing costs. */
  taxRate: number;
  /** Annual run-rate pre-tax synergies, in dollars. */
  synergies: number;
  /** Share of run-rate synergies achieved in each projected year (e.g. [0.5, 1]). */
  synergyPhaseIn: number[];
  /** One-time transaction fees as a share of the purchase price, paid in cash. */
  feePct: number;
  /** Extra pre-tax depreciation and amortization per year from writing up the target's assets. */
  incrementalDa: number;
  /** Standalone net income growth per year for each company. */
  acquirerGrowth: number;
  targetGrowth: number;
}

export interface MergerYear {
  year: number;
  acquirerNetIncome: number;
  targetNetIncome: number;
  synergiesPreTax: number;
  afterTaxSynergies: number;
  afterTaxDebtInterest: number;
  afterTaxForegoneInterest: number;
  afterTaxIncrementalDa: number;
  proFormaNetIncome: number;
  proFormaShares: number;
  standaloneEps: number;
  proFormaEps: number;
  accretionPerShare: number;
  /** Pro forma EPS ÷ standalone EPS − 1. Null when standalone EPS is not positive. */
  accretionPct: number | null;
  /** Pre-tax synergies needed in this year for EPS to break even; 0 if already accretive without any. */
  breakevenSynergies: number;
  /** Accretion with zero synergies, for reference. */
  accretionPctNoSynergies: number | null;
}

export interface MergerResult {
  valid: boolean;
  issues: string[];
  offerPrice: number;
  purchasePrice: number;
  fees: number;
  cashConsideration: number;
  stockConsideration: number;
  debtConsideration: number;
  /** Cash leaving the acquirer: cash consideration + fees. */
  cashUsed: number;
  newDebt: number;
  newShares: number;
  /** New shares as a share of the combined company. */
  targetOwnership: number;
  /** Target shares exchanged for each acquirer share's worth of stock consideration. */
  exchangeRatio: number;
  acquirerPe: number | null;
  /** Price paid ÷ target earnings. */
  targetPeAtOffer: number | null;
  years: MergerYear[];
}

export function validateInputs(i: MergerInputs): string[] {
  const issues: string[] = [];
  const mix = i.pctCash + i.pctStock + i.pctDebt;
  if (Math.abs(mix - 1) > 1e-6) issues.push(`The financing mix must add up to 100% (it adds up to ${(mix * 100).toFixed(1)}%).`);
  if (i.pctCash < 0 || i.pctStock < 0 || i.pctDebt < 0) issues.push("Financing percentages cannot be negative.");
  if (i.premium <= -1) issues.push("The premium cannot be −100% or lower.");
  if (i.taxRate < 0 || i.taxRate >= 1) issues.push("The tax rate must be between 0% and 100%.");
  return issues;
}

export function runMerger(acq: MergerParty, tgt: MergerParty, i: MergerInputs): MergerResult {
  const issues = validateInputs(i);
  if (!(acq.price > 0) || !(acq.shares > 0)) issues.push("The acquirer's share price and share count are needed.");
  if (!(tgt.price > 0) || !(tgt.shares > 0)) issues.push("The target's share price and share count are needed.");

  const offerPrice = tgt.price * (1 + i.premium);
  const purchasePrice = offerPrice * tgt.shares;
  const fees = purchasePrice * i.feePct;
  const cashConsideration = purchasePrice * i.pctCash;
  const stockConsideration = purchasePrice * i.pctStock;
  const debtConsideration = purchasePrice * i.pctDebt;
  const cashUsed = cashConsideration + fees;
  const newShares = acq.price > 0 ? stockConsideration / acq.price : 0;
  const proFormaShares = acq.shares + newShares;
  const t = i.taxRate;

  const years: MergerYear[] = i.synergyPhaseIn.map((phase, idx) => {
    const year = idx + 1;
    const acquirerNetIncome = acq.netIncome * Math.pow(1 + i.acquirerGrowth, year);
    const targetNetIncome = tgt.netIncome * Math.pow(1 + i.targetGrowth, year);
    const synergiesPreTax = i.synergies * phase;
    const afterTaxSynergies = synergiesPreTax * (1 - t);
    const afterTaxDebtInterest = debtConsideration * i.debtRate * (1 - t);
    const afterTaxForegoneInterest = cashUsed * i.cashRate * (1 - t);
    const afterTaxIncrementalDa = i.incrementalDa * (1 - t);
    const beforeSynergies = acquirerNetIncome + targetNetIncome - afterTaxDebtInterest - afterTaxForegoneInterest - afterTaxIncrementalDa;
    const proFormaNetIncome = beforeSynergies + afterTaxSynergies;
    const standaloneEps = acq.shares > 0 ? acquirerNetIncome / acq.shares : NaN;
    const proFormaEps = proFormaShares > 0 ? proFormaNetIncome / proFormaShares : NaN;
    const epsNoSynergies = proFormaShares > 0 ? beforeSynergies / proFormaShares : NaN;
    // Net income the combined company needs for EPS to equal the acquirer's standalone EPS.
    const neededNetIncome = standaloneEps * proFormaShares;
    const shortfallAfterTax = neededNetIncome - beforeSynergies;
    return {
      year,
      acquirerNetIncome,
      targetNetIncome,
      synergiesPreTax,
      afterTaxSynergies,
      afterTaxDebtInterest,
      afterTaxForegoneInterest,
      afterTaxIncrementalDa,
      proFormaNetIncome,
      proFormaShares,
      standaloneEps,
      proFormaEps,
      accretionPerShare: proFormaEps - standaloneEps,
      accretionPct: standaloneEps > 0 ? proFormaEps / standaloneEps - 1 : null,
      breakevenSynergies: shortfallAfterTax > 0 && t < 1 ? shortfallAfterTax / (1 - t) : 0,
      accretionPctNoSynergies: standaloneEps > 0 ? epsNoSynergies / standaloneEps - 1 : null,
    };
  });

  return {
    valid: issues.length === 0,
    issues,
    offerPrice,
    purchasePrice,
    fees,
    cashConsideration,
    stockConsideration,
    debtConsideration,
    cashUsed,
    newDebt: debtConsideration,
    newShares,
    targetOwnership: proFormaShares > 0 ? newShares / proFormaShares : 0,
    exchangeRatio: acq.price > 0 ? (offerPrice * i.pctStock) / acq.price : 0,
    acquirerPe: acq.netIncome > 0 ? (acq.price * acq.shares) / acq.netIncome : null,
    targetPeAtOffer: tgt.netIncome > 0 ? purchasePrice / tgt.netIncome : null,
    years,
  };
}

/**
 * The rule of thumb behind accretion / dilution: compare what the target earns
 * on the price paid (its earnings yield) with what each form of payment costs.
 */
export interface FinancingCosts {
  /** Target net income ÷ purchase price. */
  targetEarningsYield: number | null;
  /** Acquirer net income ÷ acquirer market value: the "cost" of paying with stock. */
  costOfStock: number | null;
  afterTaxCostOfDebt: number;
  afterTaxCostOfCash: number;
  /** Mix-weighted cost of the financing. */
  blendedCost: number | null;
}

export function financingCosts(acq: MergerParty, tgt: MergerParty, i: MergerInputs): FinancingCosts {
  const purchasePrice = tgt.price * (1 + i.premium) * tgt.shares;
  const targetEarningsYield = purchasePrice > 0 ? tgt.netIncome / purchasePrice : null;
  const acqValue = acq.price * acq.shares;
  const costOfStock = acqValue > 0 && acq.netIncome > 0 ? acq.netIncome / acqValue : null;
  const afterTaxCostOfDebt = i.debtRate * (1 - i.taxRate);
  const afterTaxCostOfCash = i.cashRate * (1 - i.taxRate);
  const blendedCost = costOfStock === null ? null : i.pctStock * costOfStock + i.pctDebt * afterTaxCostOfDebt + i.pctCash * afterTaxCostOfCash;
  return { targetEarningsYield, costOfStock, afterTaxCostOfDebt, afterTaxCostOfCash, blendedCost };
}
