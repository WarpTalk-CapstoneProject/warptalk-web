/**
 * Scrolling back through the caption lane without losing the live view.
 *
 * WHY THIS EXISTS
 *   The lane under the video rendered the last three utterances and nothing else, so it was
 *   "scrollable" over a list that had no past in it. The owner's report, in a live meeting:
 *
 *     "The subtitle box only shows the 2 newest lines; I can't scroll up to see older ones."
 *
 *   Both halves of that were true — three utterances at the lane's height read as two, and the
 *   scroll had nowhere to go. The fix keeps the two-line lane as the resting state (it is what
 *   people watch instead of listening) and makes scrolling up in it a way into the history:
 *   the lane grows upward into a taller panel over the bottom of the stage, stops following
 *   the speaker, and offers the way back with a count of what arrived meanwhile.
 *
 * WHY IT IS A REDUCER AND NOT A FEW REFS
 *   "Following" and "browsing" have to agree with each other at every moment or the lane does
 *   one of two visibly broken things: yanks the reader back down mid-sentence, or sits
 *   expanded and frozen while the meeting moves on. Putting the transitions in one pure
 *   function is what lets them be pinned by a test instead of by a meeting.
 *
 * Pure and dependency-free on purpose: it is imported by node-run contract tests, which have
 * no bundler (see project memory: store/lib imports must be relative).
 */

/** How many utterances the lane keeps rendered. An hour of talk is ~400; three hours are not. */
export const CAPTION_HISTORY_LIMIT = 500;

/**
 * While browsing, the rendered window is pinned to the line it started at, so nothing above
 * the reader is ever removed from under them (that shifts the content and reads as a yank).
 * This is the ceiling on how far that pinned window may grow before the oldest lines go anyway.
 */
export const CAPTION_BROWSING_HARD_CAP = CAPTION_HISTORY_LIMIT * 2;

/**
 * Slack, in px, within which the reader still counts as "at the newest line". Small, because the
 * lane is small: at its resting height one caption line is ~20px, and anything larger would let
 * a reader scroll up a whole line and still be dragged back down.
 */
export const CAPTION_FOLLOW_THRESHOLD_PX = 12;

/** Share of the video stage the expanded panel may cover, on top of the lane's own height. */
export const CAPTION_EXPANDED_STAGE_SHARE = 0.4;

export type CaptionScrollbackState = {
  /** True while the reader is scrolled up: follow is paused and the panel is expanded. */
  browsing: boolean;
  /** The newest line the reader had when they left the bottom — "new lines" count from here. */
  anchorId: string | null;
  /** The first rendered line when browsing began — the window stays pinned to it. */
  windowStartId: string | null;
};

export const LIVE_CAPTION_SCROLLBACK: CaptionScrollbackState = Object.freeze({
  browsing: false,
  anchorId: null,
  windowStartId: null,
});

export type CaptionScrollbackEvent =
  | {
      type: "scrolled";
      distanceFromBottom: number;
      /** Id of the newest line rendered at the moment of the scroll. */
      newestId: string | null;
      /** Id of the oldest line rendered at the moment of the scroll. */
      firstId: string | null;
    }
  | { type: "jumpToLatest" };

export function isAtLatest(distanceFromBottom: number): boolean {
  // `<=` and not `<`: a browser rubber-banding past the end reports a negative distance, and
  // exactly-at-the-threshold is the reader who scrolled back down on purpose.
  return distanceFromBottom <= CAPTION_FOLLOW_THRESHOLD_PX;
}

export function reduceCaptionScrollback(
  state: CaptionScrollbackState,
  event: CaptionScrollbackEvent,
): CaptionScrollbackState {
  if (event.type === "jumpToLatest") {
    return state.browsing ? LIVE_CAPTION_SCROLLBACK : state;
  }

  const atLatest = isAtLatest(event.distanceFromBottom);

  if (!state.browsing) {
    // Nothing to browse back to is not browsing: a lane with a single short line cannot leave
    // its bottom, and an event claiming it did has no line to anchor the count to.
    if (atLatest || !event.newestId) return state;
    return { browsing: true, anchorId: event.newestId, windowStartId: event.firstId };
  }

  // Back at the newest line by hand is the same request as pressing the pill.
  if (atLatest) return LIVE_CAPTION_SCROLLBACK;

  // Scrolling around inside the history changes nothing: the anchor is where the reader LEFT,
  // not where they are, so the count keeps meaning "said since you looked away".
  return state;
}

/**
 * The lines to render: the last CAPTION_HISTORY_LIMIT while following, and — while browsing —
 * everything from the line the window started at, so appending at the bottom never removes a
 * line above the reader.
 */
export function windowCaptionLines<T>(
  lines: readonly T[],
  idOf: (line: T) => string,
  pinnedStartId: string | null,
  limit: number = CAPTION_HISTORY_LIMIT,
): T[] {
  if (pinnedStartId) {
    const start = lines.findIndex((line) => idOf(line) === pinnedStartId);
    if (start >= 0) {
      const hardCap = Math.max(limit, CAPTION_BROWSING_HARD_CAP);
      return lines.slice(Math.max(start, lines.length - hardCap));
    }
  }
  return lines.slice(-limit);
}

/**
 * How many lines arrived after `anchorId`. Zero when the anchor is unknown — a pill claiming
 * five hundred new lines because an id went missing is worse than a pill with no number.
 */
export function countLinesAfter<T>(
  lines: readonly T[],
  idOf: (line: T) => string,
  anchorId: string | null,
): number {
  if (!anchorId) return 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (idOf(lines[index]) === anchorId) return lines.length - 1 - index;
  }
  return 0;
}

export function newLinesLabel(count: number): string {
  if (count <= 0) return "Jump to latest";
  if (count > 99) return "99+ new lines";
  return `${count} new ${count === 1 ? "line" : "lines"}`;
}

/**
 * Height of the expanded panel: the lane, plus a bounded share of the stage above it. Measured
 * rather than written in CSS because the stage's height is set by the layout around it, and a
 * viewport-relative guess covers most of a short window's picture and little of a tall one's.
 */
export function expandedCaptionPanelHeight({
  laneHeight,
  stageHeight,
  viewportHeight,
}: {
  laneHeight: number;
  /** The camera view's height, or null where there is none (the dev preview, a detached lane). */
  stageHeight: number | null;
  viewportHeight: number;
}): number {
  const room = stageHeight && stageHeight > 0 ? stageHeight : viewportHeight * 0.6;
  return Math.round(Math.max(0, laneHeight) + Math.max(0, room) * CAPTION_EXPANDED_STAGE_SHARE);
}

/** Pixels one arrow press moves: a caption line and a bit, so each press visibly reveals one. */
export const CAPTION_ARROW_STEP_PX = 40;

export type CaptionKeyAction =
  | { type: "scrollTo"; top: number }
  | { type: "jumpToLatest" }
  | null;

/**
 * Keyboard for the focused lane. Browsers do scroll a focused overflow box on their own, but not
 * consistently (Safari needs the element to have been clicked first), and Escape/End have to
 * mean "back to live", which no browser does. Everything goes through one table.
 */
export function captionKeyAction(
  key: string,
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  browsing: boolean,
): CaptionKeyAction {
  const bottom = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const page = Math.max(CAPTION_ARROW_STEP_PX, Math.round(metrics.clientHeight * 0.85));
  const clamp = (top: number) => Math.min(bottom, Math.max(0, top));

  switch (key) {
    case "ArrowUp":
      return { type: "scrollTo", top: clamp(metrics.scrollTop - CAPTION_ARROW_STEP_PX) };
    case "ArrowDown":
      return { type: "scrollTo", top: clamp(metrics.scrollTop + CAPTION_ARROW_STEP_PX) };
    case "PageUp":
      return { type: "scrollTo", top: clamp(metrics.scrollTop - page) };
    case "PageDown":
      return { type: "scrollTo", top: clamp(metrics.scrollTop + page) };
    case "Home":
      return { type: "scrollTo", top: 0 };
    case "End":
      return { type: "jumpToLatest" };
    case "Escape":
      // Only while browsing. At rest the lane has nothing to close, and swallowing Escape here
      // would steal it from whatever dialog or flyout the meeting has open.
      return browsing ? { type: "jumpToLatest" } : null;
    default:
      return null;
  }
}
