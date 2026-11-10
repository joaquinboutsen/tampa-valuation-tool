/** Developer tool: show how revenue is dimensioned in a filing's XBRL instance, and the balance sheet rows. */
import { archiveBase, secJson, secText } from "../src/lib/sec/client";
import { parseContexts } from "../src/lib/sec/segments";
import { findBalanceSheetReport, parseFilingSummary, parseReportTable } from "../src/lib/sec/statements";

async function main() {
  const [cik, accn, mode] = [Number(process.argv[2]), process.argv[3], process.argv[4] ?? "seg"];
  const base = archiveBase(cik, accn);
  if (mode === "bs") {
    const reports = parseFilingSummary(await secText(`${base}/FilingSummary.xml`));
    const t = parseReportTable(await secText(`${base}/${findBalanceSheetReport(reports)!.file}`))!;
    for (const r of t.rows) console.log(`${r.isAbstract ? "A" : " "}${r.isTotal ? "T" : " "} ${r.prefix}:${r.name.padEnd(60)} ${r.label.slice(0, 50).padEnd(50)} ${r.values[0]}`);
    return;
  }
  const idx = await secJson<{ directory: { item: { name: string }[] } }>(`${base}/index.json`);
  const inst = idx.directory.item.find((i) => /_htm\.xml$/.test(i.name))!;
  const xml = await secText(`${base}/${inst.name}`);
  const ctx = parseContexts(xml);
  console.log("contexts", ctx.size);
  for (const tag of ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"]) {
    const re = new RegExp(`<us-gaap:${tag}\\s([^>]*)>([^<]*)<`, "g");
    const seen = new Set<string>();
    for (const m of xml.matchAll(re)) {
      const c = ctx.get(/contextRef="([^"]+)"/.exec(m[1])![1]);
      if (!c || !c.start) continue;
      const days = (Date.parse(c.end!) - Date.parse(c.start)) / 86400000;
      if (days < 350) continue;
      const line = `${tag.slice(0, 20)} ${c.start}..${c.end} ${(Number(m[2]) / 1e6).toFixed(0).padStart(8)} ${c.dims.map((d) => `${d.dimension}=${d.member}`).join(" | ")}`;
      if (!seen.has(line)) console.log(line);
      seen.add(line);
    }
  }
}
main();
