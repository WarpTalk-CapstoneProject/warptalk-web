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

/**
 * `t` is optional so every existing caller — and every `node:test` pinning the English string —
 * keeps working unchanged. A translated page passes its own `useTranslations("schedules")`
 * lookup (e.g. `(type) => t(`artifactLabels.${type}`)`) instead of hard-coding English here.
 */
export function artifactLabel(
  type: RoomHistoryArtifact["type"],
  t?: (type: RoomHistoryArtifact["type"]) => string,
): string {
  return t ? t(type) : ARTIFACT_LABELS[type];
}

/**
 * Consent outranks "Ready", and only "Ready". A file that is technically ready but still needs
 * consent must not read as "Ready" — the download will stop and ask, and saying "Ready" first
 * makes that look like a failure rather than the policy working.
 *
 * WT-824: but a file that is NOT ready has nothing behind the consent hold, and every recording
 * row is written consent-required from the moment recording starts. Consent-first labelled a
 * recording still being written, or one that failed, "Consent required" — and then the download
 * said "not ready". The row sent people to the host about a permission when the real answer was
 * "wait" or "this recording failed". So a non-ready status speaks for itself.
 *
 * `t` is optional for the same reason as `artifactLabel` above — see there.
 */
export function artifactStatusLabel(
  artifact: RoomHistoryArtifact,
  t?: (key: "consentRequired" | RoomHistoryArtifact["status"]) => string,
): string {
  if (artifact.consentRequired && canDownloadArtifact(artifact)) {
    return t ? t("consentRequired") : "Consent required";
  }
  const status = artifact.status ?? "";
  if (t) return t(status);
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
  return playableRecordings(artifacts)[0] ?? null;
}

/**
 * Every recording of this meeting that has a file behind it, in the order the record lists them.
 *
 * One answer, three callers: the player picks the first, the seek guard counts them, and the
 * "more than one recording" notice offers all of them for download — which is the only route to
 * those files now that the Artifacts tab is gone. Three copies of "a recording that can be
 * fetched" is three places for the definition to drift, and a drift here reads as a recording
 * that exists in one part of the page and not in another.
 */
export function playableRecordings(
  artifacts: RoomHistoryArtifact[] | undefined | null,
): RoomHistoryArtifact[] {
  return (artifacts ?? []).filter(
    (artifact) => artifact.type === "recording" && canDownloadArtifact(artifact),
  );
}

/**
 * WT-824 — "Recording failed: <why>", for a failed recording whose reason the backend stored.
 *
 * Production's only two recordings both failed, and each row said "Failed" and nothing more —
 * LiveKit's egress runs in LiveKit Cloud, so the reason it gave existed in one log line that the
 * next deploy deleted. The backend now keeps it on the row (host-facing sentence plus LiveKit's
 * status and error, URLs redacted); this is where a reader sees it.
 *
 * Null when there is nothing to add: not a recording, not failed, or failed before the column
 * existed. The bare status label still covers those.
 */
export function recordingFailureText(artifact: RoomHistoryArtifact): string | null {
  if (artifact.type !== "recording") return null;
  if (artifact.status !== "failed" && artifact.status !== "missing") return null;
  const reason = artifact.failureReason?.trim();
  return reason ? `Recording failed: ${reason}` : null;
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
  return playableRecordings(artifacts).length;
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
 *   workspace's Artifacts library, which lists every retained file with its status, is where they
 *   are named.
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

