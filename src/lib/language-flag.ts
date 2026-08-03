/**
 * Flag emoji for a language tag, so the in-meeting language menu and the create-meeting
 * language picker render the same way. Extracted from the create picker, which owned the
 * only copy — the control bar had no flags at all.
 *
 * Accepts both a locale ("vi-VN") and a bare code ("vi"): rooms carry locale tags while the
 * AI side keys everything by the bare ISO-639-1 code.
 */
const REGION_BY_LANGUAGE: Record<string, string> = {
  en: "US",
  vi: "VN",
  ja: "JP",
  ko: "KR",
  fr: "FR",
  es: "ES",
  de: "DE",
  zh: "CN",
  pt: "PT",
  it: "IT",
  ru: "RU",
  ar: "SA",
  hi: "IN",
  th: "TH",
  id: "ID",
};

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
