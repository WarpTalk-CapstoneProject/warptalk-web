import assert from "node:assert/strict";
import test from "node:test";

import {
  PERSONAL_RENDERING_NOTE,
  documentCoreTitle,
  documentTitle,
  footerTextParts,
  formatMeetingDate,
  kindLabel,
  languageTagSuffix,
  recordHeaderRows,
  turnTimeLabel,
} from "../record-document-layout.ts";
import { transcriptPlainText } from "../transcript-docx.ts";
import type {
  RecordDocumentMeta,
  TranscriptDocumentModel,
} from "../record-documents.ts";

const META: RecordDocumentMeta = {
  meetingTitle: "Họp sprint 42",
  startedAt: "2026-09-18T02:30:00Z",
  durationLabel: "42m",
  hostName: "Ngọc Kỳ",
  participants: ["Ngọc Kỳ", "Tú Huỳnh"],
  languageLabel: "English",
  workspaceName: "Bigin",
};

/** UTC+07:00, pinned so the row reads the same in CI as it does in Hồ Chí Minh City. */
const SAIGON = 7 * 60;

test("the date carries the offset it was read in", () => {
  assert.equal(formatMeetingDate("2026-09-18T02:30:00Z", SAIGON), "2026-09-18 09:30 (UTC+07:00)");
});

test("a zone west of UTC, and one that is not a whole hour", () => {
  assert.equal(formatMeetingDate("2026-09-18T02:30:00Z", -5 * 60), "2026-09-17 21:30 (UTC-05:00)");
  assert.equal(formatMeetingDate("2026-09-18T02:30:00Z", 5 * 60 + 45), "2026-09-18 08:15 (UTC+05:45)");
});

test("UTC itself is still written out", () => {
  // Silence would be read as "the zone the reader is in", which is the confusion the row exists
  // to remove.
  assert.equal(formatMeetingDate("2026-09-18T02:30:00Z", 0), "2026-09-18 02:30 (UTC+00:00)");
});

test("a meeting with no start on record has no date row", () => {
  assert.equal(formatMeetingDate(null), null);
  assert.equal(formatMeetingDate(undefined), null);
  assert.equal(formatMeetingDate("not a date"), null);
});

test("header rows read in order, and the transcript has no template", () => {
  assert.deepEqual(recordHeaderRows(META, { offsetMinutes: SAIGON }), [
    { label: "Date", value: "2026-09-18 09:30 (UTC+07:00)" },
    { label: "Duration", value: "42m" },
    { label: "Host", value: "Ngọc Kỳ" },
    { label: "Participants", value: "Ngọc Kỳ, Tú Huỳnh" },
    { label: "Language", value: "English" },
    { label: "Workspace", value: "Bigin" },
  ]);
});

test("the summary's template sits between Language and Workspace", () => {
  const rows = recordHeaderRows(META, { templateLabel: "Standup", offsetMinutes: SAIGON });
  assert.deepEqual(
    rows.map((row) => row.label),
    ["Date", "Duration", "Host", "Participants", "Language", "Template", "Workspace"],
  );
});

test("a row with nothing to say is left out, not printed empty", () => {
  const rows = recordHeaderRows(
    { meetingTitle: "Sync", startedAt: null, hostName: "   ", participants: [] },
    { templateLabel: null },
  );
  assert.deepEqual(rows, []);
});

test("blank participant names do not become stray commas", () => {
  const rows = recordHeaderRows({
    meetingTitle: "Sync",
    startedAt: null,
    participants: ["Tú", "  ", "Kỳ"],
  });
  assert.deepEqual(rows, [{ label: "Participants", value: "Tú, Kỳ" }]);
});

test("an untitled meeting still has a title everywhere one is required", () => {
  const untitled: RecordDocumentMeta = { meetingTitle: "   ", startedAt: null };
  assert.equal(documentTitle(untitled), "Meeting");
  assert.equal(documentCoreTitle(untitled, "Summary"), "Meeting - Summary");
});

test("the core title names the meeting and what the file is", () => {
  assert.equal(documentCoreTitle(META, "Transcript"), "Họp sprint 42 - Transcript");
});

test("the kind label is upper-cased in the text, not by a Word caps flag", () => {
  assert.equal(kindLabel("Transcript"), "TRANSCRIPT");
  assert.equal(kindLabel("Summary"), "SUMMARY");
});

test("the footer surrounds the two page fields and names no product", () => {
  const { before, between } = footerTextParts(META, "Transcript");
  assert.equal(before, "Họp sprint 42 · Transcript — Page ");
  assert.equal(between, " of ");
  assert.ok(!`${before}${between}`.includes("WarpTalk"));
});

test("the personal-rendering note says the published summary is untouched", () => {
  assert.equal(
    PERSONAL_RENDERING_NOTE,
    "Your own version of this meeting. What the host published is unchanged.",
  );
});

test("a language tag is upper-cased and bracketed; nothing means nothing", () => {
  assert.equal(languageTagSuffix("ja"), " [JA]");
  assert.equal(languageTagSuffix("JA"), " [JA]");
  assert.equal(languageTagSuffix(null), "");
  assert.equal(languageTagSuffix("  "), "");
});

test("the wall clock is dropped rather than shown empty", () => {
  assert.equal(turnTimeLabel("1:12", "09:31"), "1:12 · 09:31");
  assert.equal(turnTimeLabel("1:12", null), "1:12");
});

const TRANSCRIPT: TranscriptDocumentModel = {
  meta: META,
  entries: [
    {
      kind: "turn",
      speakerName: "Ngọc Kỳ",
      elapsed: "0:04",
      clock: "09:30",
      lines: [{ text: "Chào cả nhà." }, { text: "みんなおはよう", languageTag: "ja" }],
    },
    { kind: "divider", label: "Transcript paused · 09:40 – 09:44" },
    {
      kind: "turn",
      speakerName: "Tú Huỳnh",
      elapsed: "14:02",
      clock: null,
      lines: [{ text: "Back." }],
    },
  ],
};

test("the plain text keeps turns apart and leads each with its moment", () => {
  const text = transcriptPlainText(TRANSCRIPT);
  assert.equal(
    text,
    [
      "Họp sprint 42 — Transcript",
      `${formatMeetingDate(META.startedAt)} · 42m`,
      "",
      "[0:04 · 09:30] Ngọc Kỳ",
      "Chào cả nhà.",
      "みんなおはよう [JA]",
      "",
      "— Transcript paused · 09:40 – 09:44 —",
      "",
      "[14:02] Tú Huỳnh",
      "Back.",
      "",
    ].join("\n"),
  );
});

test("the plain text of a meeting with no date or duration has no empty subtitle", () => {
  const text = transcriptPlainText({
    meta: { meetingTitle: "Sync", startedAt: null },
    entries: [{ kind: "turn", speakerName: "Tú", elapsed: "0:00", clock: null, lines: [{ text: "Hi" }] }],
  });
  assert.equal(text, "Sync — Transcript\n\n[0:00] Tú\nHi\n");
});

test("a transcript with nothing in it is still a document, not an empty string", () => {
  assert.equal(
    transcriptPlainText({ meta: { meetingTitle: "Sync", startedAt: null }, entries: [] }),
    "Sync — Transcript\n",
  );
});
