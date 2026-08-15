/**
 * How wide the meeting side panel is allowed to be, and where that choice is remembered.
 *
 * WHY IT IS RESIZABLE AT ALL
 *   The transcript lives in this panel at a fixed 300/340px. From the 15 Aug test: "cửa sổ
 *   transcript này cho điều chỉnh kéo to ra ko ... để nhỏ quá nhìn khó". A translated transcript is
 *   the thing people READ during a call, and a fixed narrow column wraps every line two or three
 *   times.
 *
 * WHY IT IS CLAMPED
 *   The panel is a flex sibling of the video stage, so an unbounded drag would collapse the stage
 *   to nothing — and the control bar with it, which is the same class of failure the two-tier
 *   breakpoint comment in meeting-side-panel.tsx already documents. The maximum is a share of the
 *   viewport rather than a constant so the floor holds on a laptop as well as a monitor.
 */

/** Below this the transcript wraps every line and the tab row starts to scroll. */
export const MIN_SIDE_PANEL_WIDTH = 280;

/** Never wider than this, whatever the viewport. */
export const MAX_SIDE_PANEL_WIDTH = 720;

/** The stage keeps at least this much, so video and the control bar survive any drag. */
export const MIN_STAGE_WIDTH = 480;

export const SIDE_PANEL_WIDTH_STORAGE_KEY = "warptalk.meeting.sidePanelWidth";

/**
 * The width to actually apply, given what the user dragged to and how much room there is.
 *
 * `viewportWidth` of 0 (server render, or a jsdom-less test) falls back to the absolute bounds:
 * the stage floor cannot be enforced without knowing the viewport, and guessing one would produce
 * a different width on the server than in the browser.
 */
export function clampSidePanelWidth(requested: number, viewportWidth: number): number {
  if (!Number.isFinite(requested)) return MIN_SIDE_PANEL_WIDTH;

  const upperBound = viewportWidth > 0
    ? Math.min(MAX_SIDE_PANEL_WIDTH, Math.max(MIN_SIDE_PANEL_WIDTH, viewportWidth - MIN_STAGE_WIDTH))
    : MAX_SIDE_PANEL_WIDTH;

  return Math.round(Math.min(upperBound, Math.max(MIN_SIDE_PANEL_WIDTH, requested)));
}

/**
 * The remembered width, or null when there is nothing usable stored.
 *
 * Null rather than a default so the caller keeps its own responsive default (300px at lg, 340px at
 * xl) until the user has actually expressed a preference. Returning a number here would pin every
 * viewport to one width the moment this shipped.
 */
export function readStoredSidePanelWidth(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
