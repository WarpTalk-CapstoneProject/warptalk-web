import { SUPPORTED_LANGUAGES } from "./languages.ts";
import { supportedTimeZones } from "./time-zones.ts";

export const DEFAULT_PROFILE_LANGUAGE = "en";
export const FALLBACK_PROFILE_TIMEZONE = "UTC";

export type ProfileLanguageOption = {
  value: string;
  label: string;
};

export function getProfileLanguageOptions(): ProfileLanguageOption[] {
  return SUPPORTED_LANGUAGES.map(({ code, name }) => ({
    value: code,
    label: name,
  }));
}

export function getDefaultProfileTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_PROFILE_TIMEZONE;
}

/**
 * The zone list, sorted with UTC first.
 *
 * The zones themselves come from `time-zones.ts` rather than from a second call to
 * `Intl.supportedValuesOf` here. This module had its own copy, which differed in the ways that
 * matter: no fallback when the platform lacks `supportedValuesOf` (it returned UTC alone), and
 * no notion of Zone/Link spellings, so `Asia/Ho_Chi_Minh` and `Asia/Saigon` could both appear
 * as separate entries for the same place. `getValues` stays injectable for the tests.
 */
export function getSupportedTimezoneOptions(
  getValues: () => string[] = () => supportedTimeZones(),
): string[] {
  return Array.from(new Set([FALLBACK_PROFILE_TIMEZONE, ...getValues()])).sort((left, right) => {
    if (left === FALLBACK_PROFILE_TIMEZONE) return -1;
    if (right === FALLBACK_PROFILE_TIMEZONE) return 1;
    return left.localeCompare(right);
  });
}
