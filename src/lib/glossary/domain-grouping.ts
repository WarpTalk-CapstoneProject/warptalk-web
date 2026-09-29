/**
 * Domain-Grouping Utilities for Glossary Terms (Linear Style).
 *
 * Enforces structured visual hierarchy by business domains without colorful fills,
 * keeping the clean, minimal monochrome aesthetic of WarpTalk.
 */

export interface DomainGroup<T> {
  domain: string;
  terms: T[];
  count: number;
}

/**
 * Normalizes a raw domain string.
 * Empty, null, or whitespace-only domains fallback to "General".
 */
export function normalizeDomain(domain?: string | null): string {
  const trimmed = domain?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return "General";
  }
  return trimmed;
}

/**
 * Groups an array of glossary terms by their domain.
 * Sorts domain groups alphabetically, placing "General" at the end if desired.
 */
export function groupTermsByDomain<T extends { domain?: string | null }>(
  terms: T[],
  defaultDomain = "General",
): DomainGroup<T>[] {
  const map = new Map<string, T[]>();

  for (const term of terms) {
    const domain = normalizeDomain(term.domain) || defaultDomain;
    const existing = map.get(domain);
    if (existing) {
      existing.push(term);
    } else {
      map.set(domain, [term]);
    }
  }

  const groups: DomainGroup<T>[] = [];
  for (const [domain, groupTerms] of map.entries()) {
    groups.push({
      domain,
      terms: groupTerms,
      count: groupTerms.length,
    });
  }

  // Sort domains: specific named domains alphabetically, "General" at the end
  return groups.sort((a, b) => {
    if (a.domain.toLowerCase() === defaultDomain.toLowerCase()) return 1;
    if (b.domain.toLowerCase() === defaultDomain.toLowerCase()) return -1;
    return a.domain.localeCompare(b.domain, "vi", { sensitivity: "base" });
  });
}

/**
 * Identifies terms that appear across multiple domains (polysemic / multi-domain terms),
 * allowing UI to render cross-domain reference links (e.g. "Also defined in: Sales, Legal").
 */
export function findCrossDomainTerms<T extends { domain?: string | null }>(
  terms: T[],
  getTermText: (t: T) => string,
): Map<T, string[]> {
  const termTextToDomains = new Map<string, Set<string>>();

  for (const term of terms) {
    const textKey = getTermText(term).trim().toLowerCase();
    if (!textKey) continue;
    const domain = normalizeDomain(term.domain);

    const domains = termTextToDomains.get(textKey) ?? new Set<string>();
    domains.add(domain);
    termTextToDomains.set(textKey, domains);
  }

  const result = new Map<T, string[]>();

  for (const term of terms) {
    const textKey = getTermText(term).trim().toLowerCase();
    const currentDomain = normalizeDomain(term.domain);
    const allDomains = termTextToDomains.get(textKey);

    if (allDomains && allDomains.size > 1) {
      const otherDomains = Array.from(allDomains).filter(
        (d) => d.toLowerCase() !== currentDomain.toLowerCase(),
      );
      if (otherDomains.length > 0) {
        result.set(term, otherDomains);
      }
    }
  }

  return result;
}
