import assert from "node:assert/strict";
import test from "node:test";

import { recordFileName } from "../record-file-name.ts";

test("meeting leads, kind follows, date trails", () => {
  const name = recordFileName({
    meetingTitle: "Họp sprint 42",
    kind: "Transcript",
    // Midday UTC, so the reader's own zone cannot move it to another day.
    startedAt: "2026-09-18T12:00:00Z",
    extension: "docx",
  });
  assert.equal(name, "Họp sprint 42 - Transcript - 2026-09-18.docx");
});

test("a translated reading carries its language", () => {
  const name = recordFileName({ meetingTitle: "Sync", kind: "Summary", language: "ja", extension: ".docx" });
  assert.equal(name, "Sync - Summary (JA).docx");
});

test("characters an OS refuses become one space, trailing dots go", () => {
  const name = recordFileName({ meetingTitle: 'Q3: plan / "draft"?.. ', kind: "Recording", extension: "mp4" });
  assert.equal(name, "Q3 plan draft - Recording.mp4");
});

test("an untitled meeting still gets a name", () => {
  assert.equal(recordFileName({ meetingTitle: "  ", kind: "Transcript", extension: "txt" }), "Meeting - Transcript.txt");
});

test("long titles stop at 80 characters", () => {
  const name = recordFileName({ meetingTitle: "a".repeat(200), kind: "Transcript", extension: "docx" });
  assert.equal(name, `${"a".repeat(80)} - Transcript.docx`);
});
