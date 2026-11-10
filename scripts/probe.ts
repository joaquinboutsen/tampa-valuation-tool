/**
 * Developer tool: build the full company package for one or more tickers
 * against the live SEC API and print a summary.
 *
 *   npx tsx --env-file=.env.local scripts/probe.ts JBL MOS
 */
import { buildCompanyPackage, CompanyError } from "../src/lib/company";

const m = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }));

async function main() {
  for (const t of process.argv.slice(2)) {
    const t0 = Date.now();
    try {
      const p = await buildCompanyPackage(t);
      const f = p.financials;
      console.log(`\n=== ${p.profile.ticker} ${p.profile.name} | ${p.profile.city}, ${p.profile.state} | SIC ${p.profile.sic} ${p.profile.sicDescription} | financial=${p.profile.isFinancial} | ${Date.now() - t0}ms`);
      console.log(`  desc: ${p.profile.description.text ?? "(none)"} [${p.profile.description.source}]`);
      console.log(`  years: ${f.fiscalYears.map((y) => y.label).join(", ")} | ${f.ltm?.label}`);
      for (const key of ["revenue", "ebitda", "netIncome"]) {
        const r = f.income.find((x) => x.key === key)!;
        console.log(`  ${key.padEnd(10)} ${r.values.map((c) => m(c.value).padStart(9)).join("")}  LTM ${m(r.ltm?.value)}`);
      }
      console.log(`  debt (${p.debt.method}) ${m(p.debt.total)}: ${p.debt.components.map((c) => `${c.label}=${m(c.value)}`).join("; ")}`);
      const b = f.latestBalance?.items;
      console.log(`  cash ${m(b?.cash.value)} STI ${m(b?.shortTermInvestments.value)} NCI ${m(b?.nci.value)} pref ${m(b?.preferred.value)} | cover shares ${f.coverShares.value} @ ${f.coverShares.asOf}`);
      console.log(`  segments: ${p.segments.available ? p.segments.segments.map((s) => `${s.label}=${m(s.value)}`).join("; ") + " | recon " + p.segments.reconciling.map((s) => `${s.label}=${m(s.value)}`).join("; ") + " | total " + m(p.segments.total) : p.segments.reason}`);
      for (const c of p.checks) if (c.status !== "pass") console.log(`  [${c.status.toUpperCase()}] ${c.title} (${c.period}): ${c.detail.slice(0, 230)}`);
      console.log(`  checks: ${p.checks.filter((c) => c.status === "pass").length} pass, ${p.checks.filter((c) => c.status === "fail").length} fail, ${p.checks.filter((c) => c.status === "na").length} n/a`);
    } catch (e) {
      if (e instanceof CompanyError) console.log(`\n=== ${t}: ${e.code}: ${e.message}`);
      else throw e;
    }
  }
}
main();
