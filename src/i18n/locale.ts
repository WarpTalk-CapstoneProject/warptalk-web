import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale, type Locale } from "@/i18n/locale-constants";

/**
 * The UI display language a person reads WarpTalk in — distinct from
 * `src/lib/language/languages.ts`, which is the meeting/transcription language
 * registry (what a room speaks or translates into). Never conflate the two:
 * this file only ever touches chrome text (buttons, labels, toasts, forms),
 * never meeting content.
 *
 * Server-only (reads `next/headers`) — do not import from a Client Component.
 * Client code that only needs the locale list/type should import from
 * `@/i18n/locale-constants` instead.
 */

/** Best-effort locale from a request's `Accept-Language` header. */
function localeFromAcceptLanguage(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage.split(",").map((part) => part.split(";")[0].trim().toLowerCase());
  for (const tag of tags) {
    const primary = tag.split("-")[0];
    if (isSupportedLocale(primary)) return primary;
  }
  return null;
}

/**
 * Resolves the locale for the current request: explicit cookie choice first
 * (set by the language switcher via `setUserLocale`), then the browser's
 * `Accept-Language`, then the product default. Read on every request via
 * `src/i18n/request.ts`.
 */
export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(cookieValue)) return cookieValue;

  const headerStore = await headers();
  const fromHeader = localeFromAcceptLanguage(headerStore.get("accept-language"));
  if (fromHeader) return fromHeader;

  return DEFAULT_LOCALE;
}
