"use client";

/**
 * The one chart primitive of the admin dashboards: values over an ordered axis (days, months),
 * drawn as a soft area, a thin line, or columns.
 *
 * THE LOOK (Linear / Resend "Metrics")
 *   One 2px line on a monotone curve, a gradient wash under it that fades to nothing at the
 *   baseline, solid hairline gridlines at round ticks, and no chart furniture beyond that. The
 *   figure the chart is about sits above it as a headline number (`ChartFigure`), not inside it.
 *
 * THE RULES IT KEEPS
 *   - A null is a gap, never a 0: a day still to come is left blank (the line stops at today; no
 *     column is drawn). Callers pass the whole period so the blank is visible as blank.
 *   - Every colour is a CSS variable, so light and dark are the same markup.
 *   - Hover (and keyboard: focus, then ←/→) moves a crosshair that snaps to the nearest index and
 *     lists every series there in a portalled `ChartTooltip` — the pointer never has to land on a
 *     2px line. Columns get the same readout for their slot.
 *   - A screen reader gets the numbers as a table.
 */

import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { ChartTooltip, type TooltipAnchor, type TooltipRow } from "@/components/admin/charts/chart-tooltip";
import {
  columnPath,
  compactAxisNumber,
  indexAtX,
  monotonePath,
  niceScale,
  valueRuns,
  xLabelIndexes,
} from "@/lib/admin/chart-scale";
import { cn } from "@/lib/utils";

export const CHART_COLORS = {
  /** Slot 1: every single-series chart. */
  primary: "var(--viz-1)",
  /** Slot 2: the second series of a pair. Validated against slot 1 in both themes. */
  secondary: "var(--viz-2)",
} as const;

export interface ChartSeries {
  key: string;
  label: string;
  /** Defaults to the slot for its position (1, then 2). */
  color?: string;
  /** One per axis position. Null is a gap: never drawn, never counted as 0. */
  values: (number | null)[];
  /**
   * What the tooltip and the table say instead of `values`, when what is drawn is not the figure
   * itself (a line indexed to its own peak so several units can share one chart). Same length.
   */
  display?: (number | null)[];
  /** Formats this series' readout; defaults to the chart's `formatValue`. */
  formatValue?: (value: number) => string;
}

export interface TimeSeriesChartProps {
  /** Short axis labels, one per position ("Sep 1", "Apr"). */
  labels: string[];
  /** Longer tooltip titles ("Tue, Sep 16"); defaults to `labels`. */
  titles?: string[];
  series: ChartSeries[];
  variant?: "area" | "line" | "bar";
  /**
   * Bar only: one column per position with the series stacked bottom-up (a total split into its
   * parts, e.g. monthly spend by category) instead of side by side. Put the total in `tooltipFooter`.
   */
  stacked?: boolean;
  /** Plot plus the x-axis band. */
  height?: number;
  /** The full value, for the tooltip and the table. */
  formatValue: (value: number) => string;
  /** Axis ticks; compact numbers by default. */
  formatAxis?: (value: number) => string;
  /** Counts: no fractional tick. */
  integer?: boolean;
  /** What the tooltip says for a gap at `index` — "Still to come", "No figure". */
  describeGap?: (index: number) => string;
  /** A secondary line under the tooltip's figures (e.g. "4.5 h translated"). */
  tooltipFooter?: (index: number) => string | null;
  ariaLabel: string;
  className?: string;
}

const AXIS_BAND = 24;
const PAD_TOP = 10;
const PAD_RIGHT = 6;
const TICK_FONT = 11;
const MAX_COLUMN = 24;
const GROUP_GAP = 2;

/** Layout-time, so the first paint is already at the real width rather than the fallback. */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(160, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Roughly how wide an axis label is at 11px — enough to size the gutter and space the labels, not
 * to typeset. Deliberately generous: an underestimate clips the currency sign off "₫50M".
 */
function textWidth(text: string): number {
  return text.length * 7.2;
}

export function TimeSeriesChart({
  labels,
  titles,
  series,
  variant = "area",
  stacked = false,
  height = 200,
  formatValue,
  formatAxis = compactAxisNumber,
  integer = false,
  describeGap = () => "No figure",
  tooltipFooter,
  ariaLabel,
  className,
}: TimeSeriesChartProps) {
  const gradientBase = useId().replace(/:/g, "");
  const [containerRef, width] = useMeasuredWidth(560);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  const count = labels.length;
  const colored = useMemo(
    () =>
      series.map((s, index) => ({
        ...s,
        color: s.color ?? (index === 0 ? CHART_COLORS.primary : CHART_COLORS.secondary),
      })),
    [series],
  );

  const isStacked = stacked && variant === "bar";
  const positive = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) || v < 0 ? 0 : v);
  const stackTotal = (index: number) => colored.reduce((sum, s) => sum + positive(s.values[index]), 0);
  const rawMax = isStacked
    ? Math.max(0, ...labels.map((_, index) => stackTotal(index)))
    : Math.max(0, ...colored.flatMap((s) => s.values.map((v) => (v === null || !Number.isFinite(v) ? 0 : v))));
  const scale = niceScale(rawMax, { integer, targetTicks: height < 170 ? 3 : 4 });
  const tickLabels = scale.ticks.map((tick) => formatAxis(tick));
  const padLeft = Math.ceil(Math.max(...tickLabels.map(textWidth), 12)) + 12;
  const plotLeft = padLeft;
  const plotWidth = Math.max(40, width - padLeft - PAD_RIGHT);
  const plotHeight = Math.max(40, height - AXIS_BAND - PAD_TOP);
  const baseY = PAD_TOP + plotHeight;
  const y = (value: number) => PAD_TOP + plotHeight - (scale.max > 0 ? (value / scale.max) * plotHeight : 0);

  const layout = variant === "bar" ? "band" : "point";
  const slot = plotWidth / Math.max(1, count);
  const x = (index: number) =>
    layout === "band"
      ? plotLeft + slot * (index + 0.5)
      : plotLeft + (count <= 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);

  // Spaced by the widest label, so "Apr … Sep" all show while "Sep 1 … Sep 30" thins out.
  const labelIndexes = xLabelIndexes(count, plotWidth, Math.max(0, ...labels.map(textWidth)) + 20);

  // Columns: grouped side by side for several series, each at most 24px, a 2px gap between.
  const groupCount = isStacked ? 1 : colored.length;
  const column = Math.max(2, Math.min(MAX_COLUMN, (slot * 0.62 - GROUP_GAP * (groupCount - 1)) / groupCount));
  const groupWidth = column * groupCount + GROUP_GAP * (groupCount - 1);

  const topOf = (index: number): number => {
    if (isStacked) return stackTotal(index) > 0 ? y(stackTotal(index)) : baseY;
    const values = colored.map((s) => s.values[index]).filter((v): v is number => v !== null && Number.isFinite(v));
    return values.length ? y(Math.max(...values)) : baseY;
  };

  const show = (index: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setActive(index);
    setAnchor({ x: rect.left + x(index), y: rect.top + topOf(index) });
  };

  const hide = () => {
    setActive(null);
    setAnchor(null);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || count === 0) return;
    const rect = svg.getBoundingClientRect();
    show(indexAtX(event.clientX - rect.left, count, plotLeft, plotWidth, layout));
  };

  const lastKnown = (() => {
    for (let index = count - 1; index >= 0; index--) {
      if (colored.some((s) => s.values[index] !== null && s.values[index] !== undefined)) return index;
    }
    return count - 1;
  })();

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (count === 0) return;
    const current = active ?? lastKnown;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(count - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else if (event.key === "Escape") {
      hide();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      show(next);
    }
  };

  const tooltipRows: TooltipRow[] =
    active === null
      ? []
      : colored.flatMap((s) => {
          if (isStacked && positive(s.values[active]) === 0) return [];
          return [s];
        }).map((s) => {
          const value = (s.display ?? s.values)[active];
          const known = value !== null && value !== undefined && Number.isFinite(value);
          return {
            key: s.key,
            label: s.label,
            value: known ? (s.formatValue ?? formatValue)(value) : describeGap(active),
            color: colored.length > 1 ? s.color : undefined,
            muted: !known,
          };
        });

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {colored.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
          {colored.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              {variant === "bar" ? (
                <i aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: s.color }} />
              ) : (
                <i aria-hidden className="inline-block h-[2px] w-3 rounded-full" style={{ background: s.color }} />
              )}
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        style={{ maxWidth: "100%" }}
        className="block touch-pan-y outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/40"
        onPointerMove={onPointerMove}
        onPointerLeave={hide}
        onFocus={() => show(lastKnown)}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
        <defs>
          {colored.map((s, index) => (
            <linearGradient key={s.key} id={`${gradientBase}-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>

        {/* Grid: solid hairlines at round ticks; the baseline one step stronger. */}
        {scale.ticks.map((tick, index) => (
          <g key={tick}>
            <line
              x1={plotLeft}
              x2={width - PAD_RIGHT}
              y1={Math.round(y(tick)) + 0.5}
              y2={Math.round(y(tick)) + 0.5}
              style={{ stroke: index === 0 ? "var(--hairline-strong)" : "var(--hairline)" }}
            />
            <text
              x={plotLeft - 10}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize={TICK_FONT}
              className="tabular-nums"
              style={{ fill: "var(--muted-foreground)" }}
            >
              {tickLabels[index]}
            </text>
          </g>
        ))}

        {/* The active slot, behind the marks. */}
        {active !== null && layout === "band" ? (
          <rect
            x={plotLeft + slot * active + 1}
            y={PAD_TOP}
            width={Math.max(0, slot - 2)}
            height={plotHeight}
            rx={4}
            style={{ fill: "var(--surface-2)" }}
          />
        ) : null}

        {isStacked
          ? labels.map((_, index) => {
              const parts = colored
                .map((s) => ({ key: s.key, color: s.color, value: positive(s.values[index]) }))
                .filter((part) => part.value > 0);
              let bottom = baseY;
              const left = x(index) - column / 2;
              return (
                <g key={`stack-${index}`} style={{ opacity: active === null || active === index ? 1 : 0.45, transition: "opacity 120ms" }}>
                  {parts.map((part, partIndex) => {
                    const height = Math.max(1, baseY - y(part.value));
                    const top = bottom - height;
                    const isTop = partIndex === parts.length - 1;
                    const d = columnPath(left, top, column, height, isTop ? 4 : 0);
                    bottom = top;
                    return <path key={part.key} d={d} style={{ fill: part.color }} />;
                  })}
                </g>
              );
            })
          : variant === "bar"
          ? colored.map((s, seriesIndex) =>
              s.values.map((value, index) => {
                if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
                const left = x(index) - groupWidth / 2 + seriesIndex * (column + GROUP_GAP);
                const top = Math.min(y(value), baseY - 1.5);
                return (
                  <path
                    key={`${s.key}-${index}`}
                    d={columnPath(left, top, column, baseY - top)}
                    style={{
                      fill: s.color,
                      opacity: active === null || active === index ? 1 : 0.45,
                      transition: "opacity 120ms",
                    }}
                  />
                );
              }),
            )
          : colored.map((s, seriesIndex) => {
              const runs = valueRuns(s.values);
              return (
                <g key={s.key}>
                  {runs.map((run, runIndex) => {
                    const points = run.map((p) => ({ x: x(p.index), y: y(p.value) }));
                    if (points.length === 1) {
                      // An isolated day between two gaps: a dot, or it would not be drawn at all.
                      return (
                        <circle key={runIndex} cx={points[0].x} cy={points[0].y} r={2.5} style={{ fill: s.color }} />
                      );
                    }
                    const line = monotonePath(points);
                    const first = points[0];
                    const last = points[points.length - 1];
                    return (
                      <g key={runIndex}>
                        {variant === "area" ? (
                          <path
                            d={`${line}L${last.x},${baseY}L${first.x},${baseY}Z`}
                            fill={`url(#${gradientBase}-${seriesIndex})`}
                          />
                        ) : null}
                        <path
                          d={line}
                          fill="none"
                          strokeWidth={2}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          style={{ stroke: s.color }}
                        />
                      </g>
                    );
                  })}
                  {/* The latest value, marked; hidden while the crosshair is out. */}
                  {active === null && runs.length > 0
                    ? (() => {
                        const lastPoint = runs[runs.length - 1][runs[runs.length - 1].length - 1];
                        return (
                          <circle
                            cx={x(lastPoint.index)}
                            cy={y(lastPoint.value)}
                            r={3.5}
                            strokeWidth={2}
                            style={{ fill: s.color, stroke: "var(--surface-1)" }}
                          />
                        );
                      })()
                    : null}
                </g>
              );
            })}

        {/* Crosshair: a hairline at the snapped index, a ringed dot on every series there. */}
        {active !== null && layout === "point" ? (
          <g pointerEvents="none">
            <line
              x1={Math.round(x(active)) + 0.5}
              x2={Math.round(x(active)) + 0.5}
              y1={PAD_TOP}
              y2={baseY}
              style={{ stroke: "var(--hairline-strong)" }}
            />
            {colored.map((s) => {
              const value = s.values[active];
              if (value === null || value === undefined || !Number.isFinite(value)) return null;
              return (
                <circle
                  key={s.key}
                  cx={x(active)}
                  cy={y(value)}
                  r={4}
                  strokeWidth={2}
                  style={{ fill: s.color, stroke: "var(--surface-1)" }}
                />
              );
            })}
          </g>
        ) : null}

        {labelIndexes.map((index) => {
          const cx = x(index);
          const half = textWidth(labels[index] ?? "") / 2;
          // Points sit ON the plot's edges, so the end labels hang inward from them; a column's
          // label is centred under it unless that would run it off the chart.
          const nearLeft = layout === "point" ? cx - plotLeft < 24 : cx - half < 0;
          const nearRight = layout === "point" ? plotLeft + plotWidth - cx < 24 : cx + half > width;
          return (
            <text
              key={index}
              x={cx}
              y={height - 6}
              textAnchor={nearLeft ? "start" : nearRight ? "end" : "middle"}
              fontSize={TICK_FONT}
              style={{ fill: active === index ? "var(--foreground)" : "var(--muted-foreground)" }}
            >
              {labels[index]}
            </text>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {colored.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, index) => (
            <tr key={`${label}-${index}`}>
              <th scope="row">{titles?.[index] ?? label}</th>
              {colored.map((s) => {
                const value = (s.display ?? s.values)[index];
                return (
                  <td key={s.key}>
                    {value === null || value === undefined || !Number.isFinite(value) ? describeGap(index) : (s.formatValue ?? formatValue)(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ChartTooltip
        anchor={anchor}
        title={active === null ? "" : (titles?.[active] ?? labels[active] ?? "")}
        rows={tooltipRows}
        footer={active === null ? null : tooltipFooter?.(active)}
      />
    </div>
  );
}

/**
 * The headline above a chart, Resend-style: the number is the chart's point, so it is big, in the
 * page's own sans, with proportional figures (tabular digits look loose at this size). A null is
 * "—", never a 0.
 */
export function ChartFigure({
  value,
  caption,
  className,
}: {
  value: string;
  caption?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 min-w-0", className)}>
      <div className="truncate text-[26px] font-semibold leading-none tracking-[-0.6px] text-ink" title={value}>
        {value}
      </div>
      {caption ? <div className="mt-1.5 truncate text-[11px] text-ink-muted" title={caption}>{caption}</div> : null}
    </div>
  );
}

export function ChartEmpty({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="flex items-center justify-center text-center text-[12px] text-ink-muted" style={{ height }}>
      {children}
    </div>
  );
}
