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
  Play,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
// WT-605. The pause-window read lives with the other transcript hooks, not with the room
// ones — #410 wrote its own beside useTranslationRoomSessions before the merged version
// existed, and two hooks of the same name over the same endpoint is how they drift.
import { useTranscriptPauseWindows } from "@/hooks/use-transcripts";
import {
  TranscriptSpeakerAvatar,
  TranscriptSpeakerStripe,
} from "@/components/rooms/transcript-speaker-avatar";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useReadingSync } from "@/components/rooms/transcript-reading-sync";
import { getLanguageCode, getLanguageName, languagesInScope } from "@/lib/language/languages";
import { splitIntoSentences } from "@/lib/transcript/sentence-flow";
import { formatCitationTime } from "@/lib/meeting/meeting-summary";
import {
  READING_LINE_OFFSET_PX,
  readingAnchorAt,
  shouldShowLanguageChip,
  splitOnQuery,
  stepAnchorKey,
  type LanguageMark,
  type ReadingAnchor,
} from "@/lib/transcript/document-reading";
import {
  firstTranslationStart,
  groupIntoSpeakerTurns,
  groupSavedTranscriptSegments,
  groupSegmentsByTranslationSession,
  pendingCorrections,
  resolveTranscriptPauseGaps,
  splitSegmentsAroundPauseGaps,
  type GroupedSavedTranscriptSegment,
  type TranscriptPauseGap,
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
 * Whether this reader has asked the system not to animate.
 *
 * Read at the moment of the scroll rather than held in state: the setting can change while a record
 * page is open, and a stale answer here means a surface that keeps animating itself after somebody
 * has just turned animation off. The guard is for SSR and for the jsdom-shaped environments that
 * have `window` but not `matchMedia`.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * WT-655(C3) — "Follow playback", after the reader has scrolled away from it.
 *
 * Same floating shape as ScrollToLatestChip, deliberately: they answer the same kind of question
 * ("take me back to the thing that is moving") and appear in the same corner of the same scroller,
 * so two different shapes would read as two unrelated systems. Filled rather than outlined, because
 * unlike Latest this one is offered rarely and is the more specific of the two answers.
 *
 * `tabIndex`/`aria-hidden` while invisible for the same reason the Latest chip carries them: a
 * focusable invisible button is a trap that scrolls the page for no visible reason.
 */
function FollowPlaybackChip({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center transition-opacity duration-150 print:hidden",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        type="button"
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        onClick={onClick}
        title="Scroll with the recording again"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-ink py-1.5 pl-2.5 pr-3.5 text-[12px] font-medium text-canvas shadow-[0_2px_10px_rgba(0,0,0,0.14)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          visible ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <Play className="size-3.5 fill-current" />
        Follow playback
      </button>
    </div>
  );
}

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
  // WT-605. Independent of the translation-session grouping above — pausing the transcript and
  // pausing translation are different, unrelated actions.
  const pauseWindowsQuery = useTranscriptPauseWindows(roomId);
  const pauseGaps = resolveTranscriptPauseGaps(pauseWindowsQuery.data ?? [], baseTime);
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
  /**
   * The rail beside this column, when there is one.
   *
   * Null on /dev/transcript-preview and anywhere else this panel is rendered on its own, and every
   * use of it below is guarded — the two-way sync is an addition to the document layout, not a
   * precondition for it.
   */
  const sync = useReadingSync();
  // Document, when a summary rail is sitting beside it. That pairing IS the reading posture the
  // rail exists for: a claim on the right and the paragraph it came from on the left. Opening on
  // bubbles there would make the reader's first action changing the layout.
  const [layout, setLayout] = useState<TranscriptLayout>(sync ? "document" : "chat");
  const isReading = layout === "document";
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
  //
  // Counted over `grouped`, so it is in the same unit as `totalCount` and as the "Saved · N
  // entries" chip: one per ROW the panel draws, not one per stored STT chunk. That is the whole
  // reason TranscriptLanguageStatus prints this number instead of the server's — see the note
  // there — and it is why anything added to this reduce has to be a fact about a rendered line.
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

  /* ─────────────────────────────────────────────────────────────────────────────────────────
     Reading mode: the document as speaker turns, and the wire to the rail beside it.
     ───────────────────────────────────────────────────────────────────────────────────────── */

  /**
   * The document as TURNS rather than as utterances.
   *
   * This is the single largest change reading mode makes, and it is a vertical-space change before
   * it is an aesthetic one. Finalized STT chunks arrive every few seconds, so one person talking
   * for two minutes is twenty rows — twenty repetitions of their name, their face and their
   * timestamp, wrapped around one paragraph of speech. Grouped on the same ~30-second window the
   * timeline already uses (groupIntoSpeakerTurns), that becomes one block with the name printed
   * once, and a meeting stops being taller than the thing it is a record of.
   */
  const readingTurns = useMemo(
    () => blocks.flatMap((block) => groupIntoSpeakerTurns(block.segments)),
    [blocks],
  );

  /**
   * Which lines print a language chip.
   *
   * Computed over the whole document in one pass, because the rule is about a CHANGE and a change
   * is only visible from the line before it — a per-row decision cannot see one. A Vietnamese
   * meeting read as spoken prints "VI" once, at the top, instead of four hundred times down the
   * right margin. See shouldShowLanguageChip for why the two warning states are exempt.
   */
  const languageChipLineIds = useMemo(() => {
    if (!isReading) return null;

    const ids = new Set<string>();
    let previous: LanguageMark | null = null;
    for (const turn of readingTurns) {
      for (const line of turn.lines) {
        const resolved = resolveTranscriptLine(line, translationIndex, displayLanguage);
        const mark: LanguageMark = {
          language: (resolved.spokenLanguage || "?").toLowerCase(),
          state: resolved.isPartial
            ? "partial"
            : resolved.isUntranslated
              ? "untranslated"
              : resolved.isTranslated
                ? "translated"
                : "spoken",
        };
        if (shouldShowLanguageChip(mark, previous)) ids.add(line.id);
        previous = mark;
      }
    }
    return ids;
  }, [isReading, readingTurns, translationIndex, displayLanguage]);

  // Ctrl+F over a page, not a filter over a list — see splitOnQuery. Opened by the toolbar button
  // or by `/`, which is the key a person reading a document already reaches for.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /**
   * Where every turn sits inside the scroller, measured rather than assumed.
   *
   * Rect arithmetic, not `offsetTop`: `offsetTop` is relative to the nearest POSITIONED ancestor,
   * and this column has picked up and lost one of those twice already (the highlight ring, the
   * scroll-to-latest chip). Subtracting the two bounding boxes and adding the scroll offset gives
   * the distance from the top of the scrolled content whatever the positioning happens to be.
   *
   * The start and end of each block are read off the element rather than out of a second copy of
   * the turn list, so there is exactly one thing that can be stale: the DOM.
   */
  /*
   * Pulled off the context ONE FIELD AT A TIME, and this is load-bearing rather than tidy.
   *
   * The context value changes identity whenever anything in it changes — including `readingKey`,
   * which this column is itself the one setting. A callback that closed over the whole `sync`
   * would therefore be rebuilt by its own output, the effect below would re-run, and the position
   * would be recomputed from the scrollbar the instant J or K moved it: the key would snap back to
   * wherever the scroll happened to be, and on a document short enough not to scroll at all the
   * two keys would appear to do nothing whatsoever. Both of these are stable — one is a `useState`
   * setter, the other only changes when the document is actually re-measured.
   */
  const publishAnchors = sync?.publishAnchors;
  const anchors = sync?.anchors;
  const setReadingKey = sync?.setReadingKey;

  const measureAnchors = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!publishAnchors || !scroller) return;

    const scrollerTop = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const measured: ReadingAnchor[] = [];
    for (const node of scroller.querySelectorAll<HTMLElement>("[data-reading-turn]")) {
      const key = node.dataset.readingTurn;
      if (!key) continue;
      measured.push({
        key,
        startMs: Number(node.dataset.startMs ?? 0),
        endMs: Number(node.dataset.endMs ?? 0),
        offsetTop: node.getBoundingClientRect().top - scrollerTop,
      });
    }
    publishAnchors(measured);
  }, [publishAnchors]);

  useEffect(() => {
    if (!publishAnchors) return;
    // Leaving reading mode retracts the anchors rather than leaving the last ones standing: a rail
    // still pointing at blocks that are no longer on screen would highlight nothing and look
    // broken, which is worse than a rail that admits it has nothing to point at.
    if (!isReading) {
      publishAnchors([]);
      return;
    }

    measureAnchors();

    // Heights change without a re-render here: a translation arrives, a chip wraps, a correction
    // editor opens. An observer is the only thing that sees those; a one-shot measurement on mount
    // would leave every anchor below the change pointing at the wrong pixel.
    const content = documentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureAnchors());
    observer.observe(content);
    return () => observer.disconnect();
  }, [publishAnchors, isReading, measureAnchors, readingTurns, displayLanguage]);

  /** The second direction of the sync: what the reader is looking at, told to the rail. */
  const reportReadingPosition = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!anchors || !setReadingKey || !scroller) return;
    const anchor = readingAnchorAt(anchors, scroller.scrollTop + READING_LINE_OFFSET_PX);
    setReadingKey(anchor?.key ?? null);
  }, [anchors, setReadingKey]);

  // Once per publish, so the rail lights up on arrival instead of waiting for the first scroll.
  // `reportReadingPosition` changes identity with the anchor list, which is exactly the moment
  // the answer can have changed without anybody scrolling.
  useEffect(() => {
    reportReadingPosition();
  }, [reportReadingPosition]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  function handleReadingScroll() {
    if (!anchors || scrollFrameRef.current !== null) return;
    // One report per frame. Scroll fires far faster than the rail can usefully be repainted, and
    // an unthrottled handler over a thousand-block meeting is how a reading surface starts
    // dropping frames on exactly the meetings worth reading.
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      reportReadingPosition();
    });
  }

  const scrollToTurn = useCallback((key: string, options?: { center?: boolean }) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const node = scroller.querySelector<HTMLElement>(
      `[data-reading-turn="${CSS.escape(key)}"]`,
    );
    if (!node) return;
    const box = node.getBoundingClientRect();
    const offset = box.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    /* CENTRED for a block the recording is playing, just under the top edge for one the reader
       jumped to. Different jobs: a jump is "start reading here", and the answer is at the top with
       the rest of the meeting below it. Following playback is "keep this in view while it moves",
       and a line pinned to the top edge has the next thirty seconds of talking below it and no
       context above — which is exactly what a reader following an argument needs. Centred also
       means the block does not have to move again the instant the speaker changes. */
    const top = options?.center
      ? offset - Math.max(0, (scroller.clientHeight - box.height) / 2)
      // Just above the reading line, not at the very top edge: landing a block flush against the
      // top puts it exactly where readingAnchorAt stops counting it as the one being read.
      : offset - 24;
    scroller.scrollTo({
      top: Math.max(0, top),
      // Somebody who asked the system not to animate has asked that of a surface which, while
      // following a recording, animates itself every twenty seconds unprompted. Honouring it here
      // is not a nicety.
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────────────────────
     WT-655(C) — the transcript follows the recording.

     Wave 1 gave the reader transcript → video: click a timestamp and the recording seeks. This is
     the other direction, and it is the one that makes a record watchable rather than merely
     searchable: while the recording plays, the line being spoken is marked and the column scrolls
     to keep it in view.

     THE THREE RULES THAT KEEP IT FROM BEING ANNOYING
       1. The mark is a TEXT COLOUR, never a background. Background is already spoken for twice over
          here — hover, and the row a summary citation jumped to (`highlighted`). A third meaning on
          the same property is how a reader stops being able to read any of them.
       2. A manual scroll switches following off, and only the reader switches it back on. Being
          dragged back to the playhead after deliberately scrolling away is the single worst thing a
          surface like this can do.
       3. Nothing moves while the recording is paused. No polling, no highlight, no scrolling —
          which is why `isPlaying` is published by the player rather than inferred from the playhead
          having stopped changing.
     ───────────────────────────────────────────────────────────────────────────────────────── */

  /* One field at a time, for the reason spelled out above `publishAnchors`: the context value now
     also changes identity about four times a second while the recording plays, so anything closing
     over the whole `sync` would be rebuilt at that rate. */
  const syncPlayingKey = sync?.playingKey ?? null;
  const isPlaying = sync?.isPlaying ?? false;
  const isFollowing = sync?.isFollowing ?? false;
  const setFollowing = sync?.setFollowing;
  // The scroller only exists once there is a transcript to put in it — see `absence`.
  const hasScroller = !absence;

  /**
   * Which block the recording is playing, or null.
   *
   * The moment is resolved to a block by the sync provider, with `anchorForMs` — the same function
   * the rail resolves a citation with, deliberately not a second implementation. The transcript has
   * no end times to work with, so a line stays marked through the silence after it until the next
   * one begins; that is correct, and blanking the mark during gaps would make it flicker on every
   * breath the speaker took.
   *
   * Gated here on `onSeekToRecording`, which is a fact about this column rather than about the
   * playhead. A meeting with no recording, or one whose clocks cannot be reconciled, offers no
   * seek — and by exactly the same rule nothing in it may light up as playing, because there is
   * nothing playing it could honestly refer to.
   */
  const canFollowPlayback = Boolean(onSeekToRecording);
  const playingKey = canFollowPlayback ? syncPlayingKey : null;

  /**
   * Keep the playing block in view.
   *
   * Keyed on `playingKey` rather than on the playhead, so this fires once when the line CHANGES
   * instead of four times a second — a smooth scroll restarted every 250ms never arrives anywhere,
   * and the column would crawl.
   */
  useEffect(() => {
    if (!isReading || !isFollowing || !isPlaying || !playingKey) return;
    scrollToTurn(playingKey, { center: true });
  }, [isReading, isFollowing, isPlaying, playingKey, scrollToTurn]);

  /**
   * The reader taking the scroll back.
   *
   * `wheel` and `touchmove`, NOT `scroll`. The auto-scroll above fires `scroll` itself, so listening
   * for that would have following switch itself off the first time it worked — and the reader would
   * be left with a pill they never asked for after a single line. These two events only happen when
   * a hand is on the wheel or the glass.
   *
   * Keyboard scrolling (Page Down, arrows) is not caught here, deliberately: J and K move the
   * reading position through the navigator, which is a different gesture with its own behaviour.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !setFollowing || !isReading) return;
    const stopFollowing = () => setFollowing(false);
    scroller.addEventListener("wheel", stopFollowing, { passive: true });
    scroller.addEventListener("touchmove", stopFollowing, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", stopFollowing);
      scroller.removeEventListener("touchmove", stopFollowing);
    };
    // `hasScroller`, because the element does not exist while the panel is explaining an absent
    // transcript — the listeners have to be attached when it appears rather than only on mount.
  }, [setFollowing, isReading, hasScroller]);

  /** Both conditions, and it is the AND that matters — see the chip's own note below. */
  const showFollowPill = Boolean(isReading && canFollowPlayback && !isFollowing && isPlaying);

  /**
   * Seeking is also a request to follow.
   *
   * Somebody who clicked 07:16 wants to hear what happened at 07:16 — and then what happened next.
   * Leaving following off there would mark the line they picked, play past it, and leave the mark
   * behind on a sentence that has finished.
   */
  const seekToMoment = useCallback(
    (atMs: number) => {
      if (!onSeekToRecording) return;
      setFollowing?.(true);
      onSeekToRecording(atMs);
    },
    [onSeekToRecording, setFollowing],
  );

  // J, K and `/` are handled by the provider — it is the only thing that can see a keypress aimed
  // at nothing in particular — and it needs this column to carry them out. Registered while
  // reading mode is on and withdrawn when it is not, so the keys go quiet in the layouts that have
  // no turns to step through rather than moving something the reader cannot see.
  useEffect(() => {
    if (!sync || !isReading) return;
    sync.registerNavigator({
      step: (delta) => {
        const nextKey = stepAnchorKey(sync.anchors, sync.readingKey, delta);
        if (!nextKey) return;
        sync.setReadingKey(nextKey);
        scrollToTurn(nextKey);
      },
      focusSearch: () => setSearchOpen(true),
    });
    return () => sync.registerNavigator(null);
  }, [sync, isReading, scrollToTurn]);

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
      // The gate stays on `onSeekToRecording`, not on the wrapper: `seekToMoment` exists whether or
      // not a seek is possible, and gating on it would make every timestamp look clickable on a
      // meeting with no recording. See TranscriptLineTime.
      onSeek: onSeekToRecording ? () => seekToMoment(segment.startTimeMs) : undefined,
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
      {/* Every control here acts on the reading of the transcript, and a sheet of paper cannot be
          read from — so none of them are printed. See the print rules on the scroller below. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 print:hidden">
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
            {/* Offered in reading mode only, because that is the only layout that marks matches in
                place — the other two draw one row per utterance, where a match highlighted inside a
                bubble is as hard to find as the word was. `/` opens the same field. */}
            {isReading ? (
              <button
                type="button"
                title="Find in this transcript"
                aria-label="Find in this transcript"
                aria-pressed={searchOpen}
                onClick={() => {
                  // Closing clears the term: leaving a filter's marks behind a closed control is
                  // how a reader ends up staring at highlights they cannot explain.
                  if (searchOpen) setQuery("");
                  setSearchOpen((current) => !current);
                }}
                className={cn(
                  "grid size-[26px] place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink",
                  searchOpen ? "bg-surface-2 text-ink" : "",
                )}
              >
                <Search className="size-3.5" />
              </button>
            ) : null}
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
        {/* Sits above the scroller rather than floating over it: a find bar laid on top of the
            first line hides the thing it just found. */}
        {isReading && searchOpen ? (
          <TranscriptFindBar
            ref={searchInputRef}
            value={query}
            onChange={setQuery}
            onClose={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          />
        ) : null}
        <div
          ref={scrollerRef}
          onScroll={isReading ? handleReadingScroll : undefined}
          className={cn(
            // The print rules are the reward the spec promised for laying this out as a document:
            // a page of paper has no viewport to bound and no scrollbar to scroll, so the frame
            // that makes this readable on screen is exactly what has to go on paper.
            "max-h-[min(60vh,560px)] overflow-y-auto rounded-xl border border-border bg-surface-1 p-4 print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:p-0",
            // Taller in reading mode: the rail beside it is scrolling independently, so a short
            // column would leave the reader scrubbing a letterbox next to a half-empty rail.
            isReading ? "max-h-[min(72vh,720px)]" : "",
          )}
        >
          <div
            ref={documentRef}
            className={cn(
              /* The measure is NOT declared here, and that is deliberate rather than an omission.
                 Custom properties inherit, so a `--reading-measure` set on this wrapper would
                 shadow the one the rail sets on its own grid — a declaration on a descendant
                 always beats an ancestor's, whatever the media query on it — and the 52ch
                 comparison measure would silently never apply. The default lives where it can be
                 overridden: in the `var(..., 66ch)` fallback on the paragraph itself, which is
                 also what makes this column read correctly with no rail beside it at all. */
              isReading ? "mx-auto w-full max-w-[820px]" : "space-y-1",
            )}
          >
          {blocks.map((block) => (
            <div key={block.sessionNumber} className={layout === "chat" ? "space-y-2" : "space-y-0.5"}>
              {showSessionLabels ? (
                <TranscriptSessionDivider sessionNumber={block.sessionNumber} session={block.session} />
              ) : null}
              {/* Two changes met here and both are kept. WT-605 splits a session wherever the
                  host paused the transcript, so a divider can say the record stops and restarts
                  rather than leaving an unexplained jump in the timestamps; Option C draws the
                  document as one block per speaker TURN instead of one row per utterance. They
                  compose: the pause split is the outer loop, and each run between pauses is laid
                  out in whichever of the three shapes the reader chose. Every layout reads
                  `sub.segments`, never `block.segments` — grouping turns across a pause would
                  merge speech from either side of it into one block and hide the very gap the
                  divider is there to announce. */}
              {splitSegmentsAroundPauseGaps(block.segments, pauseGaps).map((sub, subIndex) => (
                <div key={sub.gapBefore?.window.id ?? `${block.sessionNumber}-${subIndex}`}>
                  {sub.gapBefore ? <TranscriptPauseDivider gap={sub.gapBefore} /> : null}
                  {layout === "timeline"
                    ? // One dot per stretch of the meeting a person held, so the rail shows who had
                      // the floor and when — the thing neither of the other two layouts can show at
                      // a glance, because both of them draw one row per utterance.
                      groupIntoSpeakerTurns(sub.segments).map((turn, index) => (
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
                              ? () => seekToMoment(turn.startTimeMs)
                              : undefined
                          }
                          // The rail starts AT the first dot rather than above it — a line hanging
                          // off the top of the transcript reads as content scrolled out of view.
                          isFirst={index === 0}
                          rows={turn.lines.map(buildRow)}
                        />
                      ))
                    : layout === "document"
                      ? // One block per TURN, not per utterance: the name, the face and the
                        // timestamp are printed once for a stretch of talking rather than once per
                        // STT chunk.
                        groupIntoSpeakerTurns(sub.segments).map((turn) => (
                          <TranscriptDocumentTurn
                            key={turn.key}
                            turnKey={turn.key}
                            startTimeMs={turn.startTimeMs}
                            endTimeMs={turn.lines[turn.lines.length - 1].endTimeMs}
                            speaker={resolveTranscriptSpeaker(
                              turn.speakerId,
                              turn.speakerName,
                              speakerDirectory,
                            )}
                            // No "You" here. A document names the people in it, and a record that
                            // reads differently depending on who opened it is not a record.
                            speakerName={turn.speakerName}
                            elapsed={formatCitationTime(turn.startTimeMs)}
                            clock={base ? segmentTime(turn.startTimeMs) : null}
                            onSeek={
                              onSeekToRecording
                                ? () => seekToMoment(turn.startTimeMs)
                                : undefined
                            }
                            marked={sync?.markedKey === turn.key}
                            reading={sync?.readingKey === turn.key}
                            // Only ever true for the block the recording is actually playing —
                            // `playingKey` is null without a recording behind this record.
                            playing={playingKey === turn.key}
                            query={query}
                            rows={turn.lines.map((line) => {
                              const row = buildRow(line);
                              return languageChipLineIds
                                ? { ...row, showLanguage: languageChipLineIds.has(line.id) }
                                : row;
                            })}
                          />
                        ))
                      : sub.segments.map((segment) => {
                          const row = buildRow(segment);
                          return (
                            <TranscriptChatRow
                              key={segment.id}
                              {...row}
                              speakerName={
                                row.isSelf ? "You" : segment.speakerName || "Unknown speaker"
                              }
                            />
                          );
                        })}
                </div>
              ))}
            </div>
          ))}
          </div>
        </div>
        {/* A record of an hour-long meeting is hundreds of rows. Somebody reading the middle of it
            had no way back to the end but dragging the scrollbar the length of the room.
            Lifted a row when the follow pill is out: two floating chips in the same place is one
            chip covering the other, and which one wins would depend on render order. */}
        <ScrollToLatestChip
          visible={isAway}
          onClick={scrollToLatest}
          className={showFollowPill ? "bottom-12" : undefined}
        />
        {/* WT-655(C3). Offered only while following is OFF and the recording is PLAYING — the two
            conditions together. Off-and-paused needs no pill: nothing is moving, so there is
            nothing to catch up with, and a control offering to chase a stopped playhead is a
            control that appears to do nothing. */}
        <FollowPlaybackChip
          visible={showFollowPill}
          onClick={() => {
            setFollowing?.(true);
            // Recentre immediately rather than waiting for the playhead to cross into the next
            // block: from where the reader is standing, pressing this and watching nothing happen
            // for twenty seconds is the button not working.
            if (playingKey) scrollToTurn(playingKey, { center: true });
          }}
        />
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
 * WT-605. The gap left by a Pause Transcript window — no line was recorded here, only
 * translation/dubbing/subtitles were still running. Same visual language as
 * TranscriptSessionDivider above, deliberately distinct wording so the two are never mistaken
 * for one another.
 */
function TranscriptPauseDivider({ gap }: { gap: TranscriptPauseGap }) {
  const started = new Date(gap.window.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ended = gap.window.endedAt
    ? new Date(gap.window.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "now";

  return (
    <div className="flex items-center gap-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>Transcript paused · {started}–{ended}</span>
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
 * EVERY NUMBER PRINTED HERE IS A COUNT OF RENDERED ROWS (2026-09-09)
 *   It used to print the server's counts when a coverage response had arrived
 *   (`coverage?.missing ?? incompleteCount`, `coverage?.totalSegments ?? totalCount`) and the
 *   client's when it had not — and those two are not the same unit. The server counts STORED
 *   SEGMENTS, one per finalized STT chunk; this panel merges the consecutive chunks of one
 *   continuous utterance into a single row, which is what "entry" means everywhere else on this
 *   surface: the toolbar chip says "Saved · N entries" and the tab label says "Transcript (N)",
 *   both of them `grouped.length`.
 *
 *   So one finished meeting read "Transcript (7)", "Saved · 7 entries" and "1 of 13 entries is
 *   not in English yet" at the same moment. All three numbers were true; nothing on screen said
 *   that the 13 was counted in a unit the reader cannot see, and the sentence read as though six
 *   entries were hidden. Worse, the unit CHANGED under the reader: the same sentence said "of 7"
 *   until the coverage query resolved and "of 13" after it.
 *
 *   The server's answer is not discarded — `coverage.status` is still what decides which of these
 *   four states this is, and only the server can know that a backfill is running or has failed.
 *   What is dropped is printing its per-segment arithmetic in a sentence about rows.
 *
 *   `incompleteCount` is also the stricter count of the two: it catches a merged utterance with
 *   one part translated and one part missing, which the server sees as coverage for one segment
 *   and a shortfall on another, and never as one line the reader cannot fully read.
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
  const missing = incompleteCount;
  const total = totalCount;
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
                label={`${getLanguageCode(option.code)} · ${getLanguageName(option.code)}`.trim()}
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
 * The lines one transcript row renders.
 *
 * `paragraphs` describe where the SPEAKER stopped, so they only apply to what the speaker said.
 * A row showing a TRANSLATION is a different text with its own sentence structure — MT writes
 * proper stops, so punctuation alone is the right and only signal there. Using the spoken turn's
 * pauses to break a translated line would cut it at positions that mean nothing in that language.
 */
function transcriptLines(
  segment: GroupedSavedTranscriptSegment,
  resolved: ResolvedTranscriptLine,
): string[] {
  if (resolved.isTranslated) return splitIntoSentences(resolved.text);

  const paragraphs = segment.paragraphs?.length ? segment.paragraphs : [resolved.text];
  return paragraphs.flatMap((paragraph) => splitIntoSentences(paragraph));
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
              {/* One line per sentence. The bubble is a speaking TURN, so it stays whole; what
                  changes is that the sentences inside it stop running together. A turn with no
                  terminal punctuation — which Vietnamese STT produces constantly — comes back as
                  a single line and renders exactly as it did before. */}
              {transcriptLines(segment, resolved).map((sentence, at) => (
                <p
                  key={`${segment.id}-s-${at}`}
                  className={cn(
                    "text-[13px] leading-6",
                    at > 0 && "mt-1",
                    isSelf ? "text-white" : "text-ink",
                  )}
                >
                  {sentence}
                </p>
              ))}
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
 * The find field over the reading column.
 *
 * A find, not a filter. It marks matches where they stand and leaves every sentence around them
 * on screen — a transcript read as a document is read for its flow, and a search that deletes the
 * context around the answer has taken away the thing the reader came to check. See splitOnQuery.
 */
function TranscriptFindBar({
  ref,
  value,
  onChange,
  onClose,
}: {
  ref: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 print:hidden">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        // Accent-insensitive on both sides, so "manh" finds "Mạnh" — said out loud because a
        // reader who types it unaccented and gets nothing concludes the word is not there.
        placeholder="Find in this transcript — accents optional"
        aria-label="Find in this transcript"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-subtle"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close find"
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** One line of the reading column, with the reader's search term marked where it stands. */
function TranscriptReadingText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  return (
    <>
      {splitOnQuery(text, query).map((slice, index) =>
        slice.isMatch ? (
          <mark
            key={index}
            className="rounded-[3px] bg-primary/25 px-0.5 text-ink print:bg-transparent print:underline"
          >
            {slice.text}
          </mark>
        ) : (
          <span key={index}>{slice.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The transcript as a document: one block per speaker turn, read down a single column.
 *
 * THE FOUR NUMBERS THIS BLOCK IS
 *   66ch — the measure, as a `ch` and never a percentage. A percentage means the column grows with
 *   the window, and a 100-character line is unreadable however wide the screen that holds it is;
 *   capping in `ch` turns the extra width into margin instead of into line length. The value comes
 *   in on `--reading-measure` so the rail can narrow it to 52ch when the recording pip is open and
 *   the reader is comparing the two.
 *
 *   1.75 — the leading. Vietnamese stacks tone marks above and vowel marks below the same letter,
 *   so the vertical space a line actually occupies is taller than the font metrics claim; at the
 *   1.5 the rest of this file uses, the marks of one line touch the letters of the next.
 *
 *   56px — the timestamp gutter. Out of the text and into its own column, mono and tabular, so the
 *   times form a straight edge the eye can run down and none of them push a sentence sideways.
 *
 *   ~30s — the grouping window, borrowed from groupIntoSpeakerTurns rather than reinvented here.
 *
 * The timestamp is ELAPSED time, not the wall clock the other layouts print. The rail beside this
 * column cites moments as "1:24" — that is what a summary citation is — and a gutter answering
 * "07:16 AM" beside it would leave the reader with two clocks and no way to see they are the same
 * one. The wall clock survives on the control's tooltip, where it costs nothing.
 */
function TranscriptDocumentTurn({
  turnKey,
  startTimeMs,
  endTimeMs,
  speaker,
  speakerName,
  elapsed,
  clock,
  onSeek,
  marked,
  reading,
  playing,
  query,
  rows,
}: {
  turnKey: string;
  startTimeMs: number;
  endTimeMs: number;
  speaker: TranscriptSpeaker;
  speakerName: string;
  /** Milliseconds from the start of the meeting, as mm:ss. The gutter. */
  elapsed: string;
  /** The wall clock, for the tooltip, when the transcript knows when the meeting began. */
  clock: string | null;
  onSeek?: () => void;
  /** A summary claim in the rail is pointing here right now. */
  marked: boolean;
  /** This is the block under the reader's eye — the direction of the sync people forget. */
  reading: boolean;
  /**
   * WT-655(C1) — the recording is playing THIS block right now.
   *
   * Rendered as a change of TEXT COLOUR and nothing else. The three background marks below are
   * already three states on one property, and a fourth would be unreadable; more importantly, a
   * playing line moves every twenty seconds or so, and a moving background is a strobe. Colour on
   * the words themselves puts the mark where the reader is already looking.
   */
  playing: boolean;
  query: string;
  rows: TranscriptRowBase[];
}) {
  // A citation lands on a LINE; the block is what has to look selected, because the block is what
  // the reader sees as one thing here.
  const highlighted = rows.some((row) => row.highlighted);

  return (
    <div
      id={`transcript-turn-${turnKey}`}
      data-reading-turn={turnKey}
      data-start-ms={startTimeMs}
      data-end-ms={endTimeMs}
      className={cn(
        "relative grid scroll-mt-4 grid-cols-[56px_minmax(0,1fr)] gap-x-3.5 rounded-lg border-l-2 border-transparent py-3 pl-3 pr-2 transition-colors",
        // Every block keeps its page: a speaker turn split across a page break loses the name
        // that says whose words the second half is.
        "print:break-inside-avoid print:border-l-0 print:py-2 print:pl-0",
        // Three marks, in the order they win. The one the reader is looking at is the quietest —
        // it is feedback, not a selection, and a loud one would make the whole column strobe as
        // they scroll. The rail's pointer is the loud one, because the reader asked for it.
        reading && !marked && !highlighted ? "bg-surface-2/50" : "",
        marked ? "border-l-primary bg-primary/[0.07]" : "",
        highlighted ? "bg-primary/10 ring-1 ring-primary/30" : "",
      )}
    >
      {/* The stripe runs the height of everything one person said — which in this layout is the
          whole block, so it draws exactly the boundary the reader is looking for. */}
      <TranscriptSpeakerStripe speaker={speaker} className="my-1.5 left-[-2px] print:hidden" />

      {/* The gutter is this layout's seek target, and the rule TranscriptLineTime spells out
          applies here for the same reason: the block beside it stays selectable prose, so the
          timestamp grows and the block is not a button. 10.5px is the smallest type on the page —
          6.75px above and below its leading-none line box makes exactly 24px of height, and -my
          returns all of it, so the digits stay on the 5px of top padding this column was measured
          with. Flex, not a line of text, so the target is a flex item and takes its position from
          the box rather than from a synthesized baseline. The play mark goes LEFT of the digits:
          their right edge is the straight edge this column exists to draw, and nothing may move
          it. */}
      <div
        className={cn(
          "flex items-start justify-end pt-[5px] text-right font-mono text-[10.5px] tabular-nums leading-none",
          // The gutter takes the playing colour too. It is the one part of this block that reads as
          // a position in the recording, so leaving it grey while the words beside it are marked
          // would separate the mark from the clock it is about.
          playing ? "text-primary" : "text-ink-subtle",
        )}
      >
        {onSeek ? (
          <button
            type="button"
            onClick={onSeek}
            title={
              clock
                ? `Play the recording from here — ${clock}`
                : "Play the recording from here"
            }
            className="group/seek -mx-1 -my-[6.75px] inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-[6.75px] hover:text-ink"
          >
            <Play
              aria-hidden
              className="size-3 shrink-0 fill-current opacity-0 transition-opacity motion-reduce:transition-none group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100"
            />
            <span className="underline-offset-2 group-hover/seek:underline">{elapsed}</span>
          </button>
        ) : (
          // No recording behind this record: the gutter is a printed time, not a control.
          <span title={clock ?? undefined}>{elapsed}</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <TranscriptSpeakerAvatar speaker={speaker} />
          <span className="truncate" title={speakerName}>
            {speakerName}
          </span>
        </p>
        <div className="mt-1.5 space-y-2">
          {rows.map((row) => (
            <TranscriptDocumentLine
              key={row.segment.id}
              {...row}
              query={query}
              playing={playing}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One utterance inside a reading block. No name and no time — the block above carries both. */
function TranscriptDocumentLine({
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
  query,
  playing,
}: TranscriptRowBase & { query: string; playing: boolean }) {
  if (isEditing) {
    return <div id={`transcript-segment-${segment.id}`}>{editor}</div>;
  }

  return (
    <div id={`transcript-segment-${segment.id}`} className="group/line flex scroll-mt-4 gap-2">
      <div className="min-w-0 flex-1">
        {/* Sentences, not one block. The reading rail is where a whole meeting is read end to
            end, so a turn that runs three sentences together is the hardest place to follow.
            Highlighting still runs per sentence, so a search match inside any of them is found. */}
        {transcriptLines(segment, resolved).map((sentence, at) => (
          <p
            key={`${segment.id}-r-${at}`}
            className={cn(
              "max-w-[var(--reading-measure,66ch)] text-[14.5px] leading-[1.75] transition-colors",
              // WT-655(C1): the playing line, and the ONLY thing that changes is the colour of the
              // words. Printed pages get the ink colour whatever the player is doing — a mark about
              // a video means nothing on paper.
              playing ? "text-primary print:text-ink" : "text-ink",
              at > 0 && "mt-1",
            )}
          >
            <TranscriptReadingText text={sentence} query={query} />
          </p>
        ))}
        {revealed && resolved.isTranslated ? (
          <TranscriptSpokenOriginal resolved={resolved} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-1 pt-1.5 print:hidden">
        {/* WT-311: the version-history entry point, which development does not have. Hidden while
            editing — the editor is the history's own next entry, and offering to browse revisions
            of a line you are mid-way through rewriting reads as a way to lose the rewrite. */}
        {!isEditing ? history : null}
        {/* Only where the answer CHANGED — see shouldShowLanguageChip. Its absence is the message:
            no chip means this line is in the same language, said the same way, as the one above. */}
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
          row, which put a two-line label beside a one-line name on every single turn.

          A flex column rather than a line of text, so the enlarged timestamp target is a flex
          item: an inline-flex box in a line of text takes its baseline from its own bottom edge
          and would drop the digits below the name beside them. `items-start` because the grid
          stretches this cell to the height of the whole turn. The reserved play mark can reach
          past the 58px on a locale that prints a meridiem — it reaches into the scroller's own
          padding, which is why nothing is clipped and the digits stay where they were. */}
      <div className="flex items-start justify-end whitespace-nowrap pt-[7px] text-right">
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

/**
 * The timestamp on a line, and — when there is a recording behind it — the way into it.
 *
 * The target is the TIMESTAMP and deliberately not the row. Every other product that does this
 * makes the whole line clickable, and every other product's line carries nothing else; ours also
 * carries inline correction editing, the way back to what was spoken, and the thing every reader
 * of a transcript does without being told, which is drag across the words to quote them. A row
 * that is a <button> cannot be selected with a mouse, so making it one would buy a bigger seek
 * target with the reading.
 *
 * So the target does not move, it grows. What was ~11px of mono text — a target under half the
 * 24px a pointer can be expected to hit — is padded out to 24px tall, and the negative margin
 * hands that height straight back to the line box so no row it sits in is a pixel taller than it
 * was. The visible text is untouched: only the area that answers a click changes.
 *
 * The play mark is what says the label DOES something; a timestamp on its own reads as a label.
 * It is always in the layout and only ever fades in, because a mark that appeared at hover width
 * would shove the timestamp sideways exactly as the pointer arrived at it. It sits to the LEFT of
 * the digits: both callers right-align this column, and the digits' right edge is the straight
 * edge the eye runs down.
 */
function TranscriptLineTime({ time, onSeek }: { time: string; onSeek?: () => void }) {
  // No recording, no target. A meeting whose record has no video is read as a document, and
  // nothing in a document may look clickable — so this stays a plain span with no hit area to
  // enlarge and no mark to reveal, exactly as it was.
  if (!onSeek) {
    return <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{time}</span>;
  }

  return (
    <button
      type="button"
      onClick={onSeek}
      title="Play the recording from here"
      // 3.75px above and below an 11px/1.5 line box is 24px of height, and -my gives all of it
      // back. -mx does the same for the 4px of horizontal reach.
      className="group/seek -mx-1 -my-[3.75px] inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-[3.75px] font-mono text-[11px] text-muted-foreground hover:text-ink"
    >
      <Play
        aria-hidden
        className="size-3 shrink-0 fill-current opacity-0 transition-opacity motion-reduce:transition-none group-hover/seek:opacity-100 group-focus-visible/seek:opacity-100"
      />
      {/* Underlined on the span rather than the button: the mark is a mark, not a word, and an
          underline running under it reads as a broken glyph. */}
      <span className="underline-offset-2 group-hover/seek:underline">{time}</span>
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
