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
  nativeName: string;
  /** ISO-3166 alpha-2. The flag emoji is derived from this, see ./language-flag. */
  region: string;
  scopes: LanguageScope[];
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    code: "vi",
    locale: "vi-VN",
    name: "Vietnamese",
    nativeName: "Tiếng Việt",
    region: "VN",
    scopes: ["meeting", "voiceProfile", "voiceCatalog", "glossary", "chatTarget"],
  },
  {
    code: "en",
    locale: "en-US",
    name: "English",
    nativeName: "English",
    region: "US",
    scopes: ["meeting", "voiceProfile", "voiceCatalog", "glossary", "chatTarget"],
  },
  {
    code: "ja",
    locale: "ja-JP",
    name: "Japanese",
    nativeName: "日本語",
    region: "JP",
    scopes: ["meeting", "voiceProfile", "glossary", "chatTarget"],
  },
  {
    code: "ko",
    locale: "ko-KR",
    name: "Korean",
    nativeName: "한국어",
    region: "KR",
    scopes: ["meeting", "chatTarget"],
  },
  {
    code: "fr",
    locale: "fr-FR",
    name: "French",
    nativeName: "Français",
    region: "FR",
    scopes: ["meeting", "chatTarget"],
  },
  {
    code: "es",
    locale: "es-ES",
    name: "Spanish",
    nativeName: "Español",
    region: "ES",
    scopes: ["meeting", "chatTarget"],
  },
  {
    // Seeded and translatable, but deliberately not a meeting language — no scope puts it in
    // a room picker. Kept here so stored Chinese data still reads as "Chinese".
    code: "zh",
    locale: "zh-CN",
    name: "Chinese",
    nativeName: "中文",
    region: "CN",
    scopes: ["chatTarget"],
  },
];

/**
 * Extra spellings that must fold to a known code. Bare codes and locale tags are handled
 * structurally by `normalizeLanguageCode`, so this only carries shapes that cannot be
 * derived — chiefly ASCII-folded names, which arrive from the AI side and from older rows.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  "english (united states)": "en",
  "tieng viet": "vi",
  nihongo: "ja",
  zhongwen: "zh",
  espanol: "es",
  francais: "fr",
  ...Object.fromEntries(
    SUPPORTED_LANGUAGES.flatMap((language) => [
      [language.name.toLowerCase(), language.code],
      [language.nativeName.toLowerCase(), language.code],
      [language.locale.toLowerCase(), language.code],
    ]),
  ),
};

/** Every language offered in a given place. The one way a picker builds its options. */
export function languagesInScope(scope: LanguageScope): SupportedLanguage[] {
  return SUPPORTED_LANGUAGES.filter((language) => language.scopes.includes(scope));
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

export function getLanguageNativeName(value?: string) {
  const language = getLanguageByCode(value);
  return language?.nativeName ?? getLanguageName(value);
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
