"use client";

/**
 * A share-of-whole donut for the admin dashboards, for the few places where "what part of the total"
 * is the question (a provider's cost by workspace or by model). BarList stays the default for ranked
 * categories; a pie is used beside it, never instead of the numbers — the legend lists every slice
 * with its value and share.
 *
 * The rules of the chart primitive hold here too:
 *   - every colour is a CSS variable (both themes, same markup);
 *   - the readout is the shared portalled ChartTooltip — hover a slice, or focus the chart and move
 *     with ←/→ — never an SVG <title>;
 *   - a screen reader gets the slices as a table;
 *   - an empty or all-zero set draws nothing and says so (a 0-slice pie is a lie of a full circle).
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { ChartTooltip, type TooltipAnchor } from "@/components/admin/charts/chart-tooltip";
import { cn } from "@/lib/utils";

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  /** A second line in the readout ("$0.42 · 1,204 calls"). */
  detail?: string | null;
}

const TAU = Math.PI * 2;

function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  // A lone slice of the whole circle cannot be one arc (start and end coincide): draw two halves.
  if (end - start >= TAU - 1e-6) {
    const mid = start + Math.PI;
    return `${arcPath(cx, cy, outer, inner, start, mid)} ${arcPath(cx, cy, outer, inner, mid, end)}`;
  }
  const point = (radius: number, angle: number) => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)] as const;
  const [x0, y0] = point(outer, start);
  const [x1, y1] = point(outer, end);
  const [x2, y2] = point(inner, end);
  const [x3, y3] = point(inner, start);
  const large = end - start > Math.PI ? 1 : 0;
  return `M${x0},${y0}A${outer},${outer} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
}

export function PieChart({
  slices,
  formatValue,
  ariaLabel,
  size = 168,
  emptyLabel,
  centerLabel,
  className,
}: {
  slices: PieSlice[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  size?: number;
  /** Shown instead of the chart when nothing is positive. */
  emptyLabel: string;
  /** Under the total in the hole ("total", "calls"). */
  centerLabel?: string;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  const positive = slices.filter((slice) => Number.isFinite(slice.value) && slice.value > 0);
  const total = positive.reduce((sum, slice) => sum + slice.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 2;
  const inner = outer * 0.62;

  const arcs = positive.reduce<{ slice: PieSlice; start: number; end: number; mid: number }[]>((list, slice) => {
    const start = list.length ? list[list.length - 1].end : 0;
    const end = start + (slice.value / total) * TAU;
    return [...list, { slice, start, end, mid: (start + end) / 2 }];
  }, []);

  const show = (index: number) => {
    const svg = svgRef.current;
    const arc = arcs[index];
    if (!svg || !arc) return;
    const rect = svg.getBoundingClientRect();
    const radius = (outer + inner) / 2;
    setActive(index);
    setAnchor({ x: rect.left + cx + radius * Math.sin(arc.mid), y: rect.top + cy - radius * Math.cos(arc.mid) });
  };

  const hide = () => {
    setActive(null);
    setAnchor(null);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || arcs.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const dx = event.clientX - rect.left - cx;
    const dy = event.clientY - rect.top - cy;
    const distance = Math.hypot(dx, dy);
    if (distance < inner || distance > outer + 2) {
      hide();
      return;
    }
    let pointer = Math.atan2(dx, -dy);
    if (pointer < 0) pointer += TAU;
    const index = arcs.findIndex((arc) => pointer >= arc.start && pointer < arc.end);
    if (index >= 0) show(index);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (arcs.length === 0) return;
    const current = active ?? -1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % arcs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + arcs.length) % arcs.length;
    else if (event.key === "Escape") {
      hide();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      show(next);
    }
  };

  if (arcs.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-center text-[12px] text-ink-muted", className)} style={{ minHeight: size }}>
        {emptyLabel}
      </div>
    );
  }

  const share = (value: number) => `${((value / total) * 100).toFixed(value / total >= 0.1 ? 0 : 1)}%`;
  const activeArc = active === null ? null : arcs[active];

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-start", className)}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="shrink-0 touch-pan-y outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-ring/40"
        onPointerMove={onPointerMove}
        onPointerLeave={hide}
        onFocus={() => show(0)}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
        {arcs.map((arc, index) => (
          <path
            key={arc.slice.key}
            d={arcPath(cx, cy, active === index ? outer + 1.5 : outer, inner, arc.start, arc.end)}
            style={{
              fill: arc.slice.color,
              stroke: "var(--surface-1)",
              strokeWidth: arcs.length > 1 ? 1.5 : 0,
              opacity: active === null || active === index ? 1 : 0.5,
              transition: "opacity 120ms",
            }}
          />
        ))}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={15} fontWeight={600} style={{ fill: "var(--foreground)" }}>
          {formatValue(total)}
        </text>
        {centerLabel ? (
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} style={{ fill: "var(--muted-foreground)" }}>
            {centerLabel}
          </text>
        ) : null}
      </svg>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px]">
        {arcs.map((arc, index) => (
          <li
            key={arc.slice.key}
            className={cn("flex min-w-0 items-center gap-2", active !== null && active !== index && "opacity-60")}
            onPointerEnter={() => show(index)}
            onPointerLeave={hide}
          >
            <i aria-hidden className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: arc.slice.color }} />
            <span className="min-w-0 flex-1 truncate text-ink">{arc.slice.label}</span>
            <span className="tabular-nums text-ink-muted">{share(arc.slice.value)}</span>
            <span className="w-24 text-right font-medium tabular-nums text-ink">{formatValue(arc.slice.value)}</span>
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Slice</th>
            <th scope="col">Value</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {arcs.map((arc) => (
            <tr key={arc.slice.key}>
              <th scope="row">{arc.slice.label}</th>
              <td>{formatValue(arc.slice.value)}</td>
              <td>{share(arc.slice.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ChartTooltip
        anchor={anchor}
        title={activeArc?.slice.label ?? ""}
        rows={
          activeArc
            ? [{ key: activeArc.slice.key, label: share(activeArc.slice.value), value: formatValue(activeArc.slice.value), color: activeArc.slice.color }]
            : []
        }
        footer={activeArc?.slice.detail ?? null}
      />
    </div>
  );
}
