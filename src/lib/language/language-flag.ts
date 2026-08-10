// Explicit .ts extension so the node --test runner resolves this the same way the bundler
// does; tsconfig sets allowImportingTsExtensions for exactly this.
import { SUPPORTED_LANGUAGES } from "./languages.ts";

/**
 * Flag emoji for a language tag, so every language picker renders the same way.
 *
 * Accepts both a locale ("vi-VN") and a bare code ("vi"): rooms carry locale tags while the
 * AI side keys everything by the bare ISO-639-1 code.
 *
 * The region for a bare code comes from the language registry rather than a second table
 * kept by hand here — that copy had drifted from the registry, which is how a language could
 * end up rendering a correct flag beside a raw, un-named code.
 */
const REGION_BY_LANGUAGE: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((language) => [language.code, language.region]),
);

export function getFlagEmoji(locale: string): string {
  if (!locale) return "";

  const parts = locale.split(/[-_]/);
  let region = parts.length > 1 ? parts[1].toUpperCase() : "";

  if (!region) {
    region = REGION_BY_LANGUAGE[locale.toLowerCase()] ?? "";
  }

  // Anything that is not a two-letter region cannot be turned into a flag — return nothing
  // rather than the regional-indicator mojibake that a longer string produces.
  if (!/^[A-Z]{2}$/.test(region)) return "";

  return String.fromCodePoint(...region.split("").map((char) => 127397 + char.charCodeAt(0)));
}
