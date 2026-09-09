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

/**
 * Whether a recording of this meeting exists but has nothing behind it yet.
 *
 * The difference between "not recorded" and "recorded, still being written" — which
 * `findPlayableRecording` collapses into the same null, because for its purpose they are the same:
 * neither one can be played. They are not the same thing to tell the reader. A meeting nobody
 * recorded gets no notice at all; a meeting whose file is still processing is worth one, because
 * the answer changes on its own in a minute.
 *
 * Any non-ready status counts, not only `processing` — `failed` and `missing` are equally
 * "there was a recording and you cannot watch it", and neither is served by claiming the meeting
 * was never recorded.
 */
export function hasPendingRecording(
  artifacts: RoomHistoryArtifact[] | undefined | null,
): boolean {
  return Boolean(
    artifacts?.some((artifact) => isRecording(artifact) && !canDownloadArtifact(artifact)),
  );
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
