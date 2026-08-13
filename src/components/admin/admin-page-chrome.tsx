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

import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
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
 * One filter-tab style for the whole portal — and now for the whole app.
 *
 * There were three here: a grey `bg-surface-2` pill on Workspaces, shadcn `Tabs` on Billing, and
 * an indigo-filled pill on Global Glossary. This unified them on an ink-filled chip, which was
 * right at the time and still left the portal looking unlike Meetings, the page the team
 * actually looks at. So the decision moved up one level: `FilterChip` owns the appearance and
 * this keeps the API, which is why the knowledge page and both admin tables changed with it and
 * no caller had to.
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
    <FilterChipGroup label={label} trailing={trailing} className="border-b border-border py-3">
      {tabs.map((tab) => (
        <FilterChip
          key={tab.value}
          selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </FilterChip>
      ))}
    </FilterChipGroup>
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
