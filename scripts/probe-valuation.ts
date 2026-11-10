/**
 * Developer tool: print DCF defaults and results (and optionally comps) for tickers.
 *
 *   npx tsx --env-file=.env.local scripts/probe-valuation.ts JBL CCK
 */
import { buildCompanyPackage, CompanyError } from "../src/lib/company";
import { buildCompRow, impliedRanges, peerStats, targetBasis } from "../src/lib/finance/comps";
import { computeWacc, equityFromEnterpriseValue, runDcf, sensitivityGrowth } from "../src/lib/finance/dcf";
import { buildDcfDefaults } from "../src/lib/finance/dcfDefaults";
import { fetchMarketData, fetchPeers, unavailable } from "../src/lib/market/finnhub";
import { fetchRiskFreeRate } from "../src/lib/market/treasury";

const p = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(d)}%`);
const m = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const x = (v: number | null | undefined) => (v === null || v === undefined ? "n/m" : `${v.toFixed(1)}x`);

async function main() {
  const args = process.argv.slice(2);
  const withComps = args.includes("--comps");
  const rf = await fetchRiskFreeRate();
  console.log(`Risk-free: ${p(rf.tenYear, 2)} on ${rf.date}`);
  for (const t of args.filter((a) => !a.startsWith("--"))) {
    try {
      const pkg = await buildCompanyPackage(t);
      const market = await fetchMarketData(t).catch((e) => unavailable(String(e)));
      const d = buildDcfDefaults(pkg, market, rf);
      console.log(`\n=== ${t} ${pkg.profile.name} | price ${market.price} | fwd P/E ${market.forwardPE}`);
      if (!d.available || !d.assumptions || !d.waccInputs) {
        console.log("  DCF unavailable:", d.reason);
      } else {
        const a = d.assumptions;
        const w = computeWacc(d.waccInputs)!;
        console.log(`  hist growth ${d.history.growth.map((v) => p(v)).join(" ")} | margin ${d.history.ebitdaMargin.map((v) => p(v)).join(" ")}`);
        console.log(`  hist D&A ${d.history.daPct.map((v) => p(v)).join(" ")} | capex ${d.history.capexPct.map((v) => p(v)).join(" ")} | NWC ${d.history.nwcPct.map((v) => p(v)).join(" ")} | tax ${d.history.taxRate.map((v) => p(v)).join(" ")}`);
        console.log(`  growth ${a.growth.map((v) => p(v)).join(" ")} | margin ${p(a.ebitdaMargin[0])} | D&A ${p(a.daPctRevenue)} capex ${p(a.capexPctRevenue)} NWC ${p(a.nwcPctRevenue)} tax ${p(a.taxRate)}`);
        console.log(`  WACC ${p(w.wacc, 2)} = ${p(w.weightEquity)} x Ke ${p(w.costOfEquity, 2)} (beta ${d.waccInputs.beta.toFixed(2)}) + ${p(w.weightDebt)} x Kd ${p(w.afterTaxCostOfDebt, 2)} (pre-tax ${p(d.waccInputs.preTaxCostOfDebt, 2)})`);
        const r = runDcf(a);
        console.log(`  UFCF ${r.years.map((y) => m(y.ufcf)).join(" ")} | sum PV ${m(r.sumPvUfcf)}`);
        for (const [name, tv] of [["perpetuity", r.perpetuity], ["exit", r.exit]] as const) {
          if (!tv) { console.log(`  ${name}: n/a ${name === "perpetuity" ? r.perpetuityIssue : r.exitIssue}`); continue; }
          const eq = equityFromEnterpriseValue(tv.enterpriseValue, d.bridge);
          console.log(`  ${name}: EV ${m(tv.enterpriseValue)} (TV ${p(tv.shareOfEv)} of EV) -> equity ${m(eq.equityValue)} -> $${eq.perShare?.toFixed(2)} vs $${market.price}  ${"impliedExitMultiple" in tv ? `implied multiple ${x(tv.impliedExitMultiple)}` : `implied g ${p((tv as { impliedGrowth: number | null }).impliedGrowth, 2)}`}`);
        }
        const s = sensitivityGrowth(a, d.bridge);
        console.log(`  sens (WACC x g) corners: ${s.values[0][0]?.toFixed(0)} .. ${s.values[4][4]?.toFixed(0)} | mid ${s.values[2][2]?.toFixed(2)}`);
        for (const k of Object.keys(d.derivations)) console.log(`    - ${d.derivations[k].label}: ${d.derivations[k].how}`);
      }
      if (withComps) {
        const peers = (await fetchPeers(t)).filter((s) => s !== t.toUpperCase()).slice(0, 8);
        const rows = [];
        for (const s of peers) {
          try {
            rows.push(buildCompRow(await buildCompanyPackage(s, { light: true }), await fetchMarketData(s).catch((e) => unavailable(String(e)))));
          } catch (e) {
            console.log(`   peer ${s}: ${e instanceof CompanyError ? e.message.slice(0, 80) : e}`);
          }
        }
        for (const r of rows) console.log(`   ${r.ticker.padEnd(6)} mcap ${m(r.marketCap).padStart(9)} EV ${m(r.enterpriseValue).padStart(9)} rev ${m(r.revenue).padStart(8)} ebitda ${m(r.ebitda).padStart(7)} | ${x(r.evRevenue)} ${x(r.evEbitda)} ${x(r.peLtm)} fwd ${x(r.peForward)}`);
        const st = peerStats(rows);
        console.log("   stats EV/EBITDA", st.evEbitda && [st.evEbitda.min, st.evEbitda.p25, st.evEbitda.median, st.evEbitda.p75, st.evEbitda.max].map((v) => v.toFixed(1)).join(" / "));
        for (const r of impliedRanges(rows, targetBasis(pkg, market))) console.log(`   implied ${r.label}: ${r.low?.toFixed(2)} / ${r.mid?.toFixed(2)} / ${r.high?.toFixed(2)} (n=${r.peerCount})`);
      }
    } catch (e) {
      if (e instanceof CompanyError) console.log(`\n=== ${t}: ${e.code}: ${e.message}`);
      else throw e;
    }
  }
}
main();
