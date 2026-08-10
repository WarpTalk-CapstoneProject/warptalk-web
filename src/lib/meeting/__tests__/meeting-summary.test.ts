import test from "node:test";
import assert from "node:assert/strict";

import {
  findSegmentAtMs,
  formatCitationTime,
  parseSummarySections,
  sectionTitle,
} from "../meeting-summary.ts";

test("a summary written before citations existed still renders", () => {
  // Production storage is full of these. Nothing can backfill them — the citation was never
  // recorded — so this shape has to stay readable indefinitely.
  const sections = parseSummarySections({
    summary: "We talked about pricing.",
    decisions: ["Cap the room limit at 500"],
    actionItems: [{ owner: "Tu", task: "Draft the pricing page" }],
  });

  assert.deepEqual(sections.map((s) => s.key), ["decisions", "actionItems"]);
  assert.deepEqual(sections[0].items, [{ text: "Cap the room limit at 500", atMs: null }]);
  assert.deepEqual(sections[1].items, [
    { text: "Draft the pricing page", owner: "Tu", atMs: null },
  ]);
});

test("a cited item keeps the moment it came from", () => {
  const sections = parseSummarySections({
    decisions: [{ text: "Cap it at 500", atMs: 90210 }],
  });
  assert.deepEqual(sections[0].items, [{ text: "Cap it at 500", atMs: 90210 }]);
});

test("template sections nobody hardcoded are picked up", () => {
  const sections = parseSummarySections({
    summary: "Standup.",
    blockers: [{ text: "Waiting on the API key", atMs: 12000 }],
    plans: [{ text: "Finish the migration", atMs: 3000 }],
  });
  assert.deepEqual(sections.map((s) => s.title), ["Blockers", "Plans"]);
});

test("empty sections are dropped rather than shown as a heading over nothing", () => {
  // Every template declares every section it *could* produce, so most meetings leave
  // several of them empty.
  const sections = parseSummarySections({ decisions: [], openQuestions: ["Who owns billing?"] });
  assert.deepEqual(sections.map((s) => s.key), ["openQuestions"]);
});

test("bookkeeping keys are never mistaken for sections", () => {
  const sections = parseSummarySections({
    summary: "x",
    citations: [{ key: "summary", atMs: 10 }],
    templateKey: "standup",
    insufficientData: false,
    translations: {},
    decisions: ["real"],
  });
  assert.deepEqual(sections.map((s) => s.key), ["decisions"]);
});

test("an item with no text is discarded, cited or not", () => {
  const sections = parseSummarySections({
    decisions: ["", "   ", { text: "", atMs: 5 }, { atMs: 9 }, { text: "kept", atMs: 1 }],
  });
  assert.deepEqual(sections[0].items, [{ text: "kept", atMs: 1 }]);
});

test("a nonsense atMs degrades to uncited instead of breaking the row", () => {
  const sections = parseSummarySections({
    decisions: [
      { text: "a", atMs: -1 },
      { text: "b", atMs: "not a number" },
      { text: "c", atMs: null },
      { text: "d", atMs: "4200" },
    ],
  });
  assert.deepEqual(
    sections[0].items.map((i) => i.atMs),
    [null, null, null, 4200],
  );
});

test("a citation resolves to the segment that was being spoken, not the next one", () => {
  const segments = [{ startTimeMs: 0 }, { startTimeMs: 5000 }, { startTimeMs: 9000 }];
  // 7000 falls inside the segment that started at 5000. Jumping to 9000 would land the
  // reader after the evidence they came to check.
  assert.deepEqual(findSegmentAtMs(segments, 7000), { startTimeMs: 5000 });
  assert.deepEqual(findSegmentAtMs(segments, 5000), { startTimeMs: 5000 });
});

test("a citation before every segment still lands somewhere", () => {
  const segments = [{ startTimeMs: 8000 }, { startTimeMs: 12000 }];
  assert.deepEqual(findSegmentAtMs(segments, 100), { startTimeMs: 8000 });
});

test("no citation and no segments resolve to nothing rather than guessing", () => {
  assert.equal(findSegmentAtMs([{ startTimeMs: 0 }], null), null);
  assert.equal(findSegmentAtMs([], 500), null);
  assert.equal(findSegmentAtMs([{ startTimeMs: null }], 500), null);
});

test("an unknown section key still gets a readable heading", () => {
  // The templates live in the AI service, so this map will fall behind one day. When it
  // does, a new section must look plain rather than broken.
  assert.equal(sectionTitle("riskRegister"), "Risk register");
  assert.equal(sectionTitle("follow_ups"), "Follow ups");
  assert.equal(sectionTitle("decisions"), "Decisions");
});

test("citation times read as minutes and seconds", () => {
  assert.equal(formatCitationTime(0), "0:00");
  assert.equal(formatCitationTime(9_000), "0:09");
  assert.equal(formatCitationTime(90_210), "1:30");
  assert.equal(formatCitationTime(3_600_000), "60:00");
});
