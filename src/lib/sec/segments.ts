/**
 * Segment revenue, read from the full XBRL data file of the latest 10-K.
 *
 * The SEC's summary data feed does not include segment detail, so this parses
 * the filing's own data file. A number belongs to a segment when it is tagged
 * with the standard "business segments" dimension.
 */
import type { SegmentData, SegmentLine } from "../types";
import { FLOW_CONCEPTS } from "./concepts";

const SEGMENT_AXIS = "us-gaap:StatementBusinessSegmentsAxis";
const CONSOLIDATION_AXIS = "srt:ConsolidationItemsAxis";
const OPERATING_SEGMENTS = "us-gaap:OperatingSegmentsMember";

interface Ctx {
  start?: string;
  end?: string;
  dims: { dimension: string; member: string }[];
}

export function prettifyMember(member: string): string {
  const local = member.includes(":") ? member.split(":")[1] : member;
  return local
    .replace(/Member$/, "")
    .replace(/Segment$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\bAnd\b/g, "and")
    .trim();
}

export function parseContexts(xml: string): Map<string, Ctx> {
  const map = new Map<string, Ctx>();
  const re = /<(?:xbrli:)?context\s+id="([^"]+)"\s*>([\s\S]*?)<\/(?:xbrli:)?context>/g;
  for (const m of xml.matchAll(re)) {
    const body = m[2];
    const dims = [...body.matchAll(/<xbrldi:explicitMember\s+dimension="([^"]+)"\s*>\s*([^<\s]+)\s*</g)].map((d) => ({
      dimension: d[1],
      member: d[2],
    }));
    if (/<xbrldi:typedMember/.test(body)) dims.push({ dimension: "typed", member: "typed" });
    map.set(m[1], {
      start: /<(?:xbrli:)?startDate>([^<]+)</.exec(body)?.[1]?.trim(),
      end: /<(?:xbrli:)?endDate>([^<]+)</.exec(body)?.[1]?.trim(),
      dims,
    });
  }
  return map;
}

interface TaggedValue {
  ctx: Ctx;
  value: number;
}

function factsFor(xml: string, tag: string, contexts: Map<string, Ctx>): TaggedValue[] {
  const out: TaggedValue[] = [];
  const re = new RegExp(`<us-gaap:${tag}\\s([^>]*)>([^<]*)</us-gaap:${tag}>`, "g");
  for (const m of xml.matchAll(re)) {
    const ctxId = /contextRef="([^"]+)"/.exec(m[1])?.[1];
    const ctx = ctxId ? contexts.get(ctxId) : undefined;
    const value = Number(m[2]);
    if (!ctx || !Number.isFinite(value) || m[2].trim() === "") continue;
    out.push({ ctx, value });
  }
  return out;
}

function dedupe(lines: SegmentLine[]): SegmentLine[] {
  const seen = new Map<string, SegmentLine>();
  for (const l of lines) if (!seen.has(l.member)) seen.set(l.member, l);
  return [...seen.values()];
}

const GEO_AXIS = "srt:StatementGeographicalAxis";
/** Members that are subtotals of other segments, not segments themselves. */
const AGGREGATE_MEMBER = /(ReportableSegmentAggregation|:OperatingSegmentsMember$|:ReportableSegmentsMember$|:SegmentReportingReconcilingItem)/;

/**
 * @param xml  contents of the filing's XBRL instance document
 * @param fy   fiscal year to read (start and end dates)
 *
 * Companies tag segment revenue in a few different ways (on the segment
 * dimension alone, combined with an "operating segments" marker, or combined
 * with a geography). Each way is tried, with and without reconciling items
 * (eliminations / corporate), and the one closest to consolidated revenue is
 * reported, along with every line used, so the tie-out is fully visible.
 */
export function extractSegmentRevenue(xml: string, fy: { start: string; end: string }): SegmentData {
  const contexts = parseContexts(xml);
  let bestResult: SegmentData | null = null;
  let bestGap = Infinity;

  const byTag = FLOW_CONCEPTS.revenue.map((tag) => ({
    tag,
    facts: factsFor(xml, tag, contexts).filter((f) => f.ctx.end === fy.end && f.ctx.start === fy.start),
  }));
  // Consolidated revenue is the figure with no dimensions attached. Some companies
  // tag the total and the segments with two different revenue tags.
  const anyTotal = byTag.map((t) => t.facts.find((f) => f.ctx.dims.length === 0)?.value).find((v) => v !== undefined) ?? null;

  for (const { tag, facts } of byTag) {
    if (!facts.length) continue;
    const total = facts.find((f) => f.ctx.dims.length === 0)?.value ?? anyTotal;

    // Group segment-tagged facts by which other dimensions they carry.
    const groups = new Map<string, SegmentLine[]>();
    for (const f of facts) {
      const seg = f.ctx.dims.find((d) => d.dimension === SEGMENT_AXIS);
      if (!seg || f.ctx.dims.length > 2 || AGGREGATE_MEMBER.test(seg.member)) continue;
      const other = f.ctx.dims.find((d) => d.dimension !== SEGMENT_AXIS);
      let signature = "segment";
      if (other) {
        if (other.dimension === CONSOLIDATION_AXIS && other.member === OPERATING_SEGMENTS) signature = "segment+operating";
        else if (other.dimension === GEO_AXIS) signature = "segment+geography";
        else continue;
      }
      const list = groups.get(signature) ?? [];
      list.push({ member: seg.member, label: prettifyMember(seg.member), value: f.value });
      groups.set(signature, list);
    }

    const reconciling = dedupe(
      facts
        .filter(
          (f) => f.ctx.dims.length === 1 && f.ctx.dims[0].dimension === CONSOLIDATION_AXIS && f.ctx.dims[0].member !== OPERATING_SEGMENTS,
        )
        .map((f) => ({ member: f.ctx.dims[0].member, label: prettifyMember(f.ctx.dims[0].member), value: f.value })),
    );

    for (const lines of groups.values()) {
      const segments = dedupe(lines);
      // A segment appearing with several different values means this is a cross-tab, not a clean list.
      const crossTab = lines.some((l) => segments.find((s) => s.member === l.member)!.value !== l.value);
      if (segments.length < 2 || crossTab) continue;
      const segmentSum = segments.reduce((s, l) => s + l.value, 0);
      // Some filers tag the segment subtotal itself as a "reconciling item"; it is not one.
      const recon = reconciling.filter((r) => Math.abs(r.value - segmentSum) > Math.abs(segmentSum) * 1e-6);
      const options = [{ segments, reconciling: [] as SegmentLine[] }];
      if (recon.length) options.push({ segments, reconciling: recon });
      for (const o of options) {
        const sum = [...o.segments, ...o.reconciling].reduce((s, l) => s + l.value, 0);
        const gap = total === null ? Number.MAX_VALUE : Math.abs(sum - total);
        if (gap < bestGap) {
          bestGap = gap;
          bestResult = {
            available: true,
            axis: SEGMENT_AXIS,
            period: fy,
            revenueTag: `us-gaap:${tag}`,
            segments: o.segments,
            reconciling: o.reconciling,
            total,
          };
        }
      }
    }
  }

  return (
    bestResult ?? {
      available: false,
      reason:
        "No segment revenue was found in the 10-K's data file. The company may report a single segment, or tag its segments in a non-standard way.",
      segments: [],
      reconciling: [],
      total: null,
    }
  );
}
