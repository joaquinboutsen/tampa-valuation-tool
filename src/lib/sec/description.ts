/**
 * Business description: a short verbatim excerpt from "Item 1. Business" of
 * the latest 10-K. Nothing is paraphrased or generated.
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#x2019;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#174;|&reg;/g, "®")
    .replace(/&#8482;|&trade;/g, "™")
    .replace(/&#38;/g, "&")
    .replace(/&#x?[0-9a-fA-F]+;/g, " ")
    .replace(/&[a-z]+;/g, " ");
}

/** HTML → array of text blocks (one per paragraph-like element). */
export function htmlToBlocks(html: string): string[] {
  const body = html
    .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(div|p|tr|li|h[1-6]|table)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Matches an "Item 1. Business" heading. Filings often render headings in small
 * caps, which splits words into pieces ("I TEM 1. B USINESS"), so the test is
 * done with all spaces removed.
 */
function item1Heading(block: string): { isHeading: boolean; rest: string } {
  const squashed = block.replace(/\s+/g, "").toLowerCase();
  const m = /^(parti)?item1[.:—–-]*business/.exec(squashed);
  if (!m) return { isHeading: false, rest: "" };
  // Anything long after the heading in the same block is body text.
  const idx = block.toLowerCase().lastIndexOf("business", 60);
  const rest = squashed.length > m[0].length + 100 && idx >= 0 ? block.slice(idx + 8).replace(/^[\s.:—–-]+/, "") : "";
  return { isHeading: true, rest };
}

export function trimToSentences(text: string, maxChars = 560): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".” "));
  if (lastStop > 150) return cut.slice(0, lastStop + 1);
  return cut.replace(/\s+\S*$/, "") + "…";
}

/** Returns the first substantive paragraph after the "Item 1. Business" heading. */
export function extractBusinessDescription(html: string): string | null {
  const blocks = htmlToBlocks(html);
  for (let i = 0; i < blocks.length; i++) {
    const h = item1Heading(blocks[i]);
    if (!h.isHeading) continue;
    // Skip the table of contents: there, "Item 1A" follows within a few short lines.
    const lookahead = blocks.slice(i + 1, i + 6).join(" ");
    if (/item\s*1\s*a\b/i.test(lookahead) && lookahead.length < 600) continue;
    if (/item\s*1\s*a\b/i.test(blocks[i].slice(0, 300))) continue;
    const sameBlock = h.rest;
    const candidates = [sameBlock, ...blocks.slice(i + 1, i + 40)];
    // Join consecutive paragraphs until there is enough to describe the business.
    let text = "";
    for (const c of candidates) {
      if (/^item\s*1a\b/i.test(c)) break;
      const isParagraph = c.length >= 120 && /[a-z]/.test(c) && /\.\s|\.$|\.”$/.test(c);
      if (!isParagraph) continue;
      text = text ? `${text} ${c}` : c;
      if (text.length >= 320) break;
    }
    if (text.length >= 120) return trimToSentences(text);
  }
  return null;
}
