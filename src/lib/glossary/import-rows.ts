/**
 * Turning a spreadsheet grid into glossary terms.
 *
 * Lifted out of `glossary-import-dialog.tsx` by WT-505 so it can be tested — in particular so the
 * sample template this product now hands out can be asserted to import cleanly through the very
 * same rules. A template whose columns the importer rejects is worse than no template at all.
 */

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
export const HEADER_ALIASES: Record<string, keyof ParsedGlossaryRow> = {
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

export function toRows(matrix: string[][]): { rows: ParsedGlossaryRow[]; error?: string } {
  const header = matrix[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const columns = header.map((name) => HEADER_ALIASES[name]);

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
  for (const raw of matrix.slice(1)) {
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
export function parseCsv(text: string): string[][] {
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
