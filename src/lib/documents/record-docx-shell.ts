/**
 * The page a Recap document is printed on: A4, Calibri 11, the title block, the header table and
 * the footer. Everything a transcript and a summary must share to look like two pages out of the
 * same file rather than two files.
 *
 * WHY THE `docx` MODULE IS AN ARGUMENT
 *     `transcript-docx.ts` and `summary-docx.ts` reach the writer through `await import("docx")`
 *     so ~500 KB of Word machinery stays out of the bundle until somebody actually clicks
 *     Download. A shared module that imported `docx` at the top would undo that for whichever of
 *     the two loaded first, so the loaded namespace is passed in instead. The only mention of the
 *     package here is in type positions, which TypeScript erases: nothing of `docx` is required
 *     at run time by this file.
 *
 * WHY IT LOOKS LIKE THE MINUTES
 *     The minutes are the record this workspace already recognises on paper, so a transcript
 *     printed next to one should not look like it came from another product: same paper, same
 *     face, same footer shape. The one thing deliberately dropped is the product name — the
 *     meeting belongs to the workspace that held it, not to the tool that wrote it down.
 */

import type { Paragraph, Table } from "docx";

import {
  documentCoreTitle,
  documentTitle,
  footerTextParts,
  kindLabel,
  recordHeaderRows,
  type RecordDocumentTextKind,
} from "./record-document-layout.ts";
import type { RecordDocumentMeta } from "./record-documents.ts";

/** The loaded namespace, handed over by whichever builder awaited the import. */
type Docx = typeof import("docx");
/** Anything that can sit at the top level of a section. */
type BlockChild = Paragraph | Table;

/** `BodyFont` in GlobalMinutesDocxWriter. Two records off the same meeting, one typeface. */
export const FONT = "Calibri";
/** Half-points, as Word counts them. 22 and 18 are the minutes writer's body and small sizes. */
export const SIZE_BODY = 22;
export const SIZE_TITLE = 40;
export const SIZE_HEADING = 24;
export const SIZE_SMALL = 18;

/** `--foreground` from the app. Near-black, because a long transcript at pure black glares. */
export const COLOR_BODY = "111214";
/** `--muted-foreground`: labels and asides that must stay legible on paper. */
export const COLOR_MUTED = "5E6470";
/**
 * `--color-ink-subtle`, the grey the Reading layout puts on times and citation moments.
 *
 * The minutes writer sets no colour at all and leans on size and italics instead. That works for
 * a page of prose; a transcript is a column of names and timestamps, and without a second weight
 * of grey the timestamps read as part of what was said.
 */
export const COLOR_SUBTLE = "8A8F98";
/**
 * Rules and table lines. The app's `--border` is #EBECEF, which is a screen value: on paper it
 * disappears. Darkened to the lightest grey that still prints as a line.
 */
export const COLOR_RULE = "D9DBE0";

/** A4 in twips, as the minutes writer sets it. Letter is `docx`'s default and would reflow every
 *  page break the moment the two documents are printed side by side. */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1440;

/**
 * What is left of the page between the margins, in twips.
 *
 * Table columns are sized in twips rather than percentages because the tables are laid out
 * `FIXED`: Word then reads `tblGrid`, and a grid written in percent points comes out a few
 * millimetres wide. Percentages are only honoured under the `AUTOFIT` layout, which reflows the
 * columns around the longest cell — and one long action item would then squeeze the Owner column
 * to a letter per line.
 */
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Splits the content width, rounding so the columns still add up to it exactly. */
export function columnWidths(...shares: number[]): number[] {
  const total = shares.reduce((sum, share) => sum + share, 0);
  const widths = shares.map((share) => Math.round((CONTENT_WIDTH * share) / total));
  widths[widths.length - 1] = CONTENT_WIDTH - widths.slice(0, -1).reduce((sum, w) => sum + w, 0);
  return widths;
}

/** The label column: wide enough for "Participants", narrow enough to leave the value room. */
const HEADER_COLUMNS = columnWidths(22, 78);

function recordStyles() {
  return {
    default: {
      document: {
        run: { font: FONT, size: SIZE_BODY, color: COLOR_BODY },
        // 1.15 lines and 6pt after, the same rhythm as the minutes.
        paragraph: { spacing: { after: 120, line: 276 } },
      },
    },
    // Word insists a bulleted paragraph has a list-paragraph style; without one the indent comes
    // out of the numbering definition alone and Word's own "modify list" UI has nothing to edit.
    paragraphStyles: [
      {
        id: "ListParagraph",
        name: "List Paragraph",
        basedOn: "Normal",
        quickFormat: true,
        paragraph: { spacing: { after: 60 } },
      },
    ],
  };
}

function pageProperties() {
  return {
    page: {
      size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    },
  };
}

/** "{Meeting title} · Transcript — Page 2 of 7", as live PAGE/NUMPAGES fields so it stays true. */
function recordFooter(docx: Docx, meta: RecordDocumentMeta, kind: RecordDocumentTextKind) {
  const { before, between } = footerTextParts(meta, kind);
  const small = { size: SIZE_SMALL, color: COLOR_MUTED } as const;
  return new docx.Footer({
    children: [
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [
          new docx.TextRun({ text: before, ...small }),
          new docx.TextRun({ children: [docx.PageNumber.CURRENT], ...small }),
          new docx.TextRun({ text: between, ...small }),
          new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES], ...small }),
        ],
      }),
    ],
  });
}

function noBorders(docx: Docx) {
  const none = { style: docx.BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

/**
 * The label/value block under the title, as a borderless table rather than "Label: value" lines.
 *
 * A table because the values wrap: a meeting with fourteen participants runs to three lines, and
 * in a plain paragraph those lines start back under the label and the block stops being skimmable.
 */
function headerTable(docx: Docx, rows: ReturnType<typeof recordHeaderRows>) {
  return new docx.Table({
    width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
    layout: docx.TableLayoutType.FIXED,
    columnWidths: HEADER_COLUMNS,
    borders: noBorders(docx),
    rows: rows.map(
      (row) =>
        new docx.TableRow({
          children: [
            new docx.TableCell({
              width: { size: HEADER_COLUMNS[0], type: docx.WidthType.DXA },
              margins: { top: 20, bottom: 20, right: 120 },
              children: [
                new docx.Paragraph({
                  spacing: { after: 0 },
                  children: [new docx.TextRun({ text: row.label, size: SIZE_SMALL, color: COLOR_MUTED })],
                }),
              ],
            }),
            new docx.TableCell({
              width: { size: HEADER_COLUMNS[1], type: docx.WidthType.DXA },
              margins: { top: 20, bottom: 20 },
              children: [
                new docx.Paragraph({
                  spacing: { after: 0 },
                  children: [new docx.TextRun({ text: row.value, size: SIZE_SMALL })],
                }),
              ],
            }),
          ],
        }),
    ),
  });
}

/** The kind label, the title, and the header table — everything above the first word of content. */
export function recordTitleBlock(
  docx: Docx,
  meta: RecordDocumentMeta,
  kind: RecordDocumentTextKind,
  options: { templateLabel?: string | null } = {},
): BlockChild[] {
  const rows = recordHeaderRows(meta, { templateLabel: options.templateLabel });
  const blocks: BlockChild[] = [
    new docx.Paragraph({
      spacing: { after: 40 },
      children: [
        new docx.TextRun({
          text: kindLabel(kind),
          size: SIZE_SMALL,
          color: COLOR_MUTED,
          // A quarter of a point between letters: what makes a short upper-case word read as a
          // label rather than as shouting.
          characterSpacing: 24,
        }),
      ],
    }),
    new docx.Paragraph({
      keepNext: true,
      spacing: { after: rows.length > 0 ? 200 : 320 },
      children: [new docx.TextRun({ text: documentTitle(meta), bold: true, size: SIZE_TITLE })],
    }),
  ];
  if (rows.length > 0) {
    blocks.push(headerTable(docx, rows));
    // An empty paragraph carrying the rule that closes the header. It is also what keeps Word from
    // running the table straight into the first line of the body, which it does without one.
    blocks.push(
      new docx.Paragraph({
        spacing: { before: 160, after: 260 },
        border: { bottom: { style: docx.BorderStyle.SINGLE, size: 4, color: COLOR_RULE, space: 1 } },
        children: [],
      }),
    );
  }
  return blocks;
}

/** One section, A4, Calibri, footer attached — the whole file bar its contents. */
export function recordDocument(
  docx: Docx,
  {
    meta,
    kind,
    children,
  }: { meta: RecordDocumentMeta; kind: RecordDocumentTextKind; children: BlockChild[] },
) {
  return new docx.Document({
    title: documentCoreTitle(meta, kind),
    description: `${kind} of ${documentTitle(meta)}`,
    // Left to `docx` this reads "Un-named" in Explorer's Authors column. The record belongs to
    // the workspace that held the meeting, so that is whose name goes on it — never the product's.
    creator: meta.workspaceName?.trim() || documentTitle(meta),
    styles: recordStyles(),
    sections: [
      {
        properties: pageProperties(),
        footers: { default: recordFooter(docx, meta, kind) },
        children,
      },
    ],
  });
}

export type { BlockChild, Docx };
