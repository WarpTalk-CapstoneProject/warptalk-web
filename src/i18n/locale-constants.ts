/**
 * Locale constants shared by client and server code. Kept free of any
 * "next/headers"/server-only import — `src/i18n/locale.ts` (server-only,
 * reads cookies/headers) and Client Components like the language switcher
 * both depend on this file, and a server-only import here would leak into
 * the client bundle through the second path.
 */
export const SUPPORTED_LOCALES = ["en", "vi", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "WARPTALK_LOCALE";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: string | undefined | null): value is Locale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
