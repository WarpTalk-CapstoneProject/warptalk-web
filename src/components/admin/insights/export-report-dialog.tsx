"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ReportClassification } from "@/lib/admin/insights-report";

export type ReportFormat = "docx" | "pdf";

/** What the admin chose. Everything else in the report is decided for them. */
export interface ReportExportOptions {
  format: ReportFormat;
  classification: ReportClassification;
  includeDaily: boolean;
}

export const DEFAULT_REPORT_EXPORT_OPTIONS: ReportExportOptions = {
  format: "docx",
  // A revenue and cost report goes out marked; leaving it off has to be a decision.
  classification: "confidential",
  includeDaily: true,
};

const RADIO = "mt-0.5 size-4 accent-primary";
const GROUP = "flex flex-col gap-1.5 rounded-lg border border-hairline p-3";

/**
 * The few choices an export has. `onExport` runs inside the click: the save picker has to open while
 * the click still counts as a user gesture, so the caller starts the download here and nothing awaits first.
 */
export function ExportReportDialog({
  open,
  onOpenChange,
  periodOpen,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The period has not ended: say, before the click, that the report will say so. */
  periodOpen: boolean;
  onExport: (options: ReportExportOptions) => void;
}) {
  const t = useTranslations("adminOps.insights.periodBar.exportDialog");
  const [options, setOptions] = useState<ReportExportOptions>(DEFAULT_REPORT_EXPORT_OPTIONS);
  const set = <K extends keyof ReportExportOptions>(key: K, value: ReportExportOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onExport(options);
            onOpenChange(false);
          }}
        >
          <fieldset className={GROUP}>
            <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("format")}</legend>
            {(["docx", "pdf"] as const).map((format) => (
              <label key={format} className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="report-format"
                  className={RADIO}
                  checked={options.format === format}
                  onChange={() => set("format", format)}
                />
                <span>
                  {t(format === "docx" ? "formatDocx" : "formatPdf")}
                  {format === "pdf" ? <span className="block text-[12px] text-ink-muted">{t("formatPdfHint")}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className={GROUP}>
            <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("classification")}</legend>
            {(["confidential", "internal"] as const).map((value) => (
              <label key={value} className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="report-classification"
                  className={RADIO}
                  checked={options.classification === value}
                  onChange={() => set("classification", value)}
                />
                <span>{t(value)}</span>
              </label>
            ))}
            <p className="text-[12px] text-ink-muted">{t("classificationHint")}</p>
          </fieldset>

          <fieldset className={GROUP}>
            <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("contents")}</legend>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <Checkbox checked={options.includeDaily} onCheckedChange={(checked) => set("includeDaily", checked === true)} />
              {t("includeDaily")}
            </label>
          </fieldset>

          {periodOpen ? <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-ink">{t("openPeriod")}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit">{t("submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
