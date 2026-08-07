import { SUPPORTED_LANGUAGES } from "./languages.ts";

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

export function getSupportedTimezoneOptions(
  getValues: () => string[] = () =>
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
): string[] {
  return Array.from(new Set([FALLBACK_PROFILE_TIMEZONE, ...getValues()])).sort((left, right) => {
    if (left === FALLBACK_PROFILE_TIMEZONE) return -1;
    if (right === FALLBACK_PROFILE_TIMEZONE) return 1;
    return left.localeCompare(right);
  });
}
