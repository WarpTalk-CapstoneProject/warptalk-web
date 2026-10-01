"use client";

/**
 * One line, not a row of cards (like the admin page's Cartesia line): whether WarpBot's tools are
 * healthy this period, and the handful of counts that say why. Every call counts — built-in, web
 * search and plugin. Amber when anything failed or needs setup; a policy refusal alone is the
 * workspace's own switch working, so it does not turn it amber.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import { lastToolCallAt, toolSuccessRate } from "@/lib/workspace/insights/tool-insights";
import { toolsHealth } from "@/lib/workspace/insights/tools-metrics";
import { cn } from "@/lib/utils";
import type { WorkspaceToolInsightsDto } from "@/types/assistant-tool-insights";

export function ToolsSummaryLine({
  state,
  format,
  nowMs,
  pluginsHref,
}: {
  state: InsightsSourceState<WorkspaceToolInsightsDto>;
  format: ToolsFormatters;
  nowMs: number;
  pluginsHref: string | null;
}) {
  const t = useTranslations("workspaceInsightsTools.summary");
  const tRoot = useTranslations("workspaceInsightsTools");
  const data = state.status === "ready" ? state.data : null;
  const health = data ? toolsHealth(data.totals) : null;
  const warn = health === "attention";

  let status: string;
  let detail: ReactNode;
  if (state.status === "loading") {
    status = "—";
    detail = <span aria-hidden className="inline-block h-3.5 w-64 max-w-full animate-pulse rounded bg-surface-2" />;
  } else if (!data || !health) {
    status = "—";
    detail = <span className="text-ink-muted">{tRoot("notAvailable")}</span>;
  } else if (health === "idle") {
    status = t("status.idle");
    detail = <span className="text-ink-muted">{t("idleHint")}</span>;
  } else {
    const { totals } = data;
    const rate = toolSuccessRate(totals);
    const last = lastToolCallAt(data.byTool);
    status = t(`status.${health}`);
    const parts = [
      t("calls", { count: totals.calls }),
      rate === null ? null : t("successRate", { rate: format.percent(rate) }),
      totals.blocked > 0 ? t("blocked", { count: totals.blocked }) : null,
      totals.needsSetup > 0 ? t("needsSetup", { count: totals.needsSetup }) : null,
      totals.error > 0 ? t("failed", { count: totals.error }) : null,
      totals.medianDurationMs === null ? null : t("medianDuration", { duration: format.duration(totals.medianDurationMs) }),
      last ? t("lastCall", { time: format.ago(last, nowMs) }) : null,
    ].filter(Boolean);
    detail = <span className="text-ink-muted">{parts.join(" · ")}</span>;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl border px-4 py-2.5 text-[12px] tabular-nums",
        warn ? "border-warning/40 bg-warning/10" : "border-hairline bg-surface-1",
        state.status === "ready" && state.refreshing && "opacity-60",
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("label")}</span>
      <span className={cn("font-semibold", warn ? "text-warning" : health === "healthy" ? "text-success" : "text-ink")}>{status}</span>
      {detail}
      {pluginsHref ? (
        <Link href={pluginsHref} className="ml-auto whitespace-nowrap text-[11px] text-primary hover:underline">
          {t("pluginsLink")} →
        </Link>
      ) : null}
    </div>
  );
}
