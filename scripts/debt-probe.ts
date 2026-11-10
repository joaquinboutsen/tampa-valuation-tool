/** Developer tool: show the debt lines found on the face of the latest balance sheet. */
import { secJson, secText, archiveBase, pad10 } from "../src/lib/sec/client";
import { buildFinancials, type CompanyFacts } from "../src/lib/sec/facts";
import { extractDebtFromBalanceSheet, findBalanceSheetReport, parseFilingSummary, parseReportTable } from "../src/lib/sec/statements";
import { readFileSync } from "node:fs";

async function main() {
  for (const arg of process.argv.slice(2)) {
    const cf = JSON.parse(readFileSync(arg, "utf8")) as CompanyFacts;
    const f = buildFinancials(cf);
    const b = f.latestBalance!;
    const base = archiveBase(cf.cik, b.accn);
    const reports = parseFilingSummary(await secText(`${base}/FilingSummary.xml`));
    const bs = findBalanceSheetReport(reports);
    if (!bs) { console.log(cf.entityName, "NO BS REPORT", reports.slice(0, 8).map((r) => r.shortName)); continue; }
    const table = parseReportTable(await secText(`${base}/${bs.file}`))!;
    const debt = extractDebtFromBalanceSheet(table);
    console.log(`\n== ${cf.entityName} | ${b.form} ${b.date} | ${bs.shortName} | cols ${table.columns.join(" / ")} | scale ${table.scale} | rows ${table.rows.length}`);
    for (const d of debt) console.log(`   ${d.label.padEnd(60)} ${d.tag.padEnd(55)} ${(d.value / 1e6).toLocaleString()}`);
    console.log("   TOTAL", (debt.reduce((s, d) => s + d.value, 0) / 1e6).toLocaleString());
  }
}
main();
void secJson; void pad10;
