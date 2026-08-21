#!/usr/bin/env node
/**
 * A meeting can be read back in one language, in either of two shapes.
 *
 * WHY THIS EXISTS
 *   The saved transcript rendered `segment.originalText` and nothing else. That is exactly what
 *   was captured and exactly the wrong thing to read: a Vietnamese/Japanese meeting came back as
 *   an interleaving of two languages, so somebody who had just left the room could follow half
 *   of their own meeting — the half that never needed translating.
 *
 *   The translations existed the whole time. `GET /transcripts/{id}/translations` serves the
 *   current translation of every segment into every language the room produced, `useTranscript-
 *   Translations` had been written against it, and nothing on the room page called either.
 *
 * THE RULES
 *   1. The room page reads the translations and hands them to the transcript.
 *   2. Every line renders through `resolveTranscriptLine`, not through raw `originalText`.
 *      That function is the ONE place that decides between "as spoken", "translated" and "never
 *      translated", and it is what keeps an untranslated line from being displayed as though it
 *      were in the language the reader asked for.
 *   3. Copy and Download follow the language on screen. A reader who unified the transcript and
 *      then copied it used to get back the interleaving they had just resolved.
 *   4. All three layouts stay reachable — the conversation, the document and the timeline.
 *      The timeline is the only one that shows the meeting's SHAPE: the other two draw one row
 *      per utterance, so who held the floor and for how long is a fact that exists in the data
 *      and appears nowhere on screen.
 *   5. The transcript reads are paginated to the end. They used to take one page (200 segments,
 *      500 translations) and present it as the whole meeting, and a longer one was silently
 *      truncated mid-sentence. Reading in one language makes that worse: the dropdown would be
 *      built from a fraction of the meeting and report coverage for the rest.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
const panel = read("src/components/rooms/meeting-transcript-panel.tsx");
const hooks = read("src/hooks/use-transcripts.ts");

// 1. The translations reach the transcript panel.
for (const [needle, why] of [
  ["useTranscriptTranslations(", "the room page must read the meeting's translations"],
  ["translations={transcriptTranslations}", "and hand them to the transcript panel"],
]) {
  assert.ok(roomDetail.includes(needle), `${why} (${needle}).`);
}
assert.ok(
  panel.includes("indexTranslationsBySegment("),
  "The panel must index the translations per segment, so a line can find its own.",
);

// 2. Lines resolve through the one function that knows what it is showing.
assert.ok(
  panel.includes("resolveTranscriptLine(segment, translationIndex, displayLanguage)"),
  "Each transcript line must resolve through resolveTranscriptLine, so a line the meeting never"
    + " translated is marked rather than shown as though it were in the chosen language.",
);
assert.ok(
  !/<p[^>]*>\s*\{segment\.originalText\}/.test(panel),
  "The transcript must not print segment.originalText directly — that is the interleaving.",
);

// 3. What is copied is what is read.
assert.ok(
  panel.includes("assembleTranscriptText(blocks, translationIndex, displayLanguage)"),
  "Copy and Download must assemble the transcript in the language on screen.",
);

// 4. Every shape of the record.
for (const [needle, what] of [
  ["<TranscriptLanguageMenu", "the language picker"],
  ["<TranscriptLayoutToggle", "the view toggle"],
  ["<TranscriptChatRow", "the conversation view"],
  ["<TranscriptDocumentRow", "the document view"],
  ["<TranscriptTimelineTurn", "the timeline view"],
]) {
  assert.ok(panel.includes(needle), `The transcript panel must render ${what} (${needle}).`);
}

// A citation still has somewhere to land in every layout. `jumpToTranscriptMoment` finds a line
// by `document.getElementById("transcript-segment-" + id)`, so a layout that stops emitting that
// id silently breaks every summary and minutes citation while looking perfectly fine.
assert.equal(
  (panel.match(/id=\{`transcript-segment-\$\{segment\.id\}`\}/g) ?? []).length >= 3,
  true,
  "Every layout must anchor its lines with transcript-segment-{id}, or citations land nowhere.",
);

// 5. The whole meeting, not the first page of it.
assert.ok(
  hooks.includes("collectAllPages("),
  "The transcript reads must page to the end of the transcript.",
);
for (const [hook, call] of [
  ["useTranscriptSegments", "transcriptService.segments"],
  ["useTranscriptTranslations", "transcriptService.translations"],
]) {
  const at = hooks.indexOf(`export function ${hook}`);
  assert.ok(at > 0, `${hook} must exist.`);
  const body = hooks.slice(at, at + 500);
  assert.ok(body.includes("collectAllPages("), `${hook} must collect every page.`);
  assert.ok(body.includes(call), `${hook} must still read through ${call}.`);
  assert.ok(
    !/take:\s*\d+/.test(body),
    `${hook} must not pin a page size of its own — a hardcoded take is how the transcript was`
      + " truncated at 200 in the first place.",
  );
}

// A merged utterance keeps every segment id it absorbed, or its translation is read off the
// first segment alone and every long sentence comes back as its opening third.
const display = read("src/lib/transcript/transcript-display.ts");
const groupingAt = display.indexOf("export function groupSavedTranscriptSegments");
assert.ok(groupingAt > 0, "groupSavedTranscriptSegments must exist.");
assert.match(
  display.slice(groupingAt, groupingAt + 1200),
  /mergedSegmentIds: \[\.\.\.previous\.mergedSegmentIds, segment\.id\]/,
  "A merged saved utterance must record every segment id it absorbed.",
);

console.log("Transcript language contract: PASS");
