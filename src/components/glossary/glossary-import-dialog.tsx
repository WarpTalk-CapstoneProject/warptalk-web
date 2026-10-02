"use client";

/**
 * Importing a glossary from a spreadsheet.
 *
 * WHY A FILE PICKER AND NOT A PASTE BOX. The admin global-glossary screen takes pasted CSV text,
 * which works when you are typing five rows by hand. A workspace glossary is a domain vocabulary
 * somebody already maintains in Excel — asking them to open it, select all, and paste into a textarea
 * loses the file's own structure and every non-ASCII cell that Excel quotes oddly. `.xlsx` is read
 * directly here; `.csv` is still accepted because half the world exports that instead.
 *
 * WHAT IT REFUSES, AND WHY IT REFUSES THE WHOLE FILE
 *   A missing Term or Translation column is a wrong file, not a wrong row — the importer says so
 *   and imports nothing. Silently importing zero rows from a file the user believes is correct is
 *   the worst available outcome.
 *
 *   Individual rows missing a side are reported by the SERVER, which also skips terms already in
 *   the glossary and tells us how many. Both numbers are shown: "imported 40, skipped 60" is a
 *   very different message from "imported 40", and only one of them is true.
 *
 * The preview exists so the mapping is visible before anything is written. A header row that was
 * read as data, or a file whose columns are in another language, shows up here rather than as 200
 * junk terms in the dictionary.
 *
 * WT-880: the columns come from the admin-configured import template (see
 * lib/glossary/import-template). The header aliases are the template's names and aliases layered
 * over the importer's historical ones, so old files keep importing; the template's faint sample
 * row is skipped. The "Templates Catalog" toggle is gone — a template is a file shape, not a pack
 * of terms — and one line remains: download the template for THIS glossary's pair, or open the
 * page's "Import template" tab.
 */

import { useTranslations } from "next-intl";
import { FileArrowUp, Spinner, Warning } from "@phosphor-icons/react";
import ExcelJS from "exceljs";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useBandLabel } from "@/components/glossary/import-template-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useGlossaryImportTemplate,
  usePublishedTemplateLanguages,
} from "@/hooks/use-glossary-import-template";
import {
  baseLanguage,
  buildHeaderAliases,
  buildImportTemplateLayout,
  describeExpectedPair,
  knownSamplePairs,
  parseGlossaryMatrix,
  type ParsedGlossaryRow,
} from "@/lib/glossary/import-template";
import {
  downloadImportTemplateXlsx,
  isSampleStyledCell,
} from "@/lib/glossary/import-template-file";
import { getLanguageName } from "@/lib/language/languages";
import { cn } from "@/lib/utils";

export type { ParsedGlossaryRow } from "@/lib/glossary/import-template";

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // ExcelJS hands back a rich-text object or a formula result rather than a string for styled
    // and computed cells. Reading `.text`/`.result` keeps a bolded term from arriving as
    // "[object Object]".
    const rich = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join("");
    if (typeof rich.text === "string") return rich.text;
    if (rich.result !== undefined) return String(rich.result);
    return "";
  }
  return String(value);
}

/**
 * A deliberately small CSV reader: quoted fields with embedded commas and doubled quotes, which is
 * what Excel emits. Not a general RFC-4180 parser — a `.csv` with embedded newlines inside quotes
 * should be imported as `.xlsx`, and saying so is better than half-parsing it.
 */
function parseCsv(text: string): string[][] {
  return text
    // A BOM on the first header cell would stop "Term" from matching.
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          cells.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current);
      return cells;
    });
}

/**
 * The first sheet as a matrix, plus which rows carry the template's faint sample-row style (so
 * the importer can skip that row even after somebody edited its text).
 */
async function parseWorkbook(file: File): Promise<{ matrix: string[][]; styledSampleRows: Set<number> }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  const styledSampleRows = new Set<number>();
  if (!sheet) return { matrix: [], styledSampleRows };

  const matrix: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    // `row.eachCell` skips empty cells, which would shift every column after a gap. The indexed
    // loop keeps column positions honest.
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      cells.push(cellText(row.getCell(column).value));
    }
    if (isSampleStyledCell(row.getCell(1))) styledSampleRows.add(matrix.length);
    matrix.push(cells);
  });
  return { matrix, styledSampleRows };
}

export function GlossaryImportDialog({
  open,
  onOpenChange,
  glossaryName,
  sourceLanguage,
  targetLanguage,
  isImporting,
  onImport,
  onViewTemplate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  glossaryName: string;
  /**
   * WT-522: the pair this glossary was configured for. The template is built from it, and it is
   * stated on screen — the sample used to be the only instruction a reader got, and it was
   * hardcoded to a pair that had nothing to do with their glossary.
   */
  sourceLanguage?: string | null;
  targetLanguage?: string | null;
  isImporting: boolean;
  onImport: (rows: ParsedGlossaryRow[]) => Promise<void>;
  /** WT-880: opens the page's "Import template" tab. */
  onViewTemplate?: () => void;
}) {
  const t = useTranslations("glossary.dialogs.import");
  const tTemplate = useTranslations("glossary.importTemplate");
  const template = useGlossaryImportTemplate();
  const { languages } = usePublishedTemplateLanguages();
  const bandLabel = useBandLabel();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedGlossaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [skippedSample, setSkippedSample] = useState(false);

  const languageName = (code: string) =>
    languages.find((language) => language.code === code)?.name ?? getLanguageName(code);

  const parseOptions = useMemo(
    () => ({
      aliases: buildHeaderAliases(template.config.columns),
      samples: knownSamplePairs(template.config),
    }),
    [template.config],
  );

  const reset = () => {
    setFileName(null);
    setRows([]);
    setError(null);
    setSkippedSample(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setError(null);
    setRows([]);
    setSkippedSample(false);
    try {
      const { matrix, styledSampleRows } = file.name.toLowerCase().endsWith(".csv")
        ? { matrix: parseCsv(await file.text()), styledSampleRows: new Set<number>() }
        : await parseWorkbook(file);

      if (matrix.length === 0) {
        setError(t("noRows"));
        setFileName(file.name);
        return;
      }

      const parsed = parseGlossaryMatrix(matrix, { ...parseOptions, styledSampleRows });
      setFileName(file.name);
      if (parsed.error) {
        setError(t("missingColumns"));
        return;
      }
      setSkippedSample(parsed.skippedSample);
      if (parsed.rows.length === 0) {
        setError(t("columnsFoundButEmpty"));
        return;
      }
      setRows(parsed.rows);
    } catch (cause) {
      setFileName(file.name);
      // WT-505: say WHAT failed. This used to swallow the exception and print one generic
      // sentence, so a corrupt zip, an unsupported .xls, and a file the browser could not read
      // at all were indistinguishable — to the user AND to anyone trying to reproduce it from a
      // bug report. The advice stays; the reason is added to it.
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(t("fileCouldNotBeRead", { detail }));
    } finally {
      setIsParsing(false);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    await onImport(rows);
    reset();
  };

  /** WT-880: the admin's template for THIS glossary's pair (WT-522: never another pair's). */
  const downloadTemplate = async () => {
    const layout = buildImportTemplateLayout(template.config, sourceLanguage, targetLanguage, languageName);
    try {
      await downloadImportTemplateXlsx(layout, (group, language) =>
        bandLabel(group, language ? languageName(language) : ""),
      );
    } catch {
      toast.error(tTemplate("downloadFailed"));
    }
  };

  const expectedPair = describeExpectedPair(sourceLanguage, targetLanguage, (key, values) =>
    t(key, values),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/* WT-886: DialogContent is a CSS grid whose implicit column sizes to its widest child's
          min-content, so one unbreakable term in the preview used to push the whole column past
          the dialog edge. `minmax(0,1fr)` pins the column to the dialog width. The width override
          must carry the `sm:` variant, or the base `sm:max-w-sm` keeps the dialog at 24rem.
          WT-907: the base DialogContent has no height cap, so a long preview grew the dialog past
          the viewport (it is centred with translate-y, so it spilled off both edges and nothing
          scrolled). Cap it to the viewport and give the body row `minmax(0,1fr)` so only the body
          scrolls while the header and the Import/Cancel footer stay visible. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[14px] border-border bg-surface-1 shadow-none sm:max-h-[90dvh] sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-ink">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-ink-muted [overflow-wrap:anywhere]">
            {t.rich("description", {
              glossaryName: () => <span className="font-medium text-ink">{glossaryName}</span>,
              term: (chunks) => <span className="font-medium">{chunks}</span>,
              translation: (chunks) => <span className="font-medium">{chunks}</span>,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-4 min-h-0 overflow-y-auto overscroll-contain px-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-col gap-1.5 text-[12px]">
              {expectedPair ? (
                <p className="leading-relaxed text-ink-muted">{expectedPair}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => void downloadTemplate()}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t("downloadTemplate", {
                    source: languageName(baseLanguage(sourceLanguage)),
                    target: languageName(baseLanguage(targetLanguage)),
                  })}
                </button>
                {onViewTemplate ? (
                  <>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      onClick={onViewTemplate}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {t("viewTemplate")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-6 text-center shadow-none transition-colors hover:bg-surface-2",
              )}
            >
              <FileArrowUp className="h-6 w-6 text-ink-muted" />
              <span
                className="max-w-full truncate text-[13px] font-medium text-ink"
                title={fileName ?? undefined}
              >
                {fileName ?? t("chooseFile")}
              </span>
              <span className="text-[11px] text-ink-subtle">
                {fileName ? t("chooseDifferentFile") : t("excelOrCsv")}
              </span>
            </button>

            {isParsing ? (
              <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted">
                <Spinner className="h-3.5 w-3.5 animate-spin" />
                {t("readingFile")}
              </p>
            ) : null}

            {error ? (
              <p className="mt-3 flex items-start gap-1.5 text-[12px] text-amber-600 dark:text-amber-500">
                <Warning className="mt-px h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
              </p>
            ) : null}

            {rows.length > 0 ? (
              <div className="mt-4">
                <p className="text-[12px] text-ink-muted">
                  {t("rowsReady", { count: rows.length })}
                  {skippedSample ? ` ${t("sampleSkipped")}` : null}
                </p>
                {/* The preview is what catches a header row read as data, or a file whose columns
                    are in another language — before it becomes 200 junk terms. */}
                <div className="mt-2 max-h-[180px] overflow-y-auto rounded-[8px] border border-hairline">
                  {/* WT-886: `table-fixed` + explicit column widths, so a cell's content can never
                      widen its column. Term/translation wrap anywhere (the preview exists to show
                      what was parsed); context/field truncate with the full text in `title`. */}
                  <table className="w-full table-fixed text-left text-[12px]">
                    <colgroup>
                      <col className="w-[30%]" />
                      <col className="w-[30%]" />
                      <col className="w-[25%]" />
                      <col className="w-[15%]" />
                    </colgroup>
                    <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">{t("term")}</th>
                        <th className="px-2.5 py-1.5 font-medium">{t("translation")}</th>
                        <th className="px-2.5 py-1.5 font-medium">{t("context")}</th>
                        <th className="px-2.5 py-1.5 font-medium">{t("field")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((row, index) => (
                        <tr key={`${row.sourceTerm}-${index}`} className="border-t border-hairline">
                          <td className="px-2.5 py-1.5 align-top text-ink font-medium [overflow-wrap:anywhere]">{row.sourceTerm || "—"}</td>
                          <td className="px-2.5 py-1.5 align-top text-ink font-semibold text-primary [overflow-wrap:anywhere]">{row.targetTerm || "—"}</td>
                          <td className="px-2.5 py-1.5 align-top text-ink-muted truncate" title={row.context || undefined}>{row.context || "—"}</td>
                          <td className="px-2.5 py-1.5 align-top text-ink-muted truncate" title={row.domain || undefined}>{row.domain || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 50 ? (
                  <p className="mt-1.5 text-[11px] text-ink-subtle">
                    {t("showingFirst", { count: rows.length })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="shadow-none">
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={rows.length === 0 || isImporting || isParsing}
            className="shadow-none"
          >
            {isImporting ? (
              <>
                <Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("importing")}
              </>
            ) : (
              t("importCount", { count: rows.length })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
