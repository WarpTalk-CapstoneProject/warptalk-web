"use client";

/**
 * WT-692: the top of /admin/billing, rebuilt for an investor reading it — revenue, active accounts
 * and active workspaces over time, user growth — with credit consumption moved below it as the
 * secondary view.
 *
 * No new data source: the same Insights endpoints /admin already reads (billing, users,
 * workspaces, snapshot), over the last six local months. Revenue is paid payments with the Stripe
 * cs_/in_ twin skipped, exactly as the Insights service counts it. Every figure the server could
 * not compute arrives as null and is shown as "—" / a gap, never as 0; each chart degrades on its
 * own when its source fails or predates the series.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { ChartEmpty, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import {
  useAdminBillingInsights,
  useAdminBillingSnapshot,
  useAdminUsersInsights,
  useAdminWorkspacesInsights,
} from "@/hooks/use-admin-insights";
import { completedMonthGrowth, growthWindow, mergeGrowthMonths } from "@/lib/admin/billing-growth";
import { browserTimeZone, monthKeyLabel } from "@/lib/admin/insights-period";
import { compactMoney } from "@/lib/admin/chart-scale";
import {
  computeDelta,
  deltaText,
  deltaTone,
  formatInsightValue,
} from "@/lib/admin/insights-metrics";
import { cn } from "@/lib/utils";
import type { InsightsMetric, InsightsQuery } from "@/types/admin-insights";

const money = (value: number) => formatInsightValue(value, "money");
const moneyAxis = (value: number) => compactMoney(value, "VND");
const count = (value: number) => formatInsightValue(value, "count");

function metricOf(metrics: InsightsMetric[] | undefined, id: string): InsightsMetric | undefined {
  return metrics?.find((metric) => metric.id === id);
}

function Tile({
  label,
  value,
  detail,
  delta,
}: {
  label: string;
  value: string;
  detail?: string | null;
  delta?: { text: string; good: boolean | null } | null;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p className="mt-1 truncate text-[22px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-subtle">
        {delta ? (
          <span
            className={cn(
              "font-medium",
              delta.good === true && "text-emerald-600 dark:text-emerald-400",
              delta.good === false && "text-destructive",
            )}
          >
            {delta.text}
          </span>
        ) : null}
        {detail ? <span>{detail}</span> : null}
      </p>
    </div>
  );
}

function Panel({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-hairline bg-surface-1 p-4", className)}>
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {note ? <p className="mt-0.5 text-[11px] text-ink-subtle">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function BillingGrowthOverview() {
  const t = useTranslations("adminBillingLedger.growth");
  // Fixed once per mount: the six-month window and the zone its months are local to.
  const [query] = useState<InsightsQuery>(() => {
    const { from, to } = growthWindow(new Date());
    return { from: from.toISOString(), to: to.toISOString(), compare: "previous", tz: browserTimeZone() };
  });

  const billing = useAdminBillingInsights(query);
  const users = useAdminUsersInsights(query);
  const workspaces = useAdminWorkspacesInsights(query);
  const snapshot = useAdminBillingSnapshot(query.tz);

  const rows = useMemo(
    () =>
      mergeGrowthMonths({
        billing: billing.data ?? null,
        users: users.data ?? null,
        workspaces: workspaces.data ?? null,
      }),
    [billing.data, users.data, workspaces.data],
  );
  const labels = rows.map((row) => monthKeyLabel(row.month));

  const periodDelta = (metric: InsightsMetric | undefined) => {
    if (!metric) return null;
    const delta = computeDelta(metric.value, metric.previous);
    if (delta.kind === "none") return null;
    const tone = deltaTone(delta, metric.higherIsBetter);
    return {
      text: t("vsPrevious", { delta: deltaText(delta) }),
      good: tone === "success" ? true : tone === "danger" ? false : null,
    };
  };

  const revenue = metricOf(billing.data?.metrics, "revenue");
  const activeWorkspaces = metricOf(billing.data?.metrics, "activeWorkspaces");
  const activeUsers = metricOf(users.data?.metrics, "activeUsers");
  const newUsers = metricOf(users.data?.metrics, "newUsers");
  const lastTotalUsers = [...rows].reverse().find((row) => row.totalUsers != null)?.totalUsers ?? null;
  const userGrowth = completedMonthGrowth(rows, (row) => row.totalUsers);

  const hasRevenue = rows.some((row) => row.revenue != null);
  const hasActive = rows.some((row) => row.activeUsers != null || row.activeWorkspaces != null);
  const hasUsers = rows.some((row) => row.totalUsers != null);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          label={t("tiles.revenue")}
          value={formatInsightValue(revenue?.value, "money")}
          delta={periodDelta(revenue)}
          detail={revenue?.note ?? t("tiles.sixMonths")}
        />
        <Tile
          label={t("tiles.mrr")}
          value={formatInsightValue(snapshot.data?.mrr, "money")}
          detail={
            snapshot.data
              ? snapshot.data.mrrNote ?? t("tiles.activeSubscriptions", { count: snapshot.data.activeSubscriptions })
              : null
          }
        />
        <Tile
          label={t("tiles.activeWorkspaces")}
          value={formatInsightValue(activeWorkspaces?.value, "count")}
          delta={periodDelta(activeWorkspaces)}
          detail={t("tiles.activeWorkspacesDetail")}
        />
        <Tile
          label={t("tiles.activeAccounts")}
          value={formatInsightValue(activeUsers?.value, "count")}
          delta={periodDelta(activeUsers)}
          detail={t("tiles.activeAccountsDetail")}
        />
        <Tile
          label={t("tiles.totalUsers")}
          value={formatInsightValue(lastTotalUsers, "count")}
          delta={
            userGrowth?.percent != null
              ? {
                  text: t("monthGrowth", {
                    percent: `${userGrowth.percent >= 0 ? "+" : ""}${userGrowth.percent.toFixed(1)}%`,
                    month: monthKeyLabel(userGrowth.month),
                  }),
                  good: userGrowth.percent >= 0,
                }
              : null
          }
          detail={newUsers ? t("tiles.newUsers", { count: formatInsightValue(newUsers.value, "count") }) : null}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("revenueTitle")} note={billing.data?.revenueByMonthNote ?? t("revenueNote")}>
          {billing.isError ? (
            <ChartEmpty height={220}>{t("unavailable")}</ChartEmpty>
          ) : !hasRevenue ? (
            <ChartEmpty height={220}>{billing.isPending ? t("loading") : t("noData")}</ChartEmpty>
          ) : (
            <TimeSeriesChart
              variant="bar"
              ariaLabel={t("revenueTitle")}
              labels={labels}
              series={[{ key: "revenue", label: t("tiles.revenue"), values: rows.map((row) => row.revenue) }]}
              formatValue={money}
              formatAxis={moneyAxis}
            />
          )}
        </Panel>

        <Panel title={t("activeTitle")} note={t("activeNote")}>
          {!hasActive ? (
            <ChartEmpty height={220}>
              {users.isPending || billing.isPending ? t("loading") : t("unavailable")}
            </ChartEmpty>
          ) : (
            <TimeSeriesChart
              variant="line"
              integer
              ariaLabel={t("activeTitle")}
              labels={labels}
              series={[
                { key: "users", label: t("series.activeAccounts"), values: rows.map((r) => r.activeUsers) },
                { key: "workspaces", label: t("series.activeWorkspaces"), values: rows.map((r) => r.activeWorkspaces) },
              ]}
              formatValue={count}
            />
          )}
        </Panel>

        <Panel title={t("usersTitle")} note={users.data?.usersByMonthNote ?? null} className="lg:col-span-2">
          {!hasUsers ? (
            <ChartEmpty height={200}>{users.isPending ? t("loading") : t("unavailable")}</ChartEmpty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <TimeSeriesChart
                variant="line"
                integer
                ariaLabel={t("usersTitle")}
                labels={labels}
                height={200}
                series={[
                  { key: "total-users", label: t("series.totalUsers"), values: rows.map((r) => r.totalUsers) },
                  { key: "total-workspaces", label: t("series.totalWorkspaces"), values: rows.map((r) => r.totalWorkspaces) },
                ]}
                formatValue={count}
              />
              <div>
                {/* A single series has no legend; this names it, level with the legend beside it. */}
                <p className="mb-2 text-[11px] text-ink-muted">{t("series.newUsers")}</p>
                <TimeSeriesChart
                  variant="bar"
                  integer
                  ariaLabel={t("series.newUsers")}
                  labels={labels}
                  height={200}
                  series={[{ key: "new-users", label: t("series.newUsers"), values: rows.map((row) => row.newUsers) }]}
                  formatValue={count}
                />
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
