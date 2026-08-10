/**
 * Folds user-typed text into a comparable form for substring search.
 *
 * Vietnamese names carry diacritics that nobody types when searching — "manh" has to find
 * "Mạnh" (WT-231). Mirrors SearchTextHelper on the backend so a list narrowed locally and a
 * list narrowed by the API agree on what matches.
 */
export function foldSearchText(value: string | null | undefined): string {
  if (!value) return "";

  return (
    value
      .trim()
      // đ/Đ is a distinct letter rather than a base letter plus a combining mark, so NFD
      // leaves it intact — it has to be mapped explicitly or "Đặng" never folds to "dang".
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
  );
}

/**
 * True when `term` appears anywhere in any of `values` once both sides are folded.
 * An empty term matches everything — callers guard before narrowing a list.
 */
export function matchesSearchText(
  term: string | null | undefined,
  ...values: (string | null | undefined)[]
): boolean {
  const foldedTerm = foldSearchText(term);
  if (!foldedTerm) return true;

  return values.some((value) => foldSearchText(value).includes(foldedTerm));
}
