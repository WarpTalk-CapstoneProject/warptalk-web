/**
 * The arithmetic behind "Jump to latest". WT-574.
 *
 * The visible failure is a two-to-three second flight through an hour of transcript. The
 * failure this pins is quieter and worse: landing NEAR the bottom instead of at it, which
 * looks exactly like the panel having stopped following.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LONG_SCROLL_THRESHOLD_PX,
  SMOOTH_TAIL_PX,
  planScrollToLatest,
} from "../scroll-plan.ts";

/** An hour of meeting, read from somewhere near the top. */
const LONG = { scrollHeight: 40_000, scrollTop: 0, clientHeight: 800 };

test("a long journey is jumped, and only its tail is animated", () => {
  const plan = planScrollToLatest(LONG);
  const bottom = LONG.scrollHeight - LONG.clientHeight;

  assert.equal(plan.jumpTo, bottom - SMOOTH_TAIL_PX);
  assert.equal(plan.smoothTo, bottom);
});

test("the smooth target is always the bottom, never the tail", () => {
  // The bug this exists for: animating to `bottom - 300` leaves the newest line off-screen and
  // the chip reappears immediately, which reads as the button not working.
  for (const scrollTop of [0, 5_000, 20_000, 39_000]) {
    const plan = planScrollToLatest({ ...LONG, scrollTop });
    assert.equal(plan.smoothTo, LONG.scrollHeight - LONG.clientHeight);
  }
});

test("a short journey keeps its whole animation — that movement IS the feedback", () => {
  const bottom = LONG.scrollHeight - LONG.clientHeight;
  const plan = planScrollToLatest({ ...LONG, scrollTop: bottom - 500 });
  assert.equal(plan.jumpTo, null);
});

test("the threshold itself does not jump; one pixel past it does", () => {
  const bottom = LONG.scrollHeight - LONG.clientHeight;
  assert.equal(
    planScrollToLatest({ ...LONG, scrollTop: bottom - LONG_SCROLL_THRESHOLD_PX }).jumpTo,
    null,
  );
  assert.notEqual(
    planScrollToLatest({ ...LONG, scrollTop: bottom - LONG_SCROLL_THRESHOLD_PX - 1 }).jumpTo,
    null,
  );
});

test("already at the bottom asks for nothing surprising", () => {
  const bottom = LONG.scrollHeight - LONG.clientHeight;
  const plan = planScrollToLatest({ ...LONG, scrollTop: bottom });
  assert.equal(plan.jumpTo, null);
  assert.equal(plan.smoothTo, bottom);
});

test("a rubber-banding browser reporting past the bottom is not treated as a long journey", () => {
  // Safari reports scrollTop beyond the maximum during an overscroll. A negative distance must
  // not wrap into "further than 2000px".
  const bottom = LONG.scrollHeight - LONG.clientHeight;
  assert.equal(planScrollToLatest({ ...LONG, scrollTop: bottom + 120 }).jumpTo, null);
});

test("a container shorter than the tail never asks to scroll to a negative offset", () => {
  // Degenerate, but a negative target is silently ignored by the browser — the reader would stay
  // where they were and the button would look dead.
  const plan = planScrollToLatest({ scrollHeight: 50_000, scrollTop: 0, clientHeight: 49_900 });
  assert.ok(plan.jumpTo === null || plan.jumpTo >= 0);
});
