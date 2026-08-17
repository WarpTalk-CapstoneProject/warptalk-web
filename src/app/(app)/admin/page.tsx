"use client";

/**
 * The overview, restyled 2026-08-17 to the reference the owner pointed at (platform.openai.com):
 * sections separated by hairlines rather than boxed into cards, one accent colour, and charts
 * reduced to bare bars with the numbers doing the talking. The data underneath is unchanged —
 * global metrics, the usage chart, alerts, top workspaces, and the feature split.
 */

import { Pulse, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { billingService } from "@/services/billing.service";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import { cn } from "@/lib/utils";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** One cell of the metrics band. The band's dividers, not the cell, draw the separation. */
function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="px-5 py-4 first:pl-0">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-[11px] text-ink-subtle">{helper}</p>
    </div>
  );
}

/** A section under a hairline: a small bold title, a quiet subtitle, then the content. */
function Section({
  title,
  subtitle,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p> : null}
        </div>
        {trailing}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A quiet horizontal quantity bar, the way the reference draws rankings. */
function QuantityBar({ fraction }: { fraction: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }}
      />
    </div>
  );
}

function UsageSection() {
  const year = new Date().getFullYear();
  const chartQuery = useQuery({
    queryKey: ["global-usage-chart", year, false],
    queryFn: () => billingService.getGlobalUsageChart(year),
  });

  const months = chartQuery.data?.monthlyData ?? [];
  const max = Math.max(1, ...months.map((m) => Math.max(m.consumedCredits, m.topUpCredits)));
  const totalConsumed = months.reduce((sum, m) => sum + m.consumedCredits, 0);

  return (
    <Section
      title="Usage"
      subtitle={`Credits consumed and topped up, by month, ${year}`}
      trailing={
        <span className="text-[13px] font-medium tabular-nums text-ink">
          {numberFormatter.format(totalConsumed)} cr consumed
        </span>
      }
    >
      {chartQuery.isPending ? (
        <div className="h-40 animate-pulse rounded bg-surface-2" />
      ) : chartQuery.isError ? (
        <p className="text-sm text-destructive">The usage chart could not be loaded.</p>
      ) : (
        <>
          <div className="flex h-40 items-end gap-2">
            {months.map((month) => (
              <div
                key={month.month}
                className="group flex h-full flex-1 flex-col justify-end"
                title={`${month.monthName}: ${numberFormatter.format(month.consumedCredits)} consumed · ${numberFormatter.format(month.topUpCredits)} topped up`}
              >
                <div className="flex h-full items-end justify-center gap-[3px]">
                  <div
                    className="w-full max-w-[26px] rounded-t-sm bg-primary/75 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(1.5, (month.consumedCredits / max) * 100)}%` }}
                  />
                  <div
                    className="w-full max-w-[26px] rounded-t-sm bg-ink/15 transition-colors group-hover:bg-ink/25"
                    style={{ height: `${Math.max(1.5, (month.topUpCredits / max) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-[10px] text-ink-subtle">
                  {month.monthName.slice(0, 3)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-primary/75" /> Consumed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-ink/15" /> Topped up
            </span>
          </div>
        </>
      )}
    </Section>
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
  const topWorkspacesQuery = useQuery({
    queryKey: ["global-top-workspaces"],
    queryFn: () => billingService.getTopWorkspaces(30, 8),
  });
  const breakdownQuery = useQuery({
    queryKey: ["global-usage-breakdown"],
    queryFn: () => billingService.getGlobalUsageBreakdown(30),
  });

  /**
   * Workspaces a human has suspended, which this page could not see at all. A suspension is the
   * one platform state that stays until somebody acts on it, so it earns the only banner here.
   * Page size 1: only `total` is read.
   */
  const suspendedQuery = useAdminWorkspaceDirectory({ page: 1, pageSize: 1, status: "suspended" });
  const suspendedCount = suspendedQuery.data?.total ?? 0;

  const metrics = metricsQuery.data;
  const alerts = alertsQuery.data ?? [];
  const topWorkspaces = topWorkspacesQuery.data ?? [];
  const breakdown = useMemo(
    () =>
      [...(breakdownQuery.data ?? [])].sort(
        (a, b) => b.totalCreditsConsumed - a.totalCreditsConsumed,
      ),
    [breakdownQuery.data],
  );
  const maxTop = Math.max(1, ...topWorkspaces.map((w) => w.totalCreditsConsumed));
  const maxFeature = Math.max(1, ...breakdown.map((f) => f.totalCreditsConsumed));
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
            {updatedAt > 0
              ? ` · ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        }
      />

      {/* The one thing on this page anyone has to DO. Absent entirely at zero — a permanent
          "0 suspended" strip is furniture, and furniture is what the eye learns to skip. */}
      {suspendedCount > 0 ? (
        <Link
          href="/admin/workspaces?status=suspended"
          className="mt-5 flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm transition-colors hover:bg-amber-500/10"
        >
          <WarningCircle size={18} weight="duotone" className="shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            <span className="font-medium text-ink">
              {suspendedCount} workspace{suspendedCount === 1 ? " is" : "s are"} suspended
            </span>
            <span className="ml-1.5 text-ink-muted">
              Nothing lifts a suspension on its own — each one stays closed until an admin
              reactivates it.
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-ink-muted">Review →</span>
        </Link>
      ) : null}

      {metricsQuery.isError ? (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <WarningCircle size={18} weight="duotone" />
          Platform metrics could not be loaded. Check the billing service and your admin session.
        </div>
      ) : null}

      {/* The metrics band: cells divided by hairlines, not boxed into cards. */}
      <div className="mt-6 grid grid-cols-2 divide-x divide-hairline border-y border-hairline xl:grid-cols-4">
        <Metric
          label="Active workspaces"
          value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.activeWorkspaces ?? 0)}
          helper="Workspaces currently active on the platform"
        />
        <Metric
          label="Credits consumed"
          value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.monthlyUsage ?? 0)}
          helper="Consumption in the current month"
        />
        <Metric
          label="Platform balance"
          value={metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.totalBalance ?? 0)}
          helper="Credits available across all workspaces"
        />
        <Metric
          label="Audit activity"
          value={
            metricsQuery.isLoading ? "—" : numberFormatter.format(metrics?.auditEventsLast30Days ?? 0)
          }
          helper="Ledger events recorded in the last 30 days"
        />
      </div>

      <div className="mt-8 space-y-8">
        <UsageSection />

        <Section
          title="Live operations"
          subtitle="Credit anomalies requiring review"
          trailing={
            <span
              className={cn(
                "text-[13px] font-medium tabular-nums",
                alerts.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink-muted",
              )}
            >
              {alerts.length} open
            </span>
          }
        >
          {alertsQuery.isLoading ? (
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          ) : alertsQuery.isError ? (
            <p className="text-sm text-destructive">Operations feed is unavailable.</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-ink-muted">
              All systems look quiet — no unusual credit consumption detected.
            </p>
          ) : (
            <ul>
              {alerts.slice(0, 8).map((alert) => (
                <li
                  key={`${alert.workspaceId}-${alert.reason}`}
                  className="flex items-start gap-3 border-b border-hairline/60 py-2.5 last:border-b-0"
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {alert.workspaceName}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-muted">{alert.reason}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                    {numberFormatter.format(alert.consumedCreditsIn24h)} cr
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Top workspaces" subtitle="Highest credit consumption, last 30 days">
          {topWorkspacesQuery.isPending ? (
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          ) : topWorkspacesQuery.isError ? (
            <p className="text-sm text-destructive">Top workspaces could not be loaded.</p>
          ) : topWorkspaces.length === 0 ? (
            <p className="text-sm text-ink-muted">No billable usage in the last 30 days.</p>
          ) : (
            <ol className="space-y-3">
              {topWorkspaces.map((workspace, index) => (
                <li key={workspace.workspaceId} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-ink-subtle">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/admin/workspaces/${workspace.workspaceId}`}
                        className="truncate text-[13px] font-medium text-ink transition-colors hover:text-primary"
                      >
                        {workspace.workspaceName ?? workspace.workspaceId.slice(0, 8)}
                      </Link>
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">
                        {numberFormatter.format(workspace.totalCreditsConsumed)} cr
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <QuantityBar fraction={workspace.totalCreditsConsumed / maxTop} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Feature adoption" subtitle="Credit consumption by service, last 30 days">
          {breakdownQuery.isPending ? (
            <div className="h-16 animate-pulse rounded bg-surface-2" />
          ) : breakdownQuery.isError ? (
            <p className="text-sm text-destructive">The service breakdown could not be loaded.</p>
          ) : breakdown.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing billed in the last 30 days.</p>
          ) : (
            <ol className="space-y-3">
              {breakdown.map((feature) => (
                <li key={feature.usageType} className="flex items-center gap-3">
                  <span className="w-56 shrink-0 truncate font-mono text-[12px] text-ink">
                    {feature.usageType}
                  </span>
                  <div className="min-w-0 flex-1">
                    <QuantityBar fraction={feature.totalCreditsConsumed / maxFeature} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[13px] tabular-nums text-ink-muted">
                    {numberFormatter.format(feature.totalCreditsConsumed)} cr
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </AdminPage>
  );
}
