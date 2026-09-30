"use client";

/**
 * The status.claude.com row: one thin vertical bar per day, coloured by that day's status, with the
 * period's uptime in the middle of an axis that runs from "90 days ago" to "Today".
 *
 * Same rules as the other admin chart primitives:
 *   - colours are CSS variables handed in by the caller (theme tokens, both themes);
 *   - hover, or focus then ←/→/Home/End, moves the readout — the shared portalled ChartTooltip,
 *     never an SVG <title> — listing that day's figures and incidents;
 *   - a screen reader gets every day as a table row.
 * A day with no data is drawn as a muted bar, not left out: a gap in the row reads as "fine".
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { ChartTooltip, type TooltipAnchor, type TooltipRow } from "@/components/admin/charts/chart-tooltip";
import { cn } from "@/lib/utils";

export interface UptimeBar {
  key: string;
  /** The status in words, for the table and the readout's first row. */
  statusLabel: string;
  color: string;
  /** The readout title ("Tue, Sep 16"). */
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
  /** Drawn shorter and fainter: nothing was measured that day. */
  muted?: boolean;
}

export function UptimeBars({
  bars,
  ariaLabel,
  startLabel,
  endLabel,
  centerLabel,
  height = 34,
  className,
}: {
  bars: UptimeBar[];
  ariaLabel: string;
  startLabel: string;
  endLabel: string;
  /** "99.43 % uptime", or the honest "uptime not tracked". */
  centerLabel: ReactNode;
  height?: number;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  const show = (index: number) => {
    const row = rowRef.current;
    const bar = row?.children[index] as HTMLElement | undefined;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    setActive(index);
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const hide = () => {
    setActive(null);
    setAnchor(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!row || bars.length === 0) return;
    const rect = row.getBoundingClientRect();
    const index = Math.min(bars.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * bars.length)));
    show(index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (bars.length === 0) return;
    const current = active ?? bars.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(bars.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = bars.length - 1;
    else if (event.key === "Escape") {
      hide();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      show(next);
    }
  };

  const activeBar = active === null ? null : bars[active];

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={rowRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="flex w-full touch-pan-y items-end gap-[2px] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/40"
        style={{ height }}
        onPointerMove={onPointerMove}
        onPointerLeave={hide}
        onFocus={() => show(bars.length - 1)}
        onBlur={hide}
        onKeyDown={onKeyDown}
      >
        {bars.map((bar, index) => (
          <span
            key={bar.key}
            aria-hidden
            className="min-w-[2px] flex-1 rounded-[2px] transition-opacity duration-100"
            style={{
              background: bar.color,
              height: bar.muted ? "70%" : "100%",
              opacity: active === null || active === index ? (bar.muted ? 0.55 : 1) : 0.4,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-muted">
        <span className="shrink-0">{startLabel}</span>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <span className="shrink-0 font-medium text-ink">{centerLabel}</span>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <span className="shrink-0">{endLabel}</span>
      </div>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Status</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <th scope="row">{bar.title}</th>
              <td>{bar.statusLabel}</td>
              <td>{bar.rows.map((row) => `${row.value} ${row.label}`).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ChartTooltip
        anchor={anchor}
        title={activeBar?.title ?? ""}
        rows={activeBar ? [{ key: "status", label: "", value: activeBar.statusLabel, color: activeBar.color }, ...activeBar.rows] : []}
        footer={activeBar?.footer ?? null}
      />
    </div>
  );
}
