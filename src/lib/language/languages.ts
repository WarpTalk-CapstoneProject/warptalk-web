/**
 * The single registry of languages the product knows about.
 *
 * Before this file was the only source, eight components each carried their own hardcoded
 * `[{code, label}]` array. They drifted: Korean was offered as a room language but had no
 * entry here, so `getLanguageName("ko-KR")` fell through to its raw-value fallback and the
 * UI printed the tag itself at the user; German and Hindi had entries here but no row in
 * `platform.supported_languages`, so the chat panel offered translating into languages the
 * backend does not support.
 *
 * The rules this file exists to enforce:
 *   1. A language name shown to a person always comes from `name` here — never from a code.
 *   2. What goes over the wire is `code` (bare ISO-639-1) or `locale` (tag), never `name`.
 *   3. A picker declares WHICH languages it offers with a scope, not by re-listing them.
 *
 * The rows mirror `platform.supported_languages` (see
 * warptalk-infrastructure/scripts/seed-data.sh). Keep them in step: a language seeded there
 * but missing here renders as a raw code, and one listed here but not seeded there is
 * offered to users the backend will reject.
 */

/**
 * Where a language may be offered. A language can be known — so it renders with a proper
 * name wherever it turns up in stored data — without being offered anywhere.
 */
export type LanguageScope =
  /** Selectable as one of a meeting's languages, and on the pre-join screen. */
  | "meeting"
  /** Selectable when recording a voice profile. */
  | "voiceProfile"
  /** Has a provider voice library worth browsing. */
  | "voiceCatalog"
  /** Selectable as a glossary pair language. */
  | "glossary"
  /** Selectable as an on-click chat translation target. */
  | "chatTarget";

export type SupportedLanguage = {
  /** Bare ISO-639-1. What the AI side, the glossary and chat translation are keyed by. */
  code: string;
  /** Locale tag. What rooms, join state and voice profiles store. */
  locale: string;
  /** The full English name — the only one of these fields a person should ever see. */
  name: string;
  /** ISO-3166 alpha-2. The flag emoji is derived from this, see ./language-flag. */
  region: string;
  scopes: LanguageScope[];
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    code: "vi",
    locale: "vi-VN",
    name: "Vietnamese",
    region: "VN",
    scopes: ["meeting", "voiceProfile", "voiceCatalog", "glossary", "chatTarget"],
  },
  {
    code: "en",
    locale: "en-US",
    name: "English",
    region: "US",
    scopes: ["meeting", "voiceProfile", "voiceCatalog", "glossary", "chatTarget"],
  },
  {
    code: "ja",
    locale: "ja-JP",
    name: "Japanese",
    region: "JP",
    scopes: ["meeting", "voiceProfile", "glossary", "chatTarget"],
  },
  {
    code: "ko",
    locale: "ko-KR",
    name: "Korean",
    region: "KR",
    scopes: ["meeting", "chatTarget"],
  },
  {
    code: "fr",
    locale: "fr-FR",
    name: "French",
    region: "FR",
    scopes: ["meeting", "chatTarget"],
  },
  {
    code: "es",
    locale: "es-ES",
    name: "Spanish",
    region: "ES",
    scopes: ["meeting", "chatTarget"],
  },
  {
    // Seeded and translatable, but deliberately not a meeting language — no scope puts it in
    // a room picker. Kept here so stored Chinese data still reads as "Chinese".
    code: "zh",
    locale: "zh-CN",
    name: "Chinese",
    region: "CN",
    scopes: ["chatTarget"],
  },
];

/**
 * Extra spellings that must fold to a known code. Bare codes and locale tags are handled
 * structurally by `normalizeLanguageCode`, so this only carries shapes that cannot be
 * derived — chiefly ASCII-folded names, which arrive from the AI side and from older rows.
 */
/**
 * Endonyms — what each language calls itself. i18n-allow: this table is INPUT ONLY. It exists
 * so a name arriving from the AI side or an older row folds to the right code, and nothing
 * here is ever rendered. The registry above deliberately no longer carries a native display
 * name, so no component can reach one by accident; the UI is English throughout.
 */
const LANGUAGE_ENDONYMS: Record<string, string> = {
  "tiếng việt": "vi",
  日本語: "ja",
  한국어: "ko",
  français: "fr",
  español: "es",
  中文: "zh",
};

const LANGUAGE_ALIASES: Record<string, string> = {
  "english (united states)": "en",
  "tieng viet": "vi",
  nihongo: "ja",
  zhongwen: "zh",
  espanol: "es",
  francais: "fr",
  ...LANGUAGE_ENDONYMS,
  ...Object.fromEntries(
    SUPPORTED_LANGUAGES.flatMap((language) => [
      [language.name.toLowerCase(), language.code],
      [language.locale.toLowerCase(), language.code],
    ]),
  ),
};

/** Every language offered in a given place. The one way a picker builds its options. */
export function languagesInScope(scope: LanguageScope): SupportedLanguage[] {
  return SUPPORTED_LANGUAGES.filter((language) => language.scopes.includes(scope));
}

/**
 * A workspace's `allowedTargetLanguages` reduced to the bare codes this registry is keyed by.
 *
 * An empty result means UNRESTRICTED, never "no language permitted". The server disables the
 * whitelist check outright when the stored list is empty
 * (warptalk-backend `WorkspaceGrpcService.cs:151`), so a picker that read empty as "nothing
 * allowed" would lock every workspace that never set a policy out of creating a room at all.
 * Callers must branch on `length === 0` before filtering — which is what
 * `isLanguageAllowedByPolicy` below does for them.
 */
export function normalizeLanguagePolicy(allowedTargetLanguages?: string[] | null): string[] {
  if (!allowedTargetLanguages) return [];
  const codes = allowedTargetLanguages.map(normalizeLanguageCode).filter(Boolean);
  return Array.from(new Set(codes));
}

/**
 * Whether a workspace policy permits a language.
 *
 * `value` may arrive as a bare code or as a locale tag: the create-room picker's option
 * values are tags ("vi-VN") while the workspace setting stores bare codes ("vi"). Comparing
 * the two shapes directly is how a whitelist silently matches nothing, so both sides fold
 * through `normalizeLanguageCode` first.
 */
export function isLanguageAllowedByPolicy(
  value: string,
  allowedTargetLanguages?: string[] | null,
): boolean {
  const policy = normalizeLanguagePolicy(allowedTargetLanguages);
  if (policy.length === 0) return true;
  return policy.includes(normalizeLanguageCode(value));
}

/** The meeting-scope languages a workspace policy permits. Empty policy ⇒ the whole scope. */
export function meetingLanguagesForPolicy(allowedTargetLanguages?: string[] | null) {
  return languagesInScope("meeting").filter((language) =>
    isLanguageAllowedByPolicy(language.code, allowedTargetLanguages),
  );
}

/**
 * Trim a picked meeting-language set down to what the workspace permits, in the same value
 * shape it was given (rooms store locale tags).
 *
 * The create-room defaults are a fixed en/vi pair, so a workspace whose policy excludes
 * either one starts the dialog already invalid — the server rejects it and the host has no
 * idea why. If the trim empties the set, the first permitted meeting language stands in,
 * because the picker requires at least one selection. A policy naming only languages that
 * are not meeting-scope leaves nothing to fall back to and returns `[]`; the dialog's own
 * validation then blocks submit rather than sending a set the server would refuse.
 */
export function reconcileMeetingLanguages(
  selected: string[],
  allowedTargetLanguages?: string[] | null,
): string[] {
  const kept = selected.filter((value) =>
    isLanguageAllowedByPolicy(value, allowedTargetLanguages),
  );
  if (kept.length > 0) return kept;

  const fallback = meetingLanguagesForPolicy(allowedTargetLanguages)[0];
  return fallback ? [fallback.locale] : [];
}

export function getLanguageByCode(code?: string) {
  if (!code) return undefined;
  return SUPPORTED_LANGUAGES.find((language) => language.code === normalizeLanguageCode(code));
}

/**
 * Folds any shape a language reaches us in — "vi-VN", "vi_VN", "vi", "Vietnamese" — to the
 * bare ISO-639-1 code everything downstream is keyed by.
 *
 * Returns "" for an absent value rather than guessing "en": callers that need a default pick
 * their own, and inventing English here silently mislabelled empty values.
 */
export function normalizeLanguageCode(value?: string) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";

  const alias = LANGUAGE_ALIASES[normalized];
  if (alias) return alias;

  // Locale tags reach here from rooms and browser settings while everything downstream — the
  // alias table, SUPPORTED_LANGUAGES, the backend's supported_languages rows — is keyed by
  // the bare code. Without dropping the region subtag "vi-VN" matched nothing.
  const base = normalized.split(/[-_]/)[0];
  return LANGUAGE_ALIASES[base] ?? base;
}

/**
 * What a person should read. Never returns a bare code for a language we know; for one we do
 * not, the raw value is still more honest than inventing a name.
 */
export function getLanguageName(value?: string) {
  const language = getLanguageByCode(value);
  return language?.name ?? (value || "Auto");
}

export function getLanguageRegion(value?: string) {
  return getLanguageByCode(value)?.region ?? "";
}

/** The locale tag for a language, for surfaces that store tags rather than bare codes. */
export function getLanguageLocale(value?: string) {
  return getLanguageByCode(value)?.locale ?? value ?? "";
}

/**
 * A meeting's language route as a sentence of names: "Vietnamese → English, Japanese".
 *
 * The source is dropped from the targets because a room's stored `targetLanguages` is the
 * whole declared language set, source included — printing it raw produced the
 * "EN-US → EN-US, VI-VN" that the history table used to show.
 */
export function formatLanguageRoute(sourceLanguage?: string, targetLanguages: string[] = []) {
  const source = getLanguageName(sourceLanguage);
  const seen = new Set<string>([normalizeLanguageCode(sourceLanguage)]);

  const targets: string[] = [];
  for (const target of targetLanguages) {
    const code = normalizeLanguageCode(target);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    targets.push(getLanguageName(target));
  }

  return targets.length > 0 ? `${source} → ${targets.join(", ")}` : source;
}

export function serializeTargetLanguages(codes: string[]) {
  return codes.map(normalizeLanguageCode).filter(Boolean).join(",");
}

export function parseTargetLanguages(value?: string | string[]) {
  if (Array.isArray(value)) return value.map(normalizeLanguageCode).filter(Boolean);
  if (!value) return [];

  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeLanguageCode(String(item))).filter(Boolean);
      }
    } catch {
      // Fall through to delimiter parsing for malformed backend values.
    }
  }

  return value
    .split(/[,|]/)
    .map((item) => normalizeLanguageCode(item))
    .filter(Boolean);
}

export function getAvailableTargets(sourceLanguage: string) {
  const sourceCode = normalizeLanguageCode(sourceLanguage);
  return SUPPORTED_LANGUAGES.filter((language) => language.code !== sourceCode);
}
