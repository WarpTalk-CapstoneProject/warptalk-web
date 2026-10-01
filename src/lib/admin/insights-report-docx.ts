/**
 * Lays an `InsightsReport` out as a Word document: A4, a title block, a summary, then one section
 * per topic with its tables and charts, and the caveats last.
 *
 * `docx` is loaded with a dynamic import so ~500 KB of Word machinery stays out of the admin
 * bundle until somebody actually exports. Charts arrive as PNG bytes keyed by chart id; a chart with
 * no image is left out and its table still carries the numbers.
 */

import type { InsightsReport, ReportChart, ReportTable } from "./insights-report.ts";

const FONT = "Calibri";
const COLOR_BODY = "111214";
const COLOR_MUTED = "5E6470";
const COLOR_RULE = "D9DBE0";
const COLOR_HEAD_FILL = "F1F2F5";

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 1134;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Chart width on the page, in pixels at 96 dpi (about 16.5 cm). */
const IMAGE_WIDTH = 620;

export type ReportChartImages = Partial<Record<ReportChart["id"], { data: Uint8Array; width: number; height: number }>>;

/** First column takes the slack; numeric columns share the rest equally. Sums to CONTENT_WIDTH. */
export function reportColumnWidths(columns: number): number[] {
  if (columns <= 1) return [CONTENT_WIDTH];
  const first = columns <= 2 ? Math.round(CONTENT_WIDTH * 0.6) : Math.round(CONTENT_WIDTH * (columns <= 4 ? 0.34 : 0.26));
  const rest = Math.floor((CONTENT_WIDTH - first) / (columns - 1));
  const widths = [first, ...Array.from({ length: columns - 1 }, () => rest)];
  widths[0] = CONTENT_WIDTH - rest * (columns - 1);
  return widths;
}

export async function buildInsightsReportDocx(report: InsightsReport, images: ReportChartImages = {}): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, ImageRun, Footer, PageNumber, TableLayoutType, HeadingLevel } = docx;

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

  const tableFor = (spec: ReportTable) => {
    const widths = reportColumnWidths(spec.columns.length);
    const cell = (text: string, col: number, header: boolean) =>
      new TableCell({
        width: { size: widths[col], type: WidthType.DXA },
        borders,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: header ? { type: ShadingType.CLEAR, fill: COLOR_HEAD_FILL, color: "auto" } : undefined,
        children: [
          new Paragraph({
            alignment: spec.numericColumns.includes(col) ? AlignmentType.RIGHT : AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [run(text, { size: 19, bold: header })],
          }),
        ],
      });
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: spec.columns.map((c, i) => cell(c, i, true)) }),
        ...spec.rows.map((row) => new TableRow({ cantSplit: true, children: row.map((c, i) => cell(c, i, false)) })),
      ],
    });
  };

  const body: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  body.push(
    new Paragraph({ spacing: { after: 60 }, children: [run(report.title, { bold: true, size: 40 })] }),
    new Paragraph({ spacing: { after: 40 }, children: [run(report.periodLabel, { size: 26, color: COLOR_MUTED })] }),
    new Paragraph({ spacing: { after: 40 }, children: [run(`Reporting period: ${report.range}`, { size: 20 })] }),
    new Paragraph({
      spacing: { after: 40 },
      children: [run(`Compared with: ${report.previousRange} (${report.comparisonLabel})`, { size: 20 })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [run(`Generated ${report.generatedAt.slice(0, 16).replace("T", " ")} UTC. Money is in VND.`, { size: 18, color: COLOR_MUTED })],
    }),
  );

  if (report.summary.length) {
    body.push(heading("Summary", 1));
    for (const line of report.summary) {
      body.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [run(line)] }));
    }
  }

  for (const section of report.sections) {
    body.push(heading(section.title, 1));
    for (const chart of section.charts) {
      const image = images[chart.id];
      if (!image) continue;
      body.push(
        heading(chart.title, 2),
        new Paragraph({
          keepNext: Boolean(chart.note),
          spacing: { after: 60 },
          children: [
            new ImageRun({
              type: "png",
              data: image.data,
              transformation: { width: IMAGE_WIDTH, height: Math.round((IMAGE_WIDTH * image.height) / image.width) },
              altText: { title: chart.title, description: `${chart.title}: ${chart.points.length} data points`, name: chart.id },
            }),
          ],
        }),
      );
      if (chart.note) body.push(note(chart.note));
    }
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
    title: report.title,
    description: `${report.periodLabel} (${report.range})`,
    creator: "WarpTalk",
    styles: { default: { document: { run: { font: FONT, size: 22, color: COLOR_BODY }, paragraph: { spacing: { after: 120, line: 276 } } } } },
    sections: [
      {
        properties: { page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run(`${report.title} · ${report.range} — Page `, { size: 18, color: COLOR_MUTED }),
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
