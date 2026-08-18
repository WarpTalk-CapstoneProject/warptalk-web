"use client";

/**
 * The shared surface vocabulary for every billing screen.
 *
 * ONE RULE THIS FILE EXISTS TO ENFORCE: no drop shadows. Not on cards, not on rows, not on the
 * modal. Depth here comes from a hairline and a surface change, never from a shadow. Every
 * primitive below therefore carries an explicit `shadow-none` rather than merely omitting a
 * shadow class — `Card`, `DialogContent` and several ui/ primitives ship their own `shadow-*`,
 * so omitting is not the same as refusing, and a component that only omits will quietly grow a
 * shadow the day its base changes.
 *
 * The layout language is lines: a section is a bordered box, and everything inside it is
 * separated by `divide-y divide-hairline` rather than by gaps between floating tiles. That is
 * what makes a column of facts read as one statement instead of six competing objects.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A bordered box with no shadow. The only container these pages use. */
export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-clip rounded-[12px] border border-border bg-surface-1 shadow-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** A section header: title on the left, an optional action on the right. */
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold leading-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

/**
 * A label/value line. The workhorse of the Manage-subscription panel and of every summary list.
 *
 * `divide-y` on the parent draws the rules, so this deliberately has no border of its own —
 * otherwise adjacent rows double the hairline and the stack reads as a table with a heavy grid.
 */
export function Row({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <span className="text-[13px] text-ink-muted">{label}</span>
        {hint ? <p className="mt-0.5 text-[11px] text-ink-subtle">{hint}</p> : null}
      </div>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** A group of `Row`s, ruled rather than spaced. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-hairline">{children}</div>;
}

/**
 * A headline number with its unit and an explanatory line under it — the two boxes at the top of
 * the Cartesia subscription screen.
 */
export function StatCard({
  label,
  value,
  lines,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  /** Short factual lines under the number. Pricing, not prose. */
  lines?: ReactNode[];
  tone?: "default" | "warn";
}) {
  return (
    <Section className="flex flex-col">
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-muted">{label}</span>
          <span
            aria-hidden
            className={cn(
              "size-[7px] rounded-[1px]",
              tone === "warn" ? "bg-amber-500" : "bg-emerald-500",
            )}
          />
        </div>
        <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-ink">
          {value}
        </p>
        {lines?.length ? (
          <div className="mt-3 space-y-1">
            {lines.map((line, index) => (
              <p key={index} className="text-[12px] leading-relaxed text-ink-muted">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * A banner across the top of the subscription page — the "Allow overages" strip.
 *
 * Not a toast and not a card: it states a standing condition and offers the one control that
 * changes it, so it has to sit above the numbers it affects rather than beside them.
 */
export function Banner({
  title,
  badge,
  description,
  action,
}: {
  title: string;
  badge?: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Section>
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
            {badge}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Section>
  );
}

/** A small pill. Used for "Recommended" and "Most popular". */
export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        tone === "accent"
          ? "bg-primary/10 text-primary"
          : "bg-surface-2 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}

type ButtonTone = "primary" | "outline" | "ghost" | "quiet";

/**
 * The one button on these screens.
 *
 * `quiet` is the disabled-looking state the plan grid needs for "Covered by current plan" and
 * "Current plan" — visibly inert without being a real disabled control that a screen reader
 * announces as broken.
 */
export function BillingButton({
  children,
  onClick,
  tone = "outline",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium shadow-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        tone === "primary" &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
        tone === "outline" &&
          "border border-border bg-surface-1 text-ink hover:bg-surface-2",
        tone === "ghost" && "text-ink-muted hover:bg-surface-2 hover:text-ink",
        tone === "quiet" && "bg-surface-2 text-ink-subtle",
        className,
      )}
    >
      {children}
    </button>
  );
}
