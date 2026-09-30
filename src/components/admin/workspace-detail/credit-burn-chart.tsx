"use client";

import { useTranslations } from "next-intl";

import { TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { burnSeries } from "@/lib/admin/workspace-actions";
import type { AdminWorkspaceBurnPointDto } from "@/types/admin-workspace-actions";

const numberFormatter = new Intl.NumberFormat("en-US");
const dayFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const titleFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * The balance the ledger reports after each day (line), with that day's consumption in the
 * readout. Both come from the ledger itself; the balance is never re-derived by summing here.
 * Daily consumption as columns is the page's own usage chart, so it is not drawn twice.
 */
export function CreditBurnChart({ points }: { points: AdminWorkspaceBurnPointDto[] }) {
  const t = useTranslations("adminWorkspaces.burn");
  const series = burnSeries(points);
  const consumed = series.consumed.reduce((sum, value) => sum + value, 0);
  const granted = points.reduce((sum, p) => sum + p.granted, 0);
  const hasBalance = series.balances.some((balance) => balance !== null);

  if (points.length === 0 || (consumed === 0 && granted === 0 && !hasBalance)) {
    return <p className="py-6 text-center text-xs text-ink-muted">{t("empty")}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span>{t("consumedLegend", { credits: numberFormatter.format(consumed) })}</span>
        {granted > 0 ? <span>{t("grantedLegend", { credits: numberFormatter.format(granted) })}</span> : null}
        {hasBalance ? (
          <span className="ml-auto">{t("peakBalance", { credits: numberFormatter.format(series.maxBalance) })}</span>
        ) : null}
      </div>
      <TimeSeriesChart
        className="mt-3"
        variant="line"
        height={140}
        integer
        ariaLabel={t("aria", { days: points.length })}
        labels={points.map((p) => dayFormatter.format(new Date(p.date)))}
        titles={points.map((p) => titleFormatter.format(new Date(p.date)))}
        series={[{ key: "balance", label: t("balanceLegend"), values: series.balances }]}
        formatValue={(value) => numberFormatter.format(value)}
        tooltipFooter={(index) =>
          t("consumedFooter", { credits: numberFormatter.format(series.consumed[index] ?? 0) })
        }
      />
    </div>
  );
}
