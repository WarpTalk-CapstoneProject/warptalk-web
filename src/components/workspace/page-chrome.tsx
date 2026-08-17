"use client";

/**
 * The page furniture every WORKSPACE screen uses.
 *
 * There were five different answers to "what does a page look like" in here, and
 * `admin-page-chrome.tsx` documented them rather than fixing them:
 *
 *   history, rooms/[id]              30px semibold title
 *   billing                          24px black, text-gray-900 hardcoded
 *   dashboard, settings              20px bold
 *   advanced                         30px bold, destructive red
 *   rooms, members, documents, home  no page title at all
 *
 * The last row is the one that wins, because it is the one the owner recognises as the product:
 * Meetings and Members open straight onto their content, with a single compact toolbar of filter
 * pills on the left and actions on the right. The route name is already in the top bar and the
 * sidebar — a 30px `<h1>Knowledge</h1>` under a breadcrumb that reads "knowledge" is the same word
 * three times, and the paragraph under it is documentation living in the furniture.
 *
 * So: no page title, no description, no eyebrow, and the page's own background is
 * `bg-surface-1` — not a panel floating on a grey wash, which is what made Knowledge and Billing
 * read as bolted on from somewhere else.
 *
 * ADMIN PAGES KEEP THEIR OWN CHROME. `/admin/*` is a different product surface with a different
 * subject (the whole platform, not one workspace) and its title block orients someone who arrived
 * from outside a workspace. This file is deliberately not that one.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The page frame: full height, its own background, content scrolls inside rather than the window.
 */
export function WorkspacePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-surface-1 text-ink", className)}>
      {children}
    </div>
  );
}

/**
 * The one row above the content: filters left, actions right.
 *
 * `flex-wrap` and a real minimum width on the filter group are both load-bearing. This row has to
 * survive a narrow main — with both side panels open the content area is under 500px — and the
 * action group is shrink-0. With a floor of zero, flexbox shrinks the pills to nothing instead of
 * wrapping the row; Members hit exactly that and the pills were allotted 14px.
 */
export function WorkspaceToolbar({
  filters,
  actions,
  className,
}: {
  /** Filter pills, tabs, a day strip — whatever narrows what is below. */
  filters?: ReactNode;
  /** Search, icon buttons, the primary action. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-[260px] flex-1 items-center gap-2 overflow-x-auto hide-scrollbar">
        {filters}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 pl-4">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * One filter pill. Selected fills with `surface-2` rather than the accent colour — a filter is a
 * choice, not an action, and spending the accent on it leaves nothing louder for the primary
 * button beside it.
 */
export function WorkspaceFilterPill({
  label,
  selected,
  onClick,
  count,
  icon,
}: {
  label: ReactNode;
  selected: boolean;
  onClick: () => void;
  /** Rendered only when non-zero: a badge reading "0" is noise pretending to be information. */
  count?: number;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition-all select-none",
        selected
          ? "border-transparent bg-surface-2 font-medium text-foreground shadow-none"
          : "border-border/40 bg-transparent text-muted-foreground hover:border-border/60 hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {count ? (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** The 28px circular icon button the toolbars use for search/filter/display affordances. */
export function WorkspaceIconButton({
  title,
  onClick,
  children,
  dotted = false,
  disabled = false,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
  /** Shows the "a filter is active" dot. */
  dotted?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
    >
      {children}
      {dotted && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />}
    </button>
  );
}

/** The dark pill that is a page's single primary action. At most one per toolbar. */
export function WorkspacePrimaryButton({
  onClick,
  children,
  icon,
  disabled = false,
  type = "button",
}: {
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

/** A secondary pill action — outlined, sits left of the primary one. */
export function WorkspaceSecondaryButton({
  onClick,
  children,
  icon,
  disabled = false,
}: {
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

/** A vertical rule separating action groups in a toolbar. */
export function WorkspaceToolbarDivider() {
  return <div className="mx-1 h-4 w-[1px] shrink-0 bg-border" />;
}

/** The scrolling region under the toolbar. */
export function WorkspaceBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-auto px-4 pb-6", className)}>{children}</div>
  );
}

/**
 * The empty state, in one shape.
 *
 * Every page had drawn its own: some a dashed box, some a bare centred paragraph, some a card
 * with an illustration. The dashed box is Members' and Meetings', and it reads as a place
 * something will appear rather than as an error.
 */
export function WorkspaceEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[192px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-1/10 p-8 text-center">
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-[420px] text-xs text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * A titled block INSIDE a page — Billing's "Payment method", the dashboard's charts. Distinct from
 * a page header: it is a card with a 15px heading, not a 30px page title, so a page made of four
 * of them does not read as four pages stacked.
 *
 * The card is `bg-surface-1` — the SAME white as the page under it, separated by its border alone.
 * It was `bg-canvas`, a grey fill, and the owner's complaint was that the cards read as grey
 * patches on a white page. White-on-white with a hairline is the shape every reference surface
 * uses; it also keeps a card from looking like a disabled input. Nested boxes INSIDE a card
 * (hint blocks, icon tiles, progress tracks) still take a grey — that contrast is what gives them
 * their level, and it only works while the card itself is white.
 */
export function WorkspaceSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-border bg-surface-1 p-4 shadow-linear",
        className,
      )}
    >
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
