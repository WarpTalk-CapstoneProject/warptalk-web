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
 * INITIAL BODY
 *   Moved verbatim from the old desktop-transcript page so the shell ships without a regression:
 *   the list, the follow-only-at-the-bottom scrolling and the "Latest" chip (WT-577). t2 replaces
 *   it with the bubble design.
 */

import { useEffect, useRef, type JSX } from "react";

import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";

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
  const { segments } = useBridgeWidget();
  const scrollerRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the reader was at the bottom the last time they moved.
   *
   * True initially: an empty transcript is at its bottom, and the first line to arrive should be
   * followed. Updated from the scroll handler, which fires for the auto-scroll too, so a reader
   * who has been carried back down starts being followed again without doing anything.
   */
  const stickToBottomRef = useRef(true);

  const { isAway, scrollToLatest } = useScrollToLatest(scrollerRef, {
    threshold: STICK_TO_BOTTOM_PX,
    revision: segments.length,
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
   */
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    if (!stickToBottomRef.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [segments]);

  return (
    // `relative` because the chip floats over the bottom of this scroller.
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollerRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight
            <= STICK_TO_BOTTOM_PX;
        }}
        className="h-full space-y-4 overflow-y-auto px-4 py-4"
      >
        {segments.length === 0 && (
          <p className="text-sm text-ink-muted">
            Waiting for the first thing anyone says. Speak in your meeting and it will appear
            here.
          </p>
        )}

        {segments.map((segment) => {
          // Every translation the room produced, keyed by language. Which one to show is the
          // reader's choice everywhere else in the app; in a two-seat bridge room there is only
          // ever one, so showing whatever arrived avoids a language picker in a 460px window.
          const translation = segment.translations
            ? Object.values(segment.translations)[0]
            : segment.translatedText;

          return (
            <article key={segment.segmentId} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                {segment.speakerName}
              </p>
              <p className="text-[15px] leading-snug text-ink">{segment.originalText}</p>
              {translation && (
                <p className="border-l-2 border-border pl-2 text-[15px] leading-snug text-ink-muted">
                  {translation}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
    </div>
  );
}
