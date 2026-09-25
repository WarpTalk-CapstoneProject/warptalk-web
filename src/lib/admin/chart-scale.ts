/**
 * The arithmetic behind the admin charts (`components/admin/charts`), kept out of React so it can
 * be tested under plain `node --test`.
 *
 * WHY THIS EXISTS
 *   The Insights charts drew their y-axis at 0, max/2 and max — so a month peaking at 1.96M read
 *   "0 · 980k · 2M", and a count peaking at 7 read "0 · 3.5 · 7". Ticks are for reading values off
 *   the grid, and only round numbers can be read. `niceScale` picks them.
 *
 *   The daily line was a polyline, which draws every day-to-day change as a spike. A monotone cubic
 *   (Fritsch–Carlson) smooths it without ever overshooting a data point — a Catmull-Rom curve would
 *   dip a quiet day between two busy ones below zero, inventing negative revenue.
 *
 * NULL IS NOT ZERO
 *   A null value is a day still to come, or one the server could not price. It is never drawn as 0:
 *   `valueRuns` breaks the line at it, and a bar is simply not drawn. That rule predates this file
 *   and every chart here keeps it.
 */

export interface NiceScale {
  /** The top of the axis: the first tick at or above the largest value. */
  max: number;
  /** From 0 to `max`, evenly spaced, every one a round number. */
  ticks: number[];
}

/**
 * 1, 2, 2.5 or 5 times a power of ten — the steps a person can count in. Of those near the rough
 * step, the one whose top wastes the least of the plot wins, with a small pull towards the target
 * number of intervals: 48.9M gets 0…50M in 10M steps, not 0…60M in 20M steps.
 */
function niceStep(top: number, targetTicks: number, integer: boolean): number {
  if (!Number.isFinite(top) || top <= 0) return 1;
  const exponent = Math.floor(Math.log10(top / targetTicks));
  let best: { step: number; score: number } | null = null;
  for (let e = exponent - 1; e <= exponent + 1; e++) {
    for (const multiple of [1, 2, 2.5, 5]) {
      const step = multiple * 10 ** e;
      if (integer && (step < 1 || !Number.isInteger(step))) continue;
      const intervals = Math.ceil(top / step - 1e-9);
      if (intervals < 2 || intervals > targetTicks + 2) continue;
      const waste = (intervals * step - top) / (intervals * step);
      const score = waste + 0.05 * Math.abs(intervals - targetTicks);
      if (!best || score < best.score) best = { step, score };
    }
  }
  if (best) return best.step;
  // A tiny integer range (a count of 1): one step of 1.
  return integer ? 1 : 10 ** Math.ceil(Math.log10(top));
}

/**
 * A zero-based axis over `[0, maxValue]` with about `targetTicks` intervals.
 *
 * `integer` is for counts: no tick may be fractional, because "3.5 meetings" is not a thing that
 * happened. An empty or all-zero series still gets an axis (0 … 1 step), so a chart with nothing to
 * show draws a flat baseline rather than dividing by zero.
 */
export function niceScale(maxValue: number, options: { targetTicks?: number; integer?: boolean } = {}): NiceScale {
  const targetTicks = Math.max(1, options.targetTicks ?? 4);
  const integer = options.integer ?? false;
  const top = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
  const step = niceStep(top, targetTicks, integer);
  const intervals = Math.max(1, Math.ceil(top / step - 1e-9));
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => roundTo(index * step, step));
  return { max: ticks[ticks.length - 1], ticks };
}

/** Undo float drift (0.1 + 0.2) to the precision of the step. */
function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return Number(value.toFixed(Math.min(10, decimals)));
}

/**
 * Which x positions get a label. Labels need about `minGap` pixels each; past that they are thinned
 * to every n-th, always keeping the first. The last one always shows, taking the place of the
 * label before it when the two would sit closer than one step — so a month reads "Sep 1 … Sep 30",
 * never "Sep 1 … Sep 29" and never "Sep 28 Sep 30" printed on top of each other.
 */
export function xLabelIndexes(count: number, plotWidth: number, minGap = 64): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const fit = Math.max(2, Math.floor(plotWidth / minGap));
  const every = Math.max(1, Math.ceil(count / fit));
  const indexes: number[] = [];
  for (let index = 0; index < count; index += every) indexes.push(index);
  const last = count - 1;
  const previous = indexes[indexes.length - 1];
  if (previous !== last) {
    // A last label closer than one step would collide with the one before it: take its place.
    if (last - previous >= every) indexes.push(last);
    else if (indexes.length > 1) indexes[indexes.length - 1] = last;
    else indexes.push(last);
  }
  return indexes;
}

export interface RunPoint {
  index: number;
  value: number;
}

/** Contiguous stretches of known values. A null ends a stretch; it never becomes a 0. */
export function valueRuns(values: readonly (number | null | undefined)[]): RunPoint[][] {
  const runs: RunPoint[][] = [];
  let current: RunPoint[] = [];
  values.forEach((value, index) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ index, value });
    }
  });
  if (current.length) runs.push(current);
  return runs;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * An SVG path through `points` as a monotone cubic (Fritsch–Carlson). Between two points the curve
 * never leaves the band their values span, so a smooth line never shows a value that is not there.
 * One point is a zero-length move (the caller draws a dot); two are a straight segment.
 */
export function monotonePath(points: readonly Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const fmt = (value: number) => Number(value.toFixed(2));
  if (n === 1) return `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  if (n === 2) return `M${fmt(points[0].x)},${fmt(points[0].y)}L${fmt(points[1].x)},${fmt(points[1].y)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i];
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  tangent[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }

  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    d += `C${fmt(points[i].x + third)},${fmt(points[i].y + tangent[i] * third)} ${fmt(points[i + 1].x - third)},${fmt(points[i + 1].y - tangent[i + 1] * third)} ${fmt(points[i + 1].x)},${fmt(points[i + 1].y)}`;
  }
  return d;
}

/**
 * A column with a 4px rounded data end and a square foot on the baseline. `r` shrinks for a column
 * shorter or narrower than two radii, so a tiny value is still a column and not a pill.
 */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (width <= 0 || height <= 0) return "";
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const fmt = (value: number) => Number(value.toFixed(2));
  const bottom = y + height;
  return [
    `M${fmt(x)},${fmt(bottom)}`,
    `L${fmt(x)},${fmt(y + r)}`,
    `Q${fmt(x)},${fmt(y)} ${fmt(x + r)},${fmt(y)}`,
    `L${fmt(x + width - r)},${fmt(y)}`,
    `Q${fmt(x + width)},${fmt(y)} ${fmt(x + width)},${fmt(y + r)}`,
    `L${fmt(x + width)},${fmt(bottom)}`,
    "Z",
  ].join("");
}

/**
 * The data index under a pointer. `point` layouts put index i ON a gridline (lines, areas); `band`
 * layouts give each index a slot of equal width (columns). Either way the answer is clamped, so a
 * pointer in the padding still snaps to the nearest end.
 */
export function indexAtX(x: number, count: number, plotLeft: number, plotWidth: number, layout: "point" | "band"): number {
  if (count <= 1) return 0;
  const offset = x - plotLeft;
  const raw = layout === "band"
    ? Math.floor((offset / plotWidth) * count)
    : Math.round((offset / plotWidth) * (count - 1));
  return Math.min(count - 1, Math.max(0, raw));
}

/** The sum of the known values, or null when there is none — an empty period is not a 0. */
export function sumKnown(values: readonly (number | null | undefined)[]): number | null {
  let total: number | null = null;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Axis and label numbers: 0, 950, 1.5K, 20M, 1.2B. */
export function compactAxisNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return compactFormatter.format(value);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Axis money: "₫20M", "$1.5K". The full amount belongs in the tooltip and the headline figure; an
 * axis only has to say which order of magnitude a gridline is. An unknown currency code falls back
 * to "20M XYZ" rather than throwing.
 */
export function compactMoney(value: number, currency = "VND"): string {
  if (!Number.isFinite(value)) return "—";
  const code = currency.toUpperCase();
  let formatter = moneyFormatters.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        notation: "compact",
        maximumFractionDigits: 1,
      });
    } catch {
      return `${compactAxisNumber(value)} ${code}`;
    }
    moneyFormatters.set(code, formatter);
  }
  return formatter.format(value);
}

/** Gap between a tooltip and its anchor, and the margin it keeps from every viewport edge. */
const TOOLTIP_OFFSET = 12;
const TOOLTIP_EDGE = 8;

/**
 * Where a `position: fixed` tooltip goes: right of and above its anchor by preference, flipped to
 * the other side where that would leave the viewport, then clamped inside it. Never off-screen,
 * whatever the chart's container does — that is the half of the clipping bug a portal cannot fix.
 */
export function placeTooltip(
  anchor: Point,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = anchor.x + TOOLTIP_OFFSET;
  if (left + size.width > viewport.width - TOOLTIP_EDGE) left = anchor.x - TOOLTIP_OFFSET - size.width;
  let top = anchor.y - TOOLTIP_OFFSET - size.height;
  if (top < TOOLTIP_EDGE) top = anchor.y + TOOLTIP_OFFSET;
  left = Math.min(Math.max(TOOLTIP_EDGE, left), Math.max(TOOLTIP_EDGE, viewport.width - TOOLTIP_EDGE - size.width));
  top = Math.min(Math.max(TOOLTIP_EDGE, top), Math.max(TOOLTIP_EDGE, viewport.height - TOOLTIP_EDGE - size.height));
  return { left, top };
}
