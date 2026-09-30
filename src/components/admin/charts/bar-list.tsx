"use client";

/**
 * The bar variant for categories: a ranked list of horizontal bars (Linear / Resend / Tremor).
 *
 * It replaces the admin donut and the thick stacked-bar blocks. A donut asks the reader to compare
 * angles; five slices of one service mix read better as five bar lengths with the number beside
 * each. Every row is one line of text over one thin bar, so a long workspace or plan name has the
 * full width instead of a 12-character gutter.
 *
 * A row may be split into segments (active · trial · past due) with a 2px surface gap between
 * them; the row itself is the hover target and shows every segment in the shared portalled
 * tooltip. A row with an `href` is a link to the list behind it.
 */

import Link from "next/link";
import { useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

import { ChartTooltip, type TooltipAnchor } from "@/components/admin/charts/chart-tooltip";
import { CHART_COLORS } from "@/components/admin/charts/time-series-chart";
import { cn } from "@/lib/utils";

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface BarListRow {
  key: string;
  label: string;
  href?: string | null;
  segments: BarSegment[];
  /** Shown at the right; defaults to the formatted total. */
  valueText?: string;
}

const SEGMENT_GAP = 2;

export function BarList({
  rows,
  formatValue,
  ariaLabel,
  showShare = false,
  legend,
}: {
  rows: BarListRow[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  /** Append each row's share of the whole ("52%"). */
  showShare?: boolean;
  legend?: { key: string; label: string; color: string }[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  const totals = rows.map((row) => row.segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0));
  const max = Math.max(1, ...totals);
  const grand = totals.reduce((sum, total) => sum + total, 0);
  const activeIndex = rows.findIndex((row) => row.key === active);
  const activeRow = activeIndex >= 0 ? rows[activeIndex] : null;

  const point = (element: HTMLElement, key: string) => {
    const rect = element.getBoundingClientRect();
    setActive(key);
    setAnchor({ x: rect.left + Math.min(rect.width * 0.6, 260), y: rect.top + 4 });
  };
  const clear = () => {
    setActive(null);
    setAnchor(null);
  };

  return (
    <div role="list" aria-label={ariaLabel} className="flex flex-col">
      {legend && legend.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
          {legend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <i aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {rows.map((row, index) => {
        const total = totals[index];
        const width = (total / max) * 100;
        const share = grand > 0 ? Math.round((total / grand) * 100) : 0;
        const visible = row.segments.filter((segment) => segment.value > 0);
        const body: ReactNode = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-ink">
                {row.valueText ?? formatValue(total)}
                {showShare ? <span className="ml-1.5 text-[11px] text-ink-muted">{share}%</span> : null}
              </span>
            </div>
            <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="flex h-full" style={{ width: `${Math.max(total > 0 ? 1.5 : 0, width)}%`, gap: SEGMENT_GAP }}>
                {visible.map((segment, segmentIndex) => (
                  <span
                    key={segment.key}
                    className={cn(
                      "h-full",
                      segmentIndex === visible.length - 1 && "rounded-r-full",
                      segmentIndex === 0 && "rounded-l-full",
                    )}
                    style={{
                      flexGrow: segment.value,
                      flexBasis: 0,
                      minWidth: 2,
                      background: segment.color ?? CHART_COLORS.primary,
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        );
        const className = cn(
          "block rounded-md px-2 py-1.5 -mx-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
          active === row.key && "bg-surface-2",
        );
        const handlers = {
          onPointerEnter: (event: PointerEvent<HTMLElement>) => point(event.currentTarget, row.key),
          onPointerLeave: clear,
          onFocus: (event: FocusEvent<HTMLElement>) => point(event.currentTarget, row.key),
          onBlur: clear,
        };
        return (
          <div role="listitem" key={row.key}>
            {row.href ? (
              <Link href={row.href} className={className} {...handlers}>
                {body}
              </Link>
            ) : (
              <div tabIndex={0} className={className} {...handlers}>
                {body}
              </div>
            )}
          </div>
        );
      })}

      <ChartTooltip
        anchor={anchor}
        title={activeRow?.label ?? ""}
        rows={
          activeRow
            ? activeRow.segments.length > 1
              ? activeRow.segments.map((segment) => ({
                  key: segment.key,
                  label: segment.label,
                  value: formatValue(segment.value),
                  color: segment.color ?? CHART_COLORS.primary,
                }))
              : [
                  {
                    key: "total",
                    label: grand > 0 ? `${Math.round((totals[activeIndex] / grand) * 1000) / 10}% of total` : "",
                    value: formatValue(totals[activeIndex]),
                  },
                ]
            : []
        }
      />
    </div>
  );
}
