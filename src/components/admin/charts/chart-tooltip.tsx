"use client";

/**
 * The hover readout every admin chart shares.
 *
 * WHY A PORTAL
 *   The old readouts were either SVG `<title>` (a browser tooltip: a second late, unstyled, and
 *   absent on keyboard focus) or a Recharts tooltip rendered inside the chart's own box — where the
 *   panel's `overflow-hidden` cut it off at the card edge, and its hardcoded navy (#0f172a) ignored
 *   the theme. This one is portalled to `document.body`, positioned `fixed` against the viewport,
 *   and flipped/clamped so it never leaves the screen; no ancestor's overflow or stacking context
 *   can clip it.
 *
 * WHY IT STILL FOLLOWS THE THEME
 *   The app's theme class lives on `<html>` (next-themes), which a body portal is still inside, and
 *   every colour here is a token (`bg-popover`, `text-popover-foreground`, `border-border`).
 *
 * Values lead, labels follow (the reader already knows the series and wants the number), and each
 * row keys its series with a short stroke of the series colour — never coloured text.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { placeTooltip } from "@/lib/admin/chart-scale";
import { cn } from "@/lib/utils";

export interface TooltipAnchor {
  /** Viewport coordinates (clientX/clientY space) of the point the readout belongs to. */
  x: number;
  y: number;
}

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  /** The series colour; drawn as a short line key. Omit for a single-series chart. */
  color?: string;
  /** A muted row (e.g. "still to come") rather than a figure. */
  muted?: boolean;
}

export function ChartTooltip({
  anchor,
  title,
  rows,
  footer,
}: {
  /** Null hides the readout. */
  anchor: TooltipAnchor | null;
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // What changes the readout's size; `rows` itself is a fresh array on every render.
  const content = `${title}\u0000${rows.map((row) => `${row.key}:${row.value}:${row.label}`).join("\u0000")}\u0000${typeof footer === "string" ? footer : ""}`;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!anchor || !element) {
      setPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const next = placeTooltip(anchor, { width: rect.width, height: rect.height }, { width: window.innerWidth, height: window.innerHeight });
    // Same place, same object: no re-render for a move that lands on the same pixel.
    setPosition((previous) =>
      previous && Math.round(previous.left) === Math.round(next.left) && Math.round(previous.top) === Math.round(next.top)
        ? previous
        : next,
    );
  }, [anchor, content]);

  if (!anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[1000] min-w-[140px] max-w-[280px] rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-[0_8px_24px_-6px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)]",
        // Measured first, then shown: no one-frame flash at the corner of the screen.
        position ? "opacity-100" : "opacity-0",
      )}
      style={position ? { transform: `translate(${Math.round(position.left)}px, ${Math.round(position.top)}px)` } : undefined}
    >
      <div className="text-[11px] font-medium text-ink-muted">{title}</div>
      <div className="mt-1 flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-[12px] leading-[1.35]">
            {row.color ? (
              <span aria-hidden className="h-[2px] w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />
            ) : null}
            <span className={cn("tabular-nums", row.muted ? "text-ink-muted" : "font-semibold text-ink")}>{row.value}</span>
            <span className="min-w-0 truncate text-ink-muted">{row.label}</span>
          </div>
        ))}
      </div>
      {footer ? <div className="mt-1.5 border-t border-hairline pt-1.5 text-[11px] text-ink-muted">{footer}</div> : null}
    </div>,
    document.body,
  );
}
