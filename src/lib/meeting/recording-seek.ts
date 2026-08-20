/**
 * Turning a moment in the transcript into a position in the recording.
 *
 * TWO CLOCKS, AND NEITHER IS THE OTHER
 *   A transcript offset (`startTimeMs`, and the `atMs` a summary item cites) is a DURATION from
 *   the first audio chunk the STT pipeline saw. A recording starts whenever the host switched it
 *   on — before that first word, after it, or not at all. The gap between the two origins is
 *   different for every meeting, so there is no constant to apply and no way to guess one.
 *
 *   WT-473 put both origins in the database for exactly this: `transcripts.timeline_anchor_at` and
 *   `translation_room_artifacts.recording_started_at`. This is the arithmetic between them.
 *
 * WHY NULL IS A RESULT AND NOT A ZERO
 *   Either origin can be missing — every meeting recorded before those columns existed has no
 *   recoverable value, and none can be reconstructed. The migration that added them says it
 *   outright: substituting `created_at` would be off by however long the meeting waited for its
 *   first word, "which is exactly the kind of error that renders as a plausible seek".
 *
 *   A seek to the wrong place looks like a working feature. It is worse than no seek, because
 *   nobody can tell it happened — the video plays, somebody hears the wrong sentence, and
 *   concludes the transcript is lying about who said what. So: null means CANNOT ALIGN, the caller
 *   offers no seek, and the click does what it always did.
 */

export interface SeekSources {
  /** `transcripts.timelineAnchorAt` — when transcript offsets are measured from. */
  timelineAnchorAt?: string | null;
  /** `artifact.recordingStartedAt` — when the recording began. */
  recordingStartedAt?: string | null;
  /** How long the recording runs, when known. Used only to reject a target beyond its end. */
  durationSeconds?: number | null;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Where in the recording a transcript moment falls, in seconds, or null when it cannot be known.
 *
 * Negative results are null, not clamped to zero. A moment spoken before the host pressed record
 * is not at the start of the recording — it is not IN the recording, and seeking to 0:00 would
 * present the wrong sentence as if it were the right one.
 */
export function seekTargetSeconds(sources: SeekSources, atMs: number): number | null {
  if (!Number.isFinite(atMs) || atMs < 0) return null;

  const anchor = toTime(sources.timelineAnchorAt);
  const recordingStart = toTime(sources.recordingStartedAt);
  if (anchor === null || recordingStart === null) return null;

  const offsetMs = anchor + atMs - recordingStart;
  if (offsetMs < 0) return null;

  const seconds = offsetMs / 1000;

  // Past the end of the file is the same kind of claim as before its start: the moment exists in
  // the meeting and not in this recording, which stopped early.
  const duration = sources.durationSeconds;
  if (typeof duration === "number" && duration > 0 && seconds > duration) return null;

  return seconds;
}

/** Whether this meeting can align its transcript to its recording at all. */
export function canAlignToRecording(sources: SeekSources): boolean {
  return toTime(sources.timelineAnchorAt) !== null && toTime(sources.recordingStartedAt) !== null;
}
