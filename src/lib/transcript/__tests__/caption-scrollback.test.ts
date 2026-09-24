/**
 * The caption lane's follow/browse state. See caption-scrollback.ts.
 *
 * What these pin is the pair of failures the lane must never show: yanking a reader back to the
 * newest line while they are reading an older one, and sitting expanded and frozen after the
 * reader has come back down.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAPTION_BROWSING_HARD_CAP,
  CAPTION_FOLLOW_THRESHOLD_PX,
  CAPTION_HISTORY_LIMIT,
  LIVE_CAPTION_SCROLLBACK,
  captionKeyAction,
  countLinesAfter,
  expandedCaptionPanelHeight,
  isAtLatest,
  newLinesLabel,
  reduceCaptionScrollback,
  windowCaptionLines,
} from "../caption-scrollback.ts";

const scrolled = (distanceFromBottom: number, newestId: string | null = "s9", firstId = "s0") =>
  ({ type: "scrolled", distanceFromBottom, newestId, firstId }) as const;

const ids = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => `s${from + index}`);
const self = (id: string) => id;

test("the lane starts live: following, collapsed, nothing anchored", () => {
  assert.deepEqual(LIVE_CAPTION_SCROLLBACK, { browsing: false, anchorId: null, windowStartId: null });
});

test("scrolling up past the threshold starts browsing and anchors where the reader left", () => {
  const next = reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(80, "s42", "s3"));
  assert.deepEqual(next, { browsing: true, anchorId: "s42", windowStartId: "s3" });
});

test("a scroll that stays at the newest line is not browsing", () => {
  for (const distance of [0, CAPTION_FOLLOW_THRESHOLD_PX, -6]) {
    assert.equal(reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(distance)), LIVE_CAPTION_SCROLLBACK);
  }
});

test("an empty lane cannot be browsed — there is no line to count new ones from", () => {
  assert.equal(reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(200, null)), LIVE_CAPTION_SCROLLBACK);
});

test("moving around inside the history keeps the ORIGINAL anchor and window", () => {
  // The bug this guards: re-anchoring on every scroll would reset the "new lines" count to zero
  // the moment the reader nudged the wheel, and unpin the window so lines vanish above them.
  const browsing = reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(80, "s42", "s3"));
  const moved = reduceCaptionScrollback(browsing, scrolled(900, "s50", "s4"));
  assert.equal(moved, browsing);
});

test("scrolling back down to the newest line resumes follow and collapses", () => {
  const browsing = reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(300));
  assert.equal(reduceCaptionScrollback(browsing, scrolled(4)), LIVE_CAPTION_SCROLLBACK);
});

test("Jump to latest resumes follow from anywhere, and is a no-op when already live", () => {
  const browsing = reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, scrolled(300));
  assert.equal(reduceCaptionScrollback(browsing, { type: "jumpToLatest" }), LIVE_CAPTION_SCROLLBACK);
  assert.equal(
    reduceCaptionScrollback(LIVE_CAPTION_SCROLLBACK, { type: "jumpToLatest" }),
    LIVE_CAPTION_SCROLLBACK,
  );
});

test("isAtLatest treats a rubber-band overshoot as the bottom", () => {
  assert.equal(isAtLatest(-20), true);
  assert.equal(isAtLatest(CAPTION_FOLLOW_THRESHOLD_PX + 1), false);
});

test("following renders only the last CAPTION_HISTORY_LIMIT lines", () => {
  const lines = ids(CAPTION_HISTORY_LIMIT + 120);
  const window = windowCaptionLines(lines, self, null);
  assert.equal(window.length, CAPTION_HISTORY_LIMIT);
  assert.equal(window.at(-1), lines.at(-1));
  assert.equal(window[0], `s120`);
});

test("browsing pins the window start, so new lines never remove a line above the reader", () => {
  const before = ids(CAPTION_HISTORY_LIMIT);
  const pinned = windowCaptionLines(before, self, null)[0];
  // Thirty more lines arrive while the reader is scrolled up.
  const after = ids(CAPTION_HISTORY_LIMIT + 30);
  const window = windowCaptionLines(after, self, pinned);
  assert.equal(window[0], pinned, "the first rendered line must not change while browsing");
  assert.equal(window.length, CAPTION_HISTORY_LIMIT + 30);
  assert.equal(window.at(-1), after.at(-1));
});

test("a pinned window is still bounded, for a reader parked in the history for hours", () => {
  const lines = ids(CAPTION_BROWSING_HARD_CAP + 400);
  const window = windowCaptionLines(lines, self, "s0");
  assert.equal(window.length, CAPTION_BROWSING_HARD_CAP);
});

test("an unknown pinned start falls back to the normal window instead of rendering nothing", () => {
  assert.deepEqual(windowCaptionLines(ids(5), self, "gone"), ids(5));
});

test("countLinesAfter counts what arrived since the anchor", () => {
  const lines = ids(10);
  assert.equal(countLinesAfter(lines, self, "s9"), 0);
  assert.equal(countLinesAfter(lines, self, "s6"), 3);
  assert.equal(countLinesAfter(lines, self, null), 0);
  // A missing anchor is not "everything is new".
  assert.equal(countLinesAfter(lines, self, "gone"), 0);
});

test("the pill says how many lines are waiting, and falls back to a plain label", () => {
  assert.equal(newLinesLabel(0), "Jump to latest");
  assert.equal(newLinesLabel(1), "1 new line");
  assert.equal(newLinesLabel(7), "7 new lines");
  assert.equal(newLinesLabel(250), "99+ new lines");
});

test("the expanded panel covers a bounded share of the stage on top of the lane", () => {
  assert.equal(expandedCaptionPanelHeight({ laneHeight: 120, stageHeight: 600, viewportHeight: 900 }), 360);
  // No stage to measure (dev preview): falls back to a share of the viewport, never to 0 or NaN.
  const fallback = expandedCaptionPanelHeight({ laneHeight: 120, stageHeight: null, viewportHeight: 1000 });
  assert.equal(fallback, 120 + 240);
  // Never smaller than the lane itself.
  assert.ok(expandedCaptionPanelHeight({ laneHeight: 120, stageHeight: 0, viewportHeight: 0 }) >= 120);
});

test("keyboard: arrows and paging scroll within bounds, End returns to live", () => {
  const metrics = { scrollTop: 400, scrollHeight: 2000, clientHeight: 200 };
  assert.deepEqual(captionKeyAction("ArrowUp", metrics, false), { type: "scrollTo", top: 360 });
  assert.deepEqual(captionKeyAction("ArrowDown", metrics, true), { type: "scrollTo", top: 440 });
  assert.deepEqual(captionKeyAction("PageUp", metrics, true), { type: "scrollTo", top: 230 });
  assert.deepEqual(captionKeyAction("Home", metrics, true), { type: "scrollTo", top: 0 });
  assert.deepEqual(captionKeyAction("End", metrics, true), { type: "jumpToLatest" });
  assert.deepEqual(
    captionKeyAction("PageDown", { ...metrics, scrollTop: 1750 }, true),
    { type: "scrollTo", top: 1800 },
    "paging down must stop at the bottom, not past it",
  );
  assert.deepEqual(captionKeyAction("ArrowUp", { ...metrics, scrollTop: 10 }, true), { type: "scrollTo", top: 0 });
});

test("keyboard: Escape closes the history, and is left alone when there is none open", () => {
  const metrics = { scrollTop: 0, scrollHeight: 100, clientHeight: 100 };
  assert.deepEqual(captionKeyAction("Escape", metrics, true), { type: "jumpToLatest" });
  assert.equal(captionKeyAction("Escape", metrics, false), null);
  assert.equal(captionKeyAction("a", metrics, true), null);
});
