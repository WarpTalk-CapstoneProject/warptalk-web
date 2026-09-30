/**
 * Text matching for the admin portal's search boxes and command palette.
 *
 * One normaliser, so "hoá đơn", "hóa đơn" and "hoa don" are the same query everywhere. Vietnamese
 * has two accepted placements of the tone mark on "oa"/"oe"/"uy" (hoá / hóa), and admins type
 * whichever their keyboard produces — or none at all. Stripping every combining mark after NFD
 * makes all three equal, and `đ` is folded by hand because it is a letter of its own, not a `d`
 * with a mark, so NFD leaves it alone.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How well `query` matches `text`, or 0 when it does not.
 *
 * Deliberately simple and predictable: exact > prefix > word-prefix > substring > every query word
 * present somewhere. A fuzzy scorer ranks "bill" under "global glossary" (b…i…l…l) and admins stop
 * trusting the list; this one only ever returns things that visibly contain what was typed.
 */
export function matchScore(query: string, text: string): number {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const t = normalizeSearchText(text);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s/·,()-]+/).some((word) => word.startsWith(q))) return 60;
  if (t.includes(q)) return 40;
  const words = q.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((word) => t.includes(word))) return 20;
  return 0;
}

/** The best score of `query` against any of `texts`. */
export function bestMatchScore(query: string, texts: readonly (string | null | undefined)[]): number {
  let best = 0;
  for (const text of texts) {
    if (!text) continue;
    const score = matchScore(query, text);
    if (score > best) best = score;
  }
  return best;
}

/** Whether a free-text box's value names a row — every word present in at least one field. */
export function matchesSearch(query: string, texts: readonly (string | null | undefined)[]): boolean {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const haystack = texts.filter(Boolean).map((text) => normalizeSearchText(text as string)).join(" \u0000 ");
  return q.split(" ").every((word) => haystack.includes(word));
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeGuid(value: string): boolean {
  return GUID.test(value.trim());
}
