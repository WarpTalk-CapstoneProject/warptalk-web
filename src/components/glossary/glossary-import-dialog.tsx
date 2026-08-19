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
 */

import { FileArrowUp, Spinner, Warning } from "@phosphor-icons/react";
import ExcelJS from "exceljs";
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

/** One parsed row, in the shape the bulk endpoint takes. */
export interface ParsedGlossaryRow {
  sourceTerm: string;
  targetTerm: string;
  domain?: string | null;
  definition?: string | null;
  usageNote?: string | null;
  partOfSpeech?: string | null;
  priority?: number;
}

/**
 * Header aliases, lowercased. A vocabulary owner's spreadsheet is not going to use our column
 * names, and "Term"/"Translation" are the two that matter — the rest are optional enrichment.
 */
const HEADER_ALIASES: Record<string, keyof ParsedGlossaryRow> = {
  term: "sourceTerm",
  "source term": "sourceTerm",
  sourceterm: "sourceTerm",
  source: "sourceTerm",
  translation: "targetTerm",
  "target term": "targetTerm",
  targetterm: "targetTerm",
  target: "targetTerm",
  "translate as": "targetTerm",
  domain: "domain",
  field: "domain",
  "business domain": "domain",
  definition: "definition",
  meaning: "definition",
  note: "usageNote",
  "usage note": "usageNote",
  usagenote: "usageNote",
  "part of speech": "partOfSpeech",
  partofspeech: "partOfSpeech",
  priority: "priority",
};

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
 * WT-505: the header row is FOUND, not assumed to be row 1.
 *
 * Real vocabulary spreadsheets routinely open with a title, an export timestamp, or a blank
 * spacer before the column names — none of which the person exporting them thinks of as data.
 * Reading row 1 unconditionally turned every one of those into "this file has no Term column",
 * which is a true statement about row 1 and a false one about the file.
 *
 * Bounded to the first few rows: beyond that, a file with no recognisable header really does not
 * have one, and scanning further would start matching a stray cell in the body.
 */
const MAX_HEADER_SCAN_ROWS = 10;

function findHeaderRow(matrix: string[][]): {
  index: number;
  columns: (keyof ParsedGlossaryRow | undefined)[];
} | null {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const columns = (matrix[index] ?? [])
      .map((cell) => cell.trim().toLowerCase())
      .map((name) => HEADER_ALIASES[name]);
    if (columns.includes("sourceTerm") && columns.includes("targetTerm")) {
      return { index, columns };
    }
  }
  return null;
}

function toRows(matrix: string[][]): { rows: ParsedGlossaryRow[]; error?: string } {
  const found = findHeaderRow(matrix);
  const columns = found?.columns ?? [];

  const termIndex = columns.indexOf("sourceTerm");
  const translationIndex = columns.indexOf("targetTerm");

  // A wrong FILE, not a wrong row. Importing nothing from a file the user believes is correct,
  // without saying why, is the worst available outcome.
  if (termIndex === -1 || translationIndex === -1) {
    return {
      rows: [],
      error:
        "The first row must name the columns, and must include a Term column and a Translation column.",
    };
  }

  const rows: ParsedGlossaryRow[] = [];
  for (const raw of matrix.slice((found?.index ?? 0) + 1)) {
    const sourceTerm = (raw[termIndex] ?? "").trim();
    const targetTerm = (raw[translationIndex] ?? "").trim();
    // A blank line in the middle of a spreadsheet is punctuation, not data.
    if (!sourceTerm && !targetTerm) continue;

    const row: ParsedGlossaryRow = { sourceTerm, targetTerm };
    columns.forEach((field, index) => {
      if (!field || field === "sourceTerm" || field === "targetTerm") return;
      const value = (raw[index] ?? "").trim();
      if (!value) return;
      if (field === "priority") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) row.priority = parsed;
        return;
      }
      row[field] = value as never;
    });
    rows.push(row);
  }

  return { rows };
}

/**
 * A deliberately small CSV reader: quoted fields with embedded commas and doubled quotes, which is
 * what Excel emits. Not a general RFC-4180 parser — a `.csv` with embedded newlines inside quotes
 * should be imported as `.xlsx`, and saying so is better than half-parsing it.
 */
function parseCsv(text: string): string[][] {
  return text
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

async function parseWorkbook(file: File): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const matrix: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    // `row.eachCell` skips empty cells, which would shift every column after a gap. The indexed
    // loop keeps column positions honest.
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      cells.push(cellText(row.getCell(column).value));
    }
    matrix.push(cells);
  });
  return matrix;
}

/**
 * WT-505: a file the importer is guaranteed to accept, so "what shape should this be?" stops
 * being answered by trial and error against an error message.
 *
 * Built in the browser from the same column names the parser recognises, rather than shipped as
 * a static asset, so it cannot drift from HEADER_ALIASES the way a checked-in file would. CSV
 * rather than XLSX because it opens in every spreadsheet app and there is nothing to encode.
 */
function downloadSampleTemplate() {
  // i18n-allow: these are glossary ENTRIES, not interface copy. The sample has to demonstrate a
  // real translation pair, and an English-to-English one would show nothing about what the file
  // is for — this is the same "genuine language data" exemption the contract exists to allow.
  const rows = [
    ["Term", "Translation", "Field", "Definition", "Note", "Part of speech", "Priority"],
    ["offside", "việt vị", "Football", "Attacker ahead of the last defender", "Common in match commentary", "noun", "1"],
    ["headshot", "bắn trúng đầu", "Gaming", "A shot that hits the head", "", "noun", "2"],
  ];
  const csv = rows
    // Quote everything and double any embedded quote: a term legitimately containing a comma
    // would otherwise produce a sample file the importer itself misreads.
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  // BOM, deliberately. Excel opens a UTF-8 CSV without one as Windows-1252 and renders "việt vị"
  // as mojibake — for a glossary tool whose whole subject is non-ASCII vocabulary, a sample that
  // demonstrates broken encoding is worse than none.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "warptalk-glossary-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

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
        : await parseWorkbook(file);

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
      // WT-505: say WHAT failed. This used to swallow the exception and print one generic
      // sentence, so a corrupt zip, an unsupported .xls, and a file the browser could not read
      // at all were indistinguishable — to the user AND to anyone trying to reproduce it from a
      // bug report. The advice stays; the reason is added to it.
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(
        `That file could not be read (${detail}). Save it as .xlsx or .csv and try again, or start from the sample below.`,
      );
    } finally {
      setIsParsing(false);
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
            Into <span className="font-medium text-ink">{glossaryName}</span>. A row near the top must
            name the columns; <span className="font-medium">Term</span> and{" "}
            <span className="font-medium">Translation</span> are required. Field, Definition, Note,
            Part of speech and Priority are used when present.
          </DialogDescription>
          <button
            type="button"
            onClick={downloadSampleTemplate}
            className="self-start text-[12px] font-medium text-primary underline-offset-2 hover:underline"
          >
            Download a sample file
          </button>
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
