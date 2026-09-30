"use client";

import { memo, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { ListBullets } from "@phosphor-icons/react/dist/ssr";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { identityFor } from "@/lib/meeting/participant-identity";
import {
  captionTextForReader,
  groupTranscriptSegments,
  mergeTranslations,
} from "@/lib/transcript/transcript-display";
import {
  buildCleanTranscriptView,
  withAbsorbedSegmentIds,
} from "@/lib/transcript/clean-transcript";
import { useTranscriptViewMode } from "@/hooks/use-transcripts";
import type { GroupedTranscriptSegment } from "@/lib/transcript/transcript-display";
import { liveCaptionLines } from "@/lib/transcript/live-caption-lines";
import { useMeetingIdentities } from "./meeting-identity-context";
import { ParticipantAvatar } from "./participant-avatar";

/**
 * Live captions: what was said, IN THE READER'S OWN LANGUAGE, attributed to a face.
 *
 * WHY IT SHOWS ONLY THE CURRENT CAPTION (WT-873)
 *   The lane once kept its history and opened it as an "Earlier captions" panel when the reader
 *   scrolled up. The panel grew upward OVER the camera view — reading back meant covering the
 *   people talking — and it duplicated the Transcript side panel, which is the record: every
 *   line, the original beside the translation, timestamps and confidence. So the lane is now a
 *   subtitle again: the utterance being spoken and the one before it, centred, not scrollable,
 *   with a corner button into the transcript panel for anyone who wants to read back.
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
  onOpenTranscript,
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
  /**
   * Opens the transcript side panel — the only place to read back, since the lane shows the
   * current caption and nothing older (WT-873). Omitted where there is no panel to open (the
   * minimised dock), and then no control is drawn.
   */
  onOpenTranscript?: () => void;
}) {
  const t = useTranslations("meetingCallChrome.captions");
  // The caption lane, not the transcript lane: captions keep running while the transcript is
  // paused, and this list is the one a pause never withholds from. See captionSegments.
  const segments = useTranslationRoomStore((state) => state.captionSegments);
  const cleanSentences = useTranslationRoomStore((state) => state.cleanSentences);
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
    return shown
      .map((utterance) => ({
        utterance,
        caption: captionTextForReader(utterance, readerLanguage, translationActive),
      }))
      .filter((line): line is CaptionLineData => Boolean(line.caption));
  }, [segments, cleanSentences, viewMode, readerLanguage, translationActive]);

  const lines = useMemo(
    () =>
      variant === "compact"
        ? liveCaptionLines(spoken, speakerOfLine, 1)
        : liveCaptionLines(spoken, speakerOfLine),
    [spoken, variant],
  );

  const newest = lines[lines.length - 1]?.line;

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
    // A fixed box that clips: nothing in the lane grows over the camera view, and nothing in it
    // scrolls. Lines are bottom-anchored, so a long utterance loses its OLDEST words off the top
    // and the words being spoken now stay on screen.
    <div
      data-caption-lane
      className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-surface-2/60"
    >
      {onOpenTranscript ? (
        // The way to read back is the transcript panel, reached from a corner icon: the lane is
        // two lines tall and every pixel of it is caption.
        <button
          type="button"
          onClick={onOpenTranscript}
          aria-label={t("openFullTranscript")}
          title={t("openFullTranscript")}
          className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ListBullets className="size-4" weight="bold" />
        </button>
      ) : null}

      <div
        role="region"
        aria-label={t("liveRegionAria")}
        className="flex min-h-0 flex-1 flex-col items-center justify-end gap-1 overflow-hidden px-10 py-2 text-center"
      >
        {lines.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">{t("emptyState")}</p>
        ) : (
          lines.map(({ line, showSpeaker }, index) => (
            <CaptionLine
              key={line.utterance.segmentId}
              line={line.utterance}
              caption={line.caption}
              identities={identities}
              showSpeaker={showSpeaker}
              // The previous line steps back rather than disappears: still readable if you
              // glanced away, never competing with the sentence being spoken right now.
              dimmed={index < lines.length - 1}
              animateIn={!reduceMotion && index === lines.length - 1}
              reduceMotion={reduceMotion}
            />
          ))
        )}
      </div>
    </div>
  );
}

type CaptionLineData = { utterance: GroupedTranscriptSegment; caption: string };

function speakerOfLine(line: CaptionLineData): string | null | undefined {
  return line.utterance.speakerId ?? line.utterance.speakerName;
}

const CaptionLine = memo(
  function CaptionLine({
    line,
    caption,
    identities,
    showSpeaker,
    dimmed,
    animateIn,
    reduceMotion,
  }: {
    line: GroupedTranscriptSegment;
    /** Already resolved for this reader by captionTextForReader — never the raw original. */
    caption: string;
    identities: ReturnType<typeof useMeetingIdentities>;
    /** Avatar + name only when this line opens a speaker run (liveCaptionLines). */
    showSpeaker: boolean;
    dimmed: boolean;
    /** Read at mount only: whether this line fades in or is simply there. */
    animateIn: boolean;
    reduceMotion: boolean;
  }) {
    // `speakerName` was already resolved on arrival by resolveTranscriptSpeakerName, which guards
    // against a roster that hands back a UUID as somebody's display name. Preferring it here keeps
    // that guard; the identity map supplies the face and the language, which it alone knows.
    const person = identityFor(identities, line.speakerId, line.speakerName);
    const name = line.speakerName?.trim() || person.name;

    return (
      <motion.p
        initial={animateIn ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-3xl text-center text-[15px] leading-snug text-ink"
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
        <span>{caption}</span>
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
    previous.showSpeaker === next.showSpeaker &&
    previous.dimmed === next.dimmed &&
    previous.reduceMotion === next.reduceMotion &&
    previous.identities === next.identities,
);
