/**
 * WT-699 (Artifacts page): the card preview printed the transcript export's raw markdown — a
 * room-UUID header, "Generated on", a rule, bracketed speaker markers and `__MEETING_END__`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { artifactPreviewMarkdown } from "../artifact-preview.ts";

const EXPORT = [
  "# WarpTalk Transcription Room - Room: 01a0a94a-2fb2-7f2d-95f5-79cf2a9246af",
  "Generated on: 2026-09-16 08:40:12 UTC",
  "---",
  "**[Huỳnh Thái Tú (VI)]**: Xin chào mọi người.",
  "**[System (SYSTEM)]**: __MEETING_END__",
  "**[Ngọc Kỳ (EN)]**: Hello everyone.",
  "__MEETING_END__",
].join("\n");

test("the preview starts at the content, not at the export header", () => {
  const preview = artifactPreviewMarkdown(EXPORT);
  assert.ok(preview.startsWith("**Huỳnh Thái Tú:** Xin chào"), preview);
  assert.ok(!preview.includes("WarpTalk Transcription Room"));
  assert.ok(!preview.includes("Generated on"));
  assert.ok(!preview.includes("01a0a94a"));
  assert.ok(!/^---$/m.test(preview));
});

test("speaker markers become bold names, one paragraph per line", () => {
  assert.equal(
    artifactPreviewMarkdown(EXPORT),
    "**Huỳnh Thái Tú:** Xin chào mọi người.\n\n**Ngọc Kỳ:** Hello everyone.",
  );
});

test("the pipeline's sentinel and System lines never reach a reader", () => {
  const preview = artifactPreviewMarkdown(EXPORT);
  assert.ok(!preview.includes("__MEETING_END__"));
  assert.ok(!preview.includes("System"));
  // A mangled sentinel (production holds `__MEETING_END__a`) is still a sentinel.
  assert.equal(artifactPreviewMarkdown("**[Nhi (VI)]**: __MEETING_END__a"), "");
});

test("a transcript with nothing but furniture previews as nothing", () => {
  assert.equal(
    artifactPreviewMarkdown(
      "# WarpTalk Transcription Room - Room: x\nGenerated on: now\n---\n__MEETING_END__",
    ),
    "",
  );
  assert.equal(artifactPreviewMarkdown(null), "");
});

test("a summary or minutes body passes through, and a later rule is left alone", () => {
  const body = "The team agreed to ship.\n\nDecisions\n• Ship Friday\n---\nNotes";
  assert.equal(
    artifactPreviewMarkdown(body),
    "The team agreed to ship.\n\nDecisions\n\n• Ship Friday\n\n---\n\nNotes",
  );
});

test("the budget cuts on whole lines, and a long first line on a word with bold closed", () => {
  const lines = Array.from({ length: 40 }, (_, index) => `**[A (EN)]**: line number ${index}`);
  const preview = artifactPreviewMarkdown(lines.join("\n"), 100);
  assert.ok(preview.length <= 120, preview);
  assert.ok(preview.split("\n\n").every((line) => line.startsWith("**A:** line number")));

  const long = `**[A (EN)]**: ${"word ".repeat(60)}`;
  const cut = artifactPreviewMarkdown(long, 40);
  assert.ok(cut.endsWith("…"));
  assert.equal((cut.match(/\*\*/g) ?? []).length % 2, 0);

  const openBold = artifactPreviewMarkdown(`**${"bold ".repeat(40)}**`, 30);
  assert.equal((openBold.match(/\*\*/g) ?? []).length % 2, 0, openBold);
});
