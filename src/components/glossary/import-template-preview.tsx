"use client";

/**
 * WT-880 — the import template for one language pair, as the file will look: the group band
 * (Source · English | Target · Vietnamese | General), the header row, and the faint sample row.
 * Shared by the workspace Glossary page's "Import template" tab and the admin editor's preview,
 * so what the admin sees is exactly what a workspace downloads.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, FileCsv, FileXls, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildImportTemplateLayout,
  type ImportTemplateConfig,
  type ImportTemplateGroup,
} from "@/lib/glossary/import-template";
import {
  downloadImportTemplateCsv,
  downloadImportTemplateXlsx,
} from "@/lib/glossary/import-template-file";
import { cn } from "@/lib/utils";
import type { TemplateLanguageOption } from "@/hooks/use-glossary-import-template";

const BAND_CLASS: Record<ImportTemplateGroup, string> = {
  source: "bg-primary/10 text-primary",
  target: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  general: "bg-surface-2 text-ink-muted",
};

/** The band label, from the same copy on screen and in the file. */
export function useBandLabel() {
  const t = useTranslations("glossary.importTemplate");
  return (group: ImportTemplateGroup, languageName: string) =>
    languageName
      ? t("band", { group: t(`groups.${group}`), language: languageName })
      : t(`groups.${group}`);
}

export function ImportTemplatePairPicker({
  languages,
  sourceLanguage,
  targetLanguage,
  onChange,
  disabled,
}: {
  languages: TemplateLanguageOption[];
  sourceLanguage: string;
  targetLanguage: string;
  onChange: (pair: { sourceLanguage: string; targetLanguage: string }) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("glossary.importTemplate");
  const select = (value: string, label: string, apply: (code: string) => void) => (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-ink-muted">
      {label}
      <Select value={value} onValueChange={(code) => code && apply(code)} disabled={disabled}>
        <SelectTrigger className="h-8 w-44 text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.code} value={language.code}>
              {language.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-2">
      {select(sourceLanguage, t("sourceLanguage"), (code) => onChange({ sourceLanguage: code, targetLanguage }))}
      <ArrowRight className="mb-2 h-3.5 w-3.5 text-ink-subtle" />
      {select(targetLanguage, t("targetLanguage"), (code) => onChange({ sourceLanguage, targetLanguage: code }))}
    </div>
  );
}

export function ImportTemplatePreview({
  config,
  sourceLanguage,
  targetLanguage,
  languageName,
  showDownloads = true,
}: {
  config: ImportTemplateConfig;
  sourceLanguage: string;
  targetLanguage: string;
  /** Names a language code; the published list's names win over the registry's. */
  languageName: (code: string) => string;
  showDownloads?: boolean;
}) {
  const t = useTranslations("glossary.importTemplate");
  const bandLabel = useBandLabel();
  const [downloading, setDownloading] = useState(false);

  const layout = useMemo(
    () => buildImportTemplateLayout(config, sourceLanguage, targetLanguage, languageName),
    [config, sourceLanguage, targetLanguage, languageName],
  );

  const fileBandLabel = (group: ImportTemplateGroup, language: string) =>
    bandLabel(group, language ? languageName(language) : "");

  const downloadXlsx = async () => {
    setDownloading(true);
    try {
      await downloadImportTemplateXlsx(layout, fileBandLabel);
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto rounded-[10px] border border-hairline">
        <table className="w-full min-w-max border-collapse text-left text-[12px]">
          <thead>
            <tr>
              {layout.bands.map((band, index) => (
                <th
                  key={`${band.group}-${index}`}
                  colSpan={band.span}
                  className={cn(
                    "border-b border-hairline px-2.5 py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide",
                    BAND_CLASS[band.group],
                  )}
                >
                  {fileBandLabel(band.group, band.language)}
                </th>
              ))}
            </tr>
            <tr className="bg-surface-2">
              {layout.header.map((header, index) => (
                <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-hairline px-2.5 py-1.5 font-semibold text-ink">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {layout.sample.map((value, index) => (
                <td
                  key={`${layout.columns[index]?.key}-${index}`}
                  className="max-w-[220px] truncate px-2.5 py-1.5 italic text-ink-subtle"
                  title={value || undefined}
                >
                  {value || "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-subtle">{t("sampleNote")}</p>

      {showDownloads ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void downloadXlsx()} disabled={downloading} className="shadow-none">
            {downloading ? <Spinner className="h-4 w-4 animate-spin" /> : <FileXls className="h-4 w-4" />}
            {t("downloadXlsx")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadImportTemplateCsv(layout)} className="shadow-none">
            <FileCsv className="h-4 w-4" />
            {t("downloadCsv")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
