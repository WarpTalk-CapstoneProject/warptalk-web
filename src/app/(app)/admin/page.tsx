"use client";

import {
  Buildings,
  ChartLineUp,
  Coins,
  ClockCounterClockwise,
  Pulse,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";

import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { TopWorkspacesChart } from "@/components/admin/TopWorkspacesChart";
import { UsageChart } from "@/components/admin/UsageChart";
import { billingService } from "@/services/billing.service";
import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {value}
          </p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg border border-primary/10 bg-primary/8 text-primary">
          <Icon size={18} weight="duotone" />
        </span>
      </div>
      <p className="mt-3 text-xs text-ink-muted">{helper}</p>
    </article>
  );
}

export default function AdminOverviewPage() {
  const metricsQuery = useQuery({
    queryKey: ["global-billing-metrics"],
    queryFn: () => billingService.getGlobalMetrics(),
    refetchInterval: 60_000,
  });
  const alertsQuery = useQuery({
    queryKey: ["global-usage-alerts"],
    queryFn: () => billingService.getUsageAlerts(),
    refetchInterval: 60_000,
  });

  const metrics = metricsQuery.data;
  const alerts = alertsQuery.data ?? [];
  const updatedAt = Math.max(metricsQuery.dataUpdatedAt, alertsQuery.dataUpdatedAt);

  return (
    <AdminPage>
        <AdminPageHeader
          eyebrow="Platform control center"
          eyebrowIcon={<Pulse size={14} weight="fill" />}
          title="Overview"
          description="Live health, credit movement, and adoption across every WarpTalk workspace."
          actions={
            <span className="flex items-center gap-2 text-[11px] text-ink-muted">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Live data
              {updatedAt > 0 ? ` · ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </span>
          }
        />

        {metricsQuery.isError ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <WarningCircle size={18} weight="duotone" />
            Platform metrics could not be loaded. Check the billing service and your admin session.
          </div>
        ) : null}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Active workspaces"
            value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.activeWorkspaces ?? 0)}
            helper="Workspaces currently active on the platform"
            icon={Buildings}
          />
          <MetricCard
            label="Credits consumed"
            value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.monthlyUsage ?? 0)}
            helper="Consumption in the current month"
            icon={ChartLineUp}
          />
          <MetricCard
            label="Platform balance"
            value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.totalBalance ?? 0)}
            helper="Credits available across all workspaces"
            icon={Coins}
          />
          <MetricCard
            label="Audit activity"
            value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.auditEventsLast30Days ?? 0)}
            helper="Ledger events recorded in the last 30 days"
            icon={ClockCounterClockwise}
          />
        </section>

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
          <UsageChart className="min-w-0" />
          <aside className="overflow-hidden rounded-lg border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">Live operations</h2>
                <p className="mt-0.5 text-xs text-ink-muted">Credit anomalies requiring review</p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                {alerts.length} open
              </span>
            </div>
            <div className="max-h-[356px] overflow-y-auto p-2">
              {alertsQuery.isLoading ? (
                <p className="p-4 text-sm text-ink-muted">Loading operations feed…</p>
              ) : alertsQuery.isError ? (
                <p className="p-4 text-sm text-destructive">Operations feed is unavailable.</p>
              ) : alerts.length === 0 ? (
                <div className="grid min-h-44 place-items-center px-4 text-center">
                  <div>
                    <span className="mx-auto grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
                      <ChartLineUp size={17} weight="duotone" />
                    </span>
                    <p className="mt-3 text-sm font-medium">All systems look quiet</p>
                    <p className="mt-1 text-xs text-ink-muted">No unusual credit consumption detected.</p>
                  </div>
                </div>
              ) : (
                <ul className="space-y-1">
                  {alerts.slice(0, 8).map((alert) => (
                    <li key={`${alert.workspaceId}-${alert.reason}`} className="rounded-lg px-3 py-2.5 hover:bg-surface-2">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{alert.workspaceName}</p>
                          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{alert.reason}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {numberFormatter.format(alert.consumedCreditsIn24h)} cr
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-2">
          <TopWorkspacesChart />
          <FeatureBreakdownChart />
        </section>
    </AdminPage>
  );
}
