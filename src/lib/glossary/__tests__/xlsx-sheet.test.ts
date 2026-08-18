/**
 * WT-505 — the file the reporter attached was a valid .xlsx that the product refused.
 *
 * The distinguishing property, and the one every case here is built around: its OOXML parts bind
 * the SpreadsheetML namespace to a PREFIX (`<x:worksheet xmlns:x="…">`) rather than making it the
 * default namespace. That is the same document to any namespace-aware reader — the prefix is
 * arbitrary — and it is what ExcelJS could not open.
 *
 * The workbooks below are BUILT here rather than committed as binary, so each test pins the
 * property that matters instead of one person's spreadsheet, and the prefixed and unprefixed
 * spellings can be asserted to produce byte-identical results.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";

import {
  columnIndexFromRef,
  findFirstWorksheetPath,
  parseSharedStrings,
  parseSheetMatrix,
  readFirstSheetMatrix,
} from "../xlsx-sheet.ts";

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";

/**
 * A one-sheet workbook. `prefix` is the whole point: pass "x" for the reported file's spelling
 * and null for the one Excel itself writes.
 */
async function buildWorkbook(options: {
  prefix: string | null;
  sheetXmlBody: string;
  sharedStrings?: string;
  /** The reported file used an absolute Target, which is the less common of the two legal forms. */
  absoluteTarget?: boolean;
}): Promise<ArrayBuffer> {
  const p = options.prefix ? `${options.prefix}:` : "";
  const ns = options.prefix ? `xmlns:${options.prefix}="${MAIN}"` : `xmlns="${MAIN}"`;

  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><${p}workbook ${ns}><${p}sheets><${p}sheet name="Glossary" sheetId="1" r:id="rIdSheet" xmlns:r="${RELS}"/></${p}sheets></${p}workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="${RELS}"><Relationship Id="rIdSheet" Type="${RELS}/worksheet" Target="${
      options.absoluteTarget ? "/xl/worksheets/sheet1.xml" : "worksheets/sheet1.xml"
    }"/></Relationships>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0"?><${p}worksheet ${ns}><${p}sheetData>${options.sheetXmlBody}</${p}sheetData></${p}worksheet>`,
  );
  if (options.sharedStrings) zip.file("xl/sharedStrings.xml", options.sharedStrings);

  return zip.generateAsync({ type: "arraybuffer" });
}

/** Two rows in the exact shape the reported file stores text: `t="str"` around a `<v>`. */
function sheetBody(prefix: string | null): string {
  const p = prefix ? `${prefix}:` : "";
  return (
    `<${p}row r="1">` +
    `<${p}c r="A1" t="str"><${p}v>Term</${p}v></${p}c>` +
    `<${p}c r="B1" t="str"><${p}v>Translation</${p}v></${p}c>` +
    `</${p}row>` +
    `<${p}row r="2">` +
    `<${p}c r="A2" t="str"><${p}v>kickoff</${p}v></${p}c>` +
    `<${p}c r="B2" t="str"><${p}v>giao bóng</${p}v></${p}c>` +
    `</${p}row>`
  );
}

test("a workbook whose namespace is on a prefix reads — this is the reported file", async () => {
  const data = await buildWorkbook({
    prefix: "x",
    sheetXmlBody: sheetBody("x"),
    absoluteTarget: true,
  });

  assert.deepEqual(await readFirstSheetMatrix(data), [
    ["Term", "Translation"],
    ["kickoff", "giao bóng"],
  ]);
});

test("the prefix is arbitrary, so the same file spelled two ways reads identically", async () => {
  const prefixed = await readFirstSheetMatrix(
    await buildWorkbook({ prefix: "x", sheetXmlBody: sheetBody("x") }),
  );
  const plain = await readFirstSheetMatrix(
    await buildWorkbook({ prefix: null, sheetXmlBody: sheetBody(null) }),
  );
  const oddPrefix = await readFirstSheetMatrix(
    await buildWorkbook({ prefix: "ss", sheetXmlBody: sheetBody("ss") }),
  );

  assert.deepEqual(prefixed, plain);
  assert.deepEqual(oddPrefix, plain);
});

test("shared strings are resolved, not printed as their index", async () => {
  // The failure this guards is specific and silent: a t="s" cell read literally puts the NUMBER 3
  // in the glossary where a term belongs, and the import preview looks like a table of integers.
  const data = await buildWorkbook({
    prefix: "x",
    sharedStrings: `<?xml version="1.0"?><x:sst xmlns:x="${MAIN}"><x:si><x:t>Term</x:t></x:si><x:si><x:t>Translation</x:t></x:si><x:si><x:r><x:t>giao </x:t></x:r><x:r><x:t>bóng</x:t></x:r></x:si></x:sst>`,
    sheetXmlBody:
      `<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c></x:row>` +
      `<x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>kickoff</x:t></x:is></x:c><x:c r="B2" t="s"><x:v>2</x:v></x:c></x:row>`,
  });

  assert.deepEqual(await readFirstSheetMatrix(data), [
    ["Term", "Translation"],
    // The last one is a rich-text entry: bolding half a term does not make it two terms.
    ["kickoff", "giao bóng"],
  ]);
});

test("an empty cell in the middle of a row does not shift the columns after it", async () => {
  // A row with no Field simply omits the cell. Counting cells instead of reading r="C2" would
  // slide the Definition into the Field column — a silent, plausible-looking wrong import.
  const data = await buildWorkbook({
    prefix: "x",
    sheetXmlBody:
      `<x:row r="1"><x:c r="A1" t="str"><x:v>Term</x:v></x:c><x:c r="B1" t="str"><x:v>Translation</x:v></x:c><x:c r="C1" t="str"><x:v>Field</x:v></x:c><x:c r="D1" t="str"><x:v>Definition</x:v></x:c></x:row>` +
      `<x:row r="2"><x:c r="A2" t="str"><x:v>kickoff</x:v></x:c><x:c r="B2" t="str"><x:v>giao bóng</x:v></x:c><x:c r="D2" t="str"><x:v>Restart of play.</x:v></x:c></x:row>`,
  });

  const matrix = await readFirstSheetMatrix(data);
  assert.deepEqual(matrix[1], ["kickoff", "giao bóng", "", "Restart of play."]);
});

test("XML entities come back as characters, including the numeric ones", () => {
  // &#10; is how a line break inside a cell is stored, and it is common in a Note column.
  const matrix = parseSheetMatrix(
    `<x:row r="1"><x:c r="A1" t="str"><x:v>R&amp;D</x:v></x:c>` +
      `<x:c r="B1" t="str"><x:v>one&#10;two</x:v></x:c>` +
      `<x:c r="C1" t="str"><x:v>&lt;tag&gt;</x:v></x:c></x:row>`,
    [],
  );

  assert.deepEqual(matrix[0], ["R&D", "one\ntwo", "<tag>"]);
});

test("a number keeps its stored value rather than becoming empty", async () => {
  // Priority is a number column, and a cell with no t attribute is the normal way to store one.
  const data = await buildWorkbook({
    prefix: "x",
    sheetXmlBody: `<x:row r="1"><x:c r="A1"><x:v>2</x:v></x:c></x:row>`,
  });

  assert.deepEqual(await readFirstSheetMatrix(data), [["2"]]);
});

test("the FIRST sheet is resolved through the relationship, not assumed to be sheet1.xml", () => {
  // A workbook whose sheets were reordered would otherwise import the wrong one — and the preview
  // would look entirely reasonable, which is what makes it worth resolving properly.
  const workbook = `<x:workbook xmlns:x="${MAIN}"><x:sheets><x:sheet name="Glossary" sheetId="1" r:id="rId7" xmlns:r="${RELS}"/><x:sheet name="Notes" sheetId="2" r:id="rId3" xmlns:r="${RELS}"/></x:sheets></x:workbook>`;
  const rels = `<Relationships xmlns="${RELS}"><Relationship Id="rId3" Type="${RELS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="${RELS}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`;

  assert.equal(findFirstWorksheetPath(workbook, rels), "xl/worksheets/sheet2.xml");
});

test("both legal spellings of a relationship Target resolve to the same part", () => {
  const workbook = `<workbook xmlns="${MAIN}"><sheets><sheet name="S" sheetId="1" r:id="rId1" xmlns:r="${RELS}"/></sheets></workbook>`;
  const relative = `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${RELS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const absolute = `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${RELS}/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>`;

  assert.equal(findFirstWorksheetPath(workbook, relative), "xl/worksheets/sheet1.xml");
  assert.equal(findFirstWorksheetPath(workbook, absolute), "xl/worksheets/sheet1.xml");
});

test("column references decode past Z", () => {
  assert.equal(columnIndexFromRef("A1"), 0);
  assert.equal(columnIndexFromRef("B12"), 1);
  assert.equal(columnIndexFromRef("Z1"), 25);
  assert.equal(columnIndexFromRef("AA1"), 26);
  assert.equal(columnIndexFromRef("AB3"), 27);
  assert.equal(columnIndexFromRef(null), null);
});

test("an empty shared string table is not an error", () => {
  // The reported file ships exactly this — a self-closing <sst/> — because every cell is inline.
  assert.deepEqual(parseSharedStrings(`<x:sst xmlns:x="${MAIN}" />`), []);
  assert.deepEqual(parseSharedStrings(undefined), []);
});

test("something that is not a spreadsheet says so, rather than throwing a type error", async () => {
  const zip = new JSZip();
  zip.file("hello.txt", "not a spreadsheet");
  const data = await zip.generateAsync({ type: "arraybuffer" });

  await assert.rejects(() => readFirstSheetMatrix(data), /not a spreadsheet/i);
});
