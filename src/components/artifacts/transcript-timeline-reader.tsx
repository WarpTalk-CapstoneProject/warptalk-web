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
  isTranscriptControlMarker,
} from "@/lib/transcript/transcript-display";
import { type TranscriptSpeaker } from "@/lib/transcript/speaker-color";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";
import type { TranscriptSegmentDto } from "@/types/transcript";
import { cn } from "@/lib/utils";
import { describeAbsence } from "@/lib/meeting/artifact-library";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Fallback parsed speaker turn when raw database segments are not available and we only have markdown body.
 */
interface ParsedFallbackTurn {
  key: string;
  speakerName: string;
  language?: string;
  elapsedTime?: string;
  paragraphs: string[];
}

const SPEAKER_LINE_REGEX = /^\*\*\[(.+?)(?:\s+\(([^()]*)\))?\]\*\*:\s*(.*)$/;
// i18n-allow: Regex character class matching Unicode Vietnamese characters in transcript speaker names
const PLAIN_SPEAKER_REGEX = /^([A-ZÀ-Ỹa-zà-ỹ0-9_.\s]+?):\s*(.*)$/;
const TIMESTAMP_PREFIX_REGEX = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

function parseMarkdownTranscript(body: string | null | undefined): ParsedFallbackTurn[] {
  if (!body?.trim()) return [];

  const rawLines = body.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const turns: ParsedFallbackTurn[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    if (!raw) continue;
    // Skip header lines and sentinels
    if (
      /^#\s+WarpTalk Transcription Room\b/i.test(raw) ||
      /^Generated on:/i.test(raw) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(raw) ||
      isTranscriptControlMarker(raw)
    ) {
      continue;
    }

    let line = raw;
    let explicitTime: string | undefined;

    const timeMatch = TIMESTAMP_PREFIX_REGEX.exec(line);
    if (timeMatch) {
      explicitTime = timeMatch[1];
      line = timeMatch[2];
    }

    let speakerName = "Speaker";
    let language: string | undefined;
    let content = line;

    const boldMatch = SPEAKER_LINE_REGEX.exec(line);
    if (boldMatch) {
      speakerName = boldMatch[1].trim();
      language = boldMatch[2]?.trim();
      content = boldMatch[3].trim();
    } else {
      const plainMatch = PLAIN_SPEAKER_REGEX.exec(line);
      if (plainMatch && !plainMatch[1].toLowerCase().startsWith("http")) {
        speakerName = plainMatch[1].trim();
        content = plainMatch[2].trim();
      }
    }

    if (speakerName.toLowerCase() === "system" || isTranscriptControlMarker(content)) {
      continue;
    }

    const previous = turns[turns.length - 1];
    if (previous && previous.speakerName === speakerName) {
      if (content) previous.paragraphs.push(content);
    } else {
      turns.push({
        key: `turn-${turns.length}-${speakerName}`,
        speakerName,
        language,
        elapsedTime: explicitTime,
        paragraphs: content ? [content] : [],
      });
    }
  }

  return turns;
}

export function TranscriptTimelineReader({
  entry,
  roomId,
}: {
  entry: LibraryEntry;
  roomId: string;
}) {
  const [viewMode, setViewMode] = useState<"clean" | "verbatim">("clean");
  const [searchQuery, setSearchQuery] = useState("");
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
    () => (rawSegments.length === 0 && entry.body ? parseMarkdownTranscript(entry.body) : []),
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

  function downloadAsText() {
    if (!entry.body) return;
    const blob = new Blob([entry.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `transcript-${roomId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript downloaded");
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
            onClick={downloadAsText}
            title="Download transcript as text"
            className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <DownloadSimple size={13} />
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
