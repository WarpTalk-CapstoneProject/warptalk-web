/**
 * Lays an `InsightsReport` out as a Word document: A4, a title block, a summary, then one section
 * per topic with its tables, and the caveats last. Tables and sentences only, without charts.
 *
 * `docx` is loaded with a dynamic import so ~500 KB of Word machinery stays out of the admin
 * bundle until somebody actually exports.
 */

import type { InsightsReport, ReportTable, ReportTone } from "./insights-report.ts";

const FONT = "Calibri";
const COLOR_BODY = "111214";
const COLOR_MUTED = "5E6470";
const COLOR_RULE = "D9DBE0";
const COLOR_HEAD_FILL = "F1F2F5";
const COLOR_GOOD = "1B6E3C";
const COLOR_BAD = "B42318";
const COLOR_WARN_FILL = "FFF4D6";
const COLOR_WARN_RULE = "D9A400";

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1134;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/**
 * First column takes the slack; the others share the rest equally. Sums to CONTENT_WIDTH.
 * `firstShare` (0-1) overrides how much the first column takes, for a table of text.
 */
export function reportColumnWidths(columns: number, firstShare?: number): number[] {
  if (columns <= 1) return [CONTENT_WIDTH];
  const share = firstShare !== undefined && firstShare > 0 && firstShare < 1 ? firstShare : undefined;
  const first = Math.round(CONTENT_WIDTH * (share ?? (columns <= 2 ? 0.6 : columns <= 4 ? 0.34 : 0.26)));
  const rest = Math.floor((CONTENT_WIDTH - first) / (columns - 1));
  const widths = [first, ...Array.from({ length: columns - 1 }, () => rest)];
  widths[0] = CONTENT_WIDTH - rest * (columns - 1);
  return widths;
}

export async function buildInsightsReportDocx(report: InsightsReport): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, Footer, Header, PageNumber, TableLayoutType, HeadingLevel } = docx;

  const run = (text: string, extra: Record<string, unknown> = {}) => new TextRun({ text, font: FONT, ...extra });
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLOR_RULE };
  const borders = { top: border, bottom: border, left: border, right: border };

  const heading = (text: string, level: 1 | 2) =>
    new Paragraph({
      heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: level === 1 ? 360 : 240, after: 120 },
      children: [run(text, { bold: true, size: level === 1 ? 30 : 24, color: COLOR_BODY })],
    });

  const note = (text: string) =>
    new Paragraph({ spacing: { before: 60, after: 120 }, children: [run(text, { italics: true, size: 18, color: COLOR_MUTED })] });

  const toneColor = (tone: ReportTone | null | undefined) => (tone === "good" ? COLOR_GOOD : tone === "bad" ? COLOR_BAD : undefined);

  const tableFor = (spec: ReportTable) => {
    const widths = reportColumnWidths(spec.columns.length, spec.firstColumnShare);
    const cell = (text: string, col: number, header: boolean, tone?: ReportTone | null) =>
      new TableCell({
        width: { size: widths[col], type: WidthType.DXA },
        borders,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: header ? { type: ShadingType.CLEAR, fill: COLOR_HEAD_FILL, color: "auto" } : undefined,
        children: [
          new Paragraph({
            alignment: spec.numericColumns.includes(col) ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [run(text, { size: 19, bold: header || Boolean(tone), color: toneColor(tone) })],
          }),
        ],
      });
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: spec.columns.map((c, i) => cell(c, i, true)) }),
        ...spec.rows.map(
          (row, r) => new TableRow({ cantSplit: true, children: row.map((c, i) => cell(c, i, false, spec.tones?.[r]?.[i])) }),
        ),
      ],
    });
  };

  const body: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  body.push(
    new Paragraph({ spacing: { after: 120 }, children: [run(report.classification.line, { bold: true, size: 18, color: COLOR_BAD })] }),
    // Title block, the same shape on every export: the report's name, then the period in words.
    new Paragraph({ spacing: { after: 60 }, children: [run(report.title, { bold: true, size: 40 })] }),
    new Paragraph({ spacing: { after: 120 }, children: [run(report.periodTitle, { size: 28, color: COLOR_MUTED })] }),
    new Paragraph({
      spacing: { after: 40 },
      children: [run(`Reporting period: ${report.range} (${report.periodDays} ${report.periodDays === 1 ? "day" : "days"})`, { size: 20 })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [run(`Compared with: ${report.previousRange} (${report.comparisonLabel})`, { size: 20 })],
    }),
  );
  if (report.timeZone) {
    body.push(new Paragraph({ spacing: { after: 40 }, children: [run(`Time zone: ${report.timeZone}. Days start and end at local midnight.`, { size: 20 })] }));
  }
  body.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        run(
          `Generated ${report.generatedAtLocal}${report.timeZone ? "" : " UTC"}. All amounts are in US dollars (USD).`,
          { size: 18, color: COLOR_MUTED },
        ),
      ],
    }),
  );

  // Before the numbers: a period that is still running reads as a short period unless it says so.
  for (const warning of report.warnings) {
    const edge = { style: BorderStyle.SINGLE, size: 8, color: COLOR_WARN_RULE };
    body.push(
      new Paragraph({
        spacing: { before: 60, after: 200 },
        shading: { type: ShadingType.CLEAR, fill: COLOR_WARN_FILL, color: "auto" },
        border: { top: edge, bottom: edge, left: edge, right: edge },
        children: [run("Period not closed. ", { bold: true, size: 20 }), run(warning, { size: 20 })],
      }),
    );
  }

  if (report.summary.length) {
    body.push(heading("Summary", 1));
    for (const line of report.summary) {
      body.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [run(line)] }));
    }
  }

  for (const section of report.sections) {
    body.push(heading(section.title, 1));
    for (const table of section.tables) {
      body.push(heading(table.title, 2), tableFor(table));
      if (table.note) body.push(note(table.note));
    }
  }

  if (report.notes.length) {
    body.push(heading("Notes", 1));
    for (const text of report.notes) {
      body.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [run(text, { size: 20 })] }));
    }
  }

  const doc = new Document({
    title: report.documentTitle,
    description: `Reporting period ${report.range}`,
    creator: "WarpTalk",
    styles: { default: { document: { run: { font: FONT, size: 22, color: COLOR_BODY }, paragraph: { spacing: { after: 120, line: 276 } } } } },
    sections: [
      {
        properties: { page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [run(report.classification.label, { bold: true, size: 16, color: COLOR_BAD })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run(`${report.classification.label} · ${report.documentTitle} · Page `, { size: 18, color: COLOR_MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR_MUTED }),
                  run(" of ", { size: 18, color: COLOR_MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR_MUTED }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });

  return Packer.toBlob(doc);
}
