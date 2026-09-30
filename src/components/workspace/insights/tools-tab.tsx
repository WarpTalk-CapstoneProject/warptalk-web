"use client";

/**
 * Workspace Insights → Tools: what WarpBot's plugin tools did in the selected period. WT-878.
 *
 * Everything on the tab is counted from the plugin audit log — the same rows the Plugin activity
 * page lists — read for the period by `useWorkspaceToolInsights` and reduced by
 * `lib/workspace/insights/tools-metrics`. No figure is seeded or defaulted: no calls is "No calls
 * yet" and a "—" success rate; a read that hit its page cap says "at least N".
 *
 * Sources degrade separately: the audit log unavailable (a 403, an error) turns the summary, both
 * charts and the trail into "Not available yet"; the member list unavailable only turns names into
 * "Member"; the plugin catalog unavailable only shows plugin keys instead of labels.
 */

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import type { InsightsSourceState, InsightsTabProps } from "@/components/workspace/insights/insights-types";
import { ToolsAuditTrail, type AuditTrailData } from "@/components/workspace/insights/tools/tools-audit-trail";
import { ToolCallsByPluginPanel, ToolOutcomesPerDayPanel } from "@/components/workspace/insights/tools/tools-charts";
import { toolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { ToolsSummaryLine } from "@/components/workspace/insights/tools/tools-summary-line";
import { useWorkspaceToolInsights } from "@/hooks/use-workspace-tool-insights";
import { toPluginActivityRows, type PluginActivityRow } from "@/lib/assistant/plugin-activity";
import { toolsMetrics, type ToolsMetrics } from "@/lib/workspace/insights/tools-metrics";

export function ToolsTab({ workspaceId, workspaceSlug, period, timeZone, updatedAt }: InsightsTabProps) {
  const tActivity = useTranslations("settingsPluginActivity");
  const locale = useLocale();
  const sources = useWorkspaceToolInsights({ workspaceId, period });
  const format = useMemo(() => toolsFormatters(locale, timeZone), [locale, timeZone]);

  const { audits, members, plugins } = sources;

  // The figures wait for the plugin catalog too, so labels do not flip from keys to names; the
  // catalog failing is not a reason to hide them.
  const metricsState = useMemo<InsightsSourceState<ToolsMetrics<PluginActivityRow>>>(() => {
    if (audits.status !== "ready") return audits;
    if (plugins.status === "loading") return { status: "loading" };
    const catalog = plugins.status === "ready" ? plugins.data : [];
    const memberList = members.status === "ready" ? members.data : [];
    const rows = toPluginActivityRows(audits.data.rows, memberList, catalog, (key) => tActivity(key)).map((row) =>
      // Without the member list "not found" means "not known", not "left the workspace".
      members.status === "ready" ? row : { ...row, memberLabel: tActivity("memberFallback"), isFormerMember: false },
    );
    const data = toolsMetrics(rows, {
      from: period.from,
      to: period.to,
      timeZone,
      axisEndDay: period.axisEndDay,
      capped: audits.data.capped,
    });
    return { status: "ready", data, refreshing: audits.refreshing };
  }, [audits, plugins, members, period.from, period.to, period.axisEndDay, timeZone, tActivity]);

  // The trail also waits for names, so a member is never shown as "Former member" for a moment.
  const trailState: InsightsSourceState<AuditTrailData> =
    metricsState.status !== "ready"
      ? metricsState
      : members.status === "loading"
        ? { status: "loading" }
        : {
            status: "ready",
            refreshing: metricsState.refreshing,
            data: {
              rows: metricsState.data.rows,
              capped: metricsState.data.capped,
              readCount: audits.status === "ready" ? audits.data.rows.length : 0,
            },
          };

  const nowMs = updatedAt > 0 ? updatedAt : period.to.getTime();
  const periodKey = `${period.from.getTime()}-${period.to.getTime()}`;

  return (
    <div className="flex flex-col gap-3.5">
      <ToolsSummaryLine
        state={metricsState}
        format={format}
        nowMs={nowMs}
        pluginsHref={workspaceSlug ? `/${workspaceSlug}/settings/plugins` : null}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <ToolCallsByPluginPanel state={metricsState} format={format} />
        <ToolOutcomesPerDayPanel state={metricsState} format={format} />
      </div>
      {/* Keyed on the period so a new period starts on its first page. */}
      <ToolsAuditTrail
        key={periodKey}
        state={trailState}
        format={format}
        workspaceSlug={workspaceSlug}
        onRetry={sources.refetchAudits}
      />
    </div>
  );
}
