import test from "node:test";
import assert from "node:assert/strict";

import { buildInsightsReportDocx } from "../insights-report-docx.ts";
import { buildInsightsReport } from "../insights-report.ts";

test("the report renders to a real .docx (zip) whose document.xml carries the sections", async () => {
  const report = buildInsightsReport(
    {},
    {
      label: "Sep 2026",
      compare: "previous",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
      previousFrom: new Date(2026, 7, 2),
      previousTo: new Date(2026, 8, 1),
    },
  );
  const blob = await buildInsightsReportDocx(report);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(xml.includes("WarpTalk Insights report"));
  assert.ok(xml.includes("Reporting period: 2026-09-01 to 2026-09-30"));
  assert.ok(xml.includes("Notes"), "the unavailable-source notes are printed");
});
