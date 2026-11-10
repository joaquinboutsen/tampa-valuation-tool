import type { CompanyPackage, MarketData } from "@/lib/types";
import type { EvBridge, ShareChoice } from "@/lib/finance/ev";
import { fmtDate, fmtM, fmtPrice, fmtShares, NA } from "@/lib/format";

function Line({
  label,
  value,
  source,
  indent = false,
  bold = false,
  rule = false,
  op,
}: {
  label: string;
  value: string;
  source?: React.ReactNode;
  indent?: boolean;
  bold?: boolean;
  rule?: boolean;
  op?: string;
}) {
  return (
    <tr className={`${rule ? "border-t border-navy" : ""}`}>
      <td className="py-1.5 pr-2 w-5 text-muted text-center align-top">{op ?? ""}</td>
      <td className={`py-1.5 pr-3 align-top ${indent ? "pl-4 text-muted text-[13px]" : ""} ${bold ? "font-semibold" : ""}`}>
        {label}
        {source ? <div className="text-[11.5px] text-muted font-normal leading-snug">{source}</div> : null}
      </td>
      <td className={`py-1.5 num align-top ${bold ? "font-semibold" : ""} ${indent ? "text-muted text-[13px]" : ""}`}>{value}</td>
    </tr>
  );
}

export default function EvBridgeCard({
  pkg,
  market,
  bridge,
  shares,
  decimals,
}: {
  pkg: CompanyPackage;
  market: MarketData;
  bridge: EvBridge;
  shares: ShareChoice;
  decimals: number;
}) {
  const bs = pkg.financials.latestBalance;
  const it = bs?.items;
  const bsLink = bs ? (
    <a className="link" href={bs.url} target="_blank" rel="noopener noreferrer">
      {bs.form} balance sheet, {fmtDate(bs.date)}
    </a>
  ) : null;
  const m = (v: number | null | undefined) => fmtM(v ?? null, decimals);
  const opLease = (it?.operatingLeaseCurrent.value ?? 0) + (it?.operatingLeaseNoncurrent.value ?? 0);
  const coverSrc = pkg.financials.coverShares.sources[0];

  return (
    <div className="card p-4 sm:p-5">
      <table className="w-full text-sm">
        <tbody>
          <Line
            label="Share price"
            value={fmtPrice(market.price)}
            source={market.available ? `${market.provider}, ${market.priceTime ? fmtDate(market.priceTime) : "latest quote"}` : market.reason}
          />
          <Line
            op="×"
            label="Shares outstanding (millions)"
            value={fmtShares(shares.shares)}
            source={
              shares.basis === "sec-cover" && coverSrc ? (
                <>
                  Cover of the{" "}
                  <a className="link" href={coverSrc.url} target="_blank" rel="noopener noreferrer">
                    {coverSrc.form} filed {fmtDate(coverSrc.filed)}
                  </a>
                  , as of {fmtDate(pkg.financials.coverShares.asOf)}. Basic count; option dilution is not included.
                </>
              ) : (
                shares.note
              )
            }
          />
          <Line op="=" label="Equity value (market capitalization)" value={m(bridge.marketCap)} bold rule />
          {pkg.debt.components.map((c) => (
            <Line key={c.tag + c.label} label={c.label} value={m(c.value)} indent />
          ))}
          <Line
            op="+"
            label="Total debt"
            value={pkg.debt.total === null ? NA : m(bridge.totalDebt)}
            source={
              <>
                {pkg.debt.note}{" "}
                {pkg.debt.source ? (
                  <a className="link" href={pkg.debt.source.url} target="_blank" rel="noopener noreferrer">
                    {pkg.debt.source.form} balance sheet, {fmtDate(pkg.debt.asOf)}
                  </a>
                ) : null}
              </>
            }
          />
          <Line
            op="+"
            label="Preferred stock"
            value={m(bridge.preferred)}
            source={it?.preferred.value === null ? "No preferred stock line reported; treated as zero." : bsLink}
          />
          <Line
            op="+"
            label="Noncontrolling interests"
            value={m(bridge.noncontrollingInterest)}
            source={it?.nci.value === null && it?.redeemableNci.value === null ? "No noncontrolling interest line reported; treated as zero." : bsLink}
          />
          <Line
            op="−"
            label="Cash and short-term investments"
            value={m(bridge.cashAndInvestments)}
            source={
              <>
                Cash {m(it?.cash.value)}
                {it?.shortTermInvestments.value !== null && it?.shortTermInvestments.value !== undefined ? ` + short-term investments ${m(it.shortTermInvestments.value)}` : ""}. {bsLink}
              </>
            }
          />
          <Line op="=" label="Enterprise value" value={m(bridge.enterpriseValue)} bold rule />
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted leading-relaxed">
        $ in millions except share price. Net debt (debt − cash) is {m(bridge.netDebt)}.
        {opLease > 0 ? ` Operating lease liabilities of ${m(opLease)} are excluded from debt, consistent with EBITDA being measured after rent expense.` : ""}{" "}
        Market value is as of the quote date; balance sheet items are as of {fmtDate(bs?.date)}.
      </p>
    </div>
  );
}
