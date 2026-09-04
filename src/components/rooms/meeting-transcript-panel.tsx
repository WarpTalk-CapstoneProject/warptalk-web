"use client";

/**
 * The saved transcript panel of a meeting's record.
 *
 * Lifted out of the room detail page when it grew a language and a layout of its own: it is the
 * one tab of the record that is live DURING a meeting as well as after it, it owns its own
 * corrections and its own export, and at ~800 lines it was most of a 2,600-line route file.
 * `SummaryPanel` and `ArtifactsPanel` — the record's other two tabs — already live beside it in
 * meeting-record-panels.tsx.
 *
 * Being a component rather than a closure over the page is also what makes /dev/transcript-preview
 * possible: a multilingual transcript with real translations behind it cannot be reached from a
 * laptop, and rendering a COPY of this layout there would only ever verify the copy.
 */

import {
  AlignLeft,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  GitCommitVertical,
  History,
  Languages,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  describeTranscriptAbsence,
  transcriptAbsenceMessage,
} from "@/lib/meeting/transcript-absence";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useSegmentCorrections,
  useTranscriptLanguageBackfill,
  useTranslationRefreshAfterCorrection,
} from "@/hooks/use-transcripts";
import {
  formatMeetingDuration,
  resolveMeetingDurationSeconds,
} from "@/lib/meeting/room-history-mapping";
import { correctionAuthorName } from "@/lib/transcript/correction-history";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { useTranslationRoomSessions } from "@/hooks/use-translationRooms";
import {
  TranscriptSpeakerAvatar,
  TranscriptSpeakerStripe,
} from "@/components/rooms/transcript-speaker-avatar";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { getFlagEmoji } from "@/lib/language/language-flag";
import { getLanguageName, languagesInScope } from "@/lib/language/languages";
import {
  firstTranslationStart,
  groupIntoSpeakerTurns,
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
  pendingCorrections,
  type GroupedSavedTranscriptSegment,
} from "@/lib/transcript/transcript-display";
import {
  AS_SPOKEN,
  assembleTranscriptText,
  defaultTranscriptLanguage,
  indexTranslationsBySegment,
  resolveTranscriptLine,
  transcriptLanguageOptions,
  withOfferableLanguages,
  type ResolvedTranscriptLine,
  type TranscriptLanguageOption,
} from "@/lib/transcript/transcript-language";
import {
  resolveTranscriptSpeaker,
  speakerColorVar,
  type TranscriptSpeaker,
} from "@/lib/transcript/speaker-color";
import { saveBlobDownload } from "@/lib/ui/download-artifact";
import { cn } from "@/lib/utils";
import { transcriptService } from "@/services/transcript.service";
import type {
  TranscriptLanguageCoverage,
  TranscriptSegmentDto,
  TranscriptTranslationDto,
} from "@/types/transcript";
import type { TranslationRoomSessionDto } from "@/types/translationRoom";

/** The room page's InlineChip, in the one shape this panel uses it.
 *
 *  12px, not 11: WT-311(d) — these chips ARE the transcript's header, and at 11px muted the
 *  facts on it (how many entries, how long, when translation started) were the smallest text on
 *  the page. The icon stays 14px so the chip does not grow with it. */
function TranscriptChip({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2 text-[12px] font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A timestamp as the wall clock the reader keeps — "09:41", not the ISO string. */
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** How the transcript is laid out: as the conversation, as a document, or on a timeline. */
type TranscriptLayout = "chat" | "document" | "timeline";

/**
 * The saved meeting transcript, rendered as a distinct artifact participants can read
 * and copy after the meeting ends. Data is the persisted TranscriptService segments for
 * this room (already fetched on the page), so it does not depend on any exported file
 * being stored — it always reflects what was actually transcribed.
 *
 * READ IN ONE LANGUAGE
 *   A transcript is stored as it was captured — every line in whatever language the person
 *   speaking was using. In a Vietnamese/Japanese meeting that came back as an interleaving of
 *   two languages, and somebody who had just left the room could not read half of their own
 *   meeting. The dubbing that made the meeting work while it ran was translated, persisted, and
 *   then never shown again.
 *
 *   So the language is a choice here, exactly as it was in the room: pick one, and every line
 *   is rendered in it — the ones spoken in it as they were said, the rest through the
 *   translation the meeting already produced. A line the meeting never translated stays in its
 *   own language and says so, because showing it unmarked would be indistinguishable from a
 *   line that WAS in the chosen language.
 */
export function MeetingTranscriptArtifact({
  segments,
  translations,
  preferredLanguage,
  onSeekToRecording,
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
  speakerDirectory,
  transcriptErrorCode,
  transcriptLoading,
  meetingStartedAt,
  meetingEndedAt,
}: {
  segments: TranscriptSegmentDto[];
  /** Every current translation of this transcript, one row per (segment, language). */
  translations: TranscriptTranslationDto[];
  /** The reader's own language, so the transcript opens on it when the meeting has it. */
  preferredLanguage?: string;
  /** Move the recording to this line. Omitted when the two clocks cannot be reconciled, which is
   *  how the timestamp stays plain text instead of becoming a button that does nothing. */
  onSeekToRecording?: (atMs: number) => void;
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
  /**
   * WT-516: the server's code when the transcript lookup FAILED — `FORBIDDEN`, `NOT_FOUND`, a
   * status. Without it this panel cannot tell "you may not read this" from "there is nothing",
   * and it said the second for both. Omitted means the request did not fail.
   */
  transcriptErrorCode?: string | number | null;
  /** The lookup is still in flight, so no explanation is due yet. */
  transcriptLoading?: boolean;
  /** Only the host may rewrite what the room recorded. */
  canEdit?: boolean;
  /** Refetch after a correction lands, so the line shows what was actually saved. */
  onSegmentsChanged?: () => void;
  /** Faces, by user id. The workspace member list — the participants API carries no avatar at
   *  all, so this is the only place one exists. Omit it and every speaker is initials, which is
   *  what most of them are anyway. */
  speakerDirectory?: Readonly<Record<string, { fullName?: string | null; avatarUrl?: string | null }>>;
  /**
   * WT-311(c): when the MEETING ran — the room's own `startedAt`/`endedAt`, never the
   * translation session's. A host who never pressed Start Translation still held a meeting, and
   * its length was being read off a session that did not exist and coming out as "0m". A
   * missing end renders as "—" rather than as a number.
   */
  meetingStartedAt?: string | null;
  meetingEndedAt?: string | null;
}) {
  // Memoised on the fetched rows rather than recomputed per render: the language options and
  // the translation index are derived from these, and rebuilding them on every keystroke of a
  // correction would rebuild the whole transcript with them.
  const grouped = useMemo(
    () =>
      groupSavedTranscriptSegments(
        [...segments].sort((left, right) => left.sequenceOrder - right.sequenceOrder),
      ),
    [segments],
  );
  const translationIndex = useMemo(
    () => indexTranslationsBySegment(translations),
    [translations],
  );
  const languageOptions = useMemo(
    () => transcriptLanguageOptions(grouped, translationIndex),
    [grouped, translationIndex],
  );
  /* Every language the product can translate into, not only the ones this meeting happened to
     produce — see withOfferableLanguages. A meeting where translation was never started has no
     entries of its own, and that is exactly the reader who needs the picker most. */
  const offeredLanguages = useMemo(
    () =>
      withOfferableLanguages(
        languageOptions,
        languagesInScope("chatTarget").map((language) => language.code),
        grouped.length,
      ),
    [languageOptions, grouped.length],
  );

  const sessionsQuery = useTranslationRoomSessions(roomId);
  const blocks = groupSegmentsByTranslationSession(grouped, sessionsQuery.data ?? [], baseTime);
  const showSessionLabels = blocks.length > 1;
  const totalCount = grouped.length;
  // WT-311(d): when translation first started, from the sessions the meeting actually ran. Null
  // when it never did, and then the header simply does not claim it.
  const translationStartedAt = useMemo(
    () => firstTranslationStart(sessionsQuery.data ?? []),
    [sessionsQuery.data],
  );
  // WT-311(c): the meeting's own length. Only once it is over — a running meeting has no
  // duration yet, and "—" beside "Live" would read as a broken clock rather than an open one.
  const meetingDuration = isEnded
    ? formatMeetingDuration(
        resolveMeetingDurationSeconds({ startedAt: meetingStartedAt, endedAt: meetingEndedAt }),
      )
    : null;
  const absence = describeTranscriptAbsence({
    lineCount: totalCount,
    isEnded,
    isLoading: transcriptLoading,
    errorCode: transcriptErrorCode,
  });
  const base = baseTime ? new Date(baseTime) : null;

  // Null means "the reader has not chosen", which is not the same as choosing as-spoken — the
  // default is derived, so it follows the transcript as it loads instead of being frozen by an
  // effect that ran while the segments were still in flight.
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const [layout, setLayout] = useState<TranscriptLayout>("chat");
  const scrollerRef = useRef<HTMLDivElement>(null);
  // On `blocks` and `layout` both: switching between the three views rebuilds the list at a
  // different height, and the reader's distance from the bottom changes without them scrolling.
  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, {
    revision: `${blocks.length}:${layout}`,
  });
  const [revealedOriginals, setRevealedOriginals] = useState<Record<string, boolean>>({});

  const displayLanguage =
    chosenLanguage ?? defaultTranscriptLanguage(languageOptions, preferredLanguage);

  /* Filling in what the meeting never translated. Inert for as-spoken, and inert without a
     transcript id — the live tab has neither a saved transcript to work on nor an id to name it
     by, and it must keep marking the gap rather than pretending it can close it. */
  const backfill = useTranscriptLanguageBackfill(
    transcriptId,
    displayLanguage === AS_SPOKEN ? undefined : displayLanguage,
  );

  /**
   * Picking a language is the request.
   *
   * "Read it in English" and "translate the rest into English" are not two decisions a reader
   * wants to make in sequence — the first one already means the second. The server does nothing
   * when the language is already complete, so this is safe to fire on every pick.
   */
  function chooseLanguage(code: string) {
    setChosenLanguage(code);
    if (code !== AS_SPOKEN) backfill.request(code);
  }
  // Lines the chosen language does not fully cover — never translated, or a merged utterance
  // with one part missing. Counted here and said out loud below, rather than left for the reader
  // to discover one line at a time.
  const incompleteCount = useMemo(() => {
    if (displayLanguage === AS_SPOKEN) return 0;
    return grouped.reduce((count, line) => {
      const resolved = resolveTranscriptLine(line, translationIndex, displayLanguage);
      return resolved.isUntranslated || resolved.isPartial ? count + 1 : count;
    }, 0);
  }, [grouped, translationIndex, displayLanguage]);

  function toggleOriginal(segmentId: string) {
    setRevealedOriginals((current) => ({ ...current, [segmentId]: !current[segmentId] }));
  }

  /**
   * Everything one line needs, whichever layout is drawing it.
   *
   * Built here rather than inside each layout's own loop: the correction editor, the reveal and
   * the language chip are the same behaviour in all three, and three copies of that wiring is
   * three places for them to drift.
   */
  function buildRow(segment: GroupedSavedTranscriptSegment): TranscriptRowBase {
    const resolved = resolveTranscriptLine(segment, translationIndex, displayLanguage);
    return {
      segment,
      resolved,
      speaker: resolveTranscriptSpeaker(
        segment.speakerParticipantId,
        segment.speakerName,
        speakerDirectory,
      ),
      isSelf: Boolean(currentUserId) && segment.speakerParticipantId === currentUserId,
      time: base ? segmentTime(segment.startTimeMs) : null,
      onSeek: onSeekToRecording ? () => onSeekToRecording(segment.startTimeMs) : undefined,
      highlighted: highlightedSegmentId === segment.id,
      // A chip on every line of a transcript that IS in one language is noise. Shown when the
      // line is not simply "spoken in the language you asked for", which makes its absence
      // meaningful: no chip means these are the speaker's own words.
      showLanguage:
        displayLanguage === AS_SPOKEN || resolved.isTranslated || resolved.isUntranslated,
      revealed: Boolean(revealedOriginals[segment.id]),
      onToggleReveal: () => toggleOriginal(segment.id),
      // WT-311(f): only a line somebody has corrected has a history, and only a SAVED transcript
      // has an id to ask for it by — the live tab has neither, and renders nothing here.
      history:
        segment.isCorrected && transcriptId ? (
          <TranscriptVersionHistory
            transcriptId={transcriptId}
            segmentIds={segment.mergedSegmentIds}
            currentUserId={currentUserId}
            speakerDirectory={speakerDirectory}
          />
        ) : null,
      canCorrect,
      // WT-589: in batch mode every line is open at once, so the three layouts need no changes —
      // they already ask "is this row being edited" and render `editor` when it is.
      isEditing: isBatchEditing ? true : editingSegmentId === segment.id,
      onStartEdit: () => {
        setEditingSegmentId(segment.id);
        setDraftText(segment.originalText);
      },
      editor: isBatchEditing ? (
        <TranscriptBatchLineEditor
          segmentId={segment.id}
          // `??` not `||`: a line the user has emptied must stay empty while they retype it.
          // Falling back to the original on every empty string would undo their deletion as
          // they made it.
          value={batchDrafts[segment.id] ?? segment.originalText}
          speakerName={segment.speakerName}
          disabled={isSavingBatch}
          onChange={(next) =>
            setBatchDrafts((current) => ({ ...current, [segment.id]: next }))
          }
          onCommitAndMoveOn={() => focusNextField(segment.id)}
          onExit={exitBatchEditing}
        />
      ) : (
        <TranscriptLineEditor
          value={draftText}
          onChange={setDraftText}
          speakerName={segment.speakerName}
          spokenLanguage={resolved.isTranslated ? resolved.spokenLanguage : null}
          isSaving={isSavingCorrection}
          onCancel={() => setEditingSegmentId(null)}
          onSave={() => void saveCorrection(segment)}
        />
      ),
    };
  }

  // Correcting the transcript used to live on a separate Transcripts page, which showed the
  // same segments for the same room under its own queue and its own tabs. The room already
  // owns everything that page needed — the meeting, the host, the segments — so the editing
  // moved to where the transcript is read rather than the reading moving to where it was
  // edited.
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  /**
   * WT-589 — reviewing a whole meeting instead of fixing one line.
   *
   * The pencil-per-line editor is right for what it was built for: somebody spots one wrong name
   * and fixes it. It is the wrong shape for the other job, which is reading three hundred lines
   * end to end and correcting as you go — that meant a mouse trip to a hover target, a click, a
   * save, and a scroll, per sentence.
   *
   * Batch mode turns every line into a field and leaves the keyboard in charge. Enter commits the
   * line and moves down; Tab and Shift+Tab move without committing (that is the browser's own
   * behaviour over a list of textareas, and it is better than anything reimplemented here);
   * Shift+Enter is a newline; Escape leaves.
   *
   * WHY THERE IS NO DEBOUNCED AUTO-SAVE
   *   The ticket asks for one. A correction is not a draft: each POST writes an immutable row to
   *   transcript_corrections AND queues a re-translation of that line into every target language
   *   (see saveCorrection). Firing that on a typing pause would file a revision — and a round of
   *   MT — for every pause mid-sentence, and the transcript's own edit history would become
   *   unreadable. Enter is the save, and it is a save the user asked for by moving on. "Done &
   *   save all" catches whatever they typed without pressing it.
   */
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const batchContainerRef = useRef<HTMLDivElement>(null);
  const refreshTranslationsAfterCorrection = useTranslationRefreshAfterCorrection(transcriptId);
  const [isFinalizing, setIsFinalizing] = useState(false);
  // WT-311(a): finalizing is irreversible — it locks the wording for good — and a bare button
  // called "Finalize" did it on one click with nothing on screen saying so. The dialog is the
  // one place that sentence is said before it is too late to matter.
  const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);

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
      // No triggeredRetranslation flag: the server has no such request field, and it is not the
      // caller's decision — SubmitCorrectionAsync sets it from whether the line actually had
      // translations to redo. Sending `false` here read like a switch that was off; it never was
      // one. (It also used to be set true on every correction while nothing retranslated anything:
      // the message it pushed went to a stream no worker consumed.)
      await transcriptService.correctSegment(transcriptId, segment.id, {
        originalText: segment.originalText,
        correctedText,
        correctionType: "stt",
      });
      onSegmentsChanged?.();
      // The line updates now; its translations are redone by warptalk-ai and land seconds later.
      // Without this the reader sees the corrected sentence beside translations of the one it
      // replaced, and nothing on the page ever resolves that.
      refreshTranslationsAfterCorrection();
      setEditingSegmentId(null);
      toast.success("Correction saved. Its translations are being redone.");
    } catch {
      toast.error("Could not save the transcript correction.");
    } finally {
      setIsSavingCorrection(false);
    }
  }

  /** The textareas batch mode renders, in the order they appear on screen. */
  function batchFields(): HTMLTextAreaElement[] {
    const root = batchContainerRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLTextAreaElement>("[data-batch-segment-id]"));
  }

  /**
   * Enter: commit this line and put the cursor on the next one.
   *
   * DOM order, not an index into the segment list. The panel has three layouts and each builds
   * its own loop; a numeric cursor would have to be kept in step with whichever one is mounted,
   * and would be wrong the moment a layout groups or filters lines. What is on screen, in the
   * order it is on screen, is the thing the user is moving through.
   */
  function focusNextField(currentSegmentId: string) {
    const fields = batchFields();
    const index = fields.findIndex(
      (field) => field.dataset.batchSegmentId === currentSegmentId,
    );
    const next = index >= 0 ? fields[index + 1] : undefined;
    if (!next) return;
    next.focus();
    // The caret lands at the end rather than selecting the line: this is "carry on reading",
    // not "replace this". A select-all would make the next keystroke delete a correct sentence.
    next.setSelectionRange(next.value.length, next.value.length);
    next.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function exitBatchEditing() {
    setIsBatchEditing(false);
    setBatchDrafts({});
  }

  /**
   * Posts the lines that actually changed, and only those.
   *
   * Sequential, not Promise.all: each correction queues a re-translation of its line into every
   * target language, and firing three hundred of those at once is the retry storm WT-373 spent a
   * release on. It also lets a partial failure be reported honestly — the ones that landed did
   * land, and saying "saved 12, 3 failed" is the only report that matches the database.
   *
   * The refetch and the translation refresh happen ONCE at the end. Per-correction they would
   * rebuild the entire transcript under the cursor of somebody still typing in it.
   */
  async function saveBatch(): Promise<boolean> {
    if (!transcriptId) return false;

    const pending = pendingCorrections(segments, batchDrafts);

    if (pending.length === 0) return true;

    setIsSavingBatch(true);
    let saved = 0;
    const failed: string[] = [];
    try {
      for (const segment of pending) {
        try {
          await transcriptService.correctSegment(transcriptId, segment.id, {
            originalText: segment.originalText,
            correctedText: batchDrafts[segment.id].trim(),
            correctionType: "stt",
          });
          saved += 1;
        } catch {
          failed.push(segment.id);
        }
      }
    } finally {
      setIsSavingBatch(false);
    }

    if (saved > 0) {
      onSegmentsChanged?.();
      refreshTranslationsAfterCorrection();
    }

    if (failed.length === 0) {
      toast.success(
        `Saved ${saved} ${saved === 1 ? "correction" : "corrections"}. Their translations are being redone.`,
      );
      return true;
    }

    // Deliberately stays in batch mode with the failures still on screen. Dropping out would
    // discard the text the user typed for the lines that did NOT save, which is the only copy
    // of it anywhere.
    toast.error(
      `Saved ${saved}, but ${failed.length} could not be saved. Their edits are still here — try again.`,
    );
    return false;
  }

  async function finalizeTranscript() {
    if (!transcriptId) return;
    setIsFinalizing(true);
    try {
      await transcriptService.finalize(transcriptId);
      onSegmentsChanged?.();
      toast.success("Transcript finalized and locked.");
    } catch {
      toast.error("Could not finalize the transcript.");
    } finally {
      setIsFinalizing(false);
    }
  }

  /** What is on screen, as text. Copy and Download must hand over the transcript being read,
   *  not the stored one — a reader who unified the languages and then copied it got back the
   *  interleaving they had just resolved. */
  function transcriptAsText() {
    return assembleTranscriptText(blocks, translationIndex, displayLanguage);
  }

  function downloadTranscript() {
    saveBlobDownload(
      new Blob([transcriptAsText()], { type: "text/plain;charset=utf-8" }),
      `transcript-${roomId}-${displayLanguage}.txt`,
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
    <div ref={batchContainerRef}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <TranscriptChip icon={<FileText className="size-3.5" />}>
            {isEnded ? "Saved" : "Live"} · {totalCount}{" "}
            {totalCount === 1 ? "entry" : "entries"}
          </TranscriptChip>
          {/* WT-311(c): from the room's own start and end. It used to come off the translation
              session, so a meeting whose host never pressed Start Translation read "0m". */}
          {meetingDuration ? (
            <TranscriptChip
              icon={<Clock className="size-3.5" />}
              title="How long the meeting ran, from when it was started to when it was ended"
            >
              Duration {meetingDuration}
            </TranscriptChip>
          ) : null}
          {/* WT-311(d): translation is a thing the host switches on partway through, and when
              they did is the fact that explains why the first stretch of a transcript has no
              translations. Absent when translation never ran. */}
          {translationStartedAt ? (
            <TranscriptChip
              icon={<Languages className="size-3.5" />}
              title={new Date(translationStartedAt).toLocaleString()}
            >
              Translation started {clockTime(translationStartedAt)}
            </TranscriptChip>
          ) : null}
          {/* Said out loud, because after finalizing the pencils simply stop appearing and
              that on its own reads as the page having broken. */}
          {isFinalized ? (
            <TranscriptChip
              icon={<Lock className="size-3.5" />}
              title="The wording is approved and locked. No further edits are possible."
            >
              Finalized &amp; locked
            </TranscriptChip>
          ) : null}
        </div>
        {totalCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Offered for any transcript with lines in it, including a meeting held entirely in
                one language: that used to render the same transcript twice over and read as a
                broken control, but a language with no coverage is now something the reader can
                ask for rather than a dead entry. */}
            <TranscriptLanguageMenu
              options={offeredLanguages}
              value={displayLanguage}
              onChange={chooseLanguage}
              busyLanguage={backfill.coverage?.status === "running" ? backfill.coverage.targetLanguage : null}
            />
            <TranscriptLayoutToggle value={layout} onChange={setLayout} />
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => onCopy(transcriptAsText(), "Transcript")}
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
            {/* WT-589. Two states, one button, and the second one is not a toggle — it commits.
                "Edit all" reads as a mode; leaving it has to say what leaving does, or somebody
                clicks the same button again expecting it to close and loses their typing. */}
            {canCorrect ? (
              isBatchEditing ? (
                <>
                  <button
                    type="button"
                    onClick={exitBatchEditing}
                    disabled={isSavingBatch}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveBatch().then((ok) => {
                        if (ok) exitBatchEditing();
                      });
                    }}
                    disabled={isSavingBatch}
                    className="flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle className="size-3.5" />
                    {isSavingBatch ? "Saving…" : "Done & save all"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // The per-line pencil and batch mode are the same editor in two postures;
                    // leaving one open underneath the other would leave two fields claiming the
                    // same sentence.
                    setEditingSegmentId(null);
                    setBatchDrafts({});
                    setIsBatchEditing(true);
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil className="size-3.5" />
                  Edit all
                </button>
              )
            ) : null}
            {/* WT-311(a): "Finalize & lock", with the lock in the label, because locking is what
                it does — the old "Finalize" read as "mark done" and silently made the transcript
                uneditable forever. The click opens the confirmation below; the request is sent
                from there. */}
            {canCorrect && !isBatchEditing ? (
              <button
                type="button"
                onClick={() => setIsFinalizeDialogOpen(true)}
                disabled={isFinalizing}
                title="Approve the wording and lock it. No further edits are possible afterwards."
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                <Lock className="size-3.5" />
                {isFinalizing ? "Finalizing…" : "Finalize & lock"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={isFinalizeDialogOpen} onOpenChange={setIsFinalizeDialogOpen}>
        <DialogContent className="rounded-xl border-border bg-surface-1 text-ink sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Finalize and lock this transcript?</DialogTitle>
            <DialogDescription className="pt-2 text-ink-subtle">
              Once finalized, the transcript is approved and locked. No further edits are
              possible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setIsFinalizeDialogOpen(false)}
              className="border-border bg-surface-2 text-ink hover:bg-surface-3"
            >
              Cancel
            </Button>
            <Button
              disabled={isFinalizing}
              onClick={() => {
                setIsFinalizeDialogOpen(false);
                void finalizeTranscript();
              }}
            >
              <Lock />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* What is still not in the chosen language, and what is being done about it. This used to
          be a footnote and nothing more — an honest one, but a reader told that 113 of 285 lines
          are not in English has been informed of a problem rather than given a transcript. */}
      <TranscriptLanguageStatus
        language={displayLanguage}
        incompleteCount={incompleteCount}
        totalCount={totalCount}
        coverage={backfill.coverage}
        canBackfill={Boolean(transcriptId)}
        isStarting={backfill.isStarting}
        failedToStart={backfill.failedToStart}
        onRetry={() => backfill.request(displayLanguage)}
      />

      {absence ? (
        // WT-516: "No transcript was captured for this meeting" is a claim about the MEETING,
        // and it used to be made for every reason this panel had nothing to show — including a
        // refused read, which is how a member of the workspace was told a meeting was silent
        // while 82 saved lines sat behind an access check.
        <div className="rounded-md border border-dashed border-border bg-surface-1 px-3.5 py-3 text-[13px] text-muted-foreground">
          {transcriptAbsenceMessage(absence)}
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
        <div className="relative">
        <div
          ref={scrollerRef}
          className="max-h-[min(60vh,560px)] space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-1 p-4"
        >
          {blocks.map((block) => (
            <div key={block.sessionNumber} className={layout === "chat" ? "space-y-2" : "space-y-0.5"}>
              {showSessionLabels ? (
                <TranscriptSessionDivider sessionNumber={block.sessionNumber} session={block.session} />
              ) : null}
              {layout === "timeline"
                ? // One dot per stretch of the meeting a person held, so the rail shows who had
                  // the floor and when — the thing neither of the other two layouts can show at
                  // a glance, because both of them draw one row per utterance.
                  groupIntoSpeakerTurns(block.segments).map((turn, index) => (
                    <TranscriptTimelineTurn
                      key={turn.key}
                      speaker={resolveTranscriptSpeaker(
                        turn.speakerId,
                        turn.speakerName,
                        speakerDirectory,
                      )}
                      speakerName={turn.speakerName}
                      time={base ? segmentTime(turn.startTimeMs) : null}
                      onSeek={
                        onSeekToRecording
                          ? () => onSeekToRecording(turn.startTimeMs)
                          : undefined
                      }
                      // The rail starts AT the first dot rather than above it — a line hanging
                      // off the top of the transcript reads as content scrolled out of view.
                      isFirst={index === 0}
                      rows={turn.lines.map(buildRow)}
                    />
                  ))
                : block.segments.map((segment) => {
                    const row = buildRow(segment);
                    return layout === "chat" ? (
                      <TranscriptChatRow
                        key={segment.id}
                        {...row}
                        speakerName={
                          row.isSelf ? "You" : segment.speakerName || "Unknown speaker"
                        }
                      />
                    ) : (
                      <TranscriptDocumentRow
                        key={segment.id}
                        {...row}
                        // No "You" here. A document names the people in it, and a record that
                        // reads differently depending on who opened it is not a record.
                        speakerName={segment.speakerName || "Unknown speaker"}
                      />
                    );
                  })}
            </div>
          ))}
        </div>
        {/* A record of an hour-long meeting is hundreds of rows. Somebody reading the middle of it
            had no way back to the end but dragging the scrollbar the length of the room. */}
        <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
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
  const started = session?.startedAt ? clockTime(session.startedAt) : null;
  const ended = session?.endedAt ? clockTime(session.endedAt) : "now";

  return (
    /* 11px, up from 10 (WT-311(d)): this divider is where a reader learns when translation
       started and stopped, and it was the smallest text on the page. */
    <div className="flex items-center gap-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>
        Translation {sessionNumber}
        {started ? ` · ${started}–${ended}` : ""}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The line under the toolbar: how much of the meeting is in the chosen language, and what is
 * happening to the rest.
 *
 * Four states, and they are genuinely different answers rather than four wordings of one:
 * a backfill is running and the reader can watch it close; it failed and can be retried; the
 * gap exists and nothing is filling it (the live tab, which has no saved transcript to work on);
 * or there is nothing to say.
 *
 * The counts come from the server when they are there, because the client only knows about the
 * translations it has fetched, and the whole point of a running backfill is that more are
 * arriving. `incompleteCount` is the fallback — it also catches a merged utterance with one part
 * translated, which the server's per-segment count cannot see.
 */
function TranscriptLanguageStatus({
  language,
  incompleteCount,
  totalCount,
  coverage,
  canBackfill,
  isStarting,
  failedToStart,
  onRetry,
}: {
  language: string;
  incompleteCount: number;
  totalCount: number;
  coverage: TranscriptLanguageCoverage | null;
  canBackfill: boolean;
  isStarting: boolean;
  /** The request to start one was refused or never arrived — a different failure from a run
   *  that started and then broke, and the reader can only act on it by asking again. */
  failedToStart: boolean;
  onRetry: () => void;
}) {
  if (language === AS_SPOKEN) return null;

  const name = getLanguageName(language);
  const running = coverage?.status === "running" || isStarting;
  const failed = coverage?.status === "failed";
  const missing = coverage?.missing ?? incompleteCount;
  const total = coverage?.totalSegments ?? totalCount;
  const done = Math.max(0, total - missing);

  if (running) {
    return (
      <div className="mb-2 space-y-1.5">
        <p className="flex items-center gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>
            Translating the rest of this meeting into {name} — {done} of {total} entries ready.
          </span>
        </p>
        {/* The bar and the sentence say the same thing on purpose: the number is what a reader
            checks, the bar is what tells them at a glance that it is still moving. */}
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={`Translating into ${name}`}
        >
          <div
            className="h-full rounded-full bg-ink/40 transition-[width] duration-500"
            style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
          />
        </div>
      </div>
    );
  }

  if ((failed || failedToStart) && missing > 0) {
    return (
      <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-relaxed text-muted-foreground">
        <span>
          {missing} {missing === 1 ? "entry" : "entries"} could not be translated into {name}.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-2 py-0.5 text-[12px] text-ink transition-colors hover:bg-surface-2"
        >
          Try again
        </button>
      </p>
    );
  }

  if (missing <= 0) return null;

  if (!canBackfill) {
    // The live tab: the transcript is still being written and there is no saved id to work on,
    // so the honest footnote is all there is. It was the whole feature before backfill existed.
    return (
      <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
        {missing} of {total} entries {missing === 1 ? "is" : "are"} not fully in {name} — marked,
        with the spoken words one click away.
      </p>
    );
  }

  return (
    <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-relaxed text-muted-foreground">
      <span>
        {missing} of {total} entries {missing === 1 ? "is" : "are"} not in {name} yet.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border px-2 py-0.5 text-[12px] text-ink transition-colors hover:bg-surface-2"
      >
        Translate {missing === 1 ? "it" : "them"}
      </button>
    </p>
  );
}

/**
 * Which language to read the meeting in.
 *
 * Every entry says how much of the meeting is readable in it before the reader commits. A meeting
 * can be readable end-to-end in a language nobody spoke — that is what the dubbing produced —
 * partially readable in one where translation was only running for part of it, or not readable in
 * it at all. The last of those used to be left out of the list; it is offered now, because
 * choosing it translates the meeting into it rather than returning a page of untranslated lines.
 */
function TranscriptLanguageMenu({
  options,
  value,
  onChange,
  busyLanguage,
}: {
  options: readonly TranscriptLanguageOption[];
  value: string;
  onChange: (value: string) => void;
  /** The language a backfill is currently filling in, so its row can say so. */
  busyLanguage?: string | null;
}) {
  const asSpoken = value === AS_SPOKEN;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-surface-2 hover:text-ink">
        <Languages className="size-3.5" />
        <span className="max-w-[132px] truncate font-medium text-ink">
          {asSpoken ? "As spoken" : getLanguageName(value)}
        </span>
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[272px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Read this transcript in</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onChange(AS_SPOKEN)}>
            <TranscriptLanguageItem
              label="As spoken"
              detail="Every line in its own language"
              selected={asSpoken}
            />
          </DropdownMenuItem>
          {options.map((option) => (
            <DropdownMenuItem key={option.code} onClick={() => onChange(option.code)}>
              <TranscriptLanguageItem
                label={`${getFlagEmoji(option.code)} ${getLanguageName(option.code)}`.trim()}
                detail={languageDetail(option, busyLanguage === option.code)}
                selected={!asSpoken && option.code === value}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What one row of the picker says about itself.
 *
 * "N of M entries" is the wrong thing to show a language with nothing in it yet — it reads as a
 * broken option rather than as an offer — and it is the wrong thing to show one that covers the
 * whole meeting, where the number is just noise beside the name.
 */
function languageDetail(option: TranscriptLanguageOption, busy: boolean): string {
  if (busy) return "Translating the rest now";
  // completeCount, not readableCount: a merged utterance with half a translation is readable and
  // is still marked incomplete in the transcript below, and a row promising "the whole meeting"
  // over that contradicts the line it sits above.
  if (option.totalCount > 0 && option.completeCount >= option.totalCount) return "The whole meeting";
  if (option.completeCount === 0) return "Translate the meeting into this";
  return `${option.completeCount} of ${option.totalCount} entries · translate the rest`;
}

function TranscriptLanguageItem({
  label,
  detail,
  selected,
}: {
  label: string;
  detail: string;
  selected: boolean;
}) {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <Check className={cn("size-3.5 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{label}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{detail}</span>
    </span>
  );
}

/**
 * Conversation, document, or timeline.
 *
 * The bubbles are the meeting as it happened — who answered whom, and how quickly. The document
 * is the meeting as a record: one column of names, one column of what they said, nothing
 * indented by who is reading it. Minutes get written from the second one and nobody was going
 * to transcribe a chat log by hand to get there.
 *
 * The timeline is the meeting as a SHAPE. Both of the others draw one row per utterance, so a
 * long meeting is a wall with no landmarks in it: who had the floor, for how long, and where the
 * conversation turned are all facts that exist in the data and appear nowhere on screen. A rail
 * with a dot per speaker turn puts them there, and makes the times something to aim at rather
 * than something printed beside each line.
 */
function TranscriptLayoutToggle({
  value,
  onChange,
}: {
  value: TranscriptLayout;
  onChange: (value: TranscriptLayout) => void;
}) {
  const options: { key: TranscriptLayout; label: string; icon: ReactNode }[] = [
    { key: "chat", label: "Conversation view", icon: <MessageSquare className="size-3.5" /> },
    { key: "document", label: "Document view", icon: <AlignLeft className="size-3.5" /> },
    { key: "timeline", label: "Timeline view", icon: <GitCommitVertical className="size-3.5" /> },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "grid size-6 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:text-ink",
            value === option.key ? "bg-surface-2 text-ink" : "",
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * Everything a transcript line needs, whichever way it is laid out.
 *
 * The speaker's name is NOT here: the chat and document layouts print it per line and disagree
 * about what to call the reader, while the timeline prints it once per turn and not on the lines
 * at all. It is the one thing the layouts genuinely decide for themselves.
 */
type TranscriptRowBase = {
  segment: GroupedSavedTranscriptSegment;
  resolved: ResolvedTranscriptLine;
  /** Who said it — carries the colour every layout marks this line with. */
  speaker: TranscriptSpeaker;
  isSelf: boolean;
  time: string | null;
  onSeek?: () => void;
  highlighted: boolean;
  showLanguage: boolean;
  revealed: boolean;
  onToggleReveal: () => void;
  /** WT-311(f): the "Version history" chip on a corrected line; null when it has none. */
  history: ReactNode;
  canCorrect: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  /** The correction editor, built by the panel so every layout opens the same one. */
  editor: ReactNode;
};

type TranscriptRowProps = TranscriptRowBase & { speakerName: string };

function TranscriptChatRow({
  segment,
  resolved,
  speaker,
  speakerName,
  isSelf,
  time,
  onSeek,
  highlighted,
  showLanguage,
  revealed,
  onToggleReveal,
  history,
  canCorrect,
  isEditing,
  onStartEdit,
  editor,
}: TranscriptRowProps) {
  return (
    <div
      id={`transcript-segment-${segment.id}`}
      className={cn(
        "flex scroll-mt-4 rounded-md transition-colors",
        isSelf ? "justify-end" : "justify-start",
        highlighted ? "bg-primary/10 ring-1 ring-primary/30" : "",
      )}
    >
      <div className={cn("flex max-w-[75%] flex-col gap-1", isSelf ? "items-end" : "items-start")}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
            isSelf ? "flex-row-reverse" : "",
          )}
        >
          {/* The face goes with the name rather than beside the bubble: at 18px it belongs to the
              label, and floating it outside would indent every line of a wall of text by a
              column that is empty for most people. */}
          <TranscriptSpeakerAvatar speaker={speaker} />
          <span className="font-semibold text-ink">{speakerName}</span>
          {showLanguage ? (
            <TranscriptLineLanguage
              resolved={resolved}
              revealed={revealed}
              onToggleReveal={onToggleReveal}
            />
          ) : null}
          {time ? <TranscriptLineTime time={time} onSeek={onSeek} /> : null}
          {/* On the label line, not in the bubble: the bubble's corner already holds the pencil,
              and a second control there would sit on top of the text it is about. */}
          {history}
        </div>
        {isEditing ? (
          editor
        ) : (
          <>
            <div
              className={cn(
                "group/line relative overflow-hidden rounded-2xl px-3 py-2",
                canCorrect ? "pr-9" : "",
                isSelf
                  ? "rounded-tr-sm bg-primary"
                  // Was a literal `bg-white`, which is a colour and not a token: in dark mode the
                  // incoming bubble stayed pure white and printed muted grey text on it, at a
                  // contrast a person cannot read. Surface-2 is the same subtle card in light mode
                  // and follows the theme in the other.
                  : "rounded-tl-sm border border-border bg-surface-2 pl-4",
              )}
            >
              {/* Only on the incoming side. The reader's own bubble is already the one solid
                  colour on the page, and a second stripe on it would compete with that. */}
              {isSelf ? null : <TranscriptSpeakerStripe speaker={speaker} />}
              <p className={cn("text-[13px] leading-6", isSelf ? "text-white" : "text-ink")}>
                {resolved.text}
              </p>
              {canCorrect ? (
                <button
                  type="button"
                  aria-label="Edit transcript line"
                  title="Edit this line"
                  onClick={onStartEdit}
                  className={cn(
                    "absolute right-1 top-1 grid size-7 place-items-center rounded-md opacity-60 transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100",
                    isSelf ? "text-white hover:bg-white/20" : "hover:bg-surface-2",
                  )}
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </div>
            {revealed && resolved.isTranslated ? (
              <TranscriptSpokenOriginal resolved={resolved} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The transcript as a document: names down the left, what was said beside them.
 *
 * A fixed name column rather than an inline "Name:" prefix, so the sentences start on the same
 * x for every speaker and the eye can run down one column of text — which is the whole reason
 * to read a meeting this way instead of as bubbles.
 */
function TranscriptDocumentRow({
  segment,
  resolved,
  speaker,
  speakerName,
  time,
  onSeek,
  highlighted,
  showLanguage,
  revealed,
  onToggleReveal,
  history,
  canCorrect,
  isEditing,
  onStartEdit,
  editor,
}: TranscriptRowProps) {
  return (
    <div
      id={`transcript-segment-${segment.id}`}
      className={cn(
        "group/line relative grid scroll-mt-4 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md py-1 pl-3 pr-1.5 transition-colors hover:bg-surface-2/60",
        highlighted ? "bg-primary/10 ring-1 ring-primary/30" : "",
      )}
    >
      {/* Consecutive rows by one person stack their stripes into a single unbroken line down the
          left of the block, which is the whole point: a document draws one row per utterance, so
          a paragraph somebody spoke is a dozen rows that look like a dozen speakers. */}
      <TranscriptSpeakerStripe speaker={speaker} className="my-px" />
      <div className="flex items-center gap-2">
        {time ? <TranscriptLineTime time={time} onSeek={onSeek} /> : null}
        <TranscriptSpeakerAvatar speaker={speaker} />
        <span
          className="w-[108px] shrink-0 truncate text-[13px] font-semibold text-ink"
          title={speakerName}
        >
          {speakerName}:
        </span>
      </div>
      <div className="min-w-0">
        {isEditing ? (
          editor
        ) : (
          <>
            <p className="text-[13px] leading-6 text-ink">{resolved.text}</p>
            {revealed && resolved.isTranslated ? (
              <TranscriptSpokenOriginal resolved={resolved} />
            ) : null}
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!isEditing ? history : null}
        {showLanguage && !isEditing ? (
          <TranscriptLineLanguage
            resolved={resolved}
            revealed={revealed}
            onToggleReveal={onToggleReveal}
          />
        ) : null}
        {canCorrect && !isEditing ? (
          <button
            type="button"
            aria-label="Edit transcript line"
            title="Edit this line"
            onClick={onStartEdit}
            className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover/line:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One stretch of the meeting a person held, drawn on the rail.
 *
 * The rail is a real vertical line, not a border on the content: it has to pass BEHIND the dot
 * and stop cleanly at the first one, and a border cannot do either. The dot carries a ring in
 * the container's own colour so the line appears to pass under it rather than through it.
 */
function TranscriptTimelineTurn({
  speaker,
  speakerName,
  time,
  onSeek,
  isFirst,
  rows,
}: {
  speaker: TranscriptSpeaker;
  speakerName: string;
  time: string | null;
  onSeek?: () => void;
  isFirst: boolean;
  rows: TranscriptRowBase[];
}) {
  // A citation lands on a LINE; the turn it belongs to is what has to look selected, because the
  // turn is what the reader sees as one thing here.
  const highlighted = rows.some((row) => row.highlighted);

  return (
    <div className="grid grid-cols-[58px_16px_minmax(0,1fr)] gap-x-1">
      {/* Wide enough for "07:16 AM" on one line. At 46px it wrapped the meridiem onto a second
          row, which put a two-line label beside a one-line name on every single turn. */}
      <div className="whitespace-nowrap pt-[7px] text-right">
        {time ? <TranscriptLineTime time={time} onSeek={onSeek} /> : null}
      </div>

      <div className="relative flex justify-center">
        <span
          aria-hidden
          className={cn(
            // Was a fixed grey hairline. It is the speaker's colour now and 2px wide, because the
            // rail beside a turn is the thing a reader follows down a long stretch of talking —
            // a name at the top has to be read, and this does not.
            "absolute w-[2px] rounded-full",
            isFirst ? "bottom-0 top-[11px]" : "inset-y-0",
          )}
          style={{ backgroundColor: speakerColorVar(speaker.id) }}
        />
        <span
          className={cn(
            "relative mt-[8px] size-[7px] shrink-0 rounded-full ring-4 ring-surface-1 transition-colors",
            highlighted ? "bg-primary" : "",
          )}
          // The highlight wins: a cited line is why the reader is here, and the class above it
          // has to be able to override this.
          style={highlighted ? undefined : { backgroundColor: speakerColorVar(speaker.id) }}
        />
      </div>

      <div
        className={cn(
          "-mx-2 min-w-0 rounded-md px-2 pb-3.5 pt-0.5 transition-colors",
          highlighted ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-surface-2/60",
        )}
      >
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <TranscriptSpeakerAvatar speaker={speaker} />
          <span className="truncate" title={speakerName}>
            {speakerName}
          </span>
        </p>
        <div className="mt-1 space-y-1.5">
          {rows.map((row) => (
            <TranscriptTimelineLine key={row.segment.id} {...row} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One utterance inside a turn. No name and no time — the turn above it carries both. */
function TranscriptTimelineLine({
  segment,
  resolved,
  showLanguage,
  revealed,
  onToggleReveal,
  history,
  canCorrect,
  isEditing,
  onStartEdit,
  editor,
}: TranscriptRowBase) {
  if (isEditing) {
    return <div id={`transcript-segment-${segment.id}`}>{editor}</div>;
  }

  return (
    <div
      id={`transcript-segment-${segment.id}`}
      className="group/line flex scroll-mt-4 items-start gap-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-6 text-ink">{resolved.text}</p>
        {revealed && resolved.isTranslated ? (
          <TranscriptSpokenOriginal resolved={resolved} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {history}
        {showLanguage ? (
          <TranscriptLineLanguage
            resolved={resolved}
            revealed={revealed}
            onToggleReveal={onToggleReveal}
          />
        ) : null}
        {canCorrect ? (
          <button
            type="button"
            aria-label="Edit transcript line"
            title="Edit this line"
            onClick={onStartEdit}
            className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover/line:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TranscriptLineTime({ time, onSeek }: { time: string; onSeek?: () => void }) {
  if (!onSeek) {
    return <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{time}</span>;
  }

  return (
    <button
      type="button"
      onClick={onSeek}
      title="Play the recording from here"
      className="shrink-0 rounded font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-ink hover:underline"
    >
      {time}
    </button>
  );
}

/**
 * What language a line is in, and — when it is a translation — the way back to what was said.
 *
 * A translated line is still a claim about what somebody said, and the reader has to be able to
 * check it. The original is one click away rather than printed under every line, which is the
 * interleaving this whole view exists to undo.
 */
function TranscriptLineLanguage({
  resolved,
  revealed,
  onToggleReveal,
}: {
  resolved: ResolvedTranscriptLine;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const spoken = (resolved.spokenLanguage || "?").toUpperCase();

  if (resolved.isTranslated) {
    return (
      <button
        type="button"
        onClick={onToggleReveal}
        aria-expanded={revealed}
        title={
          resolved.isPartial
            ? `Part of this line was never translated — show all of what was said, in ${getLanguageName(resolved.spokenLanguage)}`
            : `Translated from ${getLanguageName(resolved.spokenLanguage)} — show what was said`
        }
        className={cn(
          "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium transition-colors",
          // A partly translated line is a warning, not a footnote: the words on screen are
          // fluent and complete-looking and are short of a sentence.
          resolved.isPartial
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
            : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-ink",
        )}
      >
        <Languages className="size-3" />
        {spoken}
        <ChevronDown className={cn("size-3 transition-transform", revealed ? "" : "-rotate-90")} />
      </button>
    );
  }

  if (resolved.isUntranslated) {
    return (
      <span
        title={`This line was never translated — it is shown in ${getLanguageName(resolved.spokenLanguage)}, as spoken`}
        className="inline-flex h-5 shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      >
        {spoken}
      </span>
    );
  }

  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-surface-1 px-1.5 text-[10px] font-medium text-muted-foreground">
      {spoken}
    </span>
  );
}

function TranscriptSpokenOriginal({ resolved }: { resolved: ResolvedTranscriptLine }) {
  return (
    <p className="mt-1 rounded-md border border-dashed border-border bg-surface-2/60 px-2.5 py-1.5 text-[12px] leading-5 text-muted-foreground">
      <span className="mr-1.5 font-medium uppercase">{resolved.spokenLanguage}</span>
      {resolved.spokenText}
    </p>
  );
}

/**
 * WT-311(f): a corrected line says so, and shows how it got there.
 *
 * A correction rewrites the line in place, so without this the reader had no way to tell an
 * edited sentence from an original one, let alone see what it said before. The chip is visible
 * at rest rather than on hover — "this was changed" is a fact about the record, not a control —
 * and it is labelled by what it opens, because "Edited" alone reads as a status, not a door —
 * and the history behind it is fetched only when somebody opens it: the list mounts with the
 * popover, and the hook inside it does the asking.
 *
 * A popover rather than a modal: the reader is comparing a revision with the line it sits
 * beside, and a modal would cover the line.
 */
function TranscriptVersionHistory({
  transcriptId,
  segmentIds,
  currentUserId,
  speakerDirectory,
}: {
  transcriptId: string;
  /** Every stored segment behind this rendered line — corrections are recorded per segment. */
  segmentIds: readonly string[];
  currentUserId?: string;
  speakerDirectory?: Readonly<Record<string, { fullName?: string | null }>>;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Version history"
        title="This line was corrected — show its version history"
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-border bg-surface-1 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <History className="size-3" />
        Version history
      </PopoverTrigger>
      {/* Portaled by the primitive, so the transcript's own scroll frame cannot clip it — the
          frame is overflow-y-auto, which the browser computes as clipping on both axes. */}
      <PopoverContent align="start" className="w-[340px] max-w-[calc(100vw-2rem)] p-0">
        <TranscriptCorrectionList
          transcriptId={transcriptId}
          segmentIds={segmentIds}
          currentUserId={currentUserId}
          speakerDirectory={speakerDirectory}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The revisions themselves, newest first. Mounted only while the popover is open. */
function TranscriptCorrectionList({
  transcriptId,
  segmentIds,
  currentUserId,
  speakerDirectory,
}: {
  transcriptId: string;
  segmentIds: readonly string[];
  currentUserId?: string;
  speakerDirectory?: Readonly<Record<string, { fullName?: string | null }>>;
}) {
  const query = useSegmentCorrections(transcriptId, segmentIds);

  return (
    <div className="max-h-[320px] overflow-y-auto">
      <div className="border-b border-border px-3 py-2">
        <p className="text-[12px] font-semibold text-ink">Version history</p>
        <p className="text-[11px] text-muted-foreground">
          Newest first. Each entry is one saved correction.
        </p>
      </div>
      {query.isLoading ? (
        <p className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          Loading…
        </p>
      ) : query.isError ? (
        <p className="px-3 py-3 text-[12px] text-muted-foreground">
          Could not load the version history. Close this and try again.
        </p>
      ) : !query.data?.length ? (
        // The line is marked corrected and the server holds no rows for it. Say that rather than
        // nothing: an empty popover reads as a request that never returned.
        <p className="px-3 py-3 text-[12px] text-muted-foreground">
          No corrections are recorded for this line.
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {query.data.map((correction) => (
            <li key={correction.id} className="space-y-1 px-3 py-2.5">
              <p className="text-[12px] leading-5 text-ink">{correction.correctedText}</p>
              <p className="text-[11px] leading-5 text-muted-foreground line-through decoration-muted-foreground/60">
                {correction.originalText}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {correctionAuthorName(correction.userId, currentUserId, speakerDirectory)} ·{" "}
                <time dateTime={correction.createdAt}>
                  {new Date(correction.createdAt).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * WT-589: one line inside batch mode. A field, not a form.
 *
 * No Save/Cancel pair of its own — that is the whole point. Three hundred of them would be six
 * hundred buttons, and the commit is the Enter key that already moves you on. The dashed border
 * says the same thing the buttons used to: this text is editable right now.
 */
function TranscriptBatchLineEditor({
  segmentId,
  value,
  speakerName,
  disabled,
  onChange,
  onCommitAndMoveOn,
  onExit,
}: {
  segmentId: string;
  value: string;
  speakerName?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onCommitAndMoveOn: () => void;
  onExit: () => void;
}) {
  return (
    <textarea
      data-batch-segment-id={segmentId}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onExit();
          return;
        }
        // Shift+Enter is a newline, which is the textarea's own behaviour — so it is not handled
        // here, it is simply not intercepted. Tab and Shift+Tab are left alone for the same
        // reason: the browser already walks a list of textareas in document order, and that is
        // exactly the movement the ticket asks for.
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onCommitAndMoveOn();
        }
      }}
      aria-label={`Edit transcript line by ${speakerName || "unknown speaker"}`}
      rows={Math.min(6, Math.max(1, Math.ceil(value.length / 80)))}
      className="w-full min-w-0 resize-y rounded-md border border-dashed border-primary/50 bg-canvas px-2.5 py-1.5 text-[13px] leading-6 text-ink outline-none focus:border-solid focus:border-primary disabled:opacity-60"
    />
  );
}

function TranscriptLineEditor({
  value,
  onChange,
  speakerName,
  spokenLanguage,
  isSaving,
  onCancel,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  speakerName?: string;
  /** Set when the line on screen is a translation, so the editor can say what it is editing. */
  spokenLanguage: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="w-full min-w-0 space-y-2 rounded-xl border border-primary/40 bg-surface-1 p-2.5">
      {/* A reader who unified the transcript is looking at a translation, and the pencil edits
          the words underneath it. Saying so is what stops a correction being typed into the
          wrong language — the re-translation then rewrites every language from it. */}
      {spokenLanguage ? (
        <p className="text-[11px] text-muted-foreground">
          Editing what was said, in {getLanguageName(spokenLanguage)}. The translations are
          rewritten from it.
        </p>
      ) : null}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Edit transcript line by ${speakerName || "unknown speaker"}`}
        className="min-h-24 w-full resize-y rounded-md border border-border bg-canvas px-2.5 py-2 text-[13px] leading-6 text-ink outline-none focus:border-primary"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !value.trim()}
          onClick={onSave}
          className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save correction"}
        </button>
      </div>
    </div>
  );
}
