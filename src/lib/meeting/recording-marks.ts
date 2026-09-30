/**
 * Marks on the recording's own scrubber, one per transcript turn.
 *
 * WT-655 gave the transcript a click-to-seek timestamp on every line. This is the mechanical
 * reverse: a viewer scrubbing the RECORDING has no way to see where a turn begins without first
 * finding it in the transcript column. These marks are positioned with the exact same arithmetic
 * `requestSeek` uses (`seekTargetSeconds`, recording-seek.ts) against the exact same turns the
 * transcript itself groups its rows from (`groupSavedTranscriptSegments`,
 * transcript-display.ts) — so the two mark sets can never disagree about where a turn starts.
 *
 * NO CHAPTERS, NO TITLES, NO GROUPING OF ITS OWN
 *   Each mark is one turn's `startTimeMs`, unlabelled. Anything that clusters turns into "topics"
 *   is a different feature this deliberately does not become.
 */

import { seekTargetSeconds, type SeekSources } from "./recording-seek.ts";

/** One turn's position, on both clocks: the meeting's and the recording file's. */
export interface RecordingMark {
  /** The turn's own `startTimeMs` — the meeting axis, and what a click hands to
   *  `jumpToTranscriptMoment` to scroll+highlight the matching transcript line. */
  atMs: number;
  /** Where that turn falls in the recording FILE, in seconds — the same axis `video.currentTime`
   *  and `duration` are on, and the only axis a marker strip below the `<video>` may use. */
  seconds: number;
}

/**
 * One mark per turn that can actually be found in this recording.
 *
 * A turn is dropped, not clamped to 0 or to the end, when `seekTargetSeconds` cannot place it —
 * spoken before the host pressed record, after the file stopped, or on a meeting whose two clocks
 * were never aligned (see recording-seek.ts). A dot on the strip that seeks to the wrong place is
 * worse than no dot, for the same reason a wrong seek from the transcript would be.
 *
 * `turns` is deliberately typed as just the field this needs, so the caller can hand over
 * `groupSavedTranscriptSegments`'s own rows — the SAME turns the transcript's timestamps come
 * from — without this module needing to know their full shape.
 */
export function buildRecordingMarks(
  turns: readonly { startTimeMs: number }[],
  seekSources: SeekSources,
): RecordingMark[] {
  const marks: RecordingMark[] = [];
  for (const turn of turns) {
    const seconds = seekTargetSeconds(seekSources, turn.startTimeMs);
    if (seconds === null) continue;
    marks.push({ atMs: turn.startTimeMs, seconds });
  }
  return marks;
}
