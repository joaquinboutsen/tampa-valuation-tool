"""
Compare the figures the tool reports for a company with the numbers PRINTED in
its 10-K document.

A 10-K filed with the SEC is an "inline XBRL" document: every tagged number in
the human-readable report carries its tag, period and scale. This script reads
those printed numbers straight from the document and compares them with the
tool's output, cell by cell.

Usage:
    curl -s https://tampa-valuation-tool.vercel.app/api/company/JBL -o tool.json
    curl -s -A "Your Name you@example.com" -o 10k.htm \
        https://www.sec.gov/Archives/edgar/data/898293/000162828026067038/jbl-20260831.htm
    python3 scripts/check-10k.py tool.json 10k.htm 0001628280-26-067038
"""
import json
import re
import sys
from collections import Counter


def printed_facts(html):
    """(tag, start, end) -> set of printed values, for facts with no dimensions."""
    contexts = {}
    for m in re.finditer(r'<xbrli:context id="([^"]+)">(.*?)</xbrli:context>', html, re.S):
        body = m.group(2)
        has_dims = "xbrldi:explicitMember" in body or "xbrldi:typedMember" in body
        start = re.search(r"<xbrli:startDate>([^<]+)", body)
        end = re.search(r"<xbrli:endDate>([^<]+)", body) or re.search(r"<xbrli:instant>([^<]+)", body)
        contexts[m.group(1)] = (has_dims, start.group(1) if start else None, end.group(1))

    facts = {}
    for m in re.finditer(r"<ix:nonFraction\b([^>]*)>(.*?)</ix:nonFraction>", html, re.S):
        attrs = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        ctx = contexts.get(attrs.get("contextRef"))
        if not ctx or ctx[0]:
            continue
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if "zerodash" in attrs.get("format", "") or text in ("—", "-", "–"):
            value = 0.0
        else:
            try:
                value = float(text.replace(",", ""))
            except ValueError:
                continue
        value *= 10 ** int(attrs.get("scale") or 0)
        if attrs.get("sign") == "-":
            value = -value
        facts.setdefault((attrs["name"], ctx[1], ctx[2]), set()).add(round(value, 4))
    return facts


def main():
    tool = json.load(open(sys.argv[1], encoding="utf-8"))
    facts = printed_facts(open(sys.argv[2], encoding="utf-8").read())
    accession = sys.argv[3]
    fin = tool["financials"]
    years = [y["label"] for y in fin["fiscalYears"]]

    results = []

    def check(label, cell):
        if not cell or cell.get("value") is None or cell.get("derived"):
            return  # derived lines (EBITDA, free cash flow) are not printed in a 10-K
        src = cell["sources"][0]
        if src["accn"] != accession:
            results.append(("from an earlier filing", label))
            return
        printed = facts.get((src["tag"], src.get("start"), src["end"]))
        if printed is None:
            results.append(("not printed as a number", label))
        elif any(abs(p - cell["value"]) <= max(0.005, abs(cell["value"]) * 1e-9) for p in printed):
            results.append(("match", label))
        else:
            results.append(("MISMATCH", f"{label}: tool {cell['value']}, printed {sorted(printed)}"))

    for row in fin["income"] + fin["cashflow"]:
        for i, cell in enumerate(row["values"]):
            check(f"{row['label']} {years[i]}", cell)
    for snap in fin["balanceByYear"]:
        for key, cell in snap["items"].items():
            check(f"{key} at {snap['date']}", cell)

    counts = Counter(r[0] for r in results)
    for status, n in counts.most_common():
        print(f"{n:4d}  {status}")
    for status, label in results:
        if status in ("MISMATCH", "not printed as a number"):
            print(f"      {status}: {label}")


if __name__ == "__main__":
    main()
