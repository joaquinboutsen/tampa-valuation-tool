/**
 * A small, hand-built company ("TestCo") used across the tests.
 * All figures are in dollars; M() converts millions to dollars.
 *
 * Calendar fiscal year. Latest 10-K: FY2024. Latest 10-Q: Q2 2025.
 * Hand-checked expected values are documented next to each test.
 */
import type { CompanyFacts, RawFact } from "../src/lib/sec/facts";

export const M = (n: number) => n * 1_000_000;

const K23 = { form: "10-K", accn: "0000000001-24-000001", filed: "2024-02-15" };
const K24 = { form: "10-K", accn: "0000000001-25-000001", filed: "2025-02-14" };
const Q24 = { form: "10-Q", accn: "0000000001-24-000002", filed: "2024-07-30" };
const Q25 = { form: "10-Q", accn: "0000000001-25-000002", filed: "2025-07-30" };

const FY23 = { start: "2023-01-01", end: "2023-12-31" };
const FY24 = { start: "2024-01-01", end: "2024-12-31" };
const YTD24 = { start: "2024-01-01", end: "2024-06-30" };
const YTD25 = { start: "2025-01-01", end: "2025-06-30" };
const Q2_25 = { start: "2025-04-01", end: "2025-06-30" };

type Filing = typeof K23;
const dur = (p: { start: string; end: string }, val: number, f: Filing): RawFact => ({ ...p, val, ...f });
const inst = (end: string, val: number, f: Filing): RawFact => ({ end, val, ...f });

export function testCoFacts(): CompanyFacts {
  const usd = (facts: RawFact[]) => ({ units: { USD: facts } });
  return {
    cik: 1,
    entityName: "TestCo Inc",
    facts: {
      dei: {
        EntityCommonStockSharesOutstanding: { units: { shares: [inst("2025-07-25", 50_000_000, Q25)] } },
      },
      "us-gaap": {
        Revenues: usd([
          dur(FY23, M(1000), K23), // original
          dur(FY23, M(990), K24), // restated in the next 10-K: this one must win
          dur(FY24, M(1200), K24),
          dur(YTD24, M(555), Q24), // original
          dur(YTD24, M(560), Q25), // re-reported as a comparative: this one must win
          dur(YTD25, M(650), Q25),
          dur(Q2_25, M(330), Q25), // 3-month figure: must NOT be used as year-to-date
        ]),
        OperatingIncomeLoss: usd([dur(FY23, M(100), K24), dur(FY24, M(150), K24), dur(YTD24, M(60), Q25), dur(YTD25, M(80), Q25)]),
        Depreciation: usd([dur(FY24, M(30), K24), dur(YTD24, M(14), Q25), dur(YTD25, M(16), Q25)]),
        AmortizationOfIntangibleAssets: usd([dur(FY24, M(10), K24), dur(YTD24, M(5), Q25), dur(YTD25, M(5), Q25)]),
        InterestIncomeExpenseNonoperatingNet: usd([dur(FY24, M(-20), K24)]),
        NetIncomeLoss: usd([dur(FY23, M(60), K24), dur(FY24, M(90), K24), dur(YTD24, M(40), Q25), dur(YTD25, M(55), Q25)]),
        NetCashProvidedByUsedInOperatingActivities: usd([dur(FY24, M(200), K24)]),
        NetCashProvidedByUsedInInvestingActivities: usd([dur(FY24, M(-120), K24)]),
        NetCashProvidedByUsedInFinancingActivities: usd([dur(FY24, M(-50), K24)]),
        EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: usd([dur(FY24, M(-5), K24)]),
        CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect: usd([dur(FY24, M(25), K24)]),
        PaymentsToAcquirePropertyPlantAndEquipment: usd([dur(FY24, M(70), K24)]),
        Assets: usd([inst("2023-12-31", M(1800), K24), inst("2024-12-31", M(2000), K24), inst("2025-06-30", M(2100), Q25)]),
        LiabilitiesAndStockholdersEquity: usd([inst("2023-12-31", M(1800), K24), inst("2024-12-31", M(2000), K24), inst("2025-06-30", M(2100), Q25)]),
        Liabilities: usd([inst("2024-12-31", M(1200), K24), inst("2025-06-30", M(1250), Q25)]),
        StockholdersEquity: usd([inst("2024-12-31", M(790), K24), inst("2025-06-30", M(838), Q25)]),
        MinorityInterest: usd([inst("2024-12-31", M(10), K24), inst("2025-06-30", M(12), Q25)]),
        CashAndCashEquivalentsAtCarryingValue: usd([inst("2024-12-31", M(320), K24), inst("2025-06-30", M(350), Q25)]),
        CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: usd([inst("2023-12-31", M(300), K24), inst("2024-12-31", M(325), K24)]),
        LongTermDebtNoncurrent: usd([inst("2025-06-30", M(400), Q25)]),
        LongTermDebtCurrent: usd([inst("2025-06-30", M(25), Q25)]),
        ShortTermBorrowings: usd([inst("2025-06-30", M(15), Q25)]),
      },
    },
  };
}
