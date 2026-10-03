"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { CaretDown, CaretUp } from "@phosphor-icons/react/dist/ssr";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { transcriptIdentityFor } from "@/lib/meeting/participant-identity";
import {
  captionTextForReader,
  groupTranscriptSegments,
  isCaptionPending,
  mergeTranslations,
} from "@/lib/transcript/transcript-display";
import {
  buildCleanTranscriptView,
  withAbsorbedSegmentIds,
} from "@/lib/transcript/clean-transcript";
import { useTranscriptViewMode } from "@/hooks/use-transcripts";
import type { GroupedTranscriptSegment } from "@/lib/transcript/transcript-display";
import {
  LIVE_CAPTION_COLLAPSED_LINES,
  isLiveTextForReader,
  liveCaptionLines,
} from "@/lib/transcript/live-caption-lines";
import { orderedLiveLines } from "@/lib/transcript/live-text";
import {
  localizeFarSideSpeakerName,
  transcriptSpeakerKey,
} from "@/lib/transcript/speaker-identity";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useMeetingIdentities } from "./meeting-identity-context";
import { ParticipantAvatar } from "./participant-avatar";

/**
 * Live captions: what was said, IN THE READER'S OWN LANGUAGE, attributed to a face.
 *
 * WHY IT SCROLLS, AND WHY IT COLLAPSES (4 Oct 2026, product owner)
 *   WT-873 cut the lane to two unscrollable lines, because its old history opened as a panel
 *   that grew upward OVER the camera view. That left nobody a way to glance back at a sentence
 *   they missed. The history is back, but it scrolls INSIDE the lane's own fixed box (a visible
 *   scrollbar, sticking to the newest line until the reader scrolls up, with a "Latest" chip to
 *   come back) — it still never grows over the video. The corner caret collapses the lane to
 *   the one line being spoken, giving the height back to the camera view, or opens it again.
 *
 *   It does not auto-hide, which is what the original single box did wrong: whoever looked away
 *   for a moment still has the previous line on screen, and the space under the video does not
 *   flicker between empty and occupied.
 *
 * WHY THE SPEAKER IS NAMED ONCE PER RUN
 *   Avatar + name on every line, left-aligned, read as a chat thread over the video. A subtitle
 *   names who is talking when that changes — see liveCaptionLines.
 *
 * WHY IT SHOWS THE TRANSLATION AND NOT THE ORIGINAL
 *   REVERSED ON 2026-08-20, by the product owner, after reading it as a defect in a live meeting:
 *   a reader listening in English watched Vietnamese captions scroll past. For a TRANSLATION
 *   product the caption lane is the largest, most readable surface in the window and the one a
 *   participant watches instead of listening. The original lives in the transcript panel, beside
 *   the reader's translation.
 *
 * WHY A LINE CAN BE HELD BACK
 *   A transcript segment arrives before its translation does. Rendering the original in the
 *   meantime would put the line up in the wrong language and then change it under the reader.
 *   So a line with no caption for this reader yet is simply not shown yet — see
 *   captionTextForReader, which is also what keeps a same-language room captioned normally.
 *
 *   Only while translation is RUNNING, though. Transcription does not wait for Start
 *   Translation, so before anybody presses it these lines are all there will ever be, and
 *   holding them for a translation nobody ordered leaves the lane blank. Hence
 *   `translationActive`: off, the caption is what was said.
 *
 * Fed only by real segments from the AI pipeline over SignalR (TranscriptSegmentReceived /
 * TranslationTextReceived). There is no mock or preview fallback here.
 */
export function LiveSubtitleOverlay({
  enabled = true,
  /** "compact" is the minimised dock: one line, no surface of its own, over live video. */
  variant = "lane",
  readerLanguage,
  translationActive = true,
  collapsed = false,
  onToggleCollapsed,
}: {
  enabled?: boolean;
  variant?: "lane" | "compact";
  /**
   * The language THIS viewer listens in. Omit and the lane falls back to the original, which is
   * what the dev preview page renders and what a cold join shows for its first moments — a blank
   * caption surface reads as broken, so it is never the answer to "not resolved yet".
   */
  readerLanguage?: string | null;
  /**
   * Whether translation is running in this room right now. False means the captions below are
   * all there will ever be for these lines, so they are shown as spoken rather than held for a
   * translation that is not coming — see captionTextForReader.
   */
  translationActive?: boolean;
  /** Collapsed: the line being spoken only, no history. The session owns the state. */
  collapsed?: boolean;
  /**
   * Collapses or opens the lane. Omitted where the lane cannot change height (the minimised
   * dock), and then no control is drawn.
   */
  onToggleCollapsed?: () => void;
}) {
  const t = useTranslations("meetingCallChrome.captions");
  // The caption lane, not the transcript lane: captions keep running while the transcript is
  // paused, and this list is the one a pause never withholds from. See captionSegments.
  const segments = useTranslationRoomStore((state) => state.captionSegments);
  const cleanSentences = useTranslationRoomStore((state) => state.cleanSentences);
  // Live text: the words of a turn still being spoken. Captions keep running while the transcript
  // is paused, so this lane shows it regardless. See lib/transcript/live-text.ts.
  const liveLines = useTranslationRoomStore((state) => state.liveLines);
  const identities = useMeetingIdentities();
  const reduceMotion = useReducedMotion() ?? false;

  /**
   * WT-716 — the lane reads Clean or Verbatim, and it is the SAME choice the transcript panel
   * uses rather than a switch of its own.
   *
   * The lane has no header to hang a toggle on (it is three lines over live video, with the
   * control bar's CC button the only thing that governs it), and a caption surface that showed
   * "ừm, ừm, cái đó" while the panel two inches away showed the same sentence cleaned would read
   * as two transcripts of one meeting. So the preference is shared and there is no second control:
   * a reader who wants the recogniser's exact words switches once, in the panel, and both follow.
   */
  const [viewMode] = useTranscriptViewMode();

  const spoken = useMemo(() => {
    // Clean captions are built from the SEGMENTS the lane already holds — tier 1 wording, with
    // filler-only lines dropped so the lane never spends one of its three slots on "um". A merged
    // sentence (tier 2) is used when one has arrived for lines still on screen; it usually has
    // not, because the lane is showing what was said a second ago and the sentence is written
    // afterwards. Falling back to the per-segment text is the ordinary case here, not the
    // exception.
    const view =
      viewMode === "clean"
        ? buildCleanTranscriptView(segments, cleanSentences, {
            idOf: (segment) => segment.segmentId,
            // A swallowed segment takes its translations with it unless they are folded in, and
            // the translation is what this lane actually prints for a reader in another language.
            absorb: (head, absorbed) => ({
              ...head,
              translations: mergeTranslations(head.translations, absorbed.translations),
              confidence: Math.min(head.confidence, absorbed.confidence),
            }),
          })
        : null;
    const grouped = groupTranscriptSegments(view ? view.segments : segments);
    const shown = view ? withAbsorbedSegmentIds(grouped, view) : grouped;
    // Resolved ONCE per utterance here rather than inside CaptionLine, so a line with nothing to
    // show this reader yet never occupies a slot. Filtering after the slice would leave the lane
    // rendering two lines and a gap.
    const finals = shown
      .map((utterance) => ({
        utterance,
        caption: captionTextForReader(utterance, readerLanguage),
        pending: isCaptionPending(utterance, readerLanguage, translationActive),
      }))
      .filter((line): line is CaptionLineData => Boolean(line.caption));
    // The newest live line goes last, as the line being spoken right now. Only one: two
    // half-sentences in flight read as noise. And only in the reader's own language — for anyone
    // else it is a foreign half-sentence the translation replaces a second later (owner, 4 Oct).
    const live = orderedLiveLines(liveLines).at(-1);
    if (!live || !isLiveTextForReader(live.language, readerLanguage)) return finals;
    return [
      ...finals,
      {
        utterance: {
          segmentId: `live-${live.speakerId}-${live.itemId}`,
          speakerId: live.speakerId,
          speakerName: live.speakerName,
          originalLanguage: live.language,
          originalText: live.text,
        } as GroupedTranscriptSegment,
        caption: live.text,
        pending: true,
      },
    ];
  }, [segments, cleanSentences, liveLines, viewMode, readerLanguage, translationActive]);

  const showHistory = variant === "lane" && !collapsed;
  const lines = useMemo(
    () =>
      showHistory
        ? liveCaptionLines(spoken, speakerOfLine)
        : liveCaptionLines(spoken, speakerOfLine, LIVE_CAPTION_COLLAPSED_LINES),
    [spoken, showHistory],
  );

  const newest = lines[lines.length - 1]?.line;

  // Sticks to the newest line until the reader scrolls up, the way every log in this product
  // does; the 48px slack matches the chip's threshold so the two never disagree.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stuckToBottom = useRef(true);
  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, {
    threshold: STICK_THRESHOLD_PX,
    revision: lines,
  });
  const noteScroll = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    stuckToBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_THRESHOLD_PX;
  }, []);
  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (element && stuckToBottom.current) element.scrollTop = element.scrollHeight;
  }, [lines, collapsed]);

  if (!enabled) return null;

  if (variant === "compact") {
    return (
      <div className="pointer-events-none flex h-full w-full items-end justify-center">
        <AnimatePresence>
          {newest ? (
            <motion.p
              key="compact-caption"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
              className="line-clamp-2 max-w-full rounded-lg bg-black/75 px-2 py-1 text-[11px] font-medium leading-snug text-white"
            >
              {newest.caption}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  return (
    // A fixed box that clips: nothing in the lane grows over the camera view. The history
    // scrolls inside it; collapsed, it holds the one line being spoken.
    <div
      data-caption-lane
      data-collapsed={collapsed ? "" : undefined}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface-2/60"
    >
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          title={collapsed ? t("expand") : t("collapse")}
          className="absolute right-1.5 top-1.5 z-20 grid size-7 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {collapsed ? (
            <CaretUp className="size-4" weight="bold" />
          ) : (
            <CaretDown className="size-4" weight="bold" />
          )}
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={noteScroll}
        role="region"
        aria-label={t("liveRegionAria")}
        className={
          showHistory
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-10 py-2 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            : "min-h-0 flex-1 overflow-hidden px-10 py-1.5"
        }
      >
        {/* min-h-full + justify-end bottom-anchors a short history without making the overflow
            unreachable: justify-end on the scroller itself would push the oldest lines above
            scrollTop 0, where no scrollbar can reach them. */}
        <div className="flex min-h-full flex-col items-center justify-end gap-1 text-center">
          {lines.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">{t("emptyState")}</p>
          ) : (
            lines.map(({ line, showSpeaker }, index) => (
              <CaptionLine
                key={line.utterance.segmentId}
                line={line.utterance}
                caption={line.caption}
                pending={line.pending}
                identities={identities}
                showSpeaker={showSpeaker}
                // Older lines step back rather than disappear: still readable when scrolled to,
                // never competing with the sentence being spoken right now.
                dimmed={index < lines.length - 1}
                animateIn={!reduceMotion && index === lines.length - 1}
                reduceMotion={reduceMotion}
                singleLine={!showHistory}
              />
            ))
          )}
        </div>
      </div>

      {showHistory ? (
        <ScrollToLatestChip
          visible={isAway}
          onClick={scrollToLatest}
          label={t("latest")}
          className="bottom-1.5"
        />
      ) : null}
    </div>
  );
}

/** How far from the bottom still counts as following the newest line. */
const STICK_THRESHOLD_PX = 48;

type CaptionLineData = {
  utterance: GroupedTranscriptSegment;
  caption: string;
  /** Drawn muted: live text, or the original standing in for a translation still on its way. */
  pending: boolean;
};

/**
 * Who opens a speaker run. transcriptSpeakerKey rather than the bare id: everybody on the Google
 * Meet side shares the stand-in's id, and "Lan" answering "Minh" is a change of speaker.
 */
function speakerOfLine(line: CaptionLineData): string {
  return transcriptSpeakerKey(line.utterance);
}

const CaptionLine = memo(
  function CaptionLine({
    line,
    caption,
    pending,
    identities,
    showSpeaker,
    dimmed,
    animateIn,
    reduceMotion,
    singleLine = false,
  }: {
    line: GroupedTranscriptSegment;
    pending: boolean;
    /** Already resolved for this reader by captionTextForReader — never the raw original. */
    caption: string;
    identities: ReturnType<typeof useMeetingIdentities>;
    /** Avatar + name only when this line opens a speaker run (liveCaptionLines). */
    showSpeaker: boolean;
    dimmed: boolean;
    /** Read at mount only: whether this line fades in or is simply there. */
    animateIn: boolean;
    reduceMotion: boolean;
    /** The collapsed lane: one line, truncated, so it never grows past its thin box. */
    singleLine?: boolean;
  }) {
    // `speakerName` was already resolved on arrival by resolveTranscriptSpeakerName, which guards
    // against a roster that hands back a UUID as somebody's display name. Preferring it here keeps
    // that guard; the identity map supplies the face and the language, which it alone knows.
    const t = useTranslations("meetingTranscript");
    const person = transcriptIdentityFor(identities, line.speakerId, line.speakerName);
    const name = localizeFarSideSpeakerName(
      line.speakerId,
      line.speakerName?.trim() || person.name,
      t("speaker.googleMeetParticipants"),
    );

    return (
      <motion.p
        initial={animateIn ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={
          singleLine
            ? "w-full max-w-3xl truncate text-center text-[14px] leading-snug text-ink"
            : "max-w-3xl text-center text-[15px] leading-snug text-ink"
        }
      >
        {showSpeaker ? (
          <>
            <ParticipantAvatar
              identity={person}
              size="xs"
              className="mr-1.5 -translate-y-px align-middle"
            />
            <span className="mr-1.5 font-semibold text-ink">{name}:</span>
          </>
        ) : null}
        {/* Plain text, not <AnimatedWords>: the words the eye is on must not still be fading in.
            AnimatedWords stays in the transcript panel, where the reader sets the pace. */}
        <span className={pending ? "text-ink-muted" : undefined}>{caption}</span>
      </motion.p>
    );
  },
  // The grouped utterance is a fresh object on every update, so the default shallow compare
  // would re-render every line for every word spoken. What is drawn is this.
  (previous, next) =>
    previous.line.segmentId === next.line.segmentId &&
    previous.line.speakerId === next.line.speakerId &&
    previous.line.speakerName === next.line.speakerName &&
    previous.caption === next.caption &&
    previous.pending === next.pending &&
    previous.showSpeaker === next.showSpeaker &&
    previous.dimmed === next.dimmed &&
    previous.reduceMotion === next.reduceMotion &&
    previous.singleLine === next.singleLine &&
    previous.identities === next.identities,
);
