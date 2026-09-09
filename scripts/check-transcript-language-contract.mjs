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
 *   6. Choosing a language means the WHOLE meeting is in it. The live pipeline only ever
 *      translated into the target selected at that moment, so a meeting that switched languages
 *      half way through covered neither of them end to end, and one where translation was never
 *      started covered none — the picker had no entries at all. Every language the product can
 *      translate into is offered, and picking one asks the server to fill in what is missing.
 *      Reverting this to "offer only what there is text for" restores a picker that reports the
 *      gap and cannot close it.
 *   7. A corrected line's translations are refetched after the correction. Correcting what
 *      somebody said invalidates every translation of that line; redoing them happens in
 *      warptalk-ai and lands seconds later, so a page that only refetches segments shows the
 *      corrected sentence beside translations of the one it replaced and never resolves it.
 *   8. Every count printed to the reader is in ONE unit: rendered rows. The server's coverage
 *      counts stored STT segments; this panel merges the consecutive segments of one utterance
 *      into a single row. Printing the server's numbers under the word "entries" gave one
 *      finished meeting "Transcript (7)", "Saved · 7 entries" and "1 of 13 entries is not in
 *      English yet" at the same moment — three true numbers, two units, and nothing on screen
 *      saying so. The server still decides the STATE (running, failed, nothing left); it does
 *      not supply the arithmetic.
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
//
// `<TranscriptDocumentTurn` was `<TranscriptDocumentRow` before Option C, and the rename is the
// change rather than a tidy-up, so it is written down instead of quietly swapped. The document
// view used to draw one row per utterance — which for one person talking for two minutes is
// twenty rows, each repeating their name, their face and their timestamp around one paragraph of
// speech. It draws one block per speaker TURN now, grouped on the same ~30-second window the
// timeline already used, and prints the name once. What this assertion is for is unchanged: the
// document view exists and is rendered by this panel.
for (const [needle, what] of [
  ["<TranscriptLanguageMenu", "the language picker"],
  ["<TranscriptLayoutToggle", "the view toggle"],
  ["<TranscriptChatRow", "the conversation view"],
  ["<TranscriptDocumentTurn", "the document view"],
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
// Bounded by the next export, not by a character count. The window was 1200, and the line it
// looks for sat at 1001 — so any comment added inside the function pushed it out and failed a
// check about behaviour that had not changed. A function ends where the next one begins.
const groupingEnd = display.indexOf("\nexport ", groupingAt + 1);
assert.match(
  display.slice(groupingAt, groupingEnd > 0 ? groupingEnd : undefined),
  /mergedSegmentIds: \[\.\.\.previous\.mergedSegmentIds, segment\.id\]/,
  "A merged saved utterance must record every segment id it absorbed.",
);

// 6. A language with no text in it yet is an offer, not a missing row.
assert.ok(
  panel.includes("withOfferableLanguages("),
  "The picker must be built from every language the product can translate into, not only the"
    + " ones this meeting happened to produce — a meeting where translation was never started"
    + " has no entries of its own.",
);
assert.ok(
  /<TranscriptLanguageMenu[\s\S]{0,400}options=\{offeredLanguages\}/.test(panel),
  "The picker must be handed the offered languages, or the extra entries are computed and"
    + " thrown away.",
);
assert.ok(
  /function chooseLanguage[\s\S]{0,400}backfill\.request\(/.test(panel),
  "Picking a language must request the missing translations. 'Read it in English' already means"
    + " 'translate the rest into English'; making the reader ask twice is the bug.",
);
assert.ok(
  hooks.includes("export function useTranscriptLanguageBackfill"),
  "The hook that follows a running backfill must exist.",
);
assert.ok(
  /refetchInterval:[\s\S]{0,200}"running"/.test(hooks),
  "A running backfill must be polled — its results land in the database over Redis, so nothing"
    + " on this side is awaiting them.",
);
assert.ok(
  /missing < previous[\s\S]{0,200}invalidateQueries/.test(hooks),
  "Lines that have just been translated must be refetched as they arrive, rather than after the"
    + " whole run finishes.",
);

// 7. A correction does not leave stale translations on screen.
assert.ok(
  hooks.includes("export function useTranslationRefreshAfterCorrection"),
  "The hook that refetches a corrected line's translations must exist.",
);
assert.ok(
  /RETRANSLATION_REFRESH_DELAYS_MS\s*=\s*\[[^\]]+\]/.test(hooks),
  "It must look again after a delay: the retranslation is asynchronous and is not finished when"
    + " the correction request returns.",
);
assert.ok(
  /async function saveCorrection[\s\S]{0,2000}refreshTranslationsAfterCorrection\(\)/.test(panel),
  "Saving a correction must trigger that refresh, or the reader keeps the translation of a"
    + " sentence that was just replaced.",
);

// 8. One unit for every number the reader is shown.
const statusAt = panel.indexOf("function TranscriptLanguageStatus");
assert.ok(statusAt > 0, "TranscriptLanguageStatus must exist.");
const status = panel.slice(statusAt, statusAt + 3_500);

assert.ok(
  !/coverage\??\.(totalSegments|missing)/.test(status),
  "The language-status line must not print the server's coverage counts. Those are per stored"
    + " STT segment; this panel's 'entries' are the merged rows it draws, and the same sentence"
    + " swapped between the two units the moment the coverage query resolved — '1 of 7' before,"
    + " '1 of 13' after, over a transcript showing 7 rows.",
);
assert.ok(
  /const\s+missing\s*=\s*incompleteCount;/.test(status)
    && /const\s+total\s*=\s*totalCount;/.test(status),
  "The numbers in that line must be the row counts (incompleteCount of totalCount) — the same"
    + " unit as the 'Saved · N entries' chip above it and the 'Transcript (N)' tab label.",
);
assert.ok(
  /coverage\??\.status\s*===\s*"running"/.test(status) && /"failed"/.test(status),
  "The server must still decide WHICH state this is — only it knows a backfill is running or"
    + " failed. What was removed is its arithmetic, not its authority.",
);

// The count is only honest if it can reach zero. A row with no text is one the backend's coverage
// refuses to count or to translate (IsTranslatableSegment), so keeping it here — as a row of its
// own, or as an id in a merged utterance's mergedSegmentIds — is a shortfall no backfill can ever
// close: "1 entry is not in English yet" with a Translate button that does nothing, forever.
const displaySource = read("src/lib/transcript/transcript-display.ts");
assert.ok(
  /export function isRenderableTranscriptSegment/.test(displaySource),
  "The rule for 'this row is not a line of the meeting' must exist in one place.",
);
for (const grouping of ["groupTranscriptSegments", "groupSavedTranscriptSegments"]) {
  const at = displaySource.indexOf(`export function ${grouping}`);
  assert.ok(at > 0, `${grouping} must exist.`);
  assert.match(
    displaySource.slice(at, at + 1_500),
    /if \(!isRenderableTranscriptSegment\(segment\.originalText\)\) continue;/,
    `${grouping} must drop blank rows and control markers BEFORE the merge — absorbed into a`
      + " neighbour, a blank row becomes an id that demands a translation nobody will ever write.",
  );
}

console.log("Transcript language contract: PASS");
