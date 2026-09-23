"use client";

/**
 * The Insights page's five charts, hand-drawn in SVG.
 *
 * WHY NOT THE OLD ADMIN CHARTS
 *   They hardcode `#3b82f6` and a navy tooltip, so in dark mode they read as a different product.
 *   Every colour here is a CSS variable (`var(--primary)`, `var(--success)`, …) set through
 *   `style`, so a theme switch repaints the charts with the rest of the page and nothing has to
 *   re-render.
 *
 * WHY MEASURE THE WIDTH
 *   A stretched viewBox (`preserveAspectRatio="none"`) distorts the text. The SVG is drawn at its
 *   real pixel width instead, read with a ResizeObserver.
 */

import { useEffect, useRef, useState } from "react";

import { compactNumber, formatCount } from "@/lib/admin/insights-metrics";

function useMeasuredWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(120, Math.round(element.clientWidth)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const INK = "var(--foreground)";
const SUBTLE = "var(--muted-foreground)";
const HAIR = "var(--hairline)";

export function ChartEmpty({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center text-center text-[12px] text-ink-muted"
      style={{ height }}
    >
      {children}
    </div>
  );
}

// ── vertical bars with value labels ──────────────────────────────────────────

export interface BarDatum {
  key: string;
  label: string;
  /** Null draws nothing — not a zero-height bar. */
  value: number | null;
  title: string;
}

export function ValueBars({
  data,
  color,
  height = 220,
  showValues = true,
  ariaLabel,
}: {
  data: BarDatum[];
  color: string;
  height?: number;
  showValues?: boolean;
  ariaLabel: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(360);
  const padBottom = 24;
  const padTop = showValues ? 22 : 8;
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const slot = width / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(44, slot * 0.56));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(width / 56))));

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
        <line x1={0} x2={width} y1={height - padBottom} y2={height - padBottom} style={{ stroke: HAIR }} />
        {data.map((d, index) => {
          const cx = index * slot + slot / 2;
          const value = d.value ?? 0;
          const h = value > 0 ? Math.max(3, (value / max) * (height - padBottom - padTop)) : 0;
          return (
            <g key={d.key}>
              {h > 0 ? (
                <rect x={cx - barWidth / 2} y={height - padBottom - h} width={barWidth} height={h} rx={3} style={{ fill: color }}>
                  <title>{d.title}</title>
                </rect>
              ) : (
                <rect x={cx - slot / 2} y={0} width={slot} height={height - padBottom} style={{ fill: "transparent" }}>
                  <title>{d.title}</title>
                </rect>
              )}
              {showValues && h > 0 ? (
                <text x={cx} y={height - padBottom - h - 6} textAnchor="middle" fontSize={11} fontWeight={600} style={{ fill: INK }}>
                  {compactNumber(value)}
                </text>
              ) : null}
              {index % labelEvery === 0 ? (
                <text
                  x={cx < 28 ? 0 : cx > width - 28 ? width : cx}
                  y={height - 7}
                  // Edge labels are anchored inward, or "Sep 1" under a narrow first slot is clipped.
                  textAnchor={cx < 28 ? "start" : cx > width - 28 ? "end" : "middle"}
                  fontSize={11}
                  style={{ fill: SUBTLE }}
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── line over days, future days blank ────────────────────────────────────────

export interface LinePoint {
  key: string;
  label: string;
  /** Null is a gap: a day still to come, or one the server did not report. */
  value: number | null;
}

export function DailyLine({
  points,
  height = 220,
  ariaLabel,
  formatValue,
}: {
  points: LinePoint[];
  height?: number;
  ariaLabel: string;
  formatValue: (value: number) => string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(700);
  const padLeft = 44;
  const padBottom = 24;
  const padTop = 10;
  const innerWidth = Math.max(10, width - padLeft - 8);
  const innerHeight = height - padBottom - padTop;
  const rawMax = Math.max(0, ...points.map((p) => p.value ?? 0));
  const max = rawMax > 0 ? rawMax * 1.1 : 1;
  const x = (index: number) => padLeft + (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => padTop + innerHeight - (value / max) * innerHeight;

  // Contiguous runs of known values; a gap breaks the line rather than diving to zero.
  const runs: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ index, value: point.value });
    }
  });
  if (current.length) runs.push(current);
  const last = runs.at(-1)?.at(-1);

  const tickIndexes = points.length <= 1
    ? [0]
    : Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
        {[0, rawMax / 2, rawMax].map((tick, index) => (
          <g key={index}>
            <line x1={padLeft} x2={width} y1={y(tick)} y2={y(tick)} style={{ stroke: HAIR }} />
            <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} style={{ fill: SUBTLE }}>
              {compactNumber(tick)}
            </text>
          </g>
        ))}
        {runs.map((run, index) => {
          const line = run.map((p) => `${x(p.index)},${y(p.value)}`).join(" ");
          const area = `M${x(run[0].index)},${y(0)} L${line.split(" ").join(" L")} L${x(run[run.length - 1].index)},${y(0)} Z`;
          return (
            <g key={index}>
              <path d={area} style={{ fill: "var(--primary)", opacity: 0.1 }} />
              <polyline points={line} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: "var(--primary)" }} />
            </g>
          );
        })}
        {points.map((point, index) =>
          point.value === null ? null : (
            <rect key={point.key} x={x(index) - 4} y={padTop} width={8} height={innerHeight} style={{ fill: "transparent" }}>
              <title>{`${point.label}: ${formatValue(point.value)}`}</title>
            </rect>
          ),
        )}
        {last ? (
          <circle cx={x(last.index)} cy={y(last.value)} r={4} strokeWidth={2} style={{ fill: "var(--surface-1)", stroke: "var(--primary)" }} />
        ) : null}
        {tickIndexes.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            fontSize={11}
            style={{ fill: SUBTLE }}
          >
            {points[index]?.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── donut ────────────────────────────────────────────────────────────────────

export interface DonutPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({ parts, height = 170, centerLabel, ariaLabel }: {
  parts: DonutPart[];
  height?: number;
  centerLabel: string;
  ariaLabel: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(300);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(62, height / 2 - 14);
  const stroke = 20;
  let angle = -Math.PI / 2;

  return (
    <div>
      <div ref={ref} className="w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
          <circle cx={cx} cy={cy} r={radius} fill="none" strokeWidth={stroke} style={{ stroke: "var(--surface-2)" }} />
          {total > 0
            ? parts.map((part) => {
                const share = part.value / total;
                if (share <= 0) return null;
                const start = angle;
                // A single 100% slice cannot be one arc: start and end coincide and nothing draws.
                const end = start + Math.min(share, 0.9999) * Math.PI * 2;
                angle = start + share * Math.PI * 2;
                const large = end - start > Math.PI ? 1 : 0;
                return (
                  <path
                    key={part.key}
                    d={`M${cx + radius * Math.cos(start)},${cy + radius * Math.sin(start)} A${radius},${radius} 0 ${large} 1 ${cx + radius * Math.cos(end)},${cy + radius * Math.sin(end)}`}
                    fill="none"
                    strokeWidth={stroke}
                    style={{ stroke: part.color }}
                  >
                    <title>{`${part.label}: ${formatCount(part.value)} (${((share) * 100).toFixed(1)}%)`}</title>
                  </path>
                );
              })
            : null}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={18} fontWeight={600} style={{ fill: INK }}>
            {centerLabel}
          </text>
          <text x={cx} y={cy + 15} textAnchor="middle" fontSize={11} style={{ fill: SUBTLE }}>
            credits
          </text>
        </svg>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        {parts.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-[9px] rounded-[2px]" style={{ background: part.color }} />
            {part.label} {total > 0 ? `${Math.round((part.value / total) * 100)}%` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── stacked horizontal bars ──────────────────────────────────────────────────

export interface StackRow {
  key: string;
  label: string;
  segments: { key: string; label: string; value: number; color: string; opacity?: number }[];
}

export function StackedBars({ rows, ariaLabel }: { rows: StackRow[]; ariaLabel: string }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(300);
  const barHeight = 20;
  const gap = 16;
  const padLeft = 78;
  const height = Math.max(40, 12 + rows.length * (barHeight + gap));
  const totals = rows.map((row) => row.segments.reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(1, ...totals);
  const innerWidth = Math.max(10, width - padLeft - 36);

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
        {rows.map((row, index) => {
          const top = 12 + index * (barHeight + gap);
          let x0 = padLeft;
          return (
            <g key={row.key}>
              <text x={padLeft - 10} y={top + 14} textAnchor="end" fontSize={11} style={{ fill: "var(--muted-foreground)" }}>
                {row.label.length > 12 ? `${row.label.slice(0, 11)}…` : row.label}
                <title>{row.label}</title>
              </text>
              {row.segments.map((segment) => {
                const w = (segment.value / max) * innerWidth;
                const rect = w > 0 ? (
                  <rect key={segment.key} x={x0} y={top} width={w} height={barHeight} style={{ fill: segment.color, opacity: segment.opacity ?? 1 }}>
                    <title>{`${row.label} · ${segment.label}: ${formatCount(segment.value)}`}</title>
                  </rect>
                ) : null;
                x0 += w;
                return rect;
              })}
              <text x={x0 + 6} y={top + 14} fontSize={11} style={{ fill: INK }}>
                {formatCount(totals[index])}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── several lines over the same months (WT-692) ─────────────────────────────

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value per axis point; null is a gap (a month the source did not report). */
  values: (number | null)[];
}

export function MultiLine({
  labels,
  series,
  height = 220,
  ariaLabel,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(520);
  const padLeft = 40;
  const padBottom = 24;
  const padTop = 10;
  const innerWidth = Math.max(10, width - padLeft - 12);
  const innerHeight = height - padBottom - padTop;
  const rawMax = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const max = rawMax > 0 ? rawMax * 1.1 : 1;
  const x = (index: number) =>
    padLeft + (labels.length <= 1 ? innerWidth / 2 : (index / (labels.length - 1)) * innerWidth);
  const y = (value: number) => padTop + innerHeight - (value / max) * innerHeight;

  return (
    <div ref={ref} className="w-full">
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-ink-muted">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="block">
        {[0, rawMax / 2, rawMax].map((tick, index) => (
          <g key={index}>
            <line x1={padLeft} x2={width} y1={y(tick)} y2={y(tick)} style={{ stroke: HAIR }} />
            <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} style={{ fill: SUBTLE }}>
              {compactNumber(tick)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          // Contiguous runs only: a missing month breaks the line instead of diving to zero.
          const runs: { index: number; value: number }[][] = [];
          let run: { index: number; value: number }[] = [];
          s.values.forEach((value, index) => {
            if (value === null) {
              if (run.length) runs.push(run);
              run = [];
            } else run.push({ index, value });
          });
          if (run.length) runs.push(run);
          return (
            <g key={s.key}>
              {runs.map((points, i) => (
                <polyline
                  key={i}
                  points={points.map((p) => `${x(p.index)},${y(p.value)}`).join(" ")}
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  style={{ stroke: s.color }}
                />
              ))}
              {runs.flat().map((p) => (
                <circle key={p.index} cx={x(p.index)} cy={y(p.value)} r={3} style={{ fill: s.color }}>
                  <title>{`${labels[p.index]} · ${s.label}: ${formatCount(p.value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labels.map((label, index) => (
          <text
            key={label + index}
            x={x(index)}
            y={height - 6}
            textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
            fontSize={11}
            style={{ fill: SUBTLE }}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
