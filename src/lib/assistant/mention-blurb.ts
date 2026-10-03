/**
 * The one-line hint beside a plugin in WarpBot's @ menu.
 *
 * The catalog's `description` is written for the Plugins page, where it has room: Linear's reads
 * "Turn action items into Linear issues, and look up …". In the @ menu it shared one truncating
 * row with the plugin's name and squeezed the name down to "Li…" (3 Oct 2026). The name is what
 * the user is choosing by, so it never truncates now, and the hint is cut here to its first clause
 * — a phrase that still means something — instead of being left to CSS to cut mid-word.
 *
 * Catalog rows carry no short field (`category` is null on every row), which is why this is
 * derived rather than read.
 */
export const MENTION_BLURB_MAX_CHARS = 40;

export function mentionBlurb(description: string | null | undefined, maxChars = MENTION_BLURB_MAX_CHARS): string {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  // First sentence, then first clause: ", and", ";", " — " and ":" all start a second thought.
  const firstSentence = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "");
  const firstClause = firstSentence.split(/\s*(?:[;:]|\s[—–-]\s|,\s)/)[0].trim();
  const phrase = firstClause || firstSentence;
  if (phrase.length <= maxChars) return phrase;

  // Still long: stop at the last whole word that fits.
  const cut = phrase.slice(0, maxChars + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : phrase.slice(0, maxChars)).replace(/[,;:]$/, "")}…`;
}
