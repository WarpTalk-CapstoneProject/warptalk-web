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
 * WT-505 — TWO THINGS THIS DIALOG USED TO GET WRONG
 *   The `.xlsx` reader was ExcelJS, which cannot open a workbook whose OOXML parts bind the
 *   SpreadsheetML namespace to a prefix. It threw, and the catch below reported "That file could
 *   not be read. Save it as .xlsx or .csv and try again." — advice that cannot work on a file that
 *   already is a valid .xlsx. `lib/glossary/xlsx-sheet` replaces it; see that file for why
 *   repairing ExcelJS was not the answer.
 *
 *   And there was no way to find out what shape a file should be, so the dialog now hands out a
 *   template. The parsing rules live in lib/glossary/import-rows, where a test pins the template
 *   against them — a sample the product refuses to read would be worse than none.
 */

import { DownloadSimple, FileArrowUp, Spinner, Warning } from "@phosphor-icons/react";
import { saveAs } from "file-saver";
import { useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_BASE_NAME,
  TEMPLATE_COLUMNS,
  TEMPLATE_ROWS,
  templateCsv,
} from "@/lib/glossary/import-template";
import { parseCsv, toRows, type ParsedGlossaryRow } from "@/lib/glossary/import-rows";
import { readFirstSheetMatrix } from "@/lib/glossary/xlsx-sheet";

export type { ParsedGlossaryRow };

export function GlossaryImportDialog({
  open,
  onOpenChange,
  glossaryName,
  isImporting,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  glossaryName: string;
  isImporting: boolean;
  onImport: (rows: ParsedGlossaryRow[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedGlossaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setError(null);
    setRows([]);
    try {
      const matrix = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : await readFirstSheetMatrix(await file.arrayBuffer());

      if (matrix.length === 0) {
        setError("That file has no rows.");
        setFileName(file.name);
        return;
      }

      const parsed = toRows(matrix);
      setFileName(file.name);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      if (parsed.rows.length === 0) {
        setError("The columns were found, but every row below them was empty.");
        return;
      }
      setRows(parsed.rows);
    } catch (cause) {
      setFileName(file.name);
      // The old sentence here was "Save it as .xlsx or .csv and try again", which was advice that
      // could not work: the file already WAS a valid .xlsx, and re-saving it in the tool that
      // wrote it produced the same bytes. The reader's own message says what it actually found;
      // the template is offered because "what shape should this be" was the real question
      // underneath the report. See WT-505.
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "That file could not be read. Download the template below to see the expected columns.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  /**
   * The template, as the file the user asked for.
   *
   * `.xlsx` is written with ExcelJS — only its READER is the problem (WT-505), and writing is what
   * every other export in this app already uses it for. Imported lazily so a library nobody needs
   * until they click this stays out of the page's bundle.
   */
  const downloadTemplate = async (format: "xlsx" | "csv") => {
    setIsDownloadingTemplate(true);
    try {
      if (format === "csv") {
        saveAs(
          // The BOM is not decoration: without it Excel opens a UTF-8 CSV as Windows-1252 and the
          // Vietnamese in the sample rows arrives as mojibake — in the one file whose whole job is
          // to demonstrate the correct format.
          new Blob([`\uFEFF${templateCsv()}`], { type: "text/csv;charset=utf-8" }),
          `${TEMPLATE_BASE_NAME}.csv`,
        );
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Glossary");
      sheet.addRow([...TEMPLATE_COLUMNS]);
      sheet.getRow(1).font = { bold: true };
      TEMPLATE_ROWS.forEach((row) => sheet.addRow([...row]));
      // Term and Translation are the columns somebody actually reads; the default 10 characters
      // makes a template look like it wants one-word answers.
      sheet.columns.forEach((column, index) => {
        column.width = index < 2 ? 24 : 40;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${TEMPLATE_BASE_NAME}.xlsx`,
      );
    } catch {
      setError("Could not build the template file. The columns are listed above.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    await onImport(rows);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[560px] rounded-[14px] border-border bg-surface-1 shadow-none">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-ink">
            Import terms
          </DialogTitle>
          <DialogDescription className="text-[12px] text-ink-muted">
            Into <span className="font-medium text-ink">{glossaryName}</span>. The first row must
            name the columns; <span className="font-medium">Term</span> and{" "}
            <span className="font-medium">Translation</span> are required. Field, Definition, Note,
            Part of speech and Priority are used when present.
          </DialogDescription>

          {/* Beside the rules rather than at the bottom, because it IS the rules — the sentence
              above describes the format and this is that format as a file you can open. Both
              formats are offered: the same people who export .csv from their tooling cannot open
              .xlsx conveniently, and vice versa. */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-[11px] text-ink-subtle">Not sure of the format?</span>
            <button
              type="button"
              disabled={isDownloadingTemplate}
              onClick={() => void downloadTemplate("xlsx")}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ink underline-offset-2 hover:underline disabled:opacity-60"
            >
              <DownloadSimple className="h-3 w-3" />
              Sample .xlsx
            </button>
            <button
              type="button"
              disabled={isDownloadingTemplate}
              onClick={() => void downloadTemplate("csv")}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ink underline-offset-2 hover:underline disabled:opacity-60"
            >
              <DownloadSimple className="h-3 w-3" />
              Sample .csv
            </button>
          </div>
        </DialogHeader>

        <div>
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
            <span className="text-[13px] font-medium text-ink">
              {fileName ?? "Choose an .xlsx or .csv file"}
            </span>
            <span className="text-[11px] text-ink-subtle">
              {fileName ? "Choose a different file" : "Excel or comma-separated"}
            </span>
          </button>

          {isParsing ? (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted">
              <Spinner className="h-3.5 w-3.5 animate-spin" />
              Reading the file…
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-amber-600 dark:text-amber-500">
              <Warning className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="mt-4">
              <p className="text-[12px] text-ink-muted">
                {rows.length} row{rows.length === 1 ? "" : "s"} ready. Terms already in this
                glossary are skipped, and the count is reported after the import.
              </p>
              {/* The preview is what catches a header row read as data, or a file whose columns
                  are in another language — before it becomes 200 junk terms. */}
              <div className="mt-2 max-h-[180px] overflow-y-auto rounded-[8px] border border-hairline">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">Term</th>
                      <th className="px-2.5 py-1.5 font-medium">Translation</th>
                      <th className="px-2.5 py-1.5 font-medium">Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, index) => (
                      <tr key={`${row.sourceTerm}-${index}`} className="border-t border-hairline">
                        <td className="px-2.5 py-1.5 text-ink">{row.sourceTerm || "—"}</td>
                        <td className="px-2.5 py-1.5 text-ink">{row.targetTerm || "—"}</td>
                        <td className="px-2.5 py-1.5 text-ink-muted">{row.domain || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 ? (
                <p className="mt-1.5 text-[11px] text-ink-subtle">
                  Showing the first 50 of {rows.length}. All {rows.length} will be imported.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="shadow-none">
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={rows.length === 0 || isImporting || isParsing}
            className="shadow-none"
          >
            {isImporting ? (
              <>
                <Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${rows.length || ""} term${rows.length === 1 ? "" : "s"}`.trim()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
