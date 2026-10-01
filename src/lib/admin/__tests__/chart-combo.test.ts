// The combo chart's arithmetic: which series is a column or a line, which axis it is read against,
// and that each axis is scaled from its own series only (meetings 1-4 next to credits 0-9000).

import test from "node:test";
import assert from "node:assert/strict";

import {
  axisMax,
  comboDefaultColors,
  computeComboScales,
  gutterWidth,
  routeComboSeries,
  valueToY,
} from "../chart-combo.ts";

test("routing: first series is a left column, the rest right lines; explicit fields win", () => {
  assert.deepEqual(routeComboSeries([{}, {}, {}]), [
    { kind: "bar", axis: "left" },
    { kind: "line", axis: "right" },
    { kind: "line", axis: "right" },
  ]);
  assert.deepEqual(routeComboSeries([{ kind: "line" }, { kind: "bar", axis: "left" }, { axis: "left" }]), [
    { kind: "line", axis: "left" },
    { kind: "bar", axis: "left" },
    { kind: "line", axis: "left" },
  ]);
  assert.deepEqual(routeComboSeries([]), []);
});

test("default colours: column slot 1, line slot 2; a stack pushes the line past its parts", () => {
  assert.deepEqual(comboDefaultColors(routeComboSeries([{}, {}])), ["var(--viz-1)", "var(--viz-2)"]);
  const stack = routeComboSeries([{ kind: "bar" }, { kind: "bar" }, { kind: "bar" }, { kind: "line" }]);
  assert.deepEqual(comboDefaultColors(stack), ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"]);
});

test("each axis gets nice ticks from its own series: 1-4 meetings vs 0-9000 credits", () => {
  const series = [{ values: [0, 4200, 9000, null, 350] }, { values: [1, 2, 4, null, 3] }];
  const scales = computeComboScales(series, routeComboSeries(series), { integerRight: true });
  assert.equal(scales.left.max, 10000);
  assert.deepEqual(scales.left.ticks, [0, 2500, 5000, 7500, 10000]);
  assert.ok(scales.right);
  assert.deepEqual(scales.right.ticks, [0, 1, 2, 3, 4]);
});

test("integerRight never yields a fractional tick, even for a count of 1", () => {
  const series = [{ values: [10, 20] }, { values: [1, 1] }];
  const scales = computeComboScales(series, routeComboSeries(series), { integerRight: true });
  assert.ok(scales.right?.ticks.every(Number.isInteger));
  assert.ok((scales.right?.max ?? 0) >= 1);
});

test("no series on the right axis: no right scale", () => {
  const series = [{ values: [1, 2] }, { values: [3, 4] }];
  const scales = computeComboScales(series, [{ kind: "bar", axis: "left" }, { kind: "line", axis: "left" }]);
  assert.equal(scales.right, null);
  assert.equal(scales.left.max >= 4, true);
});

test("all-null series: an axis of 0 to a step, never NaN", () => {
  const series = [{ values: [null, null] }, { values: [null, null] }];
  const scales = computeComboScales(series, routeComboSeries(series), { integerRight: true });
  for (const scale of [scales.left, scales.right!]) {
    assert.ok(scale.max > 0);
    assert.ok(scale.ticks.every(Number.isFinite));
  }
  assert.equal(axisMax(series, routeComboSeries(series), "left", false), 0);
});

test("single-point series sets its axis top", () => {
  const series = [{ values: [null, 7, null] }, { values: [null, null, 3] }];
  const routes = routeComboSeries(series);
  assert.equal(axisMax(series, routes, "left", false), 7);
  assert.equal(axisMax(series, routes, "right", false), 3);
});

test("zero-range series (all zeros) still draws a usable axis", () => {
  const series = [{ values: [0, 0, 0] }, { values: [0, 0, 0] }];
  const scales = computeComboScales(series, routeComboSeries(series));
  assert.ok(scales.left.max > 0 && scales.right!.max > 0);
  assert.equal(valueToY(0, scales.left.max, 10, 100), 110);
});

test("stacked columns add up per index; lines on the same axis count on their own", () => {
  const series = [{ values: [5, 1] }, { values: [4, 1] }, { values: [50, 60] }];
  const routes = routeComboSeries([{ kind: "bar" }, { kind: "bar", axis: "left" }, { kind: "line", axis: "left" }]);
  assert.equal(axisMax(series, routes, "left", true), 60);
  assert.equal(axisMax(series.slice(0, 2), routes.slice(0, 2), "left", true), 9);
  assert.equal(axisMax(series.slice(0, 2), routes.slice(0, 2), "left", false), 5);
});

test("negatives and non-finite values never raise a scale", () => {
  const series = [{ values: [-5, Number.NaN, 3] }, { values: [Number.POSITIVE_INFINITY, -1, 2] }];
  const routes = routeComboSeries(series);
  assert.equal(axisMax(series, routes, "left", false), 3);
  assert.equal(axisMax(series, routes, "right", false), 2);
});

test("valueToY: 0 at the baseline, max at the top; gutters grow with the label", () => {
  assert.equal(valueToY(0, 4, 10, 100), 110);
  assert.equal(valueToY(4, 4, 10, 100), 10);
  assert.equal(valueToY(2, 4, 10, 100), 60);
  assert.ok(gutterWidth(["0", "10,000"], "right") > gutterWidth(["0", "4"], "right"));
  assert.equal(gutterWidth([], "left"), Math.ceil(12) + 12);
});
