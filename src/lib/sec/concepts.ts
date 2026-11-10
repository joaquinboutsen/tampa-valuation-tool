/**
 * Maps each financial line item to the XBRL tags companies use for it.
 *
 * Companies are free to pick among several standard tags for the same idea
 * (e.g. "Revenues" vs "RevenueFromContractWithCustomerExcludingAssessedTax").
 * Tags are listed in priority order. When more than one tag has a value for
 * the same period, the most recently filed value wins and priority breaks ties.
 */

export const FLOW_CONCEPTS = {
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
  ],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  da: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
  ],
  depreciation: ["Depreciation"],
  amortization: ["AmortizationOfIntangibleAssets"],
  interestExpense: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"],
  /** Net interest (income positive, expense negative); used only when gross interest expense is not tagged. */
  interestNet: ["InterestIncomeExpenseNonoperatingNet", "InterestIncomeExpenseNet"],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  incomeTax: ["IncomeTaxExpenseBenefit"],
  netIncome: ["NetIncomeLoss"],
  netIncomeInclNci: ["ProfitLoss"],
  epsDiluted: ["EarningsPerShareDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  cfo: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  cfi: ["NetCashProvidedByUsedInInvestingActivities", "NetCashProvidedByUsedInInvestingActivitiesContinuingOperations"],
  cff: ["NetCashProvidedByUsedInFinancingActivities", "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations"],
  fxOnCash: [
    "EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations",
    "EffectOfExchangeRateOnCashAndCashEquivalents",
  ],
  netChangeInCash: [
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
    "CashAndCashEquivalentsPeriodIncreaseDecrease",
  ],
  netChangeInCashExFx: [
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect",
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",
    "PaymentsForCapitalImprovements",
  ],
  sbc: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
} as const;

export const INSTANT_CONCEPTS = {
  totalAssets: ["Assets"],
  currentAssets: ["AssetsCurrent"],
  totalLiabilities: ["Liabilities"],
  currentLiabilities: ["LiabilitiesCurrent"],
  liabilitiesAndEquity: ["LiabilitiesAndStockholdersEquity"],
  equityParent: ["StockholdersEquity"],
  equityTotal: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  nci: ["MinorityInterest"],
  redeemableNci: [
    "RedeemableNoncontrollingInterestEquityCarryingAmount",
    "RedeemableNoncontrollingInterestEquityCommonCarryingAmount",
    "RedeemableNoncontrollingInterestEquityPreferredCarryingAmount",
    "RedeemableNoncontrollingInterestEquityOtherCarryingAmount",
  ],
  temporaryEquity: ["TemporaryEquityCarryingAmountAttributableToParent", "TemporaryEquityCarryingAmount"],
  preferred: ["PreferredStockValue", "PreferredStockValueOutstanding"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "Cash", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  cashInclRestricted: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  shortTermInvestments: [
    "ShortTermInvestments",
    "MarketableSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
  ],
  receivables: ["AccountsReceivableNetCurrent", "AccountsAndOtherReceivablesNetCurrent", "ReceivablesNetCurrent"],
  inventory: ["InventoryNet"],
  payables: ["AccountsPayableCurrent", "AccountsPayableTradeCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
  operatingLeaseCurrent: ["OperatingLeaseLiabilityCurrent"],
  operatingLeaseNoncurrent: ["OperatingLeaseLiabilityNoncurrent"],
} as const;

export type FlowKey = keyof typeof FLOW_CONCEPTS;
export type InstantKey = keyof typeof INSTANT_CONCEPTS;

/**
 * Fallback debt tags, used only when the face of the balance sheet cannot be
 * read. Grouped so that overlapping tags are never added together.
 */
export const DEBT_TAGS = {
  /** All current debt in one line (short-term borrowings + current maturities). */
  currentCombined: ["DebtCurrent", "ShortTermDebtAndCurrentPortionOfLongTermDebt"],
  currentMaturities: [
    "LongTermDebtCurrent",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
  ],
  shortTerm: ["ShortTermBorrowings", "ShortTermBankLoansAndNotesPayable", "CommercialPaper", "NotesPayableCurrent"],
  noncurrent: [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
  ],
  /** Long-term debt including the current portion. */
  longTermTotal: ["LongTermDebt", "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities"],
  grandTotal: ["DebtLongtermAndShorttermCombinedAmount", "DebtAndCapitalLeaseObligations"],
} as const;

/** SIC codes 6000–6499 and 6700–6799: banks, brokers, insurers, funds/REITs. */
export function isFinancialSic(sic: string | number | undefined | null): boolean {
  const n = Number(sic);
  if (!Number.isFinite(n)) return false;
  return (n >= 6000 && n <= 6499) || (n >= 6700 && n <= 6799);
}
