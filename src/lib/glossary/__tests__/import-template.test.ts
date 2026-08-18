/**
 * The template the Import dialog hands out has to be a file the Import dialog accepts.
 *
 * That sounds too obvious to test, and it is exactly the kind of thing that drifts silently: the
 * template is written in one file and the header aliases live in another, so renaming a column on
 * either side produces a sample the product itself refuses — and nobody finds out until a user
 * downloads it, fills it in, and is told their file is wrong.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCsv, toRows } from "../import-rows.ts";
import { TEMPLATE_COLUMNS, TEMPLATE_ROWS, templateCsv } from "../import-template.ts";

/** The grid the .xlsx template writes, built the same way the dialog builds it. */
const templateMatrix = (): string[][] => [
  [...TEMPLATE_COLUMNS],
  ...TEMPLATE_ROWS.map((row) => [...row]),
];

test("every column in the template is one the importer recognises", () => {
  const { rows, error } = toRows(templateMatrix());

  assert.equal(error, undefined);
  assert.equal(rows.length, TEMPLATE_ROWS.length);
});

test("the template's example rows import with every field populated", () => {
  // Not just "it parses": a template whose optional columns silently drop would teach the reader
  // that Field and Note do nothing.
  const [first] = toRows(templateMatrix()).rows;

  assert.deepEqual(first, {
    sourceTerm: "kickoff",
    targetTerm: "giao bóng",
    domain: "Sports",
    definition: "The restart that begins a match or resumes play after a goal.",
    usageNote: "Keep consistent across the UI, commentary and match events.",
    partOfSpeech: "noun",
    priority: 1,
  });
});

test("the .csv template round-trips through the CSV reader", () => {
  // The two templates are generated separately — one by ExcelJS, one by string concatenation —
  // so this is the only thing stopping them describing different formats.
  const { rows, error } = toRows(parseCsv(templateCsv()));

  assert.equal(error, undefined);
  assert.deepEqual(
    rows.map((row) => [row.sourceTerm, row.targetTerm]),
    TEMPLATE_ROWS.map((row) => [row[0], row[1]]),
  );
});

test("a cell containing a comma survives the CSV template", () => {
  // The Definition column is prose and will eventually contain one. Quoting it wrongly would
  // split a definition across two columns in the file we tell people to copy.
  const parsed = parseCsv(templateCsv());
  const definitionIndex = TEMPLATE_COLUMNS.indexOf("Definition");

  parsed.slice(1).forEach((row, index) => {
    assert.equal(row[definitionIndex], TEMPLATE_ROWS[index][definitionIndex]);
  });
});

test("Term and Translation lead, because they are the required pair", () => {
  // Order is not cosmetic here — it is what makes the two required columns the first thing the
  // reader sees when they open the sample.
  assert.equal(TEMPLATE_COLUMNS[0], "Term");
  assert.equal(TEMPLATE_COLUMNS[1], "Translation");
});

test("dropping either required column is refused, with a reason", () => {
  const withoutTranslation = templateMatrix().map((row) => [row[0], ...row.slice(2)]);
  const { rows, error } = toRows(withoutTranslation);

  assert.equal(rows.length, 0);
  assert.match(error ?? "", /Translation/);
});
