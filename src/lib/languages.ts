export type SupportedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  region?: string;
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English", nativeName: "English", region: "US" },
  { code: "es", name: "Spanish", nativeName: "Espanol", region: "ES" },
  { code: "vi", name: "Vietnamese", nativeName: "Tieng Viet", region: "VN" },
  { code: "ja", name: "Japanese", nativeName: "Nihongo", region: "JP" },
  { code: "de", name: "German", nativeName: "Deutsch", region: "DE" },
  { code: "fr", name: "French", nativeName: "Francais", region: "FR" },
  { code: "hi", name: "Hindi", nativeName: "Hindi", region: "IN" },
  { code: "ko", name: "Korean", nativeName: "Hanguk-eo", region: "KR" },
  { code: "zh", name: "Chinese", nativeName: "Zhongwen", region: "CN" },
];

const LANGUAGE_ALIASES: Record<string, string> = {
  "english (united states)": "en",
  english: "en",
  en: "en",
  spanish: "es",
  espanol: "es",
  es: "es",
  vietnamese: "vi",
  "tieng viet": "vi",
  vi: "vi",
  japanese: "ja",
  ja: "ja",
  german: "de",
  de: "de",
  french: "fr",
  fr: "fr",
  hindi: "hi",
  hi: "hi",
  korean: "ko",
  ko: "ko",
  chinese: "zh",
  zh: "zh",
};

export function getLanguageByCode(code?: string) {
  if (!code) return undefined;
  return SUPPORTED_LANGUAGES.find((language) => language.code === normalizeLanguageCode(code));
}

export function normalizeLanguageCode(value?: string) {
  if (!value) return "en";
  const normalized = value.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function getLanguageName(value?: string) {
  const language = getLanguageByCode(value);
  return language?.name ?? value ?? "Auto";
}

export function getLanguageNativeName(value?: string) {
  const language = getLanguageByCode(value);
  return language?.nativeName ?? getLanguageName(value);
}

export function getLanguageRegion(value?: string) {
  return getLanguageByCode(value)?.region ?? "AU";
}

export function serializeTargetLanguages(codes: string[]) {
  return codes.map(normalizeLanguageCode).join(",");
}

export function parseTargetLanguages(value?: string | string[]) {
  if (Array.isArray(value)) return value.map(normalizeLanguageCode);
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
    .split(/[,\|]/)
    .map((item) => normalizeLanguageCode(item))
    .filter(Boolean);
}

export function getAvailableTargets(sourceLanguage: string) {
  const sourceCode = normalizeLanguageCode(sourceLanguage);
  return SUPPORTED_LANGUAGES.filter((language) => language.code !== sourceCode);
}
