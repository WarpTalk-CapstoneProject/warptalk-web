/**
 * Resolving a cited segment to the row a reader can see. WT-655.
 *
 * The bug this covers was an absolute silence: a summary citation landing in the middle of a merged
 * bubble produced a segment id that named no DOM element, `getElementById` returned null, and the
 * jump returned early. Nothing moved, nothing was said, and the branch one line above it raises a
 * toast — so the silence read as deliberate. Every case here is either the right row or an honest
 * "no row", never a nearby one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { findRowForSegmentId, resolveCitationRowId } from "../citation-target.ts";

/**
 * Two displayed rows, as groupSavedTranscriptSegments builds them: each is named after the FIRST
 * segment folded into it, and carries the rest in `mergedSegmentIds`.
 */
const ROWS = [
  { id: "seg-1", mergedSegmentIds: ["seg-1", "seg-2", "seg-3"] },
  { id: "seg-4", mergedSegmentIds: ["seg-4"] },
  { id: "seg-5", mergedSegmentIds: ["seg-5", "seg-6"] },
];

test("a cited id that leads its row resolves to that row", () => {
  // The case that already worked, and the only one that did.
  assert.equal(resolveCitationRowId(ROWS, "seg-1"), "seg-1");
  assert.equal(resolveCitationRowId(ROWS, "seg-4"), "seg-4");
});

test("a cited id in the MIDDLE of a group resolves to the row that swallowed it", () => {
  // The bug. A bubble is several STT chunks, so this is the common case, not the edge one — and it
  // used to resolve to nothing at all.
  assert.equal(resolveCitationRowId(ROWS, "seg-2"), "seg-1");
  assert.equal(resolveCitationRowId(ROWS, "seg-3"), "seg-1");
  assert.equal(resolveCitationRowId(ROWS, "seg-6"), "seg-5");
});

test("an id no row contains resolves to null, not to the nearest row", () => {
  // Grouping drops control markers (__MEETING_END__ and friends) before anything is drawn, so a
  // moment can genuinely have no readable line. Scrolling somewhere plausible instead would land
  // the reader on a line that is not the evidence they clicked to check — the same failure
  // recording-seek.ts refuses for the video.
  assert.equal(resolveCitationRowId(ROWS, "seg-99"), null);
  assert.equal(resolveCitationRowId([], "seg-1"), null);
});

test("a missing id is not a lookup", () => {
  assert.equal(resolveCitationRowId(ROWS, null), null);
  assert.equal(resolveCitationRowId(ROWS, undefined), null);
  assert.equal(resolveCitationRowId(ROWS, ""), null);
});

test("a row with no mergedSegmentIds still matches on its own id", () => {
  // The default transcript-language.ts applies too: an ungrouped list of plain segments resolves
  // rather than falling through to "no line in the transcript".
  const plain = [{ id: "only" }, { id: "other", mergedSegmentIds: null }];

  assert.equal(resolveCitationRowId(plain, "only"), "only");
  assert.equal(resolveCitationRowId(plain, "other"), "other");
  assert.equal(resolveCitationRowId(plain, "elsewhere"), null);
});

test("the row itself is available for callers that need more than its id", () => {
  const row = findRowForSegmentId(ROWS, "seg-3");

  assert.equal(row?.id, "seg-1");
  assert.deepEqual(row?.mergedSegmentIds, ["seg-1", "seg-2", "seg-3"]);
});
