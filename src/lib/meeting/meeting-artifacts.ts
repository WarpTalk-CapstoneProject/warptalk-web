import type { RoomHistoryArtifact } from "@/types/roomHistory";

/**
 * How a meeting's retained outputs read.
 *
 * Split out of the Transcripts page when the whole meeting record moved onto room detail —
 * a transcript, its AI summary and its files belong to one meeting, so they belong on that
 * meeting's page. These are pure so they can be tested without a room; the node test runner
 * strips types but cannot parse JSX, which is why they are not in the panels component.
 */

const ARTIFACT_LABELS = {
  transcript_export: "Transcript",
  summary_export: "AI summary",
  recording: "Recording",
  debug_log: "Debug log",
  audio_sample: "Audio sample",
} as const;

export function artifactLabel(type: RoomHistoryArtifact["type"]): string {
  return ARTIFACT_LABELS[type];
}

/**
 * Consent outranks status. A file that is technically ready but still needs consent must not
 * read as "Ready" — the download will stop and ask, and saying "Ready" first makes that look
 * like a failure rather than the policy working.
 */
export function artifactStatusLabel(artifact: RoomHistoryArtifact): string {
  if (artifact.consentRequired) return "Consent required";
  const status = artifact.status ?? "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Only a ready artifact can be fetched; everything else has nothing behind it yet. */
export function canDownloadArtifact(artifact: RoomHistoryArtifact): boolean {
  return artifact.status === "ready";
}

/**
 * The recording to play above the transcript, or null when there is nothing to watch. WT-492.
 *
 * "Nothing to watch" is the ordinary case — most meetings are never recorded — so it is a null
 * rather than an error, and the player renders nothing at all rather than an empty frame promising
 * a video that does not exist.
 *
 * Gated on the same `canDownloadArtifact` the download button uses, because a recording that is
 * still processing has no bytes behind it either: a player pointed at one would show a broken
 * element instead of saying it is not ready.
 */
export function findPlayableRecording(
  artifacts: RoomHistoryArtifact[] | undefined | null,
): RoomHistoryArtifact | null {
  return (
    artifacts?.find(
      (artifact) => artifact.type === "recording" && canDownloadArtifact(artifact),
    ) ?? null
  );
}

/** A recording artifact, whatever state it is in. The one predicate both counters below share. */
function isRecording(artifact: RoomHistoryArtifact): boolean {
  return artifact.type === "recording";
}

/**
 * How many recordings of this meeting can actually be played. WT-655.
 *
 * WHY ANYONE NEEDS A COUNT AND NOT JUST THE FIRST ONE
 *   A meeting can hold several. Anyone in the room may stop recording and start again, and each run
 *   is its own file with its own row and its own `recordingStartedAt`. `findPlayableRecording`
 *   returns the FIRST match, so a moment from the second half of the meeting gets measured against
 *   the first file — and the arithmetic in recording-seek.ts has no way to notice: the answer is
 *   positive, inside the file, and completely wrong. A seek that "works" and lands on the wrong
 *   sentence is the one failure that module exists to prevent, and this is the case it cannot see,
 *   because both origins it was handed are real.
 *
 *   Choosing the right file needs each recording's duration to know where one ends and the next
 *   begins, and the backend does not store it yet. Until it does, the caller withholds seeking
 *   entirely when this returns more than 1 and says so, rather than seeking to a plausible lie.
 */
export function countPlayableRecordings(
  artifacts: RoomHistoryArtifact[] | undefined | null,
): number {
  return (
    artifacts?.filter((artifact) => isRecording(artifact) && canDownloadArtifact(artifact))
      .length ?? 0
  );
}

export type UnplayableRecordingState = "processing" | "failed";

/** A recording row with no file behind it that will never get one. See unplayableRecordingState. */
const FAILED_RECORDING_STATUSES: ReadonlySet<RoomHistoryArtifact["status"]> = new Set([
  "failed",
  "missing",
]);

/**
 * What became of this meeting's recordings that cannot be played — `"processing"`, `"failed"`,
 * or null when there is nothing to say.
 *
 * The difference between "not recorded" and "recorded, but not watchable" — which
 * `findPlayableRecording` collapses into the same null, because for its purpose they are the same:
 * neither one can be played. They are not the same thing to tell the reader. A meeting nobody
 * recorded gets no notice at all; a recording still being written is worth one, because the answer
 * changes on its own in a minute; and a recording that failed is worth a DIFFERENT one, because it
 * never will.
 *
 * WHY FAILED IS NO LONGER "PROCESSING" (rec-loss)
 *   This used to be a boolean that counted every non-ready status, and the page read it as
 *   "processing". Harmless while a recording row only appeared once its file had landed. Since
 *   rec-loss the row exists from the moment recording starts and turns `failed` when LiveKit
 *   produced nothing — so the boolean put a spinner and "this page updates on its own" over a
 *   video that does not exist, forever. That is the silent loss rec-loss is about, with a spinner
 *   on top.
 *
 * WHICH STATUSES COUNT AS FAILED
 *   `failed` and `missing`: both are "a recording was made and there is no file", and neither
 *   resolves itself. `expired` and `deleted` are NOT failures — retention ran out, or someone
 *   removed the file on purpose; the recording worked. Calling them failed would send a host
 *   looking for a fault that is really the policy working, so they return null here and the
 *   Artifacts tab's own status label is where they are named.
 *
 * Processing outranks failed: with a restart in the meeting, one run can have failed while the
 * next is still being written, and "wait a minute" is the answer that is about to change.
 */
export function unplayableRecordingState(
  artifacts: RoomHistoryArtifact[] | undefined | null,
): UnplayableRecordingState | null {
  const recordings = (artifacts ?? []).filter(isRecording);
  if (recordings.some((artifact) => artifact.status === "processing")) return "processing";
  if (recordings.some((artifact) => FAILED_RECORDING_STATUSES.has(artifact.status))) {
    return "failed";
  }
  return null;
}

/**
 * How long after a meeting ends a missing transcript or summary is still "on its way".
 *
 * The same fifteen minutes `shouldPollRoomHistory` polls for, on purpose: the page stops asking at
 * the moment this stops promising, so a row can never say "Processing" to a page that has given up
 * refetching the answer.
 */
export const ARTIFACT_OUTPUT_WINDOW_MS = 15 * 60 * 1000;

export type PendingOutput = {
  type: "transcript_export" | "summary_export";
  state: "processing" | "not_produced";
};

/**
 * WT-683 — the outputs every ended meeting is owed that have no row yet.
 *
 * The finalizer writes the transcript and the AI summary a minute or so after the meeting ends, and
 * until then the Artifacts tab read "(0) · Nothing has been generated or retained for this meeting
 * yet." That sentence is true and useless: it cannot be told apart from a meeting whose outputs
 * failed, so a host who opened the tab straight after ending assumed nothing would ever arrive.
 *
 * So the two outputs that are ALWAYS produced get a row of their own before they exist — processing
 * inside the window, "not produced" after it — and a row that does exist speaks for itself.
 *
 * The recording is deliberately not in this list: not every meeting is recorded, so it is not owed.
 * It needs no placeholder either — since rec-loss the backend writes a recording row the moment
 * recording starts (processing, then ready or failed), so a recorded meeting's row speaks for itself.
 */
export function pendingOutputs(
  artifacts: RoomHistoryArtifact[] | undefined | null,
  endedAt: string | null | undefined,
  nowMs: number = Date.now(),
): PendingOutput[] {
  const present = new Set((artifacts ?? []).map((artifact) => artifact.type));
  const endedMs = endedAt ? Date.parse(endedAt) : Number.NaN;
  const stillOnItsWay = Number.isFinite(endedMs) && nowMs - endedMs <= ARTIFACT_OUTPUT_WINDOW_MS;

  return (["transcript_export", "summary_export"] as const)
    .filter((type) => !present.has(type))
    .map((type) => ({ type, state: stillOnItsWay ? "processing" : "not_produced" }));
}

/**
 * The format the reader will actually receive — not the one the row is stored as.
 *
 * `artifact.format` is `TranslationRoomArtifact.FileFormat`, which describes the STORED bytes:
 * markdown for the transcript, json for the summary. Both of those are correct for the code that
 * reads them (the summary is parsed into prose by parseMeetingSummaryContent) and both were wrong
 * on screen, because the server serves those two as plain text — so a row that said JSON handed
 * over a .txt when clicked.
 *
 * Kept in step with the backend's ArtifactPlainText.IsTextExport, which decides the same thing for
 * the download itself. If a third text-bearing artifact type is added, both need the entry.
 */
const TEXT_EXPORT_TYPES: ReadonlySet<RoomHistoryArtifact["type"]> = new Set([
  "transcript_export",
  "summary_export",
]);

export function artifactDownloadFormat(artifact: RoomHistoryArtifact): string {
  if (TEXT_EXPORT_TYPES.has(artifact.type)) return "TXT";
  return artifact.format?.toUpperCase() || "—";
}
