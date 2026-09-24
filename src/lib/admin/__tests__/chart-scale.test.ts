// The admin charts' arithmetic: round ticks, thinned labels, gaps that stay gaps, and a smooth line
// that never shows a value the data does not have.

import test from "node:test";
import assert from "node:assert/strict";

import {
  columnPath,
  compactAxisNumber,
  compactMoney,
  indexAtX,
  monotonePath,
  niceScale,
  placeTooltip,
  sumKnown,
  valueRuns,
  xLabelIndexes,
} from "../chart-scale.ts";

test("ticks are round numbers, not max/2", () => {
  // The old axis read 0 · 980k · 2M for a 1.96M peak.
  assert.deepEqual(niceScale(1_960_000).ticks, [0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
  assert.deepEqual(niceScale(48_900_000).ticks, [0, 10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000]);
  assert.equal(niceScale(100).max, 100, "a value that is already round is the top");
  assert.ok(niceScale(101).max > 101, "the top clears the largest value");
});

test("a count axis never has a fractional tick", () => {
  const { ticks } = niceScale(7, { integer: true });
  assert.ok(ticks.every((tick) => Number.isInteger(tick)), ticks.join(","));
  assert.ok(ticks[ticks.length - 1] >= 7);
  assert.deepEqual(niceScale(3, { integer: true }).ticks, [0, 1, 2, 3]);
});

test("an empty or all-zero series still gets a baseline and one step", () => {
  assert.deepEqual(niceScale(0).ticks, [0, 1]);
  assert.deepEqual(niceScale(Number.NaN, { integer: true }).ticks, [0, 1]);
});

test("no float drift in tick values", () => {
  for (const tick of niceScale(0.7).ticks) {
    assert.equal(tick, Number(tick.toFixed(4)), String(tick));
  }
});

test("labels thin out on a narrow axis and keep both ends", () => {
  const month = xLabelIndexes(30, 600);
  assert.equal(month[0], 0);
  assert.equal(month[month.length - 1], 29, "Sep 30 is labelled, not Sep 29");
  assert.ok(month.length <= 10, `at most one label per 64px, got ${month.length}`);
  const gaps = month.slice(1).map((index, i) => index - month[i]);
  const step = gaps[0];
  assert.ok(gaps.every((gap) => gap >= step), `the last label never crowds the one before it: ${month.join(",")}`);
  assert.deepEqual(xLabelIndexes(6, 600), [0, 1, 2, 3, 4, 5], "six months all fit");
  assert.deepEqual(xLabelIndexes(1, 600), [0]);
  assert.deepEqual(xLabelIndexes(0, 600), []);
});

test("a null breaks the line; it is never a zero", () => {
  const runs = valueRuns([1, 2, null, 4, undefined, null, 7]);
  assert.deepEqual(runs, [
    [{ index: 0, value: 1 }, { index: 1, value: 2 }],
    [{ index: 3, value: 4 }],
    [{ index: 6, value: 7 }],
  ]);
  // Future days of the month: the run stops at today.
  assert.deepEqual(valueRuns([5, 0, 3, null, null]).flat().map((p) => p.index), [0, 1, 2]);
});

test("the monotone curve never overshoots its neighbours", () => {
  // A spike between two flat days: Catmull-Rom would dip below the baseline (y = 100 here).
  const points = [
    { x: 0, y: 100 },
    { x: 10, y: 100 },
    { x: 20, y: 0 },
    { x: 30, y: 100 },
    { x: 40, y: 100 },
  ];
  const d = monotonePath(points);
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const ys = numbers.filter((_, index) => index % 2 === 1);
  assert.ok(Math.max(...ys) <= 100 + 1e-9, `no control point below the baseline: ${d}`);
  assert.ok(Math.min(...ys) >= 0 - 1e-9, `no control point above the peak: ${d}`);
  assert.equal(monotonePath([]), "");
  assert.equal(monotonePath([{ x: 1, y: 2 }]), "M1,2");
  assert.equal(monotonePath([{ x: 0, y: 0 }, { x: 5, y: 5 }]), "M0,0L5,5");
});

test("a column is rounded at its end and square on the baseline", () => {
  const d = columnPath(10, 20, 20, 50);
  assert.ok(d.startsWith("M10,70"), "starts at the bottom-left corner, on the baseline");
  assert.ok(d.includes("Q10,20 14,20"), "4px rounded top-left");
  assert.equal(columnPath(0, 0, 10, 0), "", "a zero-height column is not drawn");
  assert.ok(columnPath(0, 99, 20, 1).includes("Q0,99 1,99"), "the radius shrinks for a 1px column");
});

test("the pointer snaps to the nearest index, clamped to the ends", () => {
  assert.equal(indexAtX(0, 30, 40, 580, "point"), 0);
  assert.equal(indexAtX(40 + 580, 30, 40, 580, "point"), 29);
  assert.equal(indexAtX(40 + 290, 31, 40, 580, "point"), 15);
  assert.equal(indexAtX(9999, 6, 0, 600, "band"), 5);
  assert.equal(indexAtX(99, 6, 0, 600, "band"), 0);
  assert.equal(indexAtX(100, 6, 0, 600, "band"), 1);
  assert.equal(indexAtX(123, 1, 0, 600, "point"), 0);
});

test("a period with no known value sums to null, not 0", () => {
  assert.equal(sumKnown([null, undefined]), null);
  assert.equal(sumKnown([]), null);
  assert.equal(sumKnown([0, null]), 0);
  assert.equal(sumKnown([1, 2, null, 3]), 6);
});

test("axis numbers are compact, money carries its currency", () => {
  assert.equal(compactAxisNumber(0), "0");
  assert.equal(compactAxisNumber(1_500), "1.5K");
  assert.equal(compactAxisNumber(20_000_000), "20M");
  assert.equal(compactMoney(20_000_000, "VND"), "₫20M");
  assert.equal(compactMoney(1_500, "usd"), "$1.5K");
  assert.equal(compactMoney(1_000, "NOT-A-CODE"), "1K NOT-A-CODE");
});

test("a tooltip flips at the viewport edges and never leaves the screen", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 80 };
  assert.deepEqual(placeTooltip({ x: 100, y: 300 }, size, viewport), { left: 112, top: 208 }, "right of and above");
  assert.equal(placeTooltip({ x: 950, y: 300 }, size, viewport).left, 738, "flips left at the right edge");
  assert.equal(placeTooltip({ x: 100, y: 20 }, size, viewport).top, 32, "flips below at the top edge");
  const cornered = placeTooltip({ x: 995, y: 795 }, size, viewport);
  assert.ok(cornered.left >= 8 && cornered.left + size.width <= 992, "clamped horizontally");
  assert.ok(cornered.top >= 8 && cornered.top + size.height <= 792, "clamped vertically");
  const huge = placeTooltip({ x: 10, y: 10 }, { width: 2000, height: 2000 }, viewport);
  assert.deepEqual(huge, { left: 8, top: 8 }, "larger than the screen: pinned to the top-left margin");
});
