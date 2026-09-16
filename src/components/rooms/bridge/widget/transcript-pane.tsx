"use client";

/**
 * SLOT: the Transcript tab of the Meet widget. Owner: WT-525 t2.
 *
 * CONTRACT
 *   `export function TranscriptPane(): JSX.Element` — no props. Read everything from
 *   `useBridgeWidget()`: `segments` (oldest first, replaced by segmentId), `readerLanguage`,
 *   `transcriptPaused` / `transcriptPausedSince` / `transcriptPauseKnown`, `translationStarted`.
 *   The shell renders this inside a `relative flex min-h-0 flex-1 flex-col` panel between the
 *   tabs and the dock; the pane owns its own scroller. It stays mounted while the WarpBot tab is
 *   showing (the panel is `hidden`), so scroll position survives a tab switch.
 *
 * WHAT IT READS LIKE
 *   The in-meeting transcript panel (live/side-panel/transcript-panel.tsx), bubble for bubble: a
 *   face on the side, the name and clock above, one line per sentence with the original muted and
 *   the reader's translation in medium weight, and "<spoken> → <reader>" plus the recogniser's
 *   confidence underneath. Your own lines sit on the right in the primary colour. Someone who
 *   looks from the main window to this popup over Meet should be reading one transcript, not two
 *   that disagree about which translation, which speaker or which way the arrow points.
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY OVER
 *   - Session dividers ("Translation 2 · 10:04–10:31") and pause dividers. Both need the room's
 *     start time to place a line in time, and in a 460px window over a live call the reader wants
 *     the last few lines, not the meeting's structure — the room record has that.
 *   - The open-pause filter (`withoutSegmentsInOpenPauseGaps`). The in-meeting panel needs it
 *     because it is fed by the realtime store, which keeps carrying speech through a pause for
 *     the captions. This pane is fed by the SAVED transcript (see use-bridge-widget-state.ts), and
 *     a paused transcript is one nothing is written into — the same reasoning, and the same
 *     danger of an unclosed window swallowing the rest of a meeting, that keeps the filter off
 *     meeting-transcript-panel.tsx. TODO(WT-525 relay / backend): the day live segments reach this
 *     window, they will carry speech spoken into a pause, and the filter has to come with them.
 *   - AI suggestion badges: see transcript/widget-transcript-bubble.tsx.
 */

import { useEffect, useMemo, useRef, type JSX } from "react";
import { ClosedCaptioning } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence } from "motion/react";

import { MeetingIdentityProvider } from "@/components/rooms/live/meeting-identity-context";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { buildParticipantIdentities } from "@/lib/meeting/participant-identity";
import { groupTranscriptSegments } from "@/lib/transcript/transcript-display";
import { useAuthStore } from "@/stores/auth-store";

import { WidgetTranscriptBubble } from "./transcript/widget-transcript-bubble";
import { WidgetTranscriptPausedNotice } from "./transcript/widget-transcript-paused-notice";
import { useBridgeWidget } from "./widget-context";

/**
 * How close to the bottom still counts as following.
 *
 * Matches the in-meeting transcript panel, so the chip appears at exactly the moment this window
 * stops scrolling itself. A threshold that disagreed with the auto-scroll rule would either offer
 * a jump to a bottom the window is already gliding towards, or hide the chip on a window that has
 * quietly stopped — both of which read as a broken control rather than an off-by-30-pixels.
 */
const STICK_TO_BOTTOM_PX = 48;

export function TranscriptPane(): JSX.Element {
  const { segments, readerLanguage, transcriptPaused, transcriptPausedSince } = useBridgeWidget();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?.id;
  const scrollerRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the reader was at the bottom the last time they moved.
   *
   * True initially: an empty transcript is at its bottom, and the first line to arrive should be
   * followed. Updated from the scroll handler, which fires for the auto-scroll too, so a reader
   * who has been carried back down starts being followed again without doing anything.
   */
  const stickToBottomRef = useRef(true);
  /** Whether anything has been drawn yet — the first batch is a backlog, not an arrival. */
  const hasContentRef = useRef(false);

  /**
   * Speaking turns, as the meeting draws them.
   *
   * Grouped exactly as the in-meeting panel groups: consecutive chunks of one person talking fold
   * into one bubble, with `paragraphs` recording where they stopped. The raw list would draw a
   * bubble per recogniser chunk — per breath, for a Vietnamese speaker. It also drops the
   * pipeline's own `__MEETING_END__` rows, which the saved transcript this window reads does hold.
   */
  const bubbles = useMemo(() => groupTranscriptSegments(segments), [segments]);

  /**
   * Faces for this window, which has no meeting roster to build them from.
   *
   * ParticipantAvatar reads the meeting identity context, and outside a provider that context is
   * an empty map — every face falls back to initials from the segment's name. That is already
   * right for the far side: in a bridge room it is the stand-in participant, which has no account
   * and no photo. Seeding the map with the signed-in user, through the same builder the meeting
   * uses, gives your own lines your real photo and your listen-language badge, as they have in
   * the main window. The stand-in is deliberately NOT invented here: the builder only knows what
   * a roster tells it, and this window holds none.
   */
  const identities = useMemo(
    () =>
      buildParticipantIdentities({
        participants: [],
        self: user,
        selfLanguages: { listen: readerLanguage },
      }),
    [user, readerLanguage],
  );

  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, {
    threshold: STICK_TO_BOTTOM_PX,
    // What is rendered, and every change to it: a grouped turn that grows by a chunk keeps the
    // bubble count and still moves the bottom.
    revision: bubbles,
  });

  /**
   * Follow the newest line, but only for a reader who is already there.
   *
   * This used to be an unconditional `scrollIntoView` on every segment. In a live meeting that is
   * a new segment every few seconds, so scrolling up to re-read something was impossible — the
   * window pulled itself back down before the sentence could be finished.
   *
   * THE MEASUREMENT HAS TO PREDATE THE CONTENT. An effect runs after the new segment is already in
   * the DOM, so measuring there asks "is the reader at the bottom of a list that just grew", and a
   * reader who WAS at the bottom is now a segment's height away from it — they would be classed as
   * having scrolled up, by the very line they were waiting for. The scroll handler records
   * stickiness at the last moment the reader actually moved, which is the question worth asking.
   *
   * THE FIRST BATCH JUMPS. This window opens mid-meeting and the saved transcript lands all at
   * once; gliding smoothly to the bottom of twenty minutes of talking is the long animated scroll
   * the in-meeting panel was reported for ("nó scroll lâu"). Only lines that arrive after that
   * are followed smoothly.
   */
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element || bubbles.length === 0) return;
    const first = !hasContentRef.current;
    hasContentRef.current = true;
    if (!stickToBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: first ? "auto" : "smooth" });
  }, [bubbles]);

  return (
    <MeetingIdentityProvider identities={identities}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Pinned above the scroller rather than dropped into the list, as in the meeting: it is
            a live state, and a reader parked at the bottom would never scroll up to find it.
            Above the empty state too — a host can pause before anyone has spoken, and "Waiting
            for the first thing anyone says" alone would then say the opposite of what is
            happening. */}
        {transcriptPaused ? <WidgetTranscriptPausedNotice since={transcriptPausedSince} /> : null}

        {/* `relative` because the chip floats over the bottom of this scroller. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollerRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              stickToBottomRef.current =
                element.scrollHeight - element.scrollTop - element.clientHeight
                <= STICK_TO_BOTTOM_PX;
            }}
            // Always rendered, even empty: useScrollToLatest attaches its listener to this element
            // once, on mount, and a scroller that only appeared with the first line would never
            // report being scrolled away.
            className="h-full space-y-2 overflow-y-auto p-3"
          >
            {bubbles.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <ClosedCaptioning className="h-8 w-8 text-ink-tertiary" weight="light" />
                <p className="max-w-[240px] text-[13px] text-ink-subtle">
                  Waiting for the first thing anyone says. Speak in your meeting and it will appear
                  here.
                </p>
              </div>
            ) : (
              // Mounted with the first batch, not before, so `initial={false}` covers exactly that
              // batch: it is the backlog this window opened onto, and animating twenty minutes of
              // lines in word by word is noise. Everything after it is new and animates in.
              <AnimatePresence initial={false}>
                {bubbles.map((segment) => (
                  <WidgetTranscriptBubble
                    key={segment.segmentId}
                    segment={segment}
                    readerLanguage={readerLanguage}
                    // Saved lines carry `speakerParticipantId` as `speakerId` (toLiveSegment), and
                    // the room record compares that same field against the user id.
                    isSelf={Boolean(currentUserId) && segment.speakerId === currentUserId}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
        </div>
      </div>
    </MeetingIdentityProvider>
  );
}
