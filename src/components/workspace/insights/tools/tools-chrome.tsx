"use client";

/**
 * The panel furniture of the Tools tab, matching the platform admin Insights page
 * (`components/admin/insights/insights-dashboard.tsx`): a rounded hairline card, a chart panel's
 * header with no rule under it so the headline figure reads as part of it, and one body per data
 * source that is a skeleton while loading and "Not available yet" when the source cannot be read.
 * Local to the tab so it does not reach into the admin dashboard's private components.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ChartEmpty } from "@/components/admin/charts/time-series-chart";
import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { cn } from "@/lib/utils";

export function ToolsPanel({
  title,
  subtitle,
  link,
  chart = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string } | null;
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

/** A chart body over one source: skeleton, "Not available yet", an empty line, or the chart. */
export function ToolsChartBody<T>({
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
  const t = useTranslations("workspaceInsightsTools");
  let body: ReactNode;
  if (state.status === "loading") {
    body = <div className="animate-pulse rounded-md bg-surface-2" style={{ height }} />;
  } else if (state.status === "unavailable") {
    body = <ChartEmpty height={height}>{t("notAvailable")}</ChartEmpty>;
  } else if (isEmpty(state.data)) {
    body = <ChartEmpty height={height}>{empty}</ChartEmpty>;
  } else {
    body = <div className={cn(state.refreshing && "opacity-60")}>{children(state.data)}</div>;
  }
  return <div className="px-4 pb-3 pt-2">{body}</div>;
}

export function ToolsListEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-ink-muted">{children}</p>;
}

export function ToolsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-4 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-surface-2" />
      ))}
    </div>
  );
}
