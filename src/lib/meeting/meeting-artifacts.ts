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
