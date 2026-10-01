/**
 * Marks on the recording are the summary's points, placed where a click on them lands.
 *
 * The failure that matters is the same one recording-seek.test.ts guards against: a mark that
 * seeks to the WRONG place is worse than no mark, because clicking it looks like it worked. The
 * other one is noise — a mark per sentence or per turn is what this replaced.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSummaryMarks,
  clusterMarks,
  markKindForSection,
  type MarkablePoint,
  type RecordingMark,
} from "../recording-marks.ts";

// The host started recording 30 seconds before the first word was transcribed.
const SOURCES = {
  timelineAnchorAt: "2026-08-20T10:00:30Z",
  recordingStartedAt: "2026-08-20T10:00:00Z",
};

const SEGMENTS = [
  { startTimeMs: 0 },
  { startTimeMs: 10_000 },
  { startTimeMs: 20_000 },
  { startTimeMs: 45_000 },
];

function point(overrides: Partial<MarkablePoint> & { atMs: number | null }): MarkablePoint {
  return {
    key: `decisions-${overrides.atMs}`,
    sectionKey: "decisions",
    section: "Decisions",
    text: "Ship on Friday",
    ...overrides,
  };
}

test("one mark per point with a moment, typed by its section", () => {
  const marks = buildSummaryMarks(
    [
      point({ key: "decisions-0", atMs: 10_000 }),
      point({ key: "actionItems-0", sectionKey: "actionItems", section: "Action items", atMs: 20_000 }),
      point({ key: "openQuestions-0", sectionKey: "openQuestions", section: "Open questions", atMs: 45_000 }),
    ],
    SEGMENTS,
    SOURCES,
  );

  assert.deepEqual(
    marks.map((mark) => [mark.key, mark.kind, mark.seconds]),
    [
      ["decisions-0", "decision", 40],
      ["actionItems-0", "action", 50],
      ["openQuestions-0", "question", 75],
    ],
  );
});

test("a point with no moment gets no mark", () => {
  assert.deepEqual(buildSummaryMarks([point({ atMs: null })], SEGMENTS, SOURCES), []);
});

test("the mark sits on the row the jump lands on, not on the raw moment", () => {
  // 13.4 s is inside the row that starts at 10 s; the jump seeks to 10 s, so the mark must too.
  const [mark] = buildSummaryMarks([point({ atMs: 13_400 })], SEGMENTS, SOURCES);

  assert.equal(mark?.seconds, 40);
  // The moment handed to the jump is the point's own, unchanged.
  assert.equal(mark?.atMs, 13_400);
});

test("a point resting on several moments is marked at the earliest row, as the jump seeks", () => {
  const [mark] = buildSummaryMarks(
    [point({ sectionKey: "narrative", atMs: 45_000, alsoAtMs: [20_000] })],
    SEGMENTS,
    SOURCES,
  );

  assert.equal(mark?.kind, "narrative");
  assert.equal(mark?.seconds, 50);
  assert.deepEqual(mark?.alsoAtMs, [20_000]);
});

test("a point spoken before the host pressed record is dropped, not clamped to 0:00", () => {
  const transcriptFirst = {
    timelineAnchorAt: "2026-08-20T10:00:00Z",
    recordingStartedAt: "2026-08-20T10:00:30Z",
  };

  const marks = buildSummaryMarks(
    [point({ atMs: 10_000 }), point({ atMs: 45_000 })],
    SEGMENTS,
    transcriptFirst,
  );

  assert.deepEqual(marks.map((mark) => mark.seconds), [15]);
});

test("a point past the end of a recording that stopped early is dropped", () => {
  const marks = buildSummaryMarks(
    [point({ atMs: 20_000 }), point({ atMs: 45_000 })],
    SEGMENTS,
    { ...SOURCES, durationSeconds: 60 },
  );

  assert.deepEqual(marks.map((mark) => mark.seconds), [50]);
});

test("an unaligned meeting, or a meeting with no transcript rows, yields no marks", () => {
  const points = [point({ atMs: 10_000 })];

  assert.deepEqual(
    buildSummaryMarks(points, SEGMENTS, { timelineAnchorAt: null, recordingStartedAt: "2026-08-20T10:00:00Z" }),
    [],
  );
  assert.deepEqual(buildSummaryMarks(points, [], SOURCES), []);
});

test("marks come out in recording order whatever order the summary lists them in", () => {
  const marks = buildSummaryMarks(
    [point({ key: "late", atMs: 45_000 }), point({ key: "early", atMs: 0 })],
    SEGMENTS,
    SOURCES,
  );

  assert.deepEqual(marks.map((mark) => mark.key), ["early", "late"]);
});

test("unknown template sections are plain points; known ones keep their kind", () => {
  assert.equal(markKindForSection("blockers"), "question");
  assert.equal(markKindForSection("action_items"), "action");
  assert.equal(markKindForSection("strengths"), "point");
});

function mark(seconds: number, key = String(seconds)): RecordingMark {
  return { key, kind: "decision", section: "Decisions", text: key, atMs: 0, alsoAtMs: [], seconds };
}

test("marks closer than 1.5% of the recording share one dot; nothing is dropped", () => {
  // 1000 s recording: the window is 15 s.
  const clusters = clusterMarks([mark(100), mark(110), mark(114), mark(300)], 1000);

  assert.deepEqual(
    clusters.map((cluster) => [cluster.seconds, cluster.marks.map((m) => m.seconds)]),
    [
      [100, [100, 110, 114]],
      [300, [300]],
    ],
  );
});

test("a long run of evenly spaced marks does not chain into one cluster", () => {
  // Each 10 s apart, window 15 s: measured from each cluster's FIRST mark, so 100/110 pair up and
  // 120 starts the next one.
  const clusters = clusterMarks([mark(100), mark(110), mark(120), mark(130)], 1000);

  assert.deepEqual(clusters.map((cluster) => cluster.marks.length), [2, 2]);
});

test("no duration yet is no clusters", () => {
  assert.deepEqual(clusterMarks([mark(10)], 0), []);
  assert.deepEqual(clusterMarks([mark(10)], Number.NaN), []);
});
