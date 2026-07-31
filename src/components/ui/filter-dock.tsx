"use client";

import * as React from "react";
import { Funnel, SlidersHorizontal } from "@phosphor-icons/react/dist/ssr";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FilterDockProps = {
  children: React.ReactNode;
  activeCount?: number;
  label?: string;
  mode?: "filter" | "view";
  className?: string;
};

export function FilterDock({
  children,
  activeCount = 0,
  label = "Filters",
  mode = "filter",
  className,
}: FilterDockProps) {
  const Icon = mode === "view" ? SlidersHorizontal : Funnel;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className={cn(
          "relative grid size-9 place-items-center rounded-full border border-border bg-surface-1 text-ink-muted shadow-sm transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          activeCount > 0 && "border-ink/30 bg-ink text-surface-1 hover:bg-ink/90 hover:text-surface-1",
          className
        )}
      >
        <Icon weight="bold" size={14} />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full border border-surface-1 bg-surface-1 px-1 text-[9px] font-semibold leading-4 text-ink shadow-sm">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[320px] gap-0 overflow-hidden rounded-xl border-neutral-800 bg-neutral-950 p-0 text-neutral-200 shadow-2xl ring-black/40"
      >
        <div className="border-b border-neutral-800 px-3 py-3">
          <div className="flex h-8 items-center justify-between rounded-md px-2 text-[13px] text-neutral-400">
            <span>{mode === "view" ? "View options..." : "Add Filter..."}</span>
            <kbd className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
              {mode === "view" ? "V" : "F"}
            </kbd>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterDockSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 py-1">
      {title ? (
        <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-normal text-neutral-500">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function FilterDockRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] text-neutral-300 hover:bg-neutral-900">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center text-neutral-500">{icon}</span>
        <span className="truncate font-medium">{label}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const filterDockSelectTriggerClass =
  "h-8 w-[148px] rounded-md border-neutral-800 bg-neutral-900 px-2 text-[12px] text-neutral-100 shadow-none hover:bg-neutral-800 focus-visible:ring-neutral-600";

export const filterDockSelectContentClass =
  "border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl";

export const filterDockSelectItemClass =
  "text-[12px] text-neutral-200 focus:bg-neutral-800 focus:text-neutral-50";
