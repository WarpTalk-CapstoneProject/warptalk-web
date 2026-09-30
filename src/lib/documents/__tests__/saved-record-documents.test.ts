import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSavedTranscriptBody,
  plainSummaryText,
  savedSummaryDocumentModel,
  savedTranscriptDocumentModel,
} from "../saved-record-documents.ts";
import type { TranscriptDocumentTurn } from "../record-documents.ts";

const meta = { meetingTitle: "Nhi5", startedAt: "2026-09-28T07:00:00Z" };

const EXPORT = [
  "# WarpTalk Transcription Room 1b2c3d4e-0000-0000-0000-000000000000",
  "Generated on: 2026-09-28 07:30:00",
  "---",
  "**[Ngô Xuân Hạnh Nhi (VI)]**: Mình bắt đầu với phần demo luồng booking.",
  "**[Ngô Xuân Hạnh Nhi (VI)]**: Link mời đã gửi qua email.",
  "**[System]**: __MEETING_END__",
  "**[Huỳnh Thái Tú (EN)]**: Did the invite go out?",
].join("\n");

test("the export header and control markers are not part of the transcript", () => {
  const turns = parseSavedTranscriptBody(EXPORT);
  assert.deepEqual(
    turns.map((turn) => turn.speakerName),
    ["Ngô Xuân Hạnh Nhi", "Huỳnh Thái Tú"],
  );
  assert.deepEqual(turns[0].paragraphs, [
    "Mình bắt đầu với phần demo luồng booking.",
    "Link mời đã gửi qua email.",
  ]);
});

test("the saved transcript becomes the Word model, with a language tag only where it changes", () => {
  const model = savedTranscriptDocumentModel(meta, EXPORT);
  const turns = model.entries.filter((entry): entry is TranscriptDocumentTurn => entry.kind === "turn");
  assert.equal(turns.length, 2);
  assert.equal(turns[0].lines[0].languageTag, null);
  assert.equal(turns[1].lines[0].languageTag, "EN");
  assert.equal(model.meta, meta);
});

test("an explicit [m:ss] in the export is kept as the turn's time", () => {
  const model = savedTranscriptDocumentModel(meta, "[1:12] **[Kỳ (VI)]**: Chốt ngày phát hành.");
  const turn = model.entries[0] as TranscriptDocumentTurn;
  assert.equal(turn.elapsed, "1:12");
  assert.equal(turn.lines[0].text, "Chốt ngày phát hành.");
});

test("an empty body is a document with no turns, not an error", () => {
  assert.deepEqual(savedTranscriptDocumentModel(meta, "").entries, []);
  assert.deepEqual(savedTranscriptDocumentModel(meta, null).entries, []);
});

test("a structured summary goes through the Recap's summary model", () => {
  const model = savedSummaryDocumentModel(
    meta,
    {
      summary: "Calendar ships Friday.",
      sections: [
        { key: "decisions", title: "Decisions", items: [{ text: "Keep +N more", atMs: 49_000, alsoAtMs: [] }] },
      ],
    },
    "{…}",
  );
  assert.equal(model.overview, "Calendar ships Friday.");
  assert.deepEqual(model.sections[0].items[0].citations, ["0:49"]);
});

test("a legacy markdown summary becomes the overview, without the markdown marks", () => {
  const model = savedSummaryDocumentModel(meta, undefined, "## Overview\n\n**Calendar** ships `Friday`.\n- one");
  assert.equal(model.overview, "Overview\n\nCalendar ships Friday.\n• one");
  assert.deepEqual(model.sections, []);
});

test("plainSummaryText keeps link text and drops the url", () => {
  assert.equal(plainSummaryText("See [the notes](https://example.com)."), "See the notes.");
});
