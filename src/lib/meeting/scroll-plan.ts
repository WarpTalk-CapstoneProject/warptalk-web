/**
 * How to travel back to the newest line without watching the whole meeting go past. WT-574.
 *
 * WHAT WAS WRONG
 *   `scrollTo({ behavior: "smooth" })` animates the WHOLE distance, and the browser picks the
 *   duration from that distance. An hour of transcript is tens of thousands of pixels, so pressing
 *   "Jump to latest" started a two-to-three second flight through content nobody asked to read —
 *   and every frame of it is a real paint of real bubbles, which is where the dropped frames come
 *   from. The smoothness was never the point; being told the request was heard was.
 *
 * THE SHAPE OF THE FIX
 *   Cut the journey, not the animation. Jump instantly to just above the bottom, then smooth-scroll
 *   the last short hop. The reader still gets the movement that says "you are being taken there",
 *   it lasts a fixed ~150ms instead of scaling with meeting length, and the browser only ever
 *   animates across one screen of content.
 *
 * WHY A PURE FUNCTION
 *   The hook that uses this needs a DOM element, so the rule itself would otherwise only be
 *   testable through a browser. The arithmetic is the part that can be wrong — an off-by-one here
 *   lands the reader 300px short of the newest line, which looks exactly like the panel having
 *   stopped following.
 */

/**
 * Past this distance the smooth scroll is long enough to be a nuisance rather than feedback.
 * Roughly two screens on a laptop: below it the animation is already brief, so cutting it would
 * only remove the feedback without saving anything.
 */
export const LONG_SCROLL_THRESHOLD_PX = 2000;

/** How much is left to animate after a long jump — one comfortable glance, not a journey. */
export const SMOOTH_TAIL_PX = 300;

export type ScrollPlan = {
  /**
   * Scroll position to take instantly before animating, or null when the distance is short
   * enough to animate in full.
   */
  jumpTo: number | null;
  /** Where the smooth scroll ends. Always the bottom. */
  smoothTo: number;
};

export function planScrollToLatest(metrics: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): ScrollPlan {
  const { scrollHeight, scrollTop, clientHeight } = metrics;
  const bottom = Math.max(0, scrollHeight - clientHeight);
  const distance = bottom - scrollTop;

  // Already at (or below, which a rubber-banding browser can report) the bottom: nothing to plan.
  // Still returns the bottom as the target so the caller's single scrollTo is harmless.
  if (distance <= LONG_SCROLL_THRESHOLD_PX) {
    return { jumpTo: null, smoothTo: bottom };
  }

  // Clamped at 0 for the degenerate case of a container shorter than the tail: jumping to a
  // negative offset is ignored by the browser, which would leave the reader where they were and
  // make the button look dead.
  return { jumpTo: Math.max(0, bottom - SMOOTH_TAIL_PX), smoothTo: bottom };
}
