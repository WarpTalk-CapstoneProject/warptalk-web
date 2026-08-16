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
