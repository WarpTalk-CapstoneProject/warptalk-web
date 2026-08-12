import type { Workbook } from "exceljs";

export async function createExcelWorkbook(): Promise<Workbook> {
  const ExcelJS = await import("exceljs");
  return new ExcelJS.Workbook();
}
