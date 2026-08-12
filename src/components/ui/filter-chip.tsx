"use client";

/**
 * One filter chip for the whole app.
 *
 * There were four styles doing the same job. Measured across the workspace:
 *
 *   voice profiles        rounded-full pill, 26px tall         <- the one that was picked
 *   knowledge facts       rounded-md, 11px, no border
 *   AdminFilterTabs       rounded-md, 11px, fills with bg-ink
 *   documents             rounded-full with a leading icon per chip
 *
 * A filter chip is the most repeated control in the product, so four answers to "what does a
 * chosen filter look like" is four chances for a screen to look like a different application.
 * Voice Profiles is the reference because it is the page used as the visual size baseline.
 *
 * NO ICONS. They were only ever on some of the chips in a row, which made those rows read as a
 * mixed list of actions rather than one set of choices — and an icon repeated at every size and
 * colour of the palette is what made Documents look unrelated to Meetings. The label is the
 * filter; a count belongs in `badge`, which is deliberately the only slot beside the text.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FilterChip({
  selected,
  onClick,
  children,
  badge,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** A count, e.g. the number of documents awaiting approval. Never an icon. */
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex h-[26px] shrink-0 select-none items-center justify-center gap-1.5 rounded-full border px-3",
        "text-[12px] font-medium capitalize transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
          : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white",
        className,
      )}
    >
      {children}
      {badge != null ? (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-3 px-1 text-[9px] font-bold tabular-nums text-ink-muted">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function FilterChipGroup({
  label,
  children,
  trailing,
  className,
}: {
  /** For screen readers: what these chips filter. */
  label: string;
  children: ReactNode;
  /** Right-aligned counter or status, e.g. "12 workspaces". */
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("hide-scrollbar flex items-center gap-2 overflow-x-auto", className)}
      role="tablist"
      aria-label={label}
    >
      {children}
      {trailing ? (
        <span className="ml-auto shrink-0 pl-3 text-[11px] tabular-nums text-ink-subtle">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}
