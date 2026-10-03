/**
 * WT-880 — writing the import template to a file the user downloads.
 *
 * XLSX: a group band row (Source · English | Target · Vietnamese | General), the header row, and
 * ONE faint sample row (grey italic) — no "Guide" sheet. The importer skips that row: by its style
 * when the file comes back as .xlsx, and by its values (the configured sample / a `<…>`
 * placeholder) when it comes back as .csv or was retyped. The band row sits above the header,
 * which the importer's header search (first 10 rows) steps over.
 *
 * CSV: header + sample row only, with a BOM — Excel opens a UTF-8 CSV without one as
 * Windows-1252 and mangles every non-ASCII term, which for a glossary is most of them.
 */

import ExcelJS from "exceljs";

import {
  importTemplateCsv,
  importTemplateFileName,
  type ImportTemplateGroup,
  type ImportTemplateLayout,
} from "./import-template";

/** ARGB of the sample row's font. The importer recognises the row by this plus italics. */
export const SAMPLE_ROW_FONT_ARGB = "FF9CA3AF";

const BAND_FILL: Record<ImportTemplateGroup, string> = {
  source: "FFE0E7FF",
  target: "FFDCFCE7",
  general: "FFF3F4F6",
};

export type BandLabeler = (group: ImportTemplateGroup, language: string) => string;

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function buildImportTemplateWorkbook(
  layout: ImportTemplateLayout,
  bandLabel: BandLabeler,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WarpTalk";
  const sheet = workbook.addWorksheet("Glossary");

  const bandRow = sheet.addRow(
    layout.bands.flatMap((band) => [bandLabel(band.group, band.language), ...Array(band.span - 1).fill("")]),
  );
  let column = 1;
  for (const band of layout.bands) {
    if (band.span > 1) sheet.mergeCells(1, column, 1, column + band.span - 1);
    const cell = bandRow.getCell(column);
    cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    cell.alignment = { horizontal: "center" };
    for (let offset = 0; offset < band.span; offset += 1) {
      bandRow.getCell(column + offset).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BAND_FILL[band.group] },
      };
    }
    column += band.span;
  }

  const headerRow = sheet.addRow(layout.header);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });

  const sampleRow = sheet.addRow(layout.sample);
  for (let index = 1; index <= layout.sample.length; index += 1) {
    sampleRow.getCell(index).font = { italic: true, color: { argb: SAMPLE_ROW_FONT_ARGB } };
  }

  layout.header.forEach((header, index) => {
    const widest = Math.max(header.length, layout.sample[index]?.length ?? 0);
    sheet.getColumn(index + 1).width = Math.min(Math.max(widest + 2, 12), 48);
  });
  sheet.views = [{ state: "frozen", ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function downloadImportTemplateXlsx(layout: ImportTemplateLayout, bandLabel: BandLabeler) {
  saveBlob(await buildImportTemplateWorkbook(layout, bandLabel), importTemplateFileName(layout, "xlsx"));
}

export function downloadImportTemplateCsv(layout: ImportTemplateLayout) {
  saveBlob(
    new Blob(["﻿" + importTemplateCsv(layout)], { type: "text/csv;charset=utf-8" }),
    importTemplateFileName(layout, "csv"),
  );
}

/** Whether an ExcelJS cell carries the template's sample-row style. */
export function isSampleStyledCell(cell: { font?: Partial<ExcelJS.Font> } | undefined): boolean {
  const font = cell?.font;
  return Boolean(font?.italic && font.color && "argb" in font.color && font.color.argb === SAMPLE_ROW_FONT_ARGB);
}
