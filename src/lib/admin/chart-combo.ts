/**
 * The arithmetic behind `TimeSeriesChart`'s `variant="combo"`: columns and lines in one chart with
 * two value axes. Kept out of React (and free of `@/` imports) so it runs under plain `node --test`.
 *
 * WHY THIS EXISTS
 *   The workspace "Daily Burn & Meeting Activity" chart plotted credits (hundreds or thousands a
 *   day) and meetings (1 to 4 a day) on ONE axis, so the meetings line sat flat on the baseline.
 *   Two units need two axes: credits as columns on the left, meetings as a line on the right, each
 *   axis scaled to its own series only.
 *
 * NULL IS NOT ZERO
 *   Same rule as the rest of the charts: a null never contributes to a scale and never reads as 0.
 *   A series with no known value at all simply has no height, and an axis with nothing to show
 *   still gets a usable 0 … 1 scale (`niceScale`), so nothing divides by zero.
 */

import { niceScale, type NiceScale } from "./chart-scale.ts";

export type ComboKind = "bar" | "line";
export type ComboAxis = "left" | "right";

/** What a caller may say about a series. Only read when the chart is a combo. */
export interface ComboSeriesHint {
  kind?: ComboKind;
  axis?: ComboAxis;
  /** Ignored here; lets a chart's own series objects be passed as they are. */
  values?: readonly unknown[];
}

export interface ComboRoute {
  kind: ComboKind;
  axis: ComboAxis;
}

/**
 * Where each series goes. Unspecified: the first series is a column on the left axis and every
 * other one a line on the right — the shape of "one volume, one rate". Each field defaults on its
 * own, so `{ kind: "line" }` on the first series is a line on the LEFT axis.
 */
export function routeComboSeries(series: readonly ComboSeriesHint[]): ComboRoute[] {
  return series.map((s, index) => ({
    kind: s.kind ?? (index === 0 ? "bar" : "line"),
    axis: s.axis ?? (index === 0 ? "left" : "right"),
  }));
}

/**
 * Colours as CSS variables, following the single-series rules of the other variants: the first
 * column is slot 1 and the first line slot 2. When several columns are stacked the line steps past
 * them, so a three-part stack and its rate line never share a colour.
 */
export function comboDefaultColors(routes: readonly ComboRoute[]): string[] {
  const slot = (n: number) => `var(--viz-${Math.min(5, n + 1)})`;
  const bars = routes.filter((r) => r.kind === "bar").length;
  let barSeen = 0;
  let lineSeen = 0;
  return routes.map((route) => {
    if (route.kind === "bar") return slot(barSeen++);
    const n = (bars > 1 ? bars : 1) + lineSeen;
    lineSeen += 1;
    return slot(n);
  });
}

const known = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const positive = (v: number | null | undefined): number => (known(v) && v > 0 ? v : 0);

/**
 * The largest value one axis must reach: the tallest column (or, stacked, the tallest STACK of the
 * columns on that axis) and the highest point of any line on it. Gaps and negatives add nothing.
 */
export function axisMax(
  series: readonly { values: readonly (number | null | undefined)[] }[],
  routes: readonly ComboRoute[],
  axis: ComboAxis,
  stacked: boolean,
): number {
  const onAxis = series.map((s, index) => ({ s, route: routes[index] })).filter((entry) => entry.route?.axis === axis);
  const bars = onAxis.filter((entry) => entry.route.kind === "bar");
  const lines = onAxis.filter((entry) => entry.route.kind === "line");
  let max = 0;
  if (stacked) {
    const length = Math.max(0, ...bars.map((entry) => entry.s.values.length));
    for (let index = 0; index < length; index++) {
      max = Math.max(max, bars.reduce((sum, entry) => sum + positive(entry.s.values[index]), 0));
    }
  } else {
    for (const entry of bars) for (const v of entry.s.values) max = Math.max(max, positive(v));
  }
  for (const entry of lines) for (const v of entry.s.values) max = Math.max(max, positive(v));
  return max;
}

export interface ComboScales {
  left: NiceScale;
  /** Null when no series sits on the right axis: the chart then draws no right gutter. */
  right: NiceScale | null;
}

/**
 * Nice ticks per axis, each from ITS OWN series only. The right axis takes the same target number
 * of intervals as the left, so its ticks usually land on the left gridlines and the eye can cross
 * between them.
 */
export function computeComboScales(
  series: readonly { values: readonly (number | null | undefined)[] }[],
  routes: readonly ComboRoute[],
  options: { stacked?: boolean; integerLeft?: boolean; integerRight?: boolean; targetTicks?: number } = {},
): ComboScales {
  const stacked = options.stacked ?? false;
  const targetTicks = options.targetTicks ?? 4;
  const hasRight = routes.some((route) => route.axis === "right");
  return {
    left: niceScale(axisMax(series, routes, "left", stacked), { integer: options.integerLeft ?? false, targetTicks }),
    right: hasRight
      ? niceScale(axisMax(series, routes, "right", stacked), { integer: options.integerRight ?? false, targetTicks })
      : null,
  };
}

/** Value to pixel y for an axis `[0, max]` drawn in `[top, top + plotHeight]`, 0 at the bottom. */
export function valueToY(value: number, max: number, top: number, plotHeight: number): number {
  return top + plotHeight - (max > 0 ? (value / max) * plotHeight : 0);
}

/** Rough label width at 11px: enough to size a gutter, not to typeset. Generous on purpose. */
export function estimateTextWidth(text: string): number {
  return text.length * 7.2;
}

/**
 * Width of an axis gutter: the widest tick label plus breathing room against the plot and the edge.
 * The left gutter keeps the 12px the other variants use; the right one 10px (labels hang outward).
 */
export function gutterWidth(tickLabels: readonly string[], side: ComboAxis): number {
  const widest = Math.ceil(Math.max(12, ...tickLabels.map(estimateTextWidth)));
  return widest + (side === "left" ? 12 : 10);
}
