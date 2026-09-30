"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  formatSettingValue,
  type ImportFileError,
  type ScopeIdError,
  type SettingValidationError,
  type SettingValueWords,
} from "@/lib/admin/platform-settings";
import type { PlatformSettingDto, SettingJson } from "@/types/admin-platform-settings";

/**
 * The localized words the pure helpers in lib/admin/platform-settings.ts take, and the sentence for
 * each validation code. Setting labels, descriptions and units come from the server registry in
 * English; everything around them is the console's own copy.
 */
export function useSettingsCopy() {
  const t = useTranslations("adminPlatformSettings");
  const locale = useLocale();

  return useMemo(() => {
    const words: SettingValueWords = {
      on: t("values.on"),
      off: t("values.off"),
      empty: t("values.empty"),
      none: t("values.none"),
      rollout: (percent) => t("values.rollout", { percent }),
      plans: (count) => t("values.plans", { count }),
      workspaces: (count) => t("values.workspaces", { count }),
      denied: (count) => t("values.denied", { count }),
    };

    const format = (setting: Pick<PlatformSettingDto, "type" | "unit">, value: SettingJson | null | undefined) =>
      formatSettingValue(setting, value, words, locale);

    const validation = (error: SettingValidationError): string => {
      const unit = "unit" in error && error.unit ? ` ${error.unit}` : "";
      const base = (() => {
        switch (error.code) {
          case "min":
            return t("validation.min", { min: error.min, unit });
          case "max":
            return t("validation.max", { max: error.max, unit });
          case "tooLong":
            return t("validation.tooLong", { max: error.maxLength });
          case "notAllowed":
            return t("validation.notAllowed", { value: error.value, allowed: error.allowed.join(", ") });
          case "tooManyEntries":
            return t("validation.tooManyEntries", { max: error.maxLength });
          case "duplicate":
            return t("validation.duplicate", { value: error.value });
          case "flagUnknownField":
            return t("validation.flagUnknownField", { field: error.field });
          case "flagList":
          case "flagWorkspaceIds":
            return t(`validation.${error.code}`, { field: t(`editor.flag.${error.field}`) });
          case "flagListTooLong":
            return t("validation.flagListTooLong", { field: t(`editor.flag.${error.field}`), max: error.maxLength });
          case "entryNotText":
          case "entryEmpty":
            return t(`validation.${error.code}`);
          default:
            return t(`validation.${error.code}`);
        }
      })();
      const index = "index" in error ? error.index : undefined;
      return index === undefined ? base : t("validation.entry", { index, message: base });
    };

    const scopeIdError = (error: Exclude<ScopeIdError, null>) => t(`validation.${error}`);

    const importError = (error: ImportFileError): string => {
      switch (error.code) {
        case "wrongFormat":
          return t("import.errors.wrongFormat", { format: error.format ?? "—" });
        case "tooManyEntries":
          return t("import.errors.tooManyEntries", { max: error.max });
        case "badEntry":
          return t("import.errors.badEntry", { index: error.index, reason: t(`import.errors.entryReasons.${error.reason}`) });
        default:
          return t(`import.errors.${error.code}`);
      }
    };

    const categoryLabel = (category: string) =>
      t.has(`categories.${category}.label`) ? t(`categories.${category}.label`) : category.replace(/_/g, " ");

    const scopeName = (scope: string) => (t.has(`scopes.${scope}`) ? t(`scopes.${scope}`) : scope);

    const dateTime = (iso: string | null | undefined) =>
      iso
        ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
            new Date(iso),
          )
        : "—";

    return { words, format, validation, scopeIdError, importError, categoryLabel, scopeName, dateTime };
  }, [t, locale]);
}

export type SettingsCopy = ReturnType<typeof useSettingsCopy>;
