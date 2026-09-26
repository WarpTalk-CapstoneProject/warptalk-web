import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptDocumentModel,
  type TranscriptDocumentSegment,
} from "../transcript-document-model.ts";
import type {
  TranscriptDocumentDivider,
  TranscriptDocumentTurn,
} from "../record-documents.ts";

const meta = { meetingTitle: "Sprint review", startedAt: "2026-09-18T09:00:00Z" };

function segment(
  id: string,
  startTimeMs: number,
  overrides: Partial<TranscriptDocumentSegment> = {},
): TranscriptDocumentSegment {
  return {
    id,
    originalText: `line ${id}`,
    originalLanguage: "vi",
    startTimeMs,
    endTimeMs: startTimeMs + 2000,
    speakerName: "Nhi",
    speakerParticipantId: "u1",
    ...overrides,
  };
}

const turns = (model: { entries: readonly { kind: string }[] }) =>
  model.entries.filter((entry): entry is TranscriptDocumentTurn => entry.kind === "turn");
const dividers = (model: { entries: readonly { kind: string }[] }) =>
  model.entries.filter((entry): entry is TranscriptDocumentDivider => entry.kind === "divider");

test("consecutive lines from one speaker are one turn, timed from the meeting start", () => {
  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [{ sessionNumber: 1, segments: [segment("a", 72_000), segment("b", 78_000)] }],
    translationIndex: {},
    displayLanguage: "as-spoken",
  });

  assert.equal(turns(model).length, 1);
  const [turn] = turns(model);
  assert.equal(turn.speakerName, "Nhi");
  assert.equal(turn.elapsed, "1:12");
  assert.equal(turn.clock, null);
  assert.deepEqual(
    turn.lines.map((line) => line.text),
    ["line a", "line b"],
  );
});

test("a new speaker starts a new turn, and the clock comes from the caller", () => {
  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [
      {
        sessionNumber: 1,
        segments: [
          segment("a", 0),
          segment("b", 5000, { speakerName: "Tú", speakerParticipantId: "u2" }),
        ],
      },
    ],
    translationIndex: {},
    displayLanguage: "as-spoken",
    formatClock: (startTimeMs) => (startTimeMs === 0 ? "09:00" : "09:05"),
  });

  assert.deepEqual(
    turns(model).map((turn) => [turn.speakerName, turn.clock]),
    [
      ["Nhi", "09:00"],
      ["Tú", "09:05"],
    ],
  );
});

test("the language chip prints where the answer changes, not on every line", () => {
  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [
      {
        sessionNumber: 1,
        segments: [
          segment("a", 0),
          segment("b", 5000),
          segment("c", 10_000, { originalLanguage: "en" }),
        ],
      },
    ],
    translationIndex: {},
    displayLanguage: "as-spoken",
  });

  assert.deepEqual(
    turns(model).flatMap((turn) => turn.lines.map((line) => line.languageTag)),
    ["VI", null, "EN"],
  );
});

test("a line the reader's language never covered keeps its warning chip every time", () => {
  // Two untranslated lines in a row: the second chip is not repetition, it is the gap continuing.
  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [{ sessionNumber: 1, segments: [segment("a", 0), segment("b", 5000)] }],
    translationIndex: {},
    displayLanguage: "ja",
  });

  assert.deepEqual(
    turns(model).flatMap((turn) => turn.lines.map((line) => line.languageTag)),
    ["VI", "VI"],
  );
});

test("the words handed over are the ones on screen, in the language being read", () => {
  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [{ sessionNumber: 1, segments: [segment("a", 0)] }],
    translationIndex: { a: { ja: "こんにちは" } },
    displayLanguage: "ja",
  });

  assert.deepEqual(turns(model)[0].lines, [{ text: "こんにちは", languageTag: "VI" }]);
});

test("a pause in the record becomes a divider where the screen draws one", () => {
  const gap = {
    window: {
      id: "w1",
      translationRoomId: "r1",
      startedAt: "2026-09-18T09:10:00Z",
      endedAt: "2026-09-18T09:14:00Z",
    },
    startMs: 600_000,
    endMs: 840_000,
  };

  const model = buildTranscriptDocumentModel({
    meta,
    blocks: [{ sessionNumber: 1, segments: [segment("a", 0), segment("b", 900_000)] }],
    gapsPerBlock: [[gap]],
    translationIndex: {},
    displayLanguage: "as-spoken",
    meetingEnded: true,
  });

  const [divider] = dividers(model);
  assert.ok(divider, "the pause must be announced");
  assert.match(divider.label, /^Transcript paused at .+ and resumed at .+$/);
  // And it sits between the two turns, not at either end of the document.
  assert.deepEqual(
    model.entries.map((entry) => entry.kind),
    ["turn", "divider", "turn"],
  );
});

test("session dividers appear only when there is more than one session", () => {
  const label = (block: { sessionNumber: number }) => `Translation ${block.sessionNumber}`;

  const one = buildTranscriptDocumentModel({
    meta,
    blocks: [{ sessionNumber: 1, segments: [segment("a", 0)] }],
    translationIndex: {},
    displayLanguage: "as-spoken",
    sessionDividerLabel: label,
  });
  assert.deepEqual(dividers(one), []);

  const two = buildTranscriptDocumentModel({
    meta,
    blocks: [
      { sessionNumber: 1, segments: [segment("a", 0)] },
      { sessionNumber: 2, segments: [segment("b", 60_000)] },
    ],
    translationIndex: {},
    displayLanguage: "as-spoken",
    sessionDividerLabel: label,
  });
  assert.deepEqual(
    dividers(two).map((divider) => divider.label),
    ["Translation 1", "Translation 2"],
  );
});

test("the meta is carried through untouched — the file name is built from it", () => {
  const model = buildTranscriptDocumentModel({
    meta: { ...meta, languageLabel: "Japanese", durationLabel: "42m" },
    blocks: [],
    translationIndex: {},
    displayLanguage: "ja",
  });

  assert.equal(model.meta.meetingTitle, "Sprint review");
  assert.equal(model.meta.languageLabel, "Japanese");
  assert.equal(model.meta.durationLabel, "42m");
  assert.deepEqual(model.entries, []);
});
