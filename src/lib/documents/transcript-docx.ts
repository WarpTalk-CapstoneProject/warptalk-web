/**
 * The transcript as a Word file, laid out the way the Reading tab draws it on screen.
 *
 * WHAT IS BEING PRESERVED
 *     A transcript is read by moment and by voice: "what did Kỳ say around fourteen minutes in".
 *     So a turn keeps its shape — the name and the time on their own line, the sentences under it
 *     — rather than collapsing into "Kỳ: …" run-on paragraphs that save paper and lose the scan.
 *     The name line is `keepNext`, because a page break between a speaker and their first sentence
 *     attributes that sentence to whoever spoke last on the previous page.
 *
 * WHY `docx` IS LOADED LATE
 *     The Word writer is around half a megabyte. Nobody opening a meeting record needs it until
 *     they click Download, so it is pulled in with `await import` inside the builder rather than
 *     at the top of the module. `transcriptPlainText` is re-exported from the layout file for the
 *     same reason: the clipboard path must not drag the writer in behind it.
 */

import {
  COLOR_MUTED,
  COLOR_RULE,
  COLOR_SUBTLE,
  SIZE_SMALL,
  recordDocument,
  recordTitleBlock,
  type BlockChild,
  type Docx,
} from "./record-docx-shell.ts";
import { languageTagSuffix, turnTimeLabel } from "./record-document-layout.ts";
import type { TranscriptDocumentModel, TranscriptDocumentTurn } from "./record-documents.ts";

export { transcriptPlainText } from "./record-document-layout.ts";

/**
 * "Transcript paused · 09:40 – 09:44" the way the screen draws it: centred, small, over a rule.
 * The rule is the paragraph's own top border rather than an empty bordered paragraph, so the gap
 * cannot end up on one page with the words on the next.
 */
function dividerParagraph(docx: Docx, label: string): BlockChild {
  return new docx.Paragraph({
    alignment: docx.AlignmentType.CENTER,
    spacing: { before: 280, after: 200 },
    border: { top: { style: docx.BorderStyle.SINGLE, size: 4, color: COLOR_RULE, space: 10 } },
    children: [new docx.TextRun({ text: label, size: SIZE_SMALL, color: COLOR_MUTED, italics: true })],
  });
}

function turnParagraphs(docx: Docx, turn: TranscriptDocumentTurn): BlockChild[] {
  const blocks: BlockChild[] = [
    new docx.Paragraph({
      keepNext: true,
      spacing: { before: 220, after: 40 },
      children: [
        new docx.TextRun({ text: turn.speakerName, bold: true }),
        new docx.TextRun({
          // Two spaces rather than a separator: the time is an aside to the name, and a bullet or
          // a dash between them reads as part of what the speaker is called.
          text: `  ${turnTimeLabel(turn.elapsed, turn.clock)}`,
          size: SIZE_SMALL,
          color: COLOR_SUBTLE,
        }),
      ],
    }),
  ];
  for (const line of turn.lines) {
    const tag = languageTagSuffix(line.languageTag);
    blocks.push(
      new docx.Paragraph({
        spacing: { after: 60 },
        children: [
          new docx.TextRun({ text: line.text }),
          // The Reading layout's language chip. Only on lines that are not in the language being
          // read, so its absence means "this is what you asked for", not "we did not check".
          ...(tag ? [new docx.TextRun({ text: tag, size: SIZE_SMALL, color: COLOR_SUBTLE })] : []),
        ],
      }),
    );
  }
  return blocks;
}

export async function buildTranscriptDocx(model: TranscriptDocumentModel): Promise<Blob> {
  const docx = await import("docx");
  const children = recordTitleBlock(docx, model.meta, "Transcript");
  for (const entry of model.entries) {
    if (entry.kind === "divider") children.push(dividerParagraph(docx, entry.label));
    else children.push(...turnParagraphs(docx, entry));
  }
  return docx.Packer.toBlob(recordDocument(docx, { meta: model.meta, kind: "Transcript", children }));
}
