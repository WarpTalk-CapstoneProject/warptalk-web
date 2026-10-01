"use client";

/**
 * Every WarpBot tool call of the period, with the same columns and outcome pills as the Plugin
 * activity page (`settings/plugin-activity`), 50 to a page.
 *
 * The rows are the ones the tab already read for its figures, filtered to the period, so the list
 * and the charts above it always describe the same calls. When that read stopped at its cap, the
 * last page says so and points at the Plugin activity page, which pages the whole log.
 *
 * As on that page, the tool's arguments are never shown (the server does not send them); the only
 * detail beyond who/what/when/outcome is the provider's resource id.
 */

import { ArrowSquareOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { ToolsListEmpty, ToolsListSkeleton, ToolsPanel } from "@/components/workspace/insights/tools/tools-chrome";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { WorkspaceSecondaryButton } from "@/components/workspace/page-chrome";
import type { PluginActivityRow, PluginActivityTone } from "@/lib/assistant/plugin-activity";
import { cn } from "@/lib/utils";

export const AUDIT_TRAIL_PAGE_SIZE = 50;

/** The Plugin activity page's pills, so an outcome looks the same on both pages. */
const TONE_CLASSES: Record<PluginActivityTone, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  blocked: "border-hairline bg-surface-2 text-ink-muted",
  attention: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-destructive/25 bg-destructive/10 text-destructive",
};

export interface AuditTrailData {
  /** The period's calls, newest first. */
  rows: PluginActivityRow[];
  capped: boolean;
  /** How many rows the capped read covered, for the "newest N" note. */
  readCount: number;
}

export function ToolsAuditTrail({
  state,
  format,
  workspaceSlug,
  onRetry,
}: {
  state: InsightsSourceState<AuditTrailData>;
  format: ToolsFormatters;
  workspaceSlug: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("workspaceInsightsTools.audit");
  const tRoot = useTranslations("workspaceInsightsTools");
  const tActivity = useTranslations("settingsPluginActivity");
  const [page, setPage] = useState(0);

  const pluginsHref = workspaceSlug ? `/${workspaceSlug}/settings/plugins` : null;
  const activityHref = workspaceSlug ? `/${workspaceSlug}/settings/plugin-activity` : null;

  let body: ReactNode;
  let footer: ReactNode = null;

  if (state.status === "loading") {
    body = <ToolsListSkeleton rows={4} />;
  } else if (state.status === "unavailable") {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-[12px] text-ink-muted">{tRoot("notAvailable")}</p>
        {onRetry ? <WorkspaceSecondaryButton onClick={onRetry}>{tRoot("retry")}</WorkspaceSecondaryButton> : null}
      </div>
    );
  } else if (state.data.rows.length === 0) {
    body = <ToolsListEmpty>{t("empty")}</ToolsListEmpty>;
  } else {
    const { rows, capped, readCount } = state.data;
    const pageCount = Math.max(1, Math.ceil(rows.length / AUDIT_TRAIL_PAGE_SIZE));
    const current = Math.min(page, pageCount - 1);
    const start = current * AUDIT_TRAIL_PAGE_SIZE;
    const visible = rows.slice(start, start + AUDIT_TRAIL_PAGE_SIZE);
    const range = {
      start: format.count(start + 1),
      end: format.count(start + visible.length),
      total: format.count(rows.length),
    };

    body = (
      <div className={cn("overflow-x-auto transition-opacity", state.refreshing && "opacity-60")}>
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              <th scope="col" className="px-4 py-2.5 font-semibold">{tActivity("table.time")}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{tActivity("table.member")}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{tActivity("table.plugin")}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{tActivity("table.tool")}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{tActivity("table.result")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {visible.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted" title={row.createdAt}>
                  {format.dateTime(row.createdAt)}
                </td>
                <td className="max-w-[200px] px-4 py-3">
                  <span className="block truncate text-ink">{row.memberLabel}</span>
                  {row.isFormerMember ? (
                    <span className="text-[11px] text-ink-subtle">{tActivity("noLongerMember")}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink">{row.pluginLabel}</td>
                <td className="max-w-[220px] px-4 py-3">
                  <span className="block truncate text-ink" title={row.toolName}>
                    {row.toolLabel}
                  </span>
                  {row.providerResourceRef ? (
                    <span className="block truncate font-mono text-[11px] text-ink-subtle" title={row.providerResourceRef}>
                      {row.providerResourceRef}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          TONE_CLASSES[row.outcome.tone],
                        )}
                      >
                        {row.outcome.label}
                      </span>
                      {row.outcome.code ? (
                        <span className="font-mono text-[11px] text-ink-subtle">{row.outcome.code}</span>
                      ) : null}
                    </div>
                    {row.outcome.hint ? (
                      <p className="max-w-[280px] text-[11px] leading-4 text-ink-muted">{row.outcome.hint}</p>
                    ) : null}
                    {(row.outcome.tone === "blocked" || row.outcome.tone === "attention") && pluginsHref ? (
                      <Link
                        href={pluginsHref}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        {tActivity("managePlugins")}
                        <ArrowSquareOut size={12} />
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    footer = (
      <footer className="flex flex-col gap-2 border-t border-hairline px-4 py-2.5">
        {capped && current === pageCount - 1 ? (
          <p className="text-[11px] text-warning">
            {t("cappedNote", { count: readCount })}{" "}
            {activityHref ? (
              <Link href={activityHref} className="whitespace-nowrap text-primary hover:underline">
                {t("openActivity")} →
              </Link>
            ) : null}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] tabular-nums text-ink-muted">
            {capped ? t("showingAtLeast", range) : t("showing", range)}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <WorkspaceSecondaryButton onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>
                {tActivity("previous")}
              </WorkspaceSecondaryButton>
              <WorkspaceSecondaryButton
                onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
                disabled={current >= pageCount - 1}
              >
                {tActivity("next")}
              </WorkspaceSecondaryButton>
            </div>
          ) : null}
        </div>
      </footer>
    );
  }

  return (
    <ToolsPanel title={t("title")} subtitle={t("subtitle")} link={activityHref ? { href: activityHref, label: t("openActivity") } : null}>
      {body}
      {footer}
    </ToolsPanel>
  );
}
