/**
 * The Voice panel's lists, decided without React so the node test runner can hold them.
 *
 * WHY A FIXED WINDOW OF FIVE
 *   The panel is a 256px flyout over the meeting. The library for one language is four to six
 *   voices and "All languages" is thirty-odd, so listing them inline made the panel taller than the
 *   meeting it sits on. Five rows are shown; "Show all" fills the SAME five-row box with every voice
 *   and lets it scroll, so the panel never changes height under the pointer.
 *
 * WHY PROFILE NAMES ARE CLEANED
 *   A clone carried over from an earlier meeting is stored as "My voice (vi-VN)". The code in
 *   brackets is a locale tag nobody reads; the flag beside the name says the same thing.
 */

/** Rows the library shows before "Show all". */
export const LIBRARY_VISIBLE_ROWS = 5;

/** The filter value for every language at once. */
export const ALL_LANGUAGES = "all";

export type LibraryVoice = {
  id: string;
  name: string;
  gender?: string | null;
  /** Bare ISO-639-1 of the catalogue this voice was offered in — what a pick is validated against. */
  language: string;
};

const LOCALE_SUFFIX = /\s*\(([a-z]{2,3})(?:[-_][A-Za-z]{2,4})?\)\s*$/;

/** "My voice (vi-VN)" -> { name: "My voice", language: "vi" }. A name without a tag is unchanged. */
export function profileDisplay(
  name: string,
  language?: string | null,
): { name: string; language: string | null } {
  const match = LOCALE_SUFFIX.exec(name);
  const stripped = match ? name.slice(0, match.index).trim() : name.trim();
  const fromName = match?.[1]?.toLowerCase() ?? null;
  const fromField = language ? language.split(/[-_]/)[0]?.toLowerCase() || null : null;
  return { name: stripped || name.trim(), language: fromField ?? fromName };
}

/** Bare language code, so "vi-VN", "VI" and "vi" all select the same catalogue. */
export function bareLanguage(language?: string | null): string {
  return (language ?? "").split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/**
 * The language the library opens on: the one the person speaks, if a catalogue exists for it,
 * otherwise every language. Opening on "All" when the speak language has no voices beats opening
 * on an empty list that reads as the feature being broken.
 */
export function initialLibraryLanguage(
  speakLanguage: string | null | undefined,
  available: readonly string[],
): string {
  const bare = bareLanguage(speakLanguage);
  return bare && available.includes(bare) ? bare : ALL_LANGUAGES;
}

/** Every voice of the chosen language (or all of them), sorted by language order, then gender, then name. */
export function libraryVoices(
  catalogs: Readonly<Record<string, readonly { id: string; name: string; gender?: string | null }[]>>,
  languageOrder: readonly string[],
  filter: string,
): LibraryVoice[] {
  const languages = filter === ALL_LANGUAGES ? languageOrder : languageOrder.filter((code) => code === filter);
  const seen = new Set<string>();
  const voices: LibraryVoice[] = [];
  for (const language of languages) {
    const items = [...(catalogs[language] ?? [])].sort(
      (a, b) => (a.gender || "").localeCompare(b.gender || "") || a.name.localeCompare(b.name),
    );
    for (const item of items) {
      // One voice can be offered in several languages; under "All" it is listed once, in the
      // first language that offers it, so a pick still names a catalogue that contains it.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      voices.push({ id: item.id, name: item.name, gender: item.gender, language });
    }
  }
  return voices;
}

/** The rows to render, and whether "Show all" has anything to add. */
export function libraryWindow<T>(
  voices: readonly T[],
  expanded: boolean,
): { rows: readonly T[]; hiddenCount: number; scrolls: boolean } {
  const overflow = voices.length > LIBRARY_VISIBLE_ROWS;
  return {
    rows: expanded || !overflow ? voices : voices.slice(0, LIBRARY_VISIBLE_ROWS),
    hiddenCount: overflow ? voices.length - LIBRARY_VISIBLE_ROWS : 0,
    scrolls: expanded && overflow,
  };
}
