"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CaretDown, ListBullets } from "@phosphor-icons/react/dist/ssr";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { identityFor } from "@/lib/meeting/participant-identity";
import {
  captionTextForReader,
  groupTranscriptSegments,
} from "@/lib/transcript/transcript-display";
import type { GroupedTranscriptSegment } from "@/lib/transcript/transcript-display";
import {
  LIVE_CAPTION_SCROLLBACK,
  captionKeyAction,
  countLinesAfter,
  expandedCaptionPanelHeight,
  isAtLatest,
  newLinesLabel,
  reduceCaptionScrollback,
  windowCaptionLines,
} from "@/lib/transcript/caption-scrollback";
import { cn } from "@/lib/utils";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useMeetingIdentities } from "./meeting-identity-context";
import { ParticipantAvatar } from "./participant-avatar";

/**
 * Live captions: what was said, IN THE READER'S OWN LANGUAGE, attributed to a face.
 *
 * WHY IT IS A ROLLING LIST AND NOT ONE BOX
 *   It used to be a single centred box holding the newest sentence, which auto-hid after six
 *   seconds. Two things came out of that. Whoever looked away for a moment lost the line with no
 *   way back — the box was gone, not scrolled off. And because the box appeared and disappeared,
 *   the space under the video was empty half the time and occupied the other half, so the caption
 *   and the transcript panel read as two surfaces competing for the same job:
 *
 *     "subtitle và transcript như đang đấu nhau"
 *
 *   The two now say different things. This lane is the LIVE surface: the last few utterances, who
 *   said them, big enough to read across a room, scrollable by hand for the line you just missed.
 *   The transcript panel is the RECORD: every line, the reader's own translation of it, timestamps
 *   and confidence. Neither is a worse copy of the other.
 *
 * WHY SCROLLING UP OPENS THE HISTORY
 *   The lane used to render only its last three utterances, so it was scrollable over a list with
 *   no past in it — at the lane's height that reads as two lines, and the scroll went nowhere:
 *
 *     "The subtitle box only shows the 2 newest lines; I can't scroll up to see older ones."
 *
 *   It now keeps the last CAPTION_HISTORY_LIMIT utterances rendered. At rest it is still the
 *   two-line live view, following the speaker. Scrolling up in it (wheel, trackpad, touch,
 *   arrows/PageUp when focused) is the way in: the lane grows UPWARD over the bottom of the
 *   stage — an overlay, so the video never reflows — stops following, and offers the way back
 *   as a pill counting what was said meanwhile. Back at the newest line, by scrolling or by the
 *   pill, it collapses and follows again. The state machine is lib/transcript/caption-scrollback.
 *
 * WHY IT SHOWS THE TRANSLATION AND NOT THE ORIGINAL
 *   REVERSED ON 2026-08-20, by the product owner, after reading it as a defect in a live meeting:
 *   a reader listening in English watched Vietnamese captions scroll past. This file previously
 *   argued the opposite — that CC is an accessibility surface for the audio in the room, so it
 *   should show the language actually being spoken. That reasoning holds for a meeting product.
 *   It does not hold for a TRANSLATION product, where the caption lane is the largest, most
 *   readable surface in the window and the one a participant watches instead of listening.
 *
 *   The original did not lose a home. The transcript panel shows it beside the reader's
 *   translation, with timestamps and confidence, which is a better place to read a source
 *   language than a three-line lane that scrolls.
 *
 *   The old worry — that turning captions on becomes indistinguishable from turning translation
 *   on — is answered in words on the CC control, not by withholding the translation.
 *
 * WHY A LINE CAN BE HELD BACK
 *   A transcript segment arrives before its translation does. Rendering the original in the
 *   meantime would put the line up in the wrong language and then change it under the reader,
 *   which is the thing being fixed rather than a smaller version of it. So a line with no
 *   caption for this reader yet is simply not shown yet — see captionTextForReader, which is
 *   also what keeps a same-language room captioned normally.
 *
 *   Only while translation is RUNNING, though. Transcription does not wait for Start
 *   Translation — the AI bot joins on the first published microphone — so before anybody
 *   presses it these lines are all there will ever be, and holding them for a translation
 *   nobody ordered is how the lane ends up blank for the first half of a meeting. Hence
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
   * Opens the transcript side panel. The lane's history is the recent past in one language; the
   * panel is the whole record with the original beside it — somebody scrolling back through
   * captions is one step from wanting that, so the lane offers it. Omitted where there is no
   * panel to open (the minimised dock), and then no control is drawn.
   */
  onOpenTranscript?: () => void;
}) {
  // The caption lane, not the transcript lane: captions keep running while the transcript is
  // paused, and this list is the one a pause never withholds from. See captionSegments.
  const segments = useTranslationRoomStore((state) => state.captionSegments);
  const identities = useMeetingIdentities();
  const reduceMotion = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Distance from the bottom at the last scroll — what entering the history must preserve. */
  const distanceRef = useRef(0);
  const [scrollback, dispatch] = useReducer(reduceCaptionScrollback, LIVE_CAPTION_SCROLLBACK);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const browsing = variant === "lane" && scrollback.browsing;
  const browsingRef = useRef(browsing);

  const spoken = useMemo(
    () =>
      // Resolved ONCE per utterance here rather than inside CaptionLine, so a line with nothing to
      // show this reader yet never occupies a slot. Filtering after the slice would leave the lane
      // rendering two lines and a gap.
      groupTranscriptSegments(segments)
        .map((utterance) => ({
          utterance,
          caption: captionTextForReader(utterance, readerLanguage, translationActive),
        }))
        .filter((line): line is CaptionLineData => Boolean(line.caption)),
    [segments, readerLanguage, translationActive],
  );

  const lines = useMemo(
    () =>
      variant === "compact"
        ? spoken.slice(-1)
        : windowCaptionLines(spoken, lineId, browsing ? scrollback.windowStartId : null),
    [spoken, variant, browsing, scrollback.windowStartId],
  );

  const newLines = browsing ? countLinesAfter(spoken, lineId, scrollback.anchorId) : 0;

  const newest = lines[lines.length - 1];
  // Length, not just the id: a live utterance keeps the same segmentId while its text grows, and
  // the lane has to follow it down as it does. Measured on the CAPTION, because that is the text
  // that grows on screen — the original can lengthen while the translation has not caught up.
  const tailKey = newest ? `${newest.utterance.segmentId}:${newest.caption.length}` : "";

  useEffect(() => {
    browsingRef.current = browsing;
  }, [browsing]);

  // Following. A layout effect, so the lane is pinned before the frame paints: from a plain
  // effect, the new line would be drawn below the fold for one frame and then jump into view.
  // Also re-runs on leaving the history, which is what collapses it onto the newest line.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || browsing) return;
    element.scrollTop = element.scrollHeight;
  }, [tailKey, lines.length, browsing]);

  // Entering the history. The panel has just grown upward, which on its own would slide the
  // text the reader was looking at up with the top edge. Putting back the distance from the
  // bottom they scrolled to keeps every line exactly where it was on screen; the older ones
  // simply appear above it.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !browsing) return;
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - distanceRef.current);
  }, [browsing]);

  // A lane that is following stays on its newest line when the window resizes it. New content
  // changes scrollHeight, not the box, so this fires for layout changes only.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!browsingRef.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [variant]);

  // The expanded height is a share of the stage, so it has to follow the stage when the window
  // changes size mid-browse.
  useEffect(() => {
    if (!browsing) return;
    const onResize = () => {
      if (rootRef.current) setExpandedHeight(measureExpandedHeight(rootRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [browsing]);

  const jumpToLatest = useCallback(() => {
    // Keyboard users keep their place: the pill they just pressed is about to disappear, and
    // focus falling back to <body> would strand them at the top of the page.
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      scrollRef.current?.focus({ preventScroll: true });
    }
    dispatch({ type: "jumpToLatest" });
  }, []);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element || variant !== "lane") return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    distanceRef.current = distanceFromBottom;
    if (!scrollback.browsing && !isAtLatest(distanceFromBottom) && rootRef.current) {
      // Measured here, in the same event, so the panel commits already at its expanded height
      // and the layout effect above restores the position against the final geometry.
      setExpandedHeight(measureExpandedHeight(rootRef.current));
    }
    // Every scroll is reported; the reducer returns the same state for the ones that change
    // nothing, and React skips the render for those.
    dispatch({
      type: "scrolled",
      distanceFromBottom,
      newestId: lines.length ? lineId(lines[lines.length - 1]) : null,
      firstId: lines.length ? lineId(lines[0]) : null,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const element = scrollRef.current;
    if (!element) return;
    const action = captionKeyAction(
      event.key,
      {
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      },
      browsing,
    );
    if (!action) return;
    event.preventDefault();
    // Escape handled here must not also close whatever the meeting has open around the lane.
    event.stopPropagation();
    if (action.type === "jumpToLatest") {
      jumpToLatest();
      return;
    }
    // Instant, and so the scroll event it produces goes through handleScroll like a wheel does:
    // one path into and out of the history, whatever moved it.
    element.scrollTop = action.top;
  }

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
    // The root holds the lane's own box and nothing more. The panel inside it is anchored to the
    // bottom and, while browsing, is TALLER than the root — it grows up over the stage instead
    // of pushing the stage up, which is what keeps the video from reflowing. The lane's container
    // must therefore not clip (see data-meeting-subtitle-lane).
    <div ref={rootRef} data-caption-lane-root className="relative h-full w-full">
      <div
        data-caption-lane
        data-browsing={browsing ? "" : undefined}
        style={browsing && expandedHeight ? { height: expandedHeight } : undefined}
        className={cn(
          "absolute inset-x-0 bottom-0 flex h-full flex-col rounded-2xl",
          browsing
            ? "border border-border bg-surface-1/95 shadow-[0_8px_30px_rgba(0,0,0,0.14)] backdrop-blur-md"
            : "bg-surface-2/60",
        )}
      >
        {browsing ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
            <p className="text-[12px] font-medium text-ink-muted">Earlier captions</p>
            <div className="flex items-center gap-1">
              {onOpenTranscript ? (
                <button
                  type="button"
                  onClick={onOpenTranscript}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ListBullets className="size-3.5" weight="bold" />
                  Full transcript
                </button>
              ) : null}
              <button
                type="button"
                onClick={jumpToLatest}
                aria-label="Close caption history and follow live captions"
                title="Back to live captions"
                className="grid size-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <CaretDown className="size-3.5" weight="bold" />
              </button>
            </div>
          </div>
        ) : onOpenTranscript ? (
          // At rest the way to the record is a corner icon, not a header: the lane is two lines
          // tall and every pixel of it is caption.
          <button
            type="button"
            onClick={onOpenTranscript}
            aria-label="Open full transcript"
            title="Open full transcript"
            className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-surface-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ListBullets className="size-4" weight="bold" />
          </button>
        ) : null}

        <div
          ref={scrollRef}
          role="region"
          aria-label="Live captions. Scroll up for earlier captions."
          // Focusable so the history is reachable without a wheel: arrows and PageUp open it,
          // End or Escape close it (captionKeyAction).
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          // Scrollable on purpose. The line you missed is one flick away instead of gone, which
          // is the whole difference between a caption and a caption you can use.
          // `overscroll-contain` keeps a wheel at the top of the history from scrolling the page.
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 custom-scrollbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60",
            browsing ? "rounded-b-2xl" : "rounded-2xl",
            onOpenTranscript && !browsing ? "pr-10" : null,
          )}
        >
          <div className="flex min-h-full max-w-3xl flex-col justify-end gap-1.5">
            {lines.length === 0 ? (
              <p className="text-[13px] text-ink-subtle">
                Captions will appear here as people speak.
              </p>
            ) : (
              lines.map((line, index) => (
                <CaptionLine
                  key={line.utterance.segmentId}
                  line={line.utterance}
                  caption={line.caption}
                  identities={identities}
                  // Older lines step back rather than disappear: still readable if you want
                  // them, never competing with the sentence being spoken right now. Not while
                  // browsing — there the older lines ARE what is being read.
                  dimmed={!browsing && index < lines.length - 1}
                  // Only the newest line fades in, and only on arrival: the history is already
                  // there when the lane mounts, and five hundred lines animating in at once is
                  // noise nobody asked for.
                  animateIn={!reduceMotion && index === lines.length - 1}
                  reduceMotion={reduceMotion}
                />
              ))
            )}
          </div>
        </div>

        <ScrollToLatestChip
          visible={browsing}
          onClick={jumpToLatest}
          label={newLinesLabel(newLines)}
          className="bottom-2"
        />
      </div>
    </div>
  );
}

type CaptionLineData = { utterance: GroupedTranscriptSegment; caption: string };

function lineId(line: CaptionLineData): string {
  return line.utterance.segmentId;
}

/**
 * The stage is the camera view in the same meeting column. Found by attribute rather than passed
 * in so the lane stays a leaf: the meeting page only has to not clip it. Where there is no stage
 * (the dev preview without one), expandedCaptionPanelHeight falls back to the viewport.
 */
function measureExpandedHeight(root: HTMLElement): number {
  const stage =
    root.closest("[data-meeting-content]")?.querySelector<HTMLElement>("[data-meeting-camera-view]") ??
    null;
  return expandedCaptionPanelHeight({
    laneHeight: root.getBoundingClientRect().height,
    stageHeight: stage ? stage.getBoundingClientRect().height : null,
    viewportHeight: window.innerHeight,
  });
}

const CaptionLine = memo(
  function CaptionLine({
    line,
    caption,
    identities,
    dimmed,
    animateIn,
    reduceMotion,
  }: {
    line: GroupedTranscriptSegment;
    /** Already resolved for this reader by captionTextForReader — never the raw original. */
    caption: string;
    identities: ReturnType<typeof useMeetingIdentities>;
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
      // No `layout` animation any more. It measured every line on every update, which was
      // affordable for three lines and is not for five hundred; the newest line's own fade is
      // what reads as "something new arrived".
      <motion.p
        initial={animateIn ? { opacity: 0, y: 4 } : false}
        animate={{ opacity: dimmed ? 0.55 : 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start gap-2 text-[15px] leading-snug text-ink"
      >
        <ParticipantAvatar identity={person} size="xs" className="mt-px" />
        <span className="min-w-0">
          <span className="mr-1.5 font-semibold text-ink">{name}:</span>
          {/* Plain text, not <AnimatedWords>. Animating each word in reads well for a transcript
              being reviewed and badly for a caption being read live: the words the eye is on are
              still fading in. AnimatedWords stays in use in the transcript panel, where the reader
              sets the pace. */}
          <span>{caption}</span>
        </span>
      </motion.p>
    );
  },
  // The grouped utterance is a fresh object on every update, so the default shallow compare
  // would re-render all five hundred lines for every word spoken. What is drawn is this.
  (previous, next) =>
    previous.line.segmentId === next.line.segmentId &&
    previous.line.speakerId === next.line.speakerId &&
    previous.line.speakerName === next.line.speakerName &&
    previous.caption === next.caption &&
    previous.dimmed === next.dimmed &&
    previous.reduceMotion === next.reduceMotion &&
    previous.identities === next.identities,
);
