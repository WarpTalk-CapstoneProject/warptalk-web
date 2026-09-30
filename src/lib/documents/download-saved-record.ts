import { readSummaryArtifact } from "@/lib/meeting/artifact-content";
import { saveBlobDownload } from "@/lib/ui/download-artifact";
import { recordFileName } from "@/lib/documents/record-file-name";
import {
  savedSummaryDocumentModel,
  savedTranscriptDocumentModel,
} from "@/lib/documents/saved-record-documents";
import type { RecordDocumentMeta } from "@/lib/documents/record-documents";

/**
 * Download a meeting's STORED transcript or summary as the same .docx the Recap downloads.
 *
 * For the surfaces that hold only the text the server saved — the Artifacts reader's fallback and
 * the calendar's past-meeting dialog. The Recap panels build from what they render and do not come
 * through here. The Word writer is imported at the click, as it is everywhere else: ~500 KB nobody
 * needs until they press Download.
 */

type SavedRecordInput = {
  body: string | null | undefined;
  meetingTitle: string | null | undefined;
  /** When the meeting started — the date in the file name and in the header. */
  startedAt?: string | null;
  hostName?: string | null;
  workspaceName?: string | null;
};

function metaFor(input: SavedRecordInput, languageLabel?: string): RecordDocumentMeta {
  return {
    meetingTitle: input.meetingTitle ?? "",
    startedAt: input.startedAt ?? null,
    hostName: input.hostName ?? null,
    workspaceName: input.workspaceName ?? null,
    languageLabel: languageLabel ?? null,
  };
}

export async function downloadSavedTranscriptDocx(input: SavedRecordInput): Promise<void> {
  const model = savedTranscriptDocumentModel(metaFor(input, "As spoken"), input.body);
  const { buildTranscriptDocx } = await import("@/lib/documents/transcript-docx");
  saveBlobDownload(
    await buildTranscriptDocx(model),
    recordFileName({
      meetingTitle: input.meetingTitle,
      kind: "Transcript",
      startedAt: input.startedAt,
      extension: "docx",
    }),
  );
}

export async function downloadSavedSummaryDocx(input: SavedRecordInput): Promise<void> {
  const model = savedSummaryDocumentModel(
    metaFor(input),
    readSummaryArtifact(input.body),
    input.body,
  );
  const { buildSummaryDocx } = await import("@/lib/documents/summary-docx");
  saveBlobDownload(
    await buildSummaryDocx(model),
    recordFileName({
      meetingTitle: input.meetingTitle,
      kind: "Summary",
      startedAt: input.startedAt,
      extension: "docx",
    }),
  );
}
