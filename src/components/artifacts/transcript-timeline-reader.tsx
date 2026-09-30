"use client";

import { useMemo, useState } from "react";
import {
  ChatCircleText,
  Copy,
  DownloadSimple,
  MagnifyingGlass,
  SpinnerGap,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { MeetingTranscriptArtifact } from "@/components/rooms/meeting-transcript-panel";
import { TranscriptSpeakerAvatar } from "@/components/rooms/transcript-speaker-avatar";
import {
  useTranscriptByRoom,
  useTranscriptCleanSentences,
  useTranscriptSegments,
  useTranscriptTranslations,
} from "@/hooks/use-transcripts";
import { formatCitationTime } from "@/lib/meeting/meeting-summary";
import {
  buildCleanTranscriptView,
  type CleanTranscriptView,
} from "@/lib/transcript/clean-transcript";
import {
  groupIntoSpeakerTurns,
  groupSavedTranscriptSegments,
} from "@/lib/transcript/transcript-display";
import { type TranscriptSpeaker } from "@/lib/transcript/speaker-color";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";
import type { TranscriptSegmentDto } from "@/types/transcript";
import { cn } from "@/lib/utils";
import { describeAbsence } from "@/lib/meeting/artifact-library";
import { parseSavedTranscriptBody } from "@/lib/documents/saved-record-documents";
import { downloadSavedTranscriptDocx } from "@/lib/documents/download-saved-record";
import { useAuthStore } from "@/stores/auth-store";

export function TranscriptTimelineReader({
  entry,
  roomId,
}: {
  entry: LibraryEntry;
  roomId: string;
}) {
  const [viewMode, setViewMode] = useState<"clean" | "verbatim">("clean");
  const [searchQuery, setSearchQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const viewerId = useAuthStore((state) => state.user?.id);

  // Query database segments when room ID is present
  const transcriptQuery = useTranscriptByRoom(roomId);
  const transcriptId = transcriptQuery.data?.id;

  const segmentsQuery = useTranscriptSegments(transcriptId);
  const translationsQuery = useTranscriptTranslations(transcriptId);
  const cleanSentencesQuery = useTranscriptCleanSentences(transcriptId);

  const rawSegments = segmentsQuery.data?.items ?? [];

  const orderedSegments = useMemo(
    () => [...rawSegments].sort((left, right) => left.sequenceOrder - right.sequenceOrder),
    [rawSegments],
  );

  // Fallback parsed turns if raw database segments are empty
  const fallbackTurns = useMemo(
    () =>
      rawSegments.length === 0 && entry.body
        ? parseSavedTranscriptBody(entry.body).map((turn, index) => ({
            ...turn,
            key: `turn-${index}-${turn.speakerName}`,
          }))
        : [],
    [rawSegments.length, entry.body],
  );

  const queryLower = searchQuery.trim().toLowerCase();

  const filteredFallbackTurns = useMemo(() => {
    if (!queryLower) return fallbackTurns;
    return fallbackTurns.filter(
      (turn) =>
        turn.speakerName.toLowerCase().includes(queryLower) ||
        turn.paragraphs.some((p) => p.toLowerCase().includes(queryLower)),
    );
  }, [fallbackTurns, queryLower]);

  async function copyAllTranscript() {
    if (!entry.body) return;
    try {
      await navigator.clipboard.writeText(entry.body);
      toast.success("Transcript copied to clipboard");
    } catch {
      toast.error("Could not copy transcript");
    }
  }

  /**
   * The saved transcript as the same .docx the Recap downloads. This path only runs when the
   * transcript has no saved segments, so the stored export is all there is to build from.
   */
  async function downloadAsDocument() {
    if (!entry.body || downloading) return;
    setDownloading(true);
    try {
      await downloadSavedTranscriptDocx({
        body: entry.body,
        meetingTitle: entry.roomTitle,
        startedAt: meetingStartedAt(entry),
        hostName: entry.hostName,
      });
    } catch {
      toast.error("Could not download transcript");
    } finally {
      setDownloading(false);
    }
  }

  if (entry.absence) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-5">
          <ChatCircleText size={20} className="mt-0.5 text-ink-subtle" />
          <div>
            <h3 className="text-[13px] font-medium text-ink">Transcript unavailable</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {describeAbsence(entry.absence, entry.kind)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 1. Primary: If database segments are loaded, directly render the official MeetingTranscriptArtifact component!
  if (rawSegments.length > 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
        <MeetingTranscriptArtifact
          segments={orderedSegments}
          translations={translationsQuery.data?.items ?? []}
          roomId={roomId}
          currentUserId={viewerId ?? undefined}
          isEnded={true}
          onCopy={(text, label) => {
            navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard`);
          }}
          meetingTitle={entry.roomTitle}
          transcriptId={transcriptId}
          transcriptStatus={transcriptQuery.data?.status}
          canEdit={entry.hostId === viewerId}
          onSegmentsChanged={() => {
            segmentsQuery.refetch();
          }}
          transcriptLoading={transcriptQuery.isLoading || segmentsQuery.isLoading}
          meetingStartedAt={entry.meetingEndedAt}
          meetingEndedAt={entry.meetingEndedAt}
          saveTranscript={true}
        />
      </div>
    );
  }

  // 2. Loading state while segments are in flight
  if (segmentsQuery.isLoading && !entry.body) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-ink-muted">
        <SpinnerGap size={16} className="animate-spin" />
        Loading transcript timeline...
      </div>
    );
  }

  // 3. Fallback: If database segments are absent but exported markdown body exists in cache
  return (
    <div className="flex flex-col">
      {/* Transcript Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-1/95 px-5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-medium text-ink">
            <ChatCircleText size={13} className="text-emerald-500" />
            <span>Saved · {fallbackTurns.reduce((acc, t) => acc + t.paragraphs.length, 0)} entries</span>
          </span>

          {entry.durationSeconds ? (
            <span className="hidden rounded-full border border-border bg-surface-2 px-2.5 py-1 text-ink-muted sm:inline-flex">
              Duration {Math.floor(entry.durationSeconds / 60)}m
            </span>
          ) : null}
        </div>

        {/* Search and Action Buttons */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <MagnifyingGlass
              size={13}
              className="absolute left-2.5 text-ink-subtle pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-40 rounded-md border border-border bg-surface-2 pl-7 pr-6 text-[11px] text-ink placeholder:text-ink-subtle transition-all focus:w-56 focus:border-ink-muted focus:outline-none sm:w-48"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 text-ink-subtle hover:text-ink"
              >
                <X size={11} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={copyAllTranscript}
            title="Copy full transcript"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={() => void downloadAsDocument()}
            disabled={downloading}
            title="Download transcript (.docx)"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-60"
          >
            {downloading ? <SpinnerGap size={13} className="animate-spin" /> : <DownloadSimple size={13} />}
          </button>
        </div>
      </div>

      {/* Main Timeline Body */}
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {fallbackTurns.length > 0 ? (
          <div className="flex flex-col gap-5">
            {filteredFallbackTurns.map((turn, index) => {
              const speaker: TranscriptSpeaker = {
                id: `fallback-${turn.speakerName}`,
                name: turn.speakerName,
              };
              return (
                <article
                  key={turn.key}
                  className="group relative flex gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 transition-colors hover:border-emerald-500 hover:bg-surface-2/50"
                >
                  <div className="w-12 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums text-ink-subtle">
                    {turn.elapsedTime || `${index + 1}`}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <TranscriptSpeakerAvatar speaker={speaker} />
                      <span className="text-[12.5px] font-semibold text-ink">
                        {turn.speakerName}
                      </span>
                      {turn.language ? (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-medium uppercase text-ink-subtle">
                          {turn.language}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1 text-[13px] leading-relaxed text-ink/90">
                      {turn.paragraphs.map((p, pIndex) => (
                        <p key={pIndex} className="break-words">
                          {highlightQuery(p, searchQuery)}
                        </p>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-[12px] text-ink-muted">
            {searchQuery ? "No matching lines found." : "No transcript lines to display."}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * When the meeting began. The library entry carries the end and the length rather than the start,
 * and the document's header and file name are both dated by the start.
 */
function meetingStartedAt(entry: LibraryEntry): string | null {
  const ended = Date.parse(entry.meetingEndedAt);
  if (Number.isNaN(ended)) return null;
  return new Date(ended - Math.max(0, entry.durationSeconds || 0) * 1000).toISOString();
}

function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={index}
        className="rounded-sm bg-yellow-200/80 px-0.5 text-ink dark:bg-yellow-800/80 dark:text-yellow-100"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
