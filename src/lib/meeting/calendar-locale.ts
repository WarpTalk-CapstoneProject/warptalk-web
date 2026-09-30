/**
 * The schedule pages format every date with the app's own `next-intl` locale rather than the
 * `en-GB` constant they used before translation — see `INTL_CALENDAR_LOCALES` (for
 * `Intl.DateTimeFormat` / `toLocaleDateString`) and `DATE_FNS_CALENDAR_LOCALES` (for the
 * `react-day-picker` `<Calendar>` used by the month sidebar and the agenda navigator).
 *
 * Kept in one place so the schedule page, the agenda list, the agenda row and the agenda
 * navigator cannot drift into naming three different locale tags for the same `next-intl` locale.
 */
import { enUS, ja, vi } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

export const INTL_CALENDAR_LOCALES: Record<string, string> = {
  en: "en-GB",
  vi: "vi-VN",
  ja: "ja-JP",
};

export const DATE_FNS_CALENDAR_LOCALES: Record<string, DateFnsLocale> = {
  en: enUS,
  vi,
  ja,
};

/** `next-intl`'s `useLocale()` value, mapped to the `Intl.DateTimeFormat` tag it should format with. */
export function intlCalendarLocale(locale: string): string {
  return INTL_CALENDAR_LOCALES[locale] ?? INTL_CALENDAR_LOCALES.en;
}

/** `next-intl`'s `useLocale()` value, mapped to the `date-fns` locale the `<Calendar>` should use. */
export function dateFnsCalendarLocale(locale: string): DateFnsLocale {
  return DATE_FNS_CALENDAR_LOCALES[locale] ?? DATE_FNS_CALENDAR_LOCALES.en;
}
