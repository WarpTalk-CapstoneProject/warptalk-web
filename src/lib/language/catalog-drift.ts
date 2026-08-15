/**
 * Compares the language catalog the backend validates against with the one this app ships.
 *
 * `languages.ts` states the hazard in its own header: a language present on the server but
 * missing here renders as a raw code at the user, and one listed here but absent there is offered
 * to people the backend will reject. Nothing has ever checked. This is that check, run against
 * live data on the admin Configuration screen rather than against a comment.
 */

import { SUPPORTED_LANGUAGES } from "./languages.ts";

export interface ServerLanguage {
  code: string;
  name: string;
  nativeName: string | null;
  isActive: boolean;
}

export interface LanguageCatalogRow extends ServerLanguage {
  /** Whether this app knows the language at all — if not, its name renders as a bare code. */
  shippedInApp: boolean;
  /** Whether a meeting picker offers it. Knowing a language and offering it are separate. */
  offeredForMeetings: boolean;
}

export interface LanguageCatalogComparison {
  rows: LanguageCatalogRow[];
  /**
   * Languages this app offers for meetings that the server catalog has no active row for. Every
   * one of these is a picker entry that produces "Source language is not supported."
   */
  offeredButNotSupported: { code: string; name: string }[];
}

/**
 * "en-US" and "en" both reduce to "en".
 *
 * The same reduction the server does — LanguageRepository.IsSupportedAsync matches on the primary
 * subtag, because the catalog has been seeded in both spellings at different times and an exact
 * comparison could not hit. A comparison here that demanded exact equality would report drift
 * that does not exist.
 */
export function primarySubtag(code: string): string {
  return code.trim().toLowerCase().split("-")[0] ?? "";
}

export function compareLanguageCatalog(server: ServerLanguage[]): LanguageCatalogComparison {
  const app = SUPPORTED_LANGUAGES.map((language) => ({
    key: primarySubtag(language.code),
    name: language.name,
    offeredForMeetings: language.scopes.includes("meeting"),
  }));

  const appByKey = new Map(app.map((entry) => [entry.key, entry]));

  const rows: LanguageCatalogRow[] = server.map((language) => {
    const match = appByKey.get(primarySubtag(language.code));
    return {
      ...language,
      shippedInApp: match !== undefined,
      offeredForMeetings: match?.offeredForMeetings ?? false,
    };
  });

  // Active, because an inactive server row is a deliberate switch-off and the picker offering it
  // is the same bug — the user still gets a rejection.
  const supported = new Set(
    server.filter((language) => language.isActive).map((language) => primarySubtag(language.code)),
  );

  const offeredButNotSupported = app
    .filter((entry) => entry.offeredForMeetings && !supported.has(entry.key))
    .map((entry) => ({ code: entry.key, name: entry.name }));

  return { rows, offeredButNotSupported };
}
