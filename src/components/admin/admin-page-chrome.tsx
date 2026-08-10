"use client";

/**
 * The page furniture every /admin screen uses, so the platform pages look like the workspace
 * pages they sit beside — same measure, same title, same tabs, just a wider subject.
 *
 * The style is not invented here. It is copied from `[workspaceSlug]/history` and the room
 * detail page: a 1480px measure, a small muted eyebrow, a 30px semibold title, and filter tabs
 * that fill with `bg-ink` when selected. Those two are the most recently worked-over pages in
 * the app and they agree with each other.
 *
 * They are also, notably, the only ones that do. Measured across the workspace:
 *
 *   history, rooms/[id]   30px semibold          <- copied here
 *   billing               24px black, text-gray-900 hardcoded (breaks dark mode)
 *   dashboard, settings   20px bold
 *   advanced              30px bold, destructive red
 *   rooms, members, documents, home   no page title at all
 *
 * So "match the workspace pages" had no single answer until one was picked. This file is where
 * it is picked, which is the point of it existing: the next admin page inherits the decision
 * instead of taking a sixth guess.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The measure. Wider than a document, because these pages are tables about a whole platform. */
export function AdminPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("min-h-full bg-canvas text-ink", className)}>
      <div className="mx-auto w-full max-w-[1480px] px-5 py-6 lg:px-8">{children}</div>
    </main>
  );
}

export function AdminPageHeader({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  actions,
}: {
  /** Names the area, not the page — "Platform directory", not "Workspaces". */
  eyebrow: string;
  eyebrowIcon?: ReactNode;
  title: string;
  description?: string;
  /** Search field, refresh button, primary action. Sits bottom-aligned with the title. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-ink-muted">
          {eyebrowIcon}
          {eyebrow}
        </div>
        <h1 className="text-[30px] font-semibold leading-none tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[13px] text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export type AdminTab<T extends string> = { value: T; label: string };

/**
 * One filter-tab style for the whole portal.
 *
 * There were three: a grey `bg-surface-2` pill on Workspaces, shadcn `Tabs` on Billing, and an
 * indigo-filled pill on Global Glossary. This is the workspace pages' own — selected fills with
 * ink, which reads as "chosen" without spending the accent colour on a filter.
 */
export function AdminFilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  trailing,
}: {
  tabs: readonly AdminTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** For screen readers: what these tabs filter. */
  label: string;
  /** Right-aligned counter or status, e.g. "12 workspaces". */
  trailing?: ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b border-border py-3"
      role="tablist"
      aria-label={label}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "h-7 shrink-0 rounded-md px-3 text-[11px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            value === tab.value
              ? "bg-ink text-surface-1"
              : "text-ink-muted hover:bg-surface-2 hover:text-ink",
          )}
        >
          {tab.label}
        </button>
      ))}
      {trailing ? (
        <span className="ml-auto shrink-0 pl-3 text-[10px] tabular-nums text-ink-subtle">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

/** A bordered panel, matching the one the history page wraps its results in. */
export function AdminPanel({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface-1",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}
