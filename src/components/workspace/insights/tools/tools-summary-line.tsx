"use client";

/**
 * One line, not a row of cards (like the admin page's Cartesia line): whether WarpBot's tools are
 * healthy this period, and the handful of counts that say why. Amber when anything failed or needs
 * setup — a policy refusal alone is the workspace's own switch working, so it does not turn it amber.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import type { ToolsFormatters } from "@/components/workspace/insights/tools/tools-format";
import type { ToolsMetrics } from "@/lib/workspace/insights/tools-metrics";
import { cn } from "@/lib/utils";

export function ToolsSummaryLine({
  state,
  format,
  nowMs,
  pluginsHref,
}: {
  state: InsightsSourceState<ToolsMetrics>;
  format: ToolsFormatters;
  nowMs: number;
  pluginsHref: string | null;
}) {
  const t = useTranslations("workspaceInsightsTools.summary");
  const tRoot = useTranslations("workspaceInsightsTools");
  const metrics = state.status === "ready" ? state.data : null;
  const warn = metrics?.health === "attention";

  let status: string;
  let detail: ReactNode;
  if (state.status === "loading") {
    status = "—";
    detail = <span aria-hidden className="inline-block h-3.5 w-64 animate-pulse rounded bg-surface-2" />;
  } else if (state.status === "unavailable" || !metrics) {
    status = "—";
    detail = <span className="text-ink-muted">{tRoot("notAvailable")}</span>;
  } else if (metrics.calls === 0) {
    status = t("status.idle");
    detail = <span className="text-ink-muted">{t("idleHint")}</span>;
  } else {
    status = t(`status.${metrics.health}`);
    const parts = [
      metrics.capped ? t("callsAtLeast", { count: metrics.calls }) : t("calls", { count: metrics.calls }),
      metrics.successRate === null ? null : t("successRate", { rate: format.percent(metrics.successRate) }),
      t("blocked", { count: metrics.blocked }),
      t("needsSetup", { count: metrics.needsSetup }),
      metrics.failed > 0 ? t("failed", { count: metrics.failed }) : null,
      metrics.lastCallAt ? t("lastCall", { time: format.ago(metrics.lastCallAt, nowMs) }) : null,
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
      <span className={cn("font-semibold", warn ? "text-warning" : metrics?.health === "healthy" ? "text-success" : "text-ink")}>
        {status}
      </span>
      {detail}
      {pluginsHref ? (
        <Link href={pluginsHref} className="ml-auto whitespace-nowrap text-[11px] text-primary hover:underline">
          {t("pluginsLink")} →
        </Link>
      ) : null}
    </div>
  );
}
