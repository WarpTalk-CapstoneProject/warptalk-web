"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * "You have scrolled up, and there is newer content down there."
 *
 * WHY THIS EXISTS
 *   Every log in this product already stops following when the reader scrolls up — a chat that
 *   yanks itself back down mid-sentence is unreadable, and the transcript panel carries a comment
 *   about the report that made it stop. But stopping is only half of it: once a reader is up in
 *   the middle of an hour-long meeting there is no way back to the newest line except dragging a
 *   scrollbar the length of the room, and nothing on screen even says the bottom has moved.
 *
 * WHY THE THRESHOLD IS A PARAMETER
 *   The chip has to appear at exactly the moment its panel STOPS following, and the panels do not
 *   agree on that distance (chat allows 80px of slack, the transcript 48). Hardcoding one here
 *   would put a "jump to the newest" chip on a panel that is still jumping there by itself, or
 *   leave it hidden on one that has quietly stopped — both of which read as the control being
 *   broken rather than as a threshold being off by 30 pixels.
 *
 * WHY A REVISION RATHER THAN AN OBSERVER
 *   New content changes scrollHeight without resizing anything, so a ResizeObserver on the
 *   scroller never fires, and a MutationObserver over a live transcript fires on every token. The
 *   panels already re-render on the list they draw; passing that list back is exact, cheap, and
 *   has no lifecycle of its own.
 */
export function useScrollToLatest(
  containerRef: RefObject<HTMLElement | null>,
  {
    /** Distance from the bottom, in px, past which the reader counts as having left it. */
    threshold = 48,
    /** Anything that changes when the content does — the message list, the blocks, the steps. */
    revision,
  }: { threshold?: number; revision?: unknown } = {},
) {
  const [isAway, setIsAway] = useState(false);

  // The threshold is a dependency rather than a ref read during render: every caller passes a
  // module constant, so the listener is re-attached approximately never, and a ref assigned in
  // the render body is a write during render that React's own lint rule refuses.
  const measure = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsAway(distanceFromBottom > threshold);
  }, [containerRef, threshold]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    measure();
    element.addEventListener("scroll", measure, { passive: true });
    return () => element.removeEventListener("scroll", measure);
  }, [containerRef, measure]);

  // Content arriving while the reader is up the page is the whole case this exists for: the
  // distance grows without a scroll event, so nothing else would ever re-measure.
  useEffect(() => {
    measure();
  }, [measure, revision]);

  const scrollToLatest = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    // Smooth on purpose, and the one place in these panels where that is right: this is a
    // deliberate request to travel, so the movement is the feedback that it was heard. Restoring
    // a remembered position is the opposite case and stays a jump.
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    // Optimistic: the chip goes now rather than after the animation, so it does not sit under the
    // cursor that just clicked it for another 300ms.
    setIsAway(false);
  }, [containerRef]);

  return { isAway, scrollToLatest, measure };
}
