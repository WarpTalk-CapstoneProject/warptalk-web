"use client";

/**
 * Credits spent per day (or week), stacked by AI service — the Usage page's main chart.
 *
 * WHY BARS CAME BACK
 *   The page once swapped its daily bars for a cumulative burn-up, because on real data one day
 *   held 2,100,998 of 2,106,183 credits and drew one bar over a row of invisible ones. The owner's
 *   complaint afterwards was the opposite one: the page showed too little, and nothing said WHICH
 *   service the credits went to. Stacked daily bars answer that, and the outlier problem is solved
 *   on the axis instead (`stackedChartScale`): the scale follows the second-tallest bar and the
 *   outlier is drawn broken, with its value printed on it.
 *
 * HAND-DRAWN, LIKE THE BURN-UP IT REPLACES
 *   A broken bar and a printed outlier value are both outside what Recharts draws, and Recharts'
 *   mount animation is the one `CycleSpendChart` had to switch off after it left an empty grid.
 *
 * COLOURS ARE TOKENS
 *   `--usage-service-1…5` and `--usage-service-other` in globals.css, redefined under `.dark`, so the
 *   chart follows the theme like the rest of the page.
 */

import { useRef, useState } from "react";

import {
  stackedChartScale,
  type OverviewBucketSize,
  type ServiceBucket,
} from "@/lib/billing/usage-overview";

const W = 740;
const H = 280;
const PAD = { top: 22, right: 6, bottom: 28, left: 48 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export interface ChartSeries {
  key: string;
  label: string;
  /** 1–5, or 0 for the shared "Other" colour. */
  slot: number;
}

export function serviceColor(slot: number): string {
  return slot >= 1 && slot <= 5 ? `var(--usage-service-${slot})` : "var(--usage-service-other)";
}

export function compactCredits(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}k`;
  // Under ten thousand a whole "k" collapses neighbouring gridlines: 1,500 and 2,000 both read "2k".
  if (Math.abs(value) >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

function whole(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function UsageSpendChart({
  buckets,
  bucketSize,
  series,
  average,
}: {
  buckets: ServiceBucket[];
  bucketSize: OverviewBucketSize;
  /** Legend order, which is also stacking order from the baseline up. */
  series: ChartSeries[];
  average: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const totals = buckets.map((b) => b.total);
  const { max, clipped } = stackedChartScale(totals);
  const clippedSet = new Set(clipped);

  const slotOf = new Map(series.map((s) => [s.key, s]));
  const n = Math.max(1, buckets.length);
  const step = IW / n;
  const barWidth = Math.max(2, Math.min(28, step * 0.68));
  const y = (value: number) => PAD.top + IH - (IH * Math.min(value, max)) / max;

  const label = (bucket: ServiceBucket) =>
    bucketSize === "week"
      ? `Week of ${SHORT_DATE.format(bucket.start)}`
      : SHORT_DATE.format(bucket.start);

  /** Slot-ordered segments for one bucket, services outside the top five merged into Other. */
  const segments = (bucket: ServiceBucket) => {
    const bySlot = new Map<number, number>();
    for (const [key, credits] of Object.entries(bucket.byService)) {
      const slot = slotOf.get(key)?.slot ?? 0;
      bySlot.set(slot, (bySlot.get(slot) ?? 0) + credits);
    }
    return [1, 2, 3, 4, 5, 0]
      .map((slot) => ({ slot, credits: bySlot.get(slot) ?? 0 }))
      .filter((segment) => segment.credits > 0);
  };

  const ticks = [0, 1, 2, 3, 4].map((i) => (max * i) / 4);
  const labelIndexes = Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1])).filter(
    (i) => i >= 0 && i < buckets.length,
  );

  function indexFromClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(n - 1, Math.floor((viewX - PAD.left) / step)));
  }

  const reading = hovered !== null && buckets[hovered] ? buckets[hovered] : null;
  const legendLabel = (slot: number) =>
    slot === 0 ? "Other services" : (series.find((s) => s.slot === slot)?.label ?? "");

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        role="img"
        aria-label={`Credits spent per ${bucketSize}, stacked by AI service`}
        tabIndex={0}
        onPointerMove={(event) => setHovered(indexFromClientX(event.clientX))}
        onPointerDown={(event) => setHovered(indexFromClientX(event.clientX))}
        onPointerLeave={() => setHovered(null)}
        onFocus={() => setHovered((value) => (value === null ? n - 1 : value))}
        onBlur={() => setHovered(null)}
        onKeyDown={(event) => {
          const from = hovered === null ? n - 1 : hovered;
          if (event.key === "ArrowLeft") setHovered(Math.max(0, from - 1));
          else if (event.key === "ArrowRight") setHovered(Math.min(n - 1, from + 1));
          else if (event.key === "Escape") setHovered(null);
          else return;
          event.preventDefault();
        }}
      >
        {ticks.map((value, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-hairline"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className="fill-ink-subtle text-[11px] font-medium"
            >
              {compactCredits(value)}
            </text>
          </g>
        ))}

        {reading !== null && hovered !== null ? (
          <rect
            x={PAD.left + hovered * step}
            y={PAD.top}
            width={step}
            height={IH}
            className="fill-surface-2"
          />
        ) : null}

        {buckets.map((bucket, index) => {
          const x = PAD.left + index * step + (step - barWidth) / 2;
          if (bucket.total <= 0) {
            return (
              <rect
                key={index}
                x={x}
                y={PAD.top + IH - 1.5}
                width={barWidth}
                height={1.5}
                className="fill-surface-3"
              />
            );
          }

          const isClipped = clippedSet.has(index);
          // A clipped bar is scaled so its segments keep their proportions inside the full plot.
          const scale = isClipped ? max / bucket.total : 1;
          let base = PAD.top + IH;
          return (
            <g key={index}>
              {segments(bucket).map((segment) => {
                const height = (IH * segment.credits * scale) / max;
                base -= height;
                return (
                  <rect
                    key={segment.slot}
                    x={x}
                    y={base}
                    width={barWidth}
                    height={height}
                    fill={serviceColor(segment.slot)}
                  >
                    <title>
                      {`${label(bucket)} · ${legendLabel(segment.slot)}: ${whole(segment.credits)} credits`}
                    </title>
                  </rect>
                );
              })}
              {isClipped ? (
                <g>
                  {/* The break: two panel-coloured slashes across the top of the bar. */}
                  <path
                    d={`M${x - 2} ${PAD.top + 12}L${x + barWidth + 2} ${PAD.top + 7}M${x - 2} ${PAD.top + 17}L${x + barWidth + 2} ${PAD.top + 12}`}
                    className="stroke-panel"
                    strokeWidth="3"
                  />
                  <text
                    x={Math.min(W - PAD.right, Math.max(PAD.left, x + barWidth / 2))}
                    y={PAD.top - 7}
                    textAnchor="middle"
                    className="fill-ink text-[11px] font-semibold"
                  >
                    {compactCredits(bucket.total)}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {average > 0 && average <= max ? (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(average)}
            y2={y(average)}
            className="stroke-[var(--primary)] opacity-75"
            strokeWidth="1.25"
            strokeDasharray="4 4"
          />
        ) : null}

        {labelIndexes.map((index, position) => (
          <text
            key={index}
            x={PAD.left + index * step + step / 2}
            y={H - 8}
            textAnchor={
              labelIndexes.length > 1 && position === 0
                ? "start"
                : labelIndexes.length > 1 && position === labelIndexes.length - 1
                  ? "end"
                  : "middle"
            }
            className="fill-ink-subtle text-[11px] font-medium"
          >
            {SHORT_DATE.format(buckets[index].start)}
          </text>
        ))}
      </svg>

      {reading && hovered !== null ? (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-[8px] border border-border bg-surface-1 px-3 py-2.5"
          style={{
            left: `min(calc(100% - 188px), max(0px, ${((PAD.left + (hovered + 1) * step) / W) * 100}% + 8px))`,
          }}
        >
          <p className="text-[11px] font-semibold text-ink">{label(reading)}</p>
          {segments(reading)
            .slice()
            .reverse()
            .map((segment) => (
              <div key={segment.slot} className="mt-1 flex items-center justify-between gap-4">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-muted">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: serviceColor(segment.slot) }}
                  />
                  <span className="truncate">{legendLabel(segment.slot)}</span>
                </span>
                <b className="text-[11.5px] font-semibold tabular-nums text-ink">
                  {whole(segment.credits)}
                </b>
              </div>
            ))}
          <div className="-mx-3 mt-2 h-px bg-hairline" />
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="text-[11.5px] text-ink-muted">Total</span>
            <b className="text-[11.5px] font-semibold tabular-nums text-ink">
              {whole(reading.total)}
            </b>
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {series.map((s) => (
          <LegendKey key={s.key} color={serviceColor(s.slot)} text={s.label} />
        ))}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span aria-hidden className="h-0 w-3.5 border-t-[1.5px] border-dashed border-[var(--primary)]" />
          Average
        </span>
      </div>
    </div>
  );
}

function LegendKey({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
      <span aria-hidden className="size-[9px] rounded-[2px]" style={{ background: color }} />
      {text}
    </span>
  );
}

/**
 * A row of small bars — settlements, meetings, one service. No axis: the number beside it carries
 * the scale, and the bars only show when it happened.
 */
export function MiniBars({
  values,
  color = "var(--usage-service-1)",
  height = 46,
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  label: string;
}) {
  const w = 300;
  const n = Math.max(1, values.length);
  const step = w / n;
  const peak = Math.max(...values, 1);
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      {values.map((value, index) => {
        const h = value > 0 ? Math.max(2, (value / peak) * (height - 2)) : 1.5;
        return (
          <rect
            key={index}
            x={index * step + step * 0.14}
            y={height - h}
            width={Math.max(1, step * 0.72)}
            height={h}
            rx={1}
            fill={value > 0 ? color : "var(--surface-3)"}
          />
        );
      })}
    </svg>
  );
}
