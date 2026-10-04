import test from "node:test";
import assert from "node:assert/strict";

import { buildInsightsReportDocx } from "../insights-report-docx.ts";
import { buildInsightsReport } from "../insights-report.ts";
import type { InsightsMetric, MeetingsInsightsDto } from "../../../types/admin-insights.ts";

const basePeriod = {
  label: "Sep 2026",
  compare: "previous" as const,
  customFrom: "2026-09-01",
  customTo: "2026-09-30",
  previousFrom: new Date(2026, 7, 2),
  previousTo: new Date(2026, 8, 1),
};

async function readDocx(blob: Blob): Promise<{ xml: string; names: string[]; all: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  // Every XML part: body, header, footer, properties. A stray word can hide in any of them.
  const parts = await Promise.all(names.filter((name) => /\.(xml|rels)$/.test(name)).map((name) => zip.file(name)!.async("string")));
  // Text only: tags and their attributes go, or each part's own "application/vnd.…" type would match.
  const all = parts.join("\n").replace(/<[^>]+>/g, " ");
  return { xml: await zip.file("word/document.xml")!.async("string"), names, all };
}

test("the report renders to a real .docx (zip) whose document.xml carries the sections", async () => {
  const report = buildInsightsReport({}, basePeriod);
  const { xml } = await readDocx(await buildInsightsReportDocx(report));
  assert.ok(xml.includes("WarpTalk Insights Report"), "the title");
  assert.ok(xml.includes("1–30 September 2026"), "the period in words, under the title");
  assert.ok(xml.includes("Reporting period: 2026-09-01 to 2026-09-30 (30 days)"));
  assert.ok(xml.includes("Compared with: 2026-08-02 to 2026-08-31"));
  assert.ok(xml.includes("Notes"), "the unavailable-source notes are printed");
});

const metric = (
  id: string,
  value: number,
  previous: number,
  unit: InsightsMetric["unit"],
  higherIsBetter: boolean,
): InsightsMetric => ({ id, value, previous, unit, higherIsBetter, note: null });

test("the document carries the classification, time zone, warning, difference column and definitions", async () => {
  const meetings: MeetingsInsightsDto = {
    range: { from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" },
    previousRange: { from: "2026-08-01T00:00:00Z", to: "2026-08-30T00:00:00Z" },
    metrics: [metric("meetingsHeld", 10, 20, "count", true), metric("hoursTranslated", 4, 8, "hours", true)],
    meetingsByDay: [],
    liveNow: 0,
    startedToday: 0,
  } as unknown as MeetingsInsightsDto;
  const report = buildInsightsReport(
    { meetings },
    { ...basePeriod, from: new Date(2026, 8, 1), to: new Date(2026, 8, 10), closed: false, axisEndDay: "2026-10-01" },
    new Date(2026, 8, 10),
    { timeZone: "Asia/Ho_Chi_Minh", classification: "internal" },
  );
  const { xml, names, all } = await readDocx(await buildInsightsReportDocx(report));
  assert.ok(xml.includes("INTERNAL — for WarpTalk staff"), "classification line under the title");
  assert.ok(xml.includes("Time zone: Asia/Ho_Chi_Minh (UTC+07:00)"));
  assert.ok(xml.includes("Period not closed."));
  assert.ok(xml.includes("Difference"));
  assert.ok(xml.includes("-10"), "the absolute change is printed");
  assert.ok(xml.includes("▼ 50.0% · worse"));
  assert.ok(xml.includes("B42318"), "a bad move is coloured");
  assert.ok(xml.includes("How each figure is calculated"));
  assert.ok(xml.includes("All amounts are in US dollars (USD)."));
  assert.doesNotMatch(all, /VND|₫/i, "no part of the file names a second currency");
  assert.ok(!names.some((name) => name.startsWith("word/media/")), "no chart images");
  assert.ok(all.includes("INTERNAL · WarpTalk Insights Report — 1–30 September 2026 · Page "), "footer carries the title and period");
  assert.ok(names.some((name) => name.startsWith("word/header")), "classification repeats in the page header");
});
