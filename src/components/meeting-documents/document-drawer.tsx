"use client";

/**
 * A document, read in place.
 *
 * This panel is a READING surface; the meeting's own page is the working one. So a transcript is
 * shown as text and a summary as its sections, but neither is re-implemented here — anything that
 * involves editing, citations, seeking a recording or signing a record links out to the meeting,
 * which already does all of that. Minutes are the exception and are rendered by MinutesPanel
 * itself: that component is self-fetching and carries the whole sign/approve/revise/export
 * lifecycle, and a second copy of a signable document's controls is the last thing this product
 * needs.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowSquareOut, DownloadSimple, LockSimple, SpinnerGap, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { toast } from "sonner";

import { MinutesPanel } from "@/components/rooms/minutes-panel";
import { ARTIFACT_WITHHELD_FALLBACK, isArtifactWithheld } from "@/lib/meeting/artifact-denial";
import { parseSummarySections } from "@/lib/meeting/meeting-summary";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { getErrorMessage } from "@/lib/api/errors";
import { translationRoomService } from "@/services/translation-room.service";
import { meetingDocumentLabel } from "@/types/meetingDocument";
import type { MeetingDocumentDto } from "@/types/meetingDocument";

/** What the panel has to show, once the body has arrived. */
type Body =
  | { kind: "text"; body: string }
  /** A file with nothing to read: a recording. Downloading is the only sensible act. */
  | { kind: "file" }
  /** Stored, but with neither text nor a file behind it. */
  | { kind: "empty" };

export function DocumentDrawer({
  document,
  workspaceSlug,
  onClose,
}: {
  document: MeetingDocumentDto;
  workspaceSlug: string;
  onClose: () => void;
}) {
  const isMinutes = document.type === "MINUTES";

  return (
    <aside
      aria-label={`${meetingDocumentLabel(document.type)} — ${document.meetingTitle}`}
      className="flex h-full min-h-0 w-full flex-col border-l border-border bg-surface-1"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            {meetingDocumentLabel(document.type)}
            {document.minutesNo ? ` · ${document.minutesNo}` : ""}
          </p>
          <h2 className="mt-1 truncate text-[14px] font-semibold leading-5 text-ink" title={document.meetingTitle}>
            {document.meetingTitle}
          </h2>
          <Link
            href={`/${workspaceSlug}/rooms/${document.translationRoomId}`}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Open the meeting
            <ArrowSquareOut size={11} />
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close document"
          className="shrink-0 rounded p-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isMinutes ? (
          <MinutesPanel roomId={document.translationRoomId} canManage={document.isHost} />
        ) : (
          <ArtifactBody document={document} />
        )}
      </div>
    </aside>
  );
}

function ArtifactBody({ document }: { document: MeetingDocumentDto }) {
  const [downloading, setDownloading] = useState(false);

  // React Query rather than an effect writing state: reopening a document the reader already
  // looked at is then free, the request cancels itself, and there is no window where the panel
  // holds the previous document's body.
  //
  // `enabled` is the refusal, taken before any request is made — `canOpen` is the server's answer
  // using the same predicate /download applies, so asking anyway would spend a round trip to be
  // told no.
  const body = useQuery({
    queryKey: ["meeting-document-body", document.id],
    enabled: document.canOpen,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Body> => {
      const { data } = await translationRoomService.artifactDownload(document.id);
      if (data.content != null && data.content !== "") {
        return { kind: "text", body: readableBody(data.content) };
      }
      return data.url ? { kind: "file" } : { kind: "empty" };
    },
  });

  async function download() {
    setDownloading(true);
    try {
      const { data } = await translationRoomService.artifactDownload(document.id);
      openArtifactDownload(data);
    } catch (error) {
      if (isArtifactWithheld(error)) {
        toast.info(getErrorMessage(error, ARTIFACT_WITHHELD_FALLBACK));
        return;
      }
      toast.error(getErrorMessage(error, "Could not download this document."));
    } finally {
      setDownloading(false);
    }
  }

  // A refusal is a state somebody controls, not a failure. Reporting it as an error is what made
  // "Unauthorized to download this artifact." the answer to a policy working exactly as designed.
  if (!document.canOpen || isArtifactWithheld(body.error)) {
    return (
      <div className="flex items-start gap-2 p-5 text-[12px] leading-5 text-ink-muted">
        <LockSimple size={14} className="mt-0.5 shrink-0" />
        <span>{getErrorMessage(body.error, ARTIFACT_WITHHELD_FALLBACK)}</span>
      </div>
    );
  }

  if (body.isPending) {
    return (
      <p className="flex items-center gap-2 p-5 text-[12px] text-ink-muted">
        <SpinnerGap size={14} className="animate-spin" />
        Loading…
      </p>
    );
  }

  if (body.isError) {
    return (
      <p className="p-5 text-[12px] leading-5 text-ink-muted">
        {getErrorMessage(body.error, "Could not open this document.")}
      </p>
    );
  }

  const state = body.data;

  if (state.kind === "empty") {
    return <p className="p-5 text-[12px] leading-5 text-ink-muted">This document has no stored content.</p>;
  }

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="mb-3 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60"
      >
        {downloading ? <SpinnerGap size={12} className="animate-spin" /> : <DownloadSimple size={12} />}
        Download
      </button>

      {state.kind === "file" ? (
        <p className="text-[12px] leading-5 text-ink-muted">
          This is a media file — download it to watch or listen.
        </p>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-5 text-ink">
          {state.body}
        </pre>
      )}
    </div>
  );
}

/**
 * A stored body turned into something a person can read.
 *
 * A summary artifact stores structured JSON, so dumping it verbatim gives the reader
 * `{"summary":"…","decisions":[…]}` — which is what WT-362 reported as "renders raw JSON". Never
 * throws: a transcript export is markdown and must survive untouched.
 */
function readableBody(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return raw;
  const record = parsed as Record<string, unknown>;
  if (typeof record.summary !== "string") return raw;

  if (record.insufficientData === true) {
    return record.summary || "No summary could be generated for this meeting.";
  }

  const lines: string[] = [record.summary.trim()];
  for (const section of parseSummarySections(record)) {
    const items = section.items.map((item) => `• ${item.owner ? `${item.owner}: ` : ""}${item.text}`);
    if (items.length) lines.push("", section.title, ...items);
  }

  return lines.join("\n");
}
