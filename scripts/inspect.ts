/** Developer tool: print the normalized statements for a saved SEC facts file. */
import { readFileSync } from "node:fs";
import { buildFinancials, type CompanyFacts } from "../src/lib/sec/facts";

const file = process.argv[2];
const cf = JSON.parse(readFileSync(file, "utf8")) as CompanyFacts;
const f = buildFinancials(cf);
const fmt = (v: number | null, unit: string) =>
  v === null ? "n/a" : unit === "USD" ? (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 }) : unit === "shares" ? (v / 1e6).toFixed(1) : v.toFixed(2);
console.log(`\n== ${f.entityName} | LTM: ${f.ltm?.label} | cover shares ${f.coverShares.value} @ ${f.coverShares.asOf}`);
console.log("".padEnd(34), ...f.fiscalYears.map((y) => y.label.padStart(12)), (f.ltm?.label ?? "").padStart(14));
for (const r of [...f.income, ...f.cashflow]) {
  console.log(r.label.slice(0, 33).padEnd(34), ...r.values.map((c) => fmt(c.value, r.unit).padStart(12)), fmt(r.ltm?.value ?? null, r.unit).padStart(14), r.ltm?.sources?.[0]?.tag?.replace("us-gaap:", "").slice(0, 28) ?? "");
}
const b = f.latestBalance;
if (b) console.log(`BS ${b.date} (${b.form}):`, Object.entries(b.items).map(([k, c]) => `${k}=${fmt(c.value, "USD")}`).join(" "));
if (f.warnings.length) console.log("WARN", f.warnings);
