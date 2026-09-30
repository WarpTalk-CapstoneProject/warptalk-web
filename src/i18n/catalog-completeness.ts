/**
 * Compares the vi/ja message catalogs against en (the source of truth) so a
 * key added to one locale and forgotten in another fails loudly instead of
 * silently falling back to English in production. Mirrors the drift-check
 * shape of `src/lib/language/catalog-drift.ts`, for the UI-locale catalog
 * rather than the meeting-language registry.
 */

export type MessageTree = { [key: string]: string | MessageTree };

/** Flattens a nested message object into dot-paths, e.g. "pricing.free". */
export function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else {
      keys.push(...flattenKeys(value, path));
    }
  }
  return keys.sort();
}

export type CatalogDiff = {
  locale: string;
  namespace: string;
  missing: string[];
  extra: string[];
};

/** Diffs one locale's namespace against the source-of-truth (en) namespace. */
export function diffNamespace(
  namespace: string,
  locale: string,
  sourceTree: MessageTree,
  localeTree: MessageTree,
): CatalogDiff {
  const sourceKeys = new Set(flattenKeys(sourceTree));
  const localeKeys = new Set(flattenKeys(localeTree));

  return {
    locale,
    namespace,
    missing: [...sourceKeys].filter((key) => !localeKeys.has(key)),
    extra: [...localeKeys].filter((key) => !sourceKeys.has(key)),
  };
}
