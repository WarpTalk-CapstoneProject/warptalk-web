/**
 * The Google Meet window, cropped to Google Meet. WT-910 follow-up (production recording, 03 Oct).
 *
 * THE BUG
 *   The recording's picture was the whole Chrome window: the tab strip — with the titles of every
 *   other tab the user had open — the address bar and the bookmarks bar. A recording that promises
 *   "the Google Meet UI" showed the user's browser, and what else they were reading.
 *
 * WHAT THIS DOES
 *   The desktop app reads where the page's content sits in the window (warptalk-desktop
 *   meet-window-geometry.ts) and sends it with the call state (`MeetCallState.windowGeometry`).
 *   `meetWindowVisibleRect` maps that onto the frames the capture actually delivers and gives back
 *   the WebCodecs `visibleRect` to crop each frame to (meet-window-track.ts applies it, to the
 *   repeated frames too).
 *
 * WHICH RECTANGLE THE FRAME IS
 *   A window capture covers either the visible window (DWM's extended frame bounds) or the window
 *   rectangle with its invisible resize borders; which one was not measured, and a maximized window
 *   differs from a restored one. The capture may also be scaled down (MEET_WINDOW_CAPTURE_CONSTRAINTS
 *   caps it at 1920x1080). So both are tried and the one whose shape matches the frame's is used;
 *   when neither matches within MAX_SHAPE_MISMATCH the frame is something else and is left alone.
 *
 * NEVER A CROP THAT COULD HIDE THE MEETING
 *   Every way this can be wrong falls back to the uncropped window, which is exactly what was
 *   recorded before: no geometry (an older desktop, a read that failed its checks), a frame of
 *   another shape, content outside the window, or a crop that would keep less than
 *   MIN_CONTENT_WIDTH_SHARE x MIN_CONTENT_HEIGHT_SHARE of the frame. A crop that is the whole frame
 *   (fullscreen: F11, or Meet's own full screen) is no crop. Edges are rounded INWARD to even
 *   pixels — 4:2:0 frames cannot start on an odd pixel — so a rounding never brings back a sliver of
 *   the address bar.
 *
 * WHOSE LAYOUT
 *   Only the layout of the window being captured counts (`nextMeetWindowCropGeometry`): right after
 *   the Meet tab is dragged into another window, the call state describes the new window while the
 *   capture still shows the old one (until the re-arm, meetWindowNeedsRearm in bridge-recording.ts).
 *   And a reading without a layout — a transient failed read, a minimized window — keeps the last
 *   good one rather than flashing the browser chrome back into the recording.
 */

import type { MeetCallState, MeetWindowGeometry, MeetWindowRect } from "../desktop/bridge";

/** A frame's visible area in its coded pixels (VideoFrame.visibleRect), and the crop handed back. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far the frame's aspect may be from a window rectangle's (scaling rounds to whole pixels). */
export const MAX_SHAPE_MISMATCH = 0.02;
/** The crop keeps at least this share of the frame's width (a side panel or docked DevTools fits). */
export const MIN_CONTENT_WIDTH_SHARE = 0.4;
/** ...and of its height (tab strip, toolbar, bookmarks bar and an infobar are ~15-20%). */
export const MIN_CONTENT_HEIGHT_SHARE = 0.5;
/** ...and never less than this, in frame pixels. */
export const MIN_CONTENT_WIDTH_PX = 160;
export const MIN_CONTENT_HEIGHT_PX = 120;
/** How far (window pixels) the content may poke past the chosen window rectangle. */
const CONTENT_OVERHANG_PX = 8;
/** A crop within this of every edge is the whole frame, and is no crop. */
const FULL_FRAME_SLACK_PX = 2;

function isPositiveSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseRect(raw: unknown): MeetWindowRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isCoordinate(r.x) || !isCoordinate(r.y) || !isPositiveSize(r.width) || !isPositiveSize(r.height)) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** The desktop's geometry, checked again on this side of the IPC: anything malformed is null. */
export function parseMeetWindowGeometry(raw: unknown): MeetWindowGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const frame = parseRect(g.frame);
  const window = parseRect(g.window);
  const content = parseRect(g.content);
  if (!frame || !window || !content) return null;
  return { frame, window, content };
}

function ceilEven(value: number): number {
  return Math.ceil(value / 2) * 2;
}

function floorEven(value: number): number {
  return Math.floor(value / 2) * 2;
}

/**
 * The `visibleRect` to crop a captured frame to, or null for "leave the frame as it is".
 *
 * `frame` is the source frame's own visible area in coded pixels (VideoFrame.visibleRect, or the
 * coded size from (0, 0)). The answer is in the same coded pixels, even-aligned, inside `frame`.
 */
export function meetWindowVisibleRect(geometry: unknown, frame: FrameRect): FrameRect | null {
  const g = parseMeetWindowGeometry(geometry);
  if (!g) return null;
  if (!isCoordinate(frame?.x) || !isCoordinate(frame.y) || !isPositiveSize(frame.width) || !isPositiveSize(frame.height)) {
    return null;
  }

  // Which window rectangle this frame is a picture of: the one with the frame's shape.
  let reference: MeetWindowRect | null = null;
  let mismatch = Number.POSITIVE_INFINITY;
  for (const candidate of [g.frame, g.window]) {
    const sx = frame.width / candidate.width;
    const sy = frame.height / candidate.height;
    const m = Math.abs(sx - sy) / Math.max(sx, sy);
    if (m < mismatch) {
      mismatch = m;
      reference = candidate;
    }
  }
  if (!reference || mismatch > MAX_SHAPE_MISMATCH) return null;

  const left = g.content.x - reference.x;
  const top = g.content.y - reference.y;
  const right = left + g.content.width;
  const bottom = top + g.content.height;
  if (
    left < -CONTENT_OVERHANG_PX ||
    top < -CONTENT_OVERHANG_PX ||
    right > reference.width + CONTENT_OVERHANG_PX ||
    bottom > reference.height + CONTENT_OVERHANG_PX
  ) {
    return null;
  }

  const sx = frame.width / reference.width;
  const sy = frame.height / reference.height;
  const x0 = Math.max(0, left * sx);
  const y0 = Math.max(0, top * sy);
  const x1 = Math.min(frame.width, right * sx);
  const y1 = Math.min(frame.height, bottom * sy);

  if (
    x0 <= FULL_FRAME_SLACK_PX &&
    y0 <= FULL_FRAME_SLACK_PX &&
    x1 >= frame.width - FULL_FRAME_SLACK_PX &&
    y1 >= frame.height - FULL_FRAME_SLACK_PX
  ) {
    return null;
  }

  // Inward to even pixels, in the frame's coded coordinates.
  const ax = ceilEven(frame.x + x0);
  const ay = ceilEven(frame.y + y0);
  const ar = Math.min(floorEven(frame.x + x1), floorEven(frame.x + frame.width));
  const ab = Math.min(floorEven(frame.y + y1), floorEven(frame.y + frame.height));
  const width = ar - ax;
  const height = ab - ay;
  const minWidth = Math.max(MIN_CONTENT_WIDTH_PX, frame.width * MIN_CONTENT_WIDTH_SHARE);
  const minHeight = Math.max(MIN_CONTENT_HEIGHT_PX, frame.height * MIN_CONTENT_HEIGHT_SHARE);
  if (width < minWidth || height < minHeight) return null;
  return { x: ax, y: ay, width, height };
}

function isWindowHandle(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * The layout to crop the capture of `capturedWindowHandle` with, after the call state `call`.
 *
 * Takes the call's layout when it is a tab reading of the captured window (or either handle is not
 * known — an older desktop that sent a layout without a handle, or an arm that named none), and
 * otherwise keeps `previous`: another window's layout, a PiP or tab-less reading, and a reading
 * whose layout failed its checks say nothing about the window being recorded.
 */
export function nextMeetWindowCropGeometry(
  previous: MeetWindowGeometry | null,
  call: Pick<MeetCallState, "via" | "windowHandle" | "windowGeometry"> | null | undefined,
  capturedWindowHandle: number | null | undefined,
): MeetWindowGeometry | null {
  if (!call || call.via !== "tab") return previous;
  const geometry = parseMeetWindowGeometry(call.windowGeometry);
  if (!geometry) return previous;
  if (isWindowHandle(capturedWindowHandle) && isWindowHandle(call.windowHandle) && call.windowHandle !== capturedWindowHandle) {
    return previous;
  }
  return geometry;
}

/** For a log line: the crop, or that there is none. */
export function describeMeetWindowCrop(rect: FrameRect | null, frame: FrameRect): string {
  if (!rect) return `uncropped ${frame.width}x${frame.height}`;
  return `${rect.width}x${rect.height}+${rect.x}+${rect.y} of ${frame.width}x${frame.height}`;
}
