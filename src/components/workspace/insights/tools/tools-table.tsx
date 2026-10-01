"use client";

/**
 * Every tool WarpBot called in the period — built-in, web search and plugin — one row per tool,
 * most called first, with a source chip in front and chips above to filter by source.
 *
 * Counts only: the server records no argument or result text for any call, so there is nothing
 * else to show. The per-call record (who, when, which plugin account) stays on Plugin activity,
 * which pages the plugin audit log; a plugin tool with calls that need setup or were blocked
 * links there, with a line saying who acts on it — the member for setup, the Owner for policy.
 */

import { ArrowSquareOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import { TOOL_SOURCE_COLORS } from "@/components/workspace/insights/tools/tools-charts";
import { ToolsListEmpty, ToolsListSkeleton, ToolsPanel } from "@/components/workspace/insights/tools/tools-chrome";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { WorkspaceSecondaryButton } from "@/components/workspace/page-chrome";
import {
  filterToolRows,
  sourceChips,
  type ToolSourceFilter,
  type ToolSourceKey,
  type ToolTableRow,
} from "@/lib/workspace/insights/tools-metrics";
import { cn } from "@/lib/utils";
import type { ToolInsightsSourceDto } from "@/types/assistant-tool-insights";

export interface ToolsTableData {
  rows: ToolTableRow[];
  bySource: ToolInsightsSourceDto[];
  totalCalls: number;
}

const CHIP =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-ink";

function SourceChip({ source, label }: { source: ToolSourceKey; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
      <i aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: TOOL_SOURCE_COLORS[source] }} />
      {label}
    </span>
  );
}

function Count({ value, text, tone }: { value: number; text: string; tone?: "warning" | "danger" }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        value === 0 ? "text-ink-subtle" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-ink",
      )}
    >
      {text}
    </span>
  );
}

export function ToolsTable({
  state,
  format,
  activityHref,
  nowMs,
  onRetry,
}: {
  state: InsightsSourceState<ToolsTableData>;
  format: ToolsFormatters;
  activityHref: string | null;
  nowMs: number;
  onRetry?: () => void;
}) {
  const t = useTranslations("workspaceInsightsTools");
  const [filter, setFilter] = useState<ToolSourceFilter>("all");

  let chips: ReactNode = null;
  let body: ReactNode;

  if (state.status === "loading") {
    body = <ToolsListSkeleton rows={4} />;
  } else if (state.status === "unavailable") {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-[12px] text-ink-muted">{t("notAvailable")}</p>
        {onRetry ? <WorkspaceSecondaryButton onClick={onRetry}>{t("retry")}</WorkspaceSecondaryButton> : null}
      </div>
    );
  } else if (state.data.rows.length === 0) {
    body = <ToolsListEmpty>{t("table.empty")}</ToolsListEmpty>;
  } else {
    const available = sourceChips(state.data.bySource, state.data.totalCalls);
    // A chip that disappears with a new period falls back to "All" rather than an empty table.
    const active = available.some((chip) => chip.key === filter) ? filter : "all";
    const visible = filterToolRows(state.data.rows, active);

    chips =
      available.length > 2 ? (
        <div role="group" aria-label={t("table.chipsLabel")} className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-2.5">
          {available.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active === chip.key}
              onClick={() => setFilter(chip.key)}
              className={cn(CHIP, "border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink")}
            >
              {chip.key === "all" ? null : (
                <i aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: TOOL_SOURCE_COLORS[chip.key] }} />
              )}
              {chip.key === "all" ? t("table.all") : t(`sources.${chip.key}`)}
              <span className="tabular-nums text-ink-subtle">{format.count(chip.calls)}</span>
            </button>
          ))}
        </div>
      ) : null;

    body = (
      <div className={cn("overflow-x-auto transition-opacity", state.refreshing && "opacity-60")}>
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              <th scope="col" className="px-4 py-2.5 font-semibold">{t("table.columns.tool")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{t("table.columns.source")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.calls")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.success")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.needsSetup")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.blocked")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.failed")}</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t("table.columns.median")}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{t("table.columns.lastCall")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {visible.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="max-w-[260px] px-4 py-3">
                  <span className="block truncate text-ink" title={row.tool}>
                    {row.label}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-ink-subtle">
                    {row.pluginLabel ? `${row.pluginLabel} · ${row.tool}` : row.tool}
                  </span>
                  {row.fixer && activityHref ? (
                    <div className="mt-1 flex flex-col gap-0.5">
                      <p className="text-[11px] leading-4 text-ink-muted">
                        {row.fixer === "member" ? t("table.fixMember") : t("table.fixOwner")}
                      </p>
                      <Link
                        href={activityHref}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        {t("table.whoToFix")}
                        <ArrowSquareOut size={12} />
                      </Link>
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <SourceChip source={row.source} label={t(`sources.${row.source}`)} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink">{format.count(row.calls)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ink">
                  {row.successRate === null ? "—" : format.percent(row.successRate)}
                </td>
                <td className="px-3 py-3 text-right">
                  <Count value={row.needsSetup} text={format.count(row.needsSetup)} tone="warning" />
                </td>
                <td className="px-3 py-3 text-right">
                  <Count value={row.blocked} text={format.count(row.blocked)} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Count value={row.error} text={format.count(row.error)} tone="danger" />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-ink-muted">{format.duration(row.medianDurationMs)}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted" title={row.lastCalledAt ?? undefined}>
                  {row.lastCalledAt ? format.ago(row.lastCalledAt, nowMs) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ToolsPanel
      title={t("table.title")}
      subtitle={t("table.subtitle")}
      link={activityHref ? { href: activityHref, label: t("table.openActivity") } : null}
    >
      {chips}
      {body}
    </ToolsPanel>
  );
}
