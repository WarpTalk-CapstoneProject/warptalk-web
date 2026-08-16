import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readSummaryArtifact } from "../artifact-content.ts";

/**
 * The exact payload production stored for room 01a0089e on 2026-08-16, escapes and all — this is
 * what the user was shown instead of a summary. Python's json.dumps defaults to ensure_ascii, so
 * the Vietnamese arrives as \u sequences; they are correct JSON and disappear the moment anything
 * parses rather than prints.
 */
const PRODUCTION_SUMMARY = JSON.stringify({
  summary: "The transcript contains no substantive meeting content.",
  decisions: [],
  actionItems: [],
  openQuestions: [],
  citations: [],
  translations: {
    en: {
      summary: "The transcript contains no substantive meeting content.",
      decisions: [],
      actionItems: [],
    },
    vi: {
      summary: "Bản chép lời không có nội dung cuộc họp đáng kể.",
      decisions: [],
      actionItems: [],
    },
  },
  templateKey: "general",
  insufficientData: false,
});

test("the production summary payload is read as a summary, not as text", () => {
  const summary = readSummaryArtifact(PRODUCTION_SUMMARY);

  assert.ok(summary, "the summary export must be recognised");
  assert.equal(
    summary.summary,
    "The transcript contains no substantive meeting content.",
  );
  assert.equal(summary.templateKey, "general");
});

test("escaped non-ASCII survives as real characters", () => {
  const summary = readSummaryArtifact(PRODUCTION_SUMMARY);

  // The whole visible defect: ả rendered literally. Parsed, it is just "ả".
  assert.equal(
    summary?.translations?.vi.summary,
    "Bản chép lời không có nội dung cuộc họp đáng kể.",
  );
  assert.ok(!JSON.stringify(summary).includes("B\\u1ea3n"));
});

test("a transcript export is not mistaken for a summary", () => {
  const transcript =
    "# WarpTalk Transcription Room - Room: 01a0089e\nGenerated on: 2026-08-16 03:37:28 UTC\n---\n**[Tu (VI)]**: xin chào";

  assert.equal(readSummaryArtifact(transcript), undefined);
});

test("valid JSON that carries no summary falls through to plain text", () => {
  // parseMeetingSummaryContent answers "is this JSON", which is the weaker question. Without the
  // extra gate these would render as a summary heading over nothing.
  assert.equal(readSummaryArtifact("{}"), undefined);
  assert.equal(readSummaryArtifact("[1,2,3]"), undefined);
  assert.equal(readSummaryArtifact('{"fileUrl":"https://example.test/a.mp4"}'), undefined);
});

test("empty and missing content are not summaries", () => {
  assert.equal(readSummaryArtifact(""), undefined);
  assert.equal(readSummaryArtifact("   "), undefined);
  assert.equal(readSummaryArtifact(null), undefined);
  assert.equal(readSummaryArtifact(undefined), undefined);
});

test("an insufficient-data summary is still a summary", () => {
  // It has an empty section list and possibly an empty overview, but it is the assistant's
  // answer and must render as one rather than as raw JSON.
  const summary = readSummaryArtifact(
    JSON.stringify({
      summary: "",
      decisions: [],
      actionItems: [],
      insufficientData: true,
    }),
  );

  assert.ok(summary);
  assert.equal(summary.insufficientData, true);
});

test("legacy pre-template summaries still render", () => {
  // Decisions as bare strings, action items as {owner, task}, no templateKey. Those rows are in
  // production storage permanently — there is nothing to migrate them to.
  const summary = readSummaryArtifact(
    JSON.stringify({
      summary: "Agreed the release plan.",
      decisions: ["Ship on Friday"],
      actionItems: [{ owner: "Tu", task: "Cut the tag" }],
      insufficientData: false,
    }),
  );

  assert.ok(summary);
  assert.deepEqual(summary.decisions, ["Ship on Friday"]);
  assert.deepEqual(summary.actionItems, [{ owner: "Tu", task: "Cut the tag" }]);
});

test("neither artifact viewer stringifies JSON at the user any more", () => {
  // The defect was never in the parser — it was that two pages did not call it. A regression here
  // looks like working code, so it is asserted against the pages themselves.
  //
  // Each page is pinned to the viewer it actually uses, rather than to "any of these": the
  // post-meeting page renders the summary through SummaryPanel (which reads the same parsed shape
  // and lays it out as summary, decisions and action items), and the archive renders it through
  // readableArtifactBody. Requiring one named component of both would be requiring a mount that
  // neither needs. What they owe the reader is identical, and that is what the second assertion
  // holds: never the raw payload.
  //
  // The standalone artifacts page — the other half of the original WT-432 pair — is gone. It was
  // a second view of the Files tab both of these already carry, and nothing linked to it.
  const pages = [
    {
      path: "src/app/(app)/[workspaceSlug]/rooms/[id]/ended/page.tsx",
      viewer: "SummaryPanel",
    },
    {
      path: "src/app/(app)/[workspaceSlug]/history/page.tsx",
      viewer: "readableArtifactBody",
    },
  ];

  for (const page of pages) {
    const source = fs.readFileSync(page.path, "utf8");
    assert.ok(
      source.includes(page.viewer),
      `${page.path} must render artifact content through ${page.viewer}`,
    );
    assert.ok(
      !source.includes("JSON.stringify(JSON.parse"),
      `${page.path} must not pretty-print JSON at the reader`,
    );
  }
});
