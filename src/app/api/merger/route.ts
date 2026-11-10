import { NextResponse } from "next/server";
import { getMarketData, getPeerPackage, getRiskFreeRate } from "@/lib/cached";
import { CompanyError } from "@/lib/company";
import { deriveTaxRate } from "@/lib/finance/dcfDefaults";
import { buildValuationSnapshot } from "@/lib/finance/snapshot";
import { isValidTickerFormat, normalizeTicker } from "@/lib/sec/tickers";

export const dynamic = "force-dynamic";

/** One side of a deal, with the source of each figure. */
async function party(ticker: string) {
  const [pkg, market] = await Promise.all([getPeerPackage(ticker), getMarketData(ticker)]);
  const snap = buildValuationSnapshot(pkg, market);
  const fin = pkg.financials;
  const netIncomeCell = fin.income.find((r) => r.key === "netIncome")?.ltm ?? null;
  const tax = deriveTaxRate(pkg);
  return {
    ticker: pkg.profile.ticker,
    name: pkg.profile.name,
    isFinancial: pkg.profile.isFinancial,
    price: market.price,
    priceSource: market.available ? `${market.provider}${market.priceTime ? `, ${market.priceTime.slice(0, 10)}` : ""}` : (market.reason ?? "Not available"),
    shares: snap.shares.shares,
    sharesNote: snap.shares.note,
    netIncome: snap.ltm.netIncome,
    netIncomeNote: netIncomeCell?.note ?? null,
    ltmLabel: fin.ltm?.label ?? null,
    eps: snap.ltm.eps,
    pe: snap.multiples.pe,
    marketCap: snap.bridge.marketCap,
    ebitda: pkg.profile.isFinancial ? null : snap.ltm.ebitda,
    totalDebt: snap.bridge.totalDebt,
    cash: snap.bridge.cashAndInvestments,
    bookEquity: snap.bookEquity,
    balanceDate: fin.latestBalance?.date ?? null,
    filingUrl: fin.latestBalance?.url ?? null,
    taxRate: tax.rate,
    taxNote: tax.how,
  };
}

/**
 * Data for the merger model.
 *   /api/merger?acquirer=JBL&target=SANM
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = url.searchParams.get("acquirer") ?? "";
  const t = url.searchParams.get("target") ?? "";
  if (!isValidTickerFormat(a) || !isValidTickerFormat(t)) {
    return NextResponse.json({ error: "Enter a valid ticker for both the acquirer and the target." }, { status: 400 });
  }
  const acq = normalizeTicker(a);
  const tgt = normalizeTicker(t);
  if (acq === tgt) return NextResponse.json({ error: "The acquirer and the target must be different companies." }, { status: 400 });

  const load = async (ticker: string, role: string) => {
    try {
      return await party(ticker);
    } catch (e) {
      if (e instanceof CompanyError) throw new CompanyError(e.code, `${role} (${ticker}): ${e.message}`);
      throw e;
    }
  };

  try {
    const [acquirer, target, rates] = await Promise.all([load(acq, "Acquirer"), load(tgt, "Target"), getRiskFreeRate()]);
    return NextResponse.json(
      {
        acquirer,
        target,
        rates: rates ? { tenYear: rates.tenYear, threeMonth: rates.threeMonth ?? null, date: rates.date, url: rates.url } : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof CompanyError) {
      const status = e.code === "not-found" ? 404 : e.code === "unsupported" ? 422 : 503;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
