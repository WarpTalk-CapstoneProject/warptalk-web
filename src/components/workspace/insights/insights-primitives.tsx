"use client";

/**
 * The building blocks of the workspace Insights page (WT-878), class for class the platform
 * Insights page's (`components/admin/insights/insights-dashboard.tsx`), which keeps them private to
 * its file. Same grammar, so the two pages read as one product: a card is a card, a panel with a
 * chart has no rule under its title, a list row is the whole link.
 *
 * Shared by the three tabs (Overview, Usage, Tools). Every string comes from `workspaceInsights`.
 */

import { Info } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ChartEmpty } from "@/components/admin/charts/time-series-chart";
import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const dataOf = <T,>(state: InsightsSourceState<T>): T | undefined =>
  state.status === "ready" ? state.data : undefined;

export type InsightsTone = "success" | "warning" | "danger" | "neutral";

export const VALUE_TONE_CLASS: Record<InsightsTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-ink",
};

export const DELTA_TONE_CLASS: Record<"success" | "danger" | "neutral", string> = {
  success: "font-semibold text-success",
  danger: "font-semibold text-destructive",
  neutral: "text-ink-muted",
};

const TAG_CLASS: Record<Exclude<InsightsTone, "neutral">, string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
};

export const CARD = "relative block min-w-0 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5";
export const CARD_LINK =
  "transition-colors hover:border-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** The value line of a period card (21px) and of a snapshot card (24px). */
export const PERIOD_VALUE = "mt-2 truncate text-[21px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums";
export const SNAPSHOT_VALUE = "mt-2 truncate text-[24px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums";

export function UpdatedPulse({ updatedAt }: { updatedAt: number }) {
  const t = useTranslations("workspaceInsights");
  return (
    <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-muted">
      <span
        className={cn(
          "size-[7px] rounded-full",
          updatedAt > 0 ? "bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_20%,transparent)]" : "bg-surface-4",
        )}
      />
      {updatedAt > 0
        ? t("common.updated", {
            time: new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          })
        : t("common.loading")}
    </span>
  );
}

export function CardShell({ href, className, children }: { href?: string | null; className?: string; children: ReactNode }) {
  if (href) {
    return (
      <Link href={href} className={cn(CARD, CARD_LINK, className)}>
        {children}
      </Link>
    );
  }
  return <div className={cn(CARD, className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="truncate text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{children}</div>;
}

/**
 * A card's label, with its fine print behind an info icon. The icon sits inside a card that may
 * itself be a link, so a click on it must not navigate.
 */
export function CardLabel({ label, note }: { label: ReactNode; note?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Eyebrow>{label}</Eyebrow>
      {note ? (
        <Tooltip content={note} side="bottom" className="max-w-[320px]">
          <span
            role="img"
            aria-label={note}
            className="-m-1 inline-flex shrink-0 cursor-help rounded p-1 text-ink-subtle outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Info size={13} weight="bold" aria-hidden />
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  link,
  chart = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  /** A chart card: no rule under the title, so the headline figure reads as part of it. */
  chart?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-1", className)}>
      <header className={cn("flex items-start justify-between gap-2.5 px-4", chart ? "pt-3.5" : "border-b border-hairline py-2.5")}>
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {link ? (
          <Link href={link.href} className="shrink-0 whitespace-nowrap text-[11px] text-primary hover:underline">
            {link.label} →
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function SourceBody<T>({
  state,
  height,
  empty,
  isEmpty,
  children,
}: {
  state: InsightsSourceState<T>;
  height: number;
  empty: string;
  isEmpty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  const t = useTranslations("workspaceInsights");
  if (state.status === "loading") {
    return <div className="animate-pulse rounded-md bg-surface-2" style={{ height }} />;
  }
  if (state.status === "unavailable") {
    return <ChartEmpty height={height}>{t("common.notAvailable")}</ChartEmpty>;
  }
  if (isEmpty(state.data)) return <ChartEmpty height={height}>{empty}</ChartEmpty>;
  return <div className={cn(state.refreshing && "opacity-60")}>{children(state.data)}</div>;
}

export function Rows({ children }: { children: ReactNode }) {
  return <ul className="max-h-[252px] overflow-auto">{children}</ul>;
}

export function Row({ href, children }: { href?: string | null; children: ReactNode }) {
  const className = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2.5";
  return (
    <li className="border-b border-hairline last:border-b-0">
      {href ? (
        <Link href={href} className={cn(className, "transition-colors hover:bg-surface-2")}>
          {children}
        </Link>
      ) : (
        <div className={className}>{children}</div>
      )}
    </li>
  );
}

export function RowText({ title, detail }: { title: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0">
      <b className="block truncate text-[13px] font-medium text-ink">{title}</b>
      {detail ? <small className="block truncate text-[11px] text-ink-muted">{detail}</small> : null}
    </div>
  );
}

export function Tag({ tone, children }: { tone: InsightsTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-[7px] py-px text-[10.5px] font-semibold",
        tone === "neutral" ? "bg-surface-2 text-ink-muted" : TAG_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

export function ListEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-ink-muted">{children}</p>;
}

export function ListState<T>({ state, children }: { state: InsightsSourceState<T>; children: (data: T) => ReactNode }) {
  const t = useTranslations("workspaceInsights");
  if (state.status === "loading") {
    return (
      <div className="space-y-2 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    );
  }
  if (state.status === "unavailable") return <ListEmpty>{t("common.notAvailable")}</ListEmpty>;
  return <>{children(state.data)}</>;
}
