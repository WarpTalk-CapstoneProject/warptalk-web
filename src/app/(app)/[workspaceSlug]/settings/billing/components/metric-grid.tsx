"use client";

/**
 * The row of numbers at the top of Billing.
 *
 * ONE BOX, HAIRLINE CELLS — NOT A ROW OF CARDS
 *   The page previously drew two floating tiles with their own borders, shadows and grey fills,
 *   which is three visual weights for one row of facts. Cells inside a single bordered box read
 *   across as one statement, which is what they are; it is also the shape the dashboard's cycle
 *   summary already uses, so the two surfaces stop looking like different products.
 *
 * WHAT GOES IN IT
 *   Billing's own facts, not the dashboard's. The dashboard answers "are we going to run out";
 *   this answers "what are we paying for, until when, and what has been invoiced". Repeating the
 *   burn-rate tiles here would have made Billing a second dashboard with a table under it.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MetricGrid({ children }: { children: ReactNode }) {
  // The dividers are the 1px GAPS, with the container's colour showing through and each cell
  // painting itself white. `divide-x`/`divide-y` cannot do this on a grid that reflows: they draw
  // on every child regardless of where the wrap lands, so at 2 columns you get a stray line down
  // the middle of the last row and no line under the first. Gaps land correctly at any column
  // count, which is the whole reason this grid is 1/2/3 wide at three breakpoints.
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-hairline">
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  tone = "default",
  trailing,
}: {
  label: string;
  value: ReactNode;
  /** One line of context. Without it a number is a fact nobody can act on. */
  detail?: ReactNode;
  tone?: "default" | "warn";
  /** A badge or link pinned to the label row — the cell's own affordance, if it has one. */
  trailing?: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-surface-1 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12px] text-ink-muted">{label}</p>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate text-[22px] font-semibold leading-none tabular-nums",
          tone === "warn" ? "text-amber-500" : "text-ink",
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-1.5 text-[12px] text-ink-subtle">{detail}</p> : null}
    </div>
  );
}

/**
 * A titled block in the page body or rail. Same white card as everywhere else — the grey fill
 * these used to carry is what made Billing read as patches rather than as a page.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden rounded-[14px] border border-border bg-surface-1", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("px-4 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}
