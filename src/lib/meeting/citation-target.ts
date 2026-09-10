/**
 * Turning a cited SEGMENT id into the ROW the reader can actually see. WT-655.
 *
 * WHY THESE ARE NOT THE SAME ID
 *   A citation (`atMs` on a summary item, a minute, a claim) is resolved against the raw saved
 *   segment list by findSegmentAtMs, because that is the list with the timings in it — one row per
 *   finalized STT chunk. Nothing on screen is that list. `groupSavedTranscriptSegments` merges the
 *   consecutive chunks of one continuous piece of speech into one bubble and gives that bubble the
 *   id of the FIRST segment it folded in; every other member's id survives only in
 *   `mergedSegmentIds`, which its own comment names as the field anything keyed by backend segment
 *   ids has to read.
 *
 *   The DOM ids (`transcript-segment-<id>`) are emitted from row ids. So a citation that landed in
 *   the middle of a bubble — the common case, since a bubble is several chunks — produced an id
 *   that matched no element and no row: `getElementById` returned null, the jump returned early,
 *   and the click did nothing at all with no explanation. The same mismatch silenced the highlight,
 *   which is compared against the row's own id downstream.
 *
 * WHY A NULL AND NOT A GUESS
 *   Not every segment has a row. Grouping drops control markers (`__MEETING_END__` and friends)
 *   before anything is drawn, so a citation pointing at one belongs to no line a person can read.
 *   Returning the nearest row instead would scroll the reader to a line that is not the evidence
 *   they clicked to check — the same failure recording-seek.ts refuses for the video. Null means
 *   SAY SO, and the caller raises a toast rather than going quiet.
 */

/**
 * The parts of a displayed row this lookup needs — satisfied by
 * `GroupedSavedTranscriptSegment` and by the live `GroupedTranscriptSegment`, neither of which is
 * imported here so that the node test runner never has to resolve the "@/" alias for a value.
 */
export interface CitationRowIdentity {
  /** The row's own id, and the one its DOM element is named after. */
  id: string;
  /** Every backend segment id folded into this row, the first of them being `id`. */
  mergedSegmentIds?: readonly string[] | null;
}

/**
 * The row that contains a given segment, or null when no displayed row does.
 *
 * Falls back to `[row.id]` when a row carries no `mergedSegmentIds` — the same default
 * transcript-language.ts applies, so an ungrouped list of plain segments still resolves.
 */
export function findRowForSegmentId<T extends CitationRowIdentity>(
  rows: readonly T[],
  segmentId: string | null | undefined,
): T | null {
  if (!segmentId) return null;

  for (const row of rows) {
    if (row.id === segmentId) return row;
    const merged = row.mergedSegmentIds;
    if (merged?.length ? merged.includes(segmentId) : false) return row;
  }

  return null;
}

/**
 * The id to scroll to and highlight for a cited segment, or null when that moment has no line.
 *
 * This is the value the page wants: both the DOM element and the `highlighted` comparison in the
 * transcript panel are keyed on the ROW's id, so handing either of them a mid-group segment id is
 * a lookup that silently finds nothing.
 */
export function resolveCitationRowId(
  rows: readonly CitationRowIdentity[],
  segmentId: string | null | undefined,
): string | null {
  return findRowForSegmentId(rows, segmentId)?.id ?? null;
}
