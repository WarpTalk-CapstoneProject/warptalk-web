"use client";

/**
 * The Meeting record: Summary / Transcript / Files, plus who the record is shared with.
 *
 * WHY IT LIVES HERE AND NOT IN THE ROOM PAGE
 *   It was declared inside rooms/[id]/page.tsx, so it was reachable from exactly one route. The
 *   room's /ended page — the page a host is sent to the moment they end a meeting — hand-rolled a
 *   worse third of it instead: the same three tabs, but the transcript tab read the export file's
 *   plain text rather than the saved segments, so a summary point had nothing to jump to, and the
 *   publish control and the regenerate control were not there at all.
 *
 *   That page's own docstring already argued for this: "The panels are the SAME components the room
 *   page uses (SummaryPanel, ArtifactsPanel), so a fix to either lands on both." It was true of the
 *   panels and false of everything wrapped around them. Moving the wrapper here makes it true of
 *   the wrapper too, which is the whole point — a host who has just ended a meeting is the person
 *   most likely to want to regenerate a summary and publish it, and they were the one person who
 *   could not.
 */

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCircle, Copy, Download, FileText, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  ArtifactsPanel,
  MeetingRecordTabButton,
  MeetingRecordingPlayer,
  SummaryPanel,
  useArtifactDownload,
} from "@/components/rooms/meeting-record-panels";
import { useSetArtifactAccess, useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import { getErrorMessage } from "@/lib/api/errors";
import { findPlayableRecording } from "@/lib/meeting/meeting-artifacts";
import { findSegmentAtMs } from "@/lib/meeting/meeting-summary";
import { useTranscriptByRoom, useTranscriptSegments } from "@/hooks/use-transcripts";
import {
  describeRecordSharing,
  isRecordShared,
  nextArtifactAccess,
} from "@/lib/meeting/record-sharing";
import {
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
  type TranslationSessionBlock,
} from "@/lib/transcript/transcript-display";
import { saveBlobDownload } from "@/lib/ui/download-artifact";
import { translationRoomService } from "@/services/translation-room.service";
import { transcriptService } from "@/services/transcript.service";
import type { EndedRoomHistoryItem } from "@/types/roomHistory";
import type { TranscriptSegmentDto } from "@/types/transcript";
import type { TranslationRoomSessionDto } from "@/types/translationRoom";
import { cn } from "@/lib/utils";

export function MeetingRecordSection({
  roomId,
  isHost,
  artifactAccess,
  transcript,
  transcriptCount,
  endedRecord,
  onRecordChanged,
  onJumpToMoment,
}: {
  roomId: string;
  /** WT-480: only the host may change who the record is shared with. */
  isHost: boolean;
  /** WT-480: the room's stored `artifactAccess`. Absent reads as not shared. */
  artifactAccess?: string | null;
  transcript: React.ReactNode;
  transcriptCount: number;
  endedRecord: EndedRoomHistoryItem | null;
  onRecordChanged: () => void;
  onJumpToMoment: (atMs: number) => void;
}) {
  const [tab, setTab] = useState<"transcript" | "summary" | "artifacts">(
    "transcript",
  );
  const { busyArtifactId, downloadArtifact } =
    useArtifactDownload(onRecordChanged);
  // WT-492: null when the meeting was not recorded, or the file is not ready yet.
  const recording = findPlayableRecording(endedRecord?.artifacts);
  // WT-480: who may read this record. One derivation feeds the badge, the banner and the button.
  const setArtifactAccess = useSetArtifactAccess(roomId);
  const sharing = describeRecordSharing({ artifactAccess, isHost });

  // Read inside the polling interval, which closes over the render that started it and
  // would otherwise never see the rewritten summary arrive.
  const summaryTemplateRef = useRef(endedRecord?.summary?.templateKey);
  const rewritePollRef = useRef<number | null>(null);

  // In an effect, not during render: writing a ref while rendering is how a component ends
  // up reading a value React has not committed yet.
  useEffect(() => {
    summaryTemplateRef.current = endedRecord?.summary?.templateKey;
  }, [endedRecord?.summary?.templateKey]);

  useEffect(
    () => () => {
      // Leaving the page mid-rewrite must not leave a timer refetching a room nobody is
      // looking at.
      if (rewritePollRef.current !== null) window.clearInterval(rewritePollRef.current);
    },
    [],
  );

  // No ended record means the meeting has not finished, so there is nothing to summarise and
  // no files to retain. Showing two permanently empty tabs would only invite clicking them.
  const hasRecord = Boolean(endedRecord);
  const activeTab = hasRecord ? tab : "transcript";

  return (
    <section className="mt-8 border-b border-border/60 pb-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-semibold text-ink">Meeting record</h2>
          {/* WT-480: the badge and the banner below come from one call, so they cannot end up
              disagreeing — a "Draft" chip beside a banner saying everyone can read it is worse
              than either alone. */}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
              sharing.tone === "shared"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            {sharing.badge}
          </span>
        </div>

        {sharing.action ? (
          <button
            type="button"
            onClick={() => void setArtifactAccess.mutateAsync(nextArtifactAccess(artifactAccess))
              .then(() => {
                toast.success(
                  isRecordShared(artifactAccess)
                    ? "Record unpublished. Only you can see it now."
                    : "Record published. Everyone who took part can read it.",
                );
                onRecordChanged();
              })
              .catch((error: unknown) =>
                toast.error(getErrorMessage(error, "Could not change who this record is shared with.")),
              )}
            disabled={setArtifactAccess.isPending}
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            {setArtifactAccess.isPending ? "Saving…" : sharing.action}
          </button>
        ) : null}
      </div>

      {sharing.message ? (
        <div
          className={cn(
            "mt-3 rounded-[8px] border px-3.5 py-2.5 text-[13px] leading-relaxed",
            sharing.tone === "shared"
              ? "border-emerald-500/25 bg-emerald-500/5 text-ink"
              : sharing.tone === "draft"
                ? "border-amber-500/25 bg-amber-500/5 text-ink"
                : "border-border bg-surface-2 text-ink-muted",
          )}
        >
          {sharing.message}
        </div>
      ) : null}

      {hasRecord ? (
        <div
          className="mt-2 mb-4 flex items-center gap-1 border-b border-border"
          role="tablist"
          aria-label="Meeting record sections"
        >
          <MeetingRecordTabButton
            active={activeTab === "transcript"}
            onClick={() => setTab("transcript")}
            icon={FileText}
            label="Transcript"
            count={transcriptCount || undefined}
          />
          <MeetingRecordTabButton
            active={activeTab === "summary"}
            onClick={() => setTab("summary")}
            icon={Sparkles}
            label="Summary"
          />
          <MeetingRecordTabButton
            active={activeTab === "artifacts"}
            onClick={() => setTab("artifacts")}
            icon={Archive}
            label="Artifacts"
            count={endedRecord?.artifacts.length}
          />
        </div>
      ) : (
        <div className="mt-3" />
      )}

      {/* WT-492: above the transcript, and only in that tab — the two are read together, and it
          is the pairing the ticket asks for. On Summary and Artifacts it would push the panel the
          reader came for down the page for no reason; Artifacts still lists the same file to
          download. Rendered only when a ready recording exists, so a meeting nobody recorded shows
          no empty frame promising one. */}
      {activeTab === "transcript" ? (
        <MeetingRecordingPlayer
          artifact={recording}
          onConsentGranted={onRecordChanged}
        />
      ) : null}
      {activeTab === "transcript" ? transcript : null}
      {activeTab === "summary" && endedRecord ? (
        <SummaryPanel
          room={endedRecord}
          busyArtifactId={busyArtifactId}
          onDownload={downloadArtifact}
          // Checking a claim means leaving the summary, so the tab switches with it —
          // scrolling the transcript while the reader is still looking at the summary
          // would look like the button did nothing.
          onJumpToMoment={(atMs) => {
            setTab("transcript");
            onJumpToMoment(atMs);
          }}
          onRewrite={async (templateKey) => {
            await translationRoomService.regenerateSummary(
              endedRecord.id,
              templateKey,
            );
            toast.success("Rewriting the summary…");
            // The endpoint answers 202 — the summary lands on the artifact later, so this
            // polls for it rather than trusting the response. It stops the moment the new
            // shape arrives, and gives up after 90 seconds either way.
            if (rewritePollRef.current !== null) {
              window.clearInterval(rewritePollRef.current);
            }
            const stopAt = Date.now() + 90_000;
            rewritePollRef.current = window.setInterval(() => {
              const arrived = summaryTemplateRef.current === templateKey;
              if (arrived || Date.now() > stopAt) {
                if (rewritePollRef.current !== null) {
                  window.clearInterval(rewritePollRef.current);
                  rewritePollRef.current = null;
                }
                return;
              }
              onRecordChanged();
            }, 4000);
          }}
        />
      ) : null}
      {activeTab === "artifacts" && endedRecord ? (
        <ArtifactsPanel
          artifacts={endedRecord.artifacts}
          busyArtifactId={busyArtifactId}
          onDownload={downloadArtifact}
        />
      ) : null}
    </section>
  );
}

/**
 * The saved meeting transcript, rendered as a distinct artifact participants can read
 * and copy after the meeting ends. Data is the persisted TranscriptService segments for
 * this room (already fetched on the page), so it does not depend on any exported file
 * being stored — it always reflects what was actually transcribed.
 */
export function MeetingTranscriptArtifact({
  segments,
  baseTime,
  roomId,
  currentUserId,
  isEnded,
  onCopy,
  transcriptId,
  transcriptStatus,
  highlightedSegmentId,
  canEdit,
  onSegmentsChanged,
}: {
  segments: TranscriptSegmentDto[];
  baseTime?: string;
  roomId: string;
  currentUserId?: string;
  isEnded: boolean;
  onCopy: (text: string, label: string) => void;
  /** Needed to correct or finalize; omit and the section stays read-only. */
  transcriptId?: string;
  transcriptStatus?: string;
  /** Set when a summary citation jumped here; the row is marked so the reader can see
   *  which line the claim came from rather than landing in an anonymous wall of text. */
  highlightedSegmentId?: string | null;
  /** Only the host may rewrite what the room recorded. */
  canEdit?: boolean;
  /** Refetch after a correction lands, so the line shows what was actually saved. */
  onSegmentsChanged?: () => void;
}) {
  const ordered = [...segments].sort(
    (left, right) => left.sequenceOrder - right.sequenceOrder,
  );
  const grouped = groupSavedTranscriptSegments(ordered);
  const sessionsQuery = useTranslationRoomSessions(roomId);
  const blocks = groupSegmentsByTranslationSession(grouped, sessionsQuery.data ?? [], baseTime);
  const showSessionLabels = blocks.length > 1;
  const totalCount = grouped.length;
  const base = baseTime ? new Date(baseTime) : null;

  // Correcting the transcript used to live on a separate Transcripts page, which showed the
  // same segments for the same room under its own queue and its own tabs. The room already
  // owns everything that page needed — the meeting, the host, the segments — so the editing
  // moved to where the transcript is read rather than the reading moving to where it was
  // edited.
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const isFinalized = transcriptStatus === "finalized";
  const canCorrect = Boolean(canEdit && transcriptId) && !isFinalized;

  async function saveCorrection(segment: TranscriptSegmentDto) {
    const correctedText = draftText.trim();
    // Closing without a change is not a correction — posting one would record an edit that
    // changed nothing and count against the transcript's revision history.
    if (!transcriptId || !correctedText || correctedText === segment.originalText.trim()) {
      setEditingSegmentId(null);
      return;
    }

    setIsSavingCorrection(true);
    try {
      await transcriptService.correctSegment(transcriptId, segment.id, {
        originalText: segment.originalText,
        correctedText,
        correctionType: "stt",
        triggeredRetranslation: false,
      });
      onSegmentsChanged?.();
      setEditingSegmentId(null);
      toast.success("Transcript correction saved.");
    } catch {
      toast.error("Could not save the transcript correction.");
    } finally {
      setIsSavingCorrection(false);
    }
  }

  async function finalizeTranscript() {
    if (!transcriptId) return;
    setIsFinalizing(true);
    try {
      await transcriptService.finalize(transcriptId);
      onSegmentsChanged?.();
      toast.success("Transcript finalized.");
    } catch {
      toast.error("Could not finalize the transcript.");
    } finally {
      setIsFinalizing(false);
    }
  }

  function downloadTranscript() {
    saveBlobDownload(
      new Blob([assembleTranscriptText(blocks)], { type: "text/plain;charset=utf-8" }),
      `transcript-${roomId}.txt`,
    );
  }

  function segmentTime(startMs: number) {
    if (!base) return "";
    const stamp = new Date(base);
    stamp.setMilliseconds(stamp.getMilliseconds() + startMs);
    return stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    /* The heading and the section frame belong to MeetingRecordSection now — this is the
       Transcript tab, not a section of its own. The action row stays: copy, download and
       finalize act on the transcript specifically, not on the record as a whole. */
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InlineChip icon={<FileText className="size-3.5" />}>
            {isEnded ? "Saved" : "Live"} · {totalCount}{" "}
            {totalCount === 1 ? "entry" : "entries"}
          </InlineChip>
        </div>
        {totalCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCopy(assembleTranscriptText(blocks), "Transcript")}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Copy className="size-3.5" />
              Copy
            </button>
            <button
              type="button"
              onClick={downloadTranscript}
              className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Download className="size-3.5" />
              Download
            </button>
            {canCorrect ? (
              <button
                type="button"
                onClick={() => void finalizeTranscript()}
                disabled={isFinalizing}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                <CheckCircle className="size-3.5" />
                {isFinalizing ? "Finalizing…" : "Finalize"}
              </button>
            ) : null}
            {/* Said out loud, because after finalizing the pencils simply stop appearing and
                that on its own reads as the page having broken. */}
            {isFinalized ? (
              <InlineChip icon={<CheckCircle className="size-3.5" />}>Finalized</InlineChip>
            ) : null}
          </div>
        ) : null}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
          {isEnded
            ? "No transcript was captured for this meeting."
            : "The transcript is saved here as the meeting is transcribed."}
        </div>
      ) : (
        /* The transcript is the one thing on this page with no upper bound — an hour of
           talking is hundreds of entries, and letting it set the page height pushed every
           section below it, and the page's own scrollbar, out of reach. It scrolls inside
           its own frame instead. Capped against the viewport rather than a fixed pixel
           height so it does not swallow a short laptop screen whole.

           Scroll chaining is left at its default, as WT-330(8) requires of every inner
           scroller here — and requires by name, so do not write the containment utility
           into this comment either: check-room-surface-contract matches the file's text,
           not its markup, and the word alone fails it. Containing the scroll would stop
           the page at the end of the transcript, which is the trap that ticket removed. */
        <div className="max-h-[min(60vh,560px)] space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-1 p-4">
          {blocks.map((block) => (
            <div key={block.sessionNumber} className="space-y-2">
              {showSessionLabels ? (
                <TranscriptSessionDivider sessionNumber={block.sessionNumber} session={block.session} />
              ) : null}
              {block.segments.map((segment) => {
                const isSelf = Boolean(currentUserId) && segment.speakerParticipantId === currentUserId;
                return (
                  <div
                    key={segment.id}
                    id={`transcript-segment-${segment.id}`}
                    className={`flex scroll-mt-4 rounded-md transition-colors ${
                      isSelf ? "justify-end" : "justify-start"
                    } ${
                      highlightedSegmentId === segment.id
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : ""
                    }`}
                  >
                    <div className={`flex max-w-[75%] flex-col gap-1 ${isSelf ? "items-end" : "items-start"}`}>
                      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground ${isSelf ? "flex-row-reverse" : ""}`}>
                        <span className="font-semibold text-ink">
                          {isSelf ? "You" : segment.speakerName || "Unknown speaker"}
                        </span>
                        <InlineChip>{segment.originalLanguage?.toUpperCase() || "?"}</InlineChip>
                        {base ? <span>{segmentTime(segment.startTimeMs)}</span> : null}
                      </div>
                      {editingSegmentId === segment.id ? (
                        <div className="w-full min-w-0 space-y-2 rounded-xl border border-primary/40 bg-surface-1 p-2.5">
                          <textarea
                            value={draftText}
                            onChange={(event) => setDraftText(event.target.value)}
                            aria-label={`Edit transcript line by ${segment.speakerName || "unknown speaker"}`}
                            className="min-h-24 w-full resize-y rounded-md border border-border bg-canvas px-2.5 py-2 text-[13px] leading-6 text-ink outline-none focus:border-primary"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingSegmentId(null)}
                              className="rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingCorrection || !draftText.trim()}
                              onClick={() => void saveCorrection(segment)}
                              className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              {isSavingCorrection ? "Saving…" : "Save correction"}
                            </button>
                          </div>
                        </div>
                      ) : (
                      <div
                        className={`group/line relative rounded-2xl px-3 py-2 ${canCorrect ? "pr-9" : ""} ${
                          isSelf
                            ? "rounded-tr-sm bg-primary"
                            : "rounded-tl-sm border border-border bg-white"
                        }`}
                      >
                        <p className={`text-[13px] leading-6 ${isSelf ? "text-white" : "text-ink-subtle"}`}>
                          {segment.originalText}
                        </p>
                        {canCorrect ? (
                          <button
                            type="button"
                            aria-label="Edit transcript line"
                            title="Edit this line"
                            onClick={() => {
                              setEditingSegmentId(segment.id);
                              setDraftText(segment.originalText);
                            }}
                            className={`absolute right-1 top-1 grid size-7 place-items-center rounded-md opacity-60 transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100 ${
                              isSelf ? "text-white hover:bg-white/20" : "hover:bg-surface-2"
                            }`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptSessionDivider({
  sessionNumber,
  session,
}: {
  sessionNumber: number;
  session: TranslationRoomSessionDto | null;
}) {
  const started = session?.startedAt
    ? new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const ended = session?.endedAt
    ? new Date(session.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "now";

  return (
    <div className="flex items-center gap-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>
        Translation {sessionNumber}
        {started ? ` · ${started}–${ended}` : ""}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function assembleTranscriptText(blocks: TranslationSessionBlock<TranscriptSegmentDto>[]): string {
  const showSessionLabels = blocks.length > 1;
  return blocks
    .map((block) => {
      const lines = block.segments.map(
        (segment) =>
          `[${segment.speakerName || "Unknown"} (${(segment.originalLanguage || "").toUpperCase()})] ${segment.originalText}`,
      );
      if (!showSessionLabels) return lines.join("\n");
      return [`--- Translation ${block.sessionNumber} ---`, ...lines].join("\n");
    })
    .join("\n\n");
}

export function InlineChip({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 text-[11px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}


/**
 * Everything the record needs to show a meeting's transcript, in one call.
 *
 * WHY IT IS A HOOK AND NOT TWO QUERIES PER PAGE
 *   The room page and the /ended page both need the saved segments, the base time, and the
 *   jump-to-moment behaviour that lets a summary citation land on the line it came from. The
 *   /ended page had none of it: its transcript tab read the export file's plain text, so a summary
 *   point had nothing to scroll to. Copying the room page's three queries and its callback over
 *   there would have been a second implementation of one screen, which is the exact drift the
 *   /ended page was rewritten to end.
 */
export function useMeetingTranscript(roomId: string) {
  const transcriptQuery = useTranscriptByRoom(roomId);
  const segmentsQuery = useTranscriptSegments(transcriptQuery.data?.id);
  // Memoised because the jump callback depends on it; `?? []` allocates a fresh array every
  // render, which would rebuild the callback on every keystroke of a transcript correction.
  const segments = useMemo(() => segmentsQuery.data?.items ?? [], [segmentsQuery.data]);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  /**
   * Scroll the transcript to the moment a summary claim cites, and mark it.
   *
   * Resolved to the segment that was BEING SPOKEN at that moment rather than the nearest one —
   * see findSegmentAtMs. The DOM node is found by segment id rather than held in a ref map,
   * because the transcript re-renders on every correction and a ref map would go stale exactly
   * when the host is editing.
   */
  const jumpToTranscriptMoment = useCallback(
    (atMs: number) => {
      const segment = findSegmentAtMs(segments, atMs);
      if (!segment) {
        toast.error("That moment is not in the saved transcript.");
        return;
      }
      // The tab switch renders the transcript in the same commit, so the node does not exist
      // yet on this frame.
      requestAnimationFrame(() => {
        const node = document.getElementById(`transcript-segment-${segment.id}`);
        if (!node) return;
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedSegmentId(segment.id);
      });
    },
    [segments],
  );

  return {
    transcript: transcriptQuery.data,
    segments,
    highlightedSegmentId,
    jumpToTranscriptMoment,
    refetchSegments: () => void segmentsQuery.refetch(),
  };
}
