/**
 * PO 2026-10-02 — the workspace Glossary page's chip row, filtered and grouped by LANGUAGE PAIR.
 *
 * A glossary is a company's domain dictionary for one (source → target) pair, and the same source
 * term legitimately lives once per pair: "Bug" in an EN→JA glossary (不具合, defined in Japanese)
 * and "Bug" in an EN→EN one (defined in English). So the pair is the unit the reader navigates by:
 * a filter of the pairs that exist (with counts) and the chips grouped under a small pair label.
 * The pair is one unit — "English → Vietnamese" is not "English" plus "Vietnamese".
 *
 * Pure, so the node:test contract can pin it.
 */

export interface PairedGlossary {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface GlossaryPair {
  /** `source>target`, base languages. */
  key: string;
  source: string;
  target: string;
}

export interface GlossaryPairOption extends GlossaryPair {
  count: number;
}

export interface GlossaryPairGroup<T extends PairedGlossary> extends GlossaryPair {
  glossaries: T[];
}

export const ALL_PAIRS = "all";

function base(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

export function glossaryPairKey(glossary: Pick<PairedGlossary, "sourceLanguage" | "targetLanguage">): string {
  return `${base(glossary.sourceLanguage)}>${base(glossary.targetLanguage)}`;
}

/**
 * Groups glossaries by pair (groups ordered by source then target NAME; glossaries keep their
 * order inside a group), applies the pair filter, and settles which glossary is selected: the
 * reader's choice if it is still visible, otherwise the first visible one.
 *
 * A filter naming a pair that no longer exists (its last glossary moved away) falls back to all.
 */
export function groupGlossariesByPair<T extends PairedGlossary>(
  glossaries: readonly T[],
  filter: string,
  nameOf: (code: string) => string,
  selectedId: string | null,
): {
  options: GlossaryPairOption[];
  groups: GlossaryPairGroup<T>[];
  filter: string;
  selected: T | undefined;
} {
  const byKey = new Map<string, GlossaryPairGroup<T>>();
  for (const glossary of glossaries) {
    const key = glossaryPairKey(glossary);
    let group = byKey.get(key);
    if (!group) {
      group = { key, source: base(glossary.sourceLanguage), target: base(glossary.targetLanguage), glossaries: [] };
      byKey.set(key, group);
    }
    group.glossaries.push(glossary);
  }

  const all = [...byKey.values()].sort(
    (a, b) =>
      nameOf(a.source).localeCompare(nameOf(b.source)) ||
      nameOf(a.target).localeCompare(nameOf(b.target)),
  );
  const effectiveFilter = filter !== ALL_PAIRS && byKey.has(filter) ? filter : ALL_PAIRS;
  const groups = effectiveFilter === ALL_PAIRS ? all : all.filter((group) => group.key === effectiveFilter);
  const visible = groups.flatMap((group) => group.glossaries);

  return {
    options: all.map(({ key, source, target, glossaries: members }) => ({ key, source, target, count: members.length })),
    groups,
    filter: effectiveFilter,
    selected: visible.find((glossary) => glossary.id === selectedId) ?? visible[0],
  };
}

/**
 * WT-937 — the pair filter to show after the open glossary's pair was changed to `newKey`.
 *
 * The filter used to stay where it was. Filtered to `en>en`, relabelling the open glossary as
 * `en>vi` filtered it OUT, and the page fell back to the first glossary still in `en>en` — a
 * different glossary, under a toast that had just said "changed to English → Vietnamese". QA read
 * it as the two pairs swapping their data. "All pairs" stays all pairs; a specific pair follows the
 * glossary to the pair it now belongs to.
 */
export function filterAfterPairChange(currentFilter: string, newKey: string): string {
  return currentFilter === ALL_PAIRS ? ALL_PAIRS : newKey;
}
