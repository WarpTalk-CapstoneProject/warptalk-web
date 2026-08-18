/**
 * The sample file the Import dialog hands out. WT-505.
 *
 * The ticket asked for a template because there was no way to find out what shape a glossary file
 * should be — the importer's rules lived only in `HEADER_ALIASES`, and the dialog's one-line
 * description was the entire documentation. The interesting part is not the file, it is that the
 * template and the importer must not be able to disagree: a sample the product hands out and then
 * refuses to read is worse than no sample at all, and that is exactly the kind of drift nothing
 * catches. `import-template.test.ts` runs this template through `toRows` and asserts the rows come
 * back, so the two are pinned together.
 *
 * The two example rows are real English→Vietnamese terms rather than "foo"/"bar" because the
 * template is also the specification: someone opening it should be able to see what belongs in
 * Definition as opposed to Note without being told.
 */

/** In the order they appear in the file. The first two are the required ones. */
export const TEMPLATE_COLUMNS = [
  "Term",
  "Translation",
  "Field",
  "Definition",
  "Note",
  "Part of speech",
  "Priority",
] as const;

export const TEMPLATE_ROWS: readonly (readonly string[])[] = [
  [
    "kickoff",
    "giao bóng",
    "Sports",
    "The restart that begins a match or resumes play after a goal.",
    "Keep consistent across the UI, commentary and match events.",
    "noun",
    "1",
  ],
  [
    "frame rate",
    "tốc độ khung hình",
    "Gaming",
    "The number of rendered frames displayed per second.",
    'FPS may be kept as an abbreviation.',
    "noun",
    "2",
  ],
];

/** RFC-4180 quoting: only what needs quoting is quoted, and a quote inside doubles. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function templateCsv(): string {
  return [TEMPLATE_COLUMNS, ...TEMPLATE_ROWS]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export const TEMPLATE_BASE_NAME = "warptalk-glossary-template";
