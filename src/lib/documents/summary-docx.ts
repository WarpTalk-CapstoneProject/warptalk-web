/**
 * The summary as a Word file: the same sections, bullets and citation moments the Recap rail
 * shows, on the same paper as the transcript.
 *
 * WHAT THE FILE HAS TO SAY THAT THE SCREEN DOES NOT
 *     On screen, a reader who switched template or language can see they did — the pickers are
 *     right there. The file travels without them, and a colleague opening it has no way to tell a
 *     private re-rendering from the summary the host published and signed off. So the note says
 *     so in the document, and the template is a header row rather than a caption.
 *
 * WHY ACTION ITEMS ARE A TABLE
 *     Every other section is prose to be read; action items are a list to be worked, and the
 *     question asked of them is "which of these are mine". Owner-first columns answer that by
 *     scanning one edge of the page; a bullet that buries the name mid-sentence does not.
 */

import {
  COLOR_MUTED,
  COLOR_RULE,
  COLOR_SUBTLE,
  CONTENT_WIDTH,
  SIZE_HEADING,
  SIZE_SMALL,
  columnWidths,
  recordDocument,
  recordTitleBlock,
  type BlockChild,
  type Docx,
} from "./record-docx-shell.ts";
import { PERSONAL_RENDERING_NOTE } from "./record-document-layout.ts";
import type { SummaryDocumentItem, SummaryDocumentSection, SummaryDocumentModel } from "./record-documents.ts";

/** The one section the rail renders as a table rather than as bullets. */
const ACTION_ITEMS_KEY = "actionItems";

/** " [1:12, 3:40]" — the moments a claim rests on, primary first, as the rail's citation chips. */
function citationSuffix(citations: readonly string[]): string {
  const moments = citations.map((moment) => moment.trim()).filter((moment) => moment.length > 0);
  return moments.length > 0 ? ` [${moments.join(", ")}]` : "";
}

function noteParagraph(docx: Docx, text: string): BlockChild {
  return new docx.Paragraph({
    spacing: { after: 240 },
    children: [new docx.TextRun({ text, italics: true, color: COLOR_MUTED, size: SIZE_SMALL })],
  });
}

/** Blank-line-separated prose becomes real paragraphs; a single \n stays inside one. */
function prose(docx: Docx, text: string): BlockChild[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(
      (block) =>
        new docx.Paragraph({
          spacing: { after: 140 },
          children: [new docx.TextRun({ text: block })],
        }),
    );
}

function headingParagraph(docx: Docx, title: string): BlockChild {
  return new docx.Paragraph({
    keepNext: true,
    spacing: { before: 240, after: 100 },
    children: [new docx.TextRun({ text: title, bold: true, size: SIZE_HEADING })],
  });
}

function bulletParagraph(docx: Docx, item: SummaryDocumentItem): BlockChild {
  const citations = citationSuffix(item.citations);
  // An owner on a bullet outside the action-items section still has to be visible; leading with
  // it keeps the same "whose is this" scan the table gives.
  const owner = item.owner?.trim();
  return new docx.Paragraph({
    bullet: { level: 0 },
    children: [
      ...(owner ? [new docx.TextRun({ text: `${owner}: `, bold: true })] : []),
      new docx.TextRun({ text: item.text }),
      ...(citations ? [new docx.TextRun({ text: citations, size: SIZE_SMALL, color: COLOR_SUBTLE })] : []),
    ],
  });
}

/** No fill on the header row: the minutes writer shades nothing, and a grey band would be the one
 *  thing on the page that came from neither the meeting nor the record it is printed beside. */
function cell(docx: Docx, text: string, options: { bold?: boolean; head?: boolean; width?: number } = {}) {
  return new docx.TableCell({
    width: options.width ? { size: options.width, type: docx.WidthType.DXA } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new docx.Paragraph({
        spacing: { after: 0 },
        children: [
          new docx.TextRun({
            text,
            bold: options.bold ?? options.head,
            size: options.head ? SIZE_SMALL : undefined,
            color: options.head ? COLOR_MUTED : undefined,
          }),
        ],
      }),
    ],
  });
}

/**
 * Owner | Task, plus Moment when any item is cited. The column is dropped rather than left empty
 * because a legacy summary has no citations at all, and an empty third column on every row reads
 * as data that went missing.
 */
function actionItemsTable(docx: Docx, items: readonly SummaryDocumentItem[]): BlockChild {
  const withMoments = items.some((item) => citationSuffix(item.citations) !== "");
  const line = { style: docx.BorderStyle.SINGLE, size: 2, color: COLOR_RULE } as const;
  const head = ["Owner", "Task", ...(withMoments ? ["Moment"] : [])];
  const widths = withMoments ? columnWidths(22, 58, 20) : columnWidths(25, 75);
  return new docx.Table({
    width: { size: CONTENT_WIDTH, type: docx.WidthType.DXA },
    layout: docx.TableLayoutType.FIXED,
    columnWidths: widths,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [
      new docx.TableRow({
        tableHeader: true,
        children: head.map((label, index) => cell(docx, label, { head: true, width: widths[index] })),
      }),
      ...items.map(
        (item) =>
          new docx.TableRow({
            children: [
              // An em dash rather than a blank: the row is complete, the task simply has no owner
              // yet, and an empty cell looks like the export dropped it.
              cell(docx, item.owner?.trim() || "—", { width: widths[0] }),
              cell(docx, item.text, { width: widths[1] }),
              ...(withMoments
                ? [
                    cell(docx, item.citations.filter((moment) => moment.trim()).join(", "), {
                      width: widths[2],
                    }),
                  ]
                : []),
            ],
          }),
      ),
    ],
  });
}

function sectionBlocks(docx: Docx, section: SummaryDocumentSection): BlockChild[] {
  const blocks: BlockChild[] = [headingParagraph(docx, section.title)];
  if (section.items.length === 0) return blocks;
  if (section.key === ACTION_ITEMS_KEY) {
    blocks.push(actionItemsTable(docx, section.items));
    // Word runs a table straight into whatever follows it without a paragraph to separate them.
    blocks.push(new docx.Paragraph({ spacing: { after: 0 }, children: [] }));
    return blocks;
  }
  for (const item of section.items) blocks.push(bulletParagraph(docx, item));
  return blocks;
}

export async function buildSummaryDocx(model: SummaryDocumentModel): Promise<Blob> {
  const docx = await import("docx");
  const children = recordTitleBlock(docx, model.meta, "Summary", {
    templateLabel: model.templateLabel,
  });

  if (model.isPersonalRendering) children.push(noteParagraph(docx, PERSONAL_RENDERING_NOTE));

  const insufficient = model.insufficientDataMessage?.trim();
  if (insufficient) {
    // Nothing else is printed: an empty section list under a heading would read as a summary that
    // found nothing to say per section, rather than one that was never produced.
    children.push(noteParagraph(docx, insufficient));
  } else {
    if (model.overview?.trim()) children.push(...prose(docx, model.overview));
    for (const section of model.sections) children.push(...sectionBlocks(docx, section));
  }

  return docx.Packer.toBlob(recordDocument(docx, { meta: model.meta, kind: "Summary", children }));
}
