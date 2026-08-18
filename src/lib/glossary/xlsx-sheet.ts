/**
 * Reading the first sheet out of an `.xlsx`. WT-505.
 *
 * WHY THIS EXISTS INSTEAD OF `ExcelJS.Workbook.xlsx.load`
 *   The reported file is a valid `.xlsx` that ExcelJS 4.4.0 cannot open. Every OOXML part in it
 *   binds the SpreadsheetML namespace to a PREFIX:
 *
 *     <x:workbook xmlns:x="…/spreadsheetml/2006/main"><x:sheets><x:sheet …
 *
 *   rather than making it the default namespace, which is what Excel itself writes. Both are the
 *   same document to any namespace-aware reader — the prefix is arbitrary and carries no meaning.
 *   ExcelJS's SAX handlers match on the RAW element name, so `x:sheet` matches nothing, the
 *   workbook model comes back without a `sheets` array, and `load` dies with
 *   "Cannot read properties of undefined (reading 'sheets')". The import dialog's catch turned
 *   that into "That file could not be read. Save it as .xlsx or .csv and try again." — advice
 *   that cannot work, because the file already IS a .xlsx and re-saving it in the tool that wrote
 *   it produces the same bytes.
 *
 *   Normalising the prefixes away and handing the result back to ExcelJS was tried first. The
 *   workbook then parsed and it failed one layer deeper, on the table part; the pattern is that
 *   each repaired part reveals the next gap, so that road has no end. ExcelJS is unmaintained
 *   (4.4.0 is the last release), so the gap is not going to close upstream either.
 *
 * WHAT THIS DELIBERATELY IS NOT
 *   A spreadsheet library. It reads the FIRST worksheet as a grid of strings, which is the whole
 *   of what a glossary import needs — every column of a glossary is text. It does not do
 *   formatting, dates, formulas, merged cells or multiple sheets. Anything it cannot classify
 *   comes back as the raw stored value rather than as a failure, because a slightly wrong cell in
 *   a preview the user is about to read is a much better outcome than refusing the file.
 *
 *   Everything here is namespace-AGNOSTIC on purpose: element names are matched by local name, so
 *   the prefixed file and an Excel-authored one take exactly the same path. There is no
 *   "compatibility mode" that only some files get, and therefore no second path to rot.
 */

import JSZip from "jszip";

/** Matches an element by LOCAL name, whatever namespace prefix it carries (or none). */
function tagPattern(localName: string, flags = "g"): RegExp {
  return new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}(\\s[^>]*?)?(/)?>`, flags);
}

/** The whole of an element, opening tag to closing tag, by local name. */
function blockPattern(localName: string): RegExp {
  return new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${localName}>)`,
    "g",
  );
}

function attribute(openTag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(openTag);
  return match ? match[1] : null;
}

/**
 * XML entities, including the numeric forms.
 *
 * `&#10;` really does appear in spreadsheet text — it is what a line break inside a cell is
 * stored as — so leaving numeric entities undecoded would put literal "&#10;" in a term.
 */
function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, so an escaped ampersand cannot re-open one of the entities above.
    .replace(/&amp;/g, "&");
}

/** The concatenated text of every `<t>` inside a fragment, rich-text runs included. */
function joinTextNodes(fragment: string): string {
  let text = "";
  for (const match of fragment.matchAll(blockPattern("t"))) {
    text += decodeXml(match[1] ?? "");
  }
  return text;
}

/**
 * The shared string table, in index order.
 *
 * A rich-text entry is several `<r><t>…</t></r>` runs and reads as one string — a term that was
 * bolded halfway through is still one term.
 */
export function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  for (const match of xml.matchAll(blockPattern("si"))) {
    strings.push(joinTextNodes(match[1] ?? ""));
  }
  return strings;
}

/** "A" → 0, "B" → 1, … "AA" → 26. From a cell reference like `AB12`. */
export function columnIndexFromRef(ref: string | null): number | null {
  if (!ref) return null;
  const letters = /^([A-Za-z]+)/.exec(ref)?.[1];
  if (!letters) return null;

  let index = 0;
  for (const character of letters.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/**
 * One worksheet as a grid of strings.
 *
 * Cell POSITION comes from the `r="B3"` reference rather than from counting cells, because a row
 * with an empty cell in the middle simply omits it — counting would shift every column after the
 * gap one to the left, which is how a Definition ends up in the Translation column.
 */
export function parseSheetMatrix(worksheetXml: string, sharedStrings: string[]): string[][] {
  const matrix: string[][] = [];

  for (const rowMatch of worksheetXml.matchAll(blockPattern("row"))) {
    const rowXml = rowMatch[1] ?? "";
    const cells: string[] = [];

    for (const cellMatch of rowXml.matchAll(blockPattern("c"))) {
      const openTag = /^<[^>]*>/.exec(cellMatch[0])?.[0] ?? "";
      const body = cellMatch[1] ?? "";
      const type = attribute(openTag, "t");

      let value: string;
      if (type === "s") {
        // A shared-string INDEX, not text. Read as text this is a number where a term should be.
        const index = Number(blockPattern("v").exec(body)?.[1] ?? "");
        value = Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
      } else if (type === "inlineStr") {
        value = joinTextNodes(body);
      } else {
        // Covers t="str" (which is what the reported file uses for ordinary text), an absent t
        // (a number), and anything unrecognised. `<t>` is checked as well so a stray inline
        // string without its type attribute still reads.
        const stored = blockPattern("v").exec(body)?.[1];
        value = stored !== undefined ? decodeXml(stored) : joinTextNodes(body);
      }

      const column = columnIndexFromRef(attribute(openTag, "r"));
      if (column === null) {
        cells.push(value);
      } else {
        while (cells.length < column) cells.push("");
        cells[column] = value;
      }
    }

    matrix.push(cells);
  }

  return matrix;
}

/**
 * The path of the first worksheet, resolved through the workbook's relationships.
 *
 * Not hardcoded to `xl/worksheets/sheet1.xml`: the FIRST sheet in the workbook's own order is
 * what the user sees when they open the file, and nothing requires it to be the part named
 * `sheet1`. The reported file happens to agree, but a workbook whose sheets were reordered would
 * silently import the wrong one — and the import preview would look perfectly reasonable.
 */
export function findFirstWorksheetPath(workbookXml: string, relsXml: string): string | null {
  const firstSheet = tagPattern("sheet").exec(workbookXml)?.[0];
  if (!firstSheet) return null;

  // `r:id` is in the relationships namespace, whose prefix is conventionally but not necessarily
  // "r" — so the local name is what is matched.
  const relationshipId = /\s(?:[A-Za-z0-9_.-]+:)?id="([^"]*)"/.exec(firstSheet)?.[1];
  if (!relationshipId) return null;

  for (const match of relsXml.matchAll(tagPattern("Relationship"))) {
    const tag = match[0];
    if (attribute(tag, "Id") !== relationshipId) continue;

    const target = attribute(tag, "Target");
    if (!target) return null;
    // Targets may be absolute ("/xl/worksheets/sheet1.xml") or relative to xl/ — both are legal
    // and the reported file uses the absolute form, which is the less common one.
    return target.startsWith("/")
      ? target.slice(1)
      : target.startsWith("xl/")
        ? target
        : `xl/${target.replace(/^\.\//, "")}`;
  }

  return null;
}

/** Everything above, over the bytes of an `.xlsx`. */
export async function readFirstSheetMatrix(data: ArrayBuffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(data);

  const read = async (path: string) => {
    const entry = zip.file(path);
    return entry ? entry.async("string") : undefined;
  };

  const workbookXml = await read("xl/workbook.xml");
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) {
    throw new Error("This file is not a spreadsheet — it has no workbook inside it.");
  }

  const sheetPath = findFirstWorksheetPath(workbookXml, relsXml);
  if (!sheetPath) {
    throw new Error("This spreadsheet has no sheets in it.");
  }

  const worksheetXml = await read(sheetPath);
  if (!worksheetXml) {
    throw new Error("This spreadsheet's first sheet is missing from the file.");
  }

  return parseSheetMatrix(worksheetXml, parseSharedStrings(await read("xl/sharedStrings.xml")));
}
