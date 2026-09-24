"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";

import { BarList } from "@/components/admin/charts/bar-list";
import { PieChart } from "@/components/admin/charts/pie-chart";
import { TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { useAdminProviderBreakdown, useAdminProviderUptime } from "@/hooks/use-admin-providers";
import { dayKeyLabel } from "@/lib/admin/insights-period";
import { METRIC_COLORS, formatMetric, pieColors, statusColor } from "@/lib/admin/providers";
import { cn } from "@/lib/utils";
import type { ProviderRangeQuery } from "@/services/admin-providers.service";
import type {
  AdminProviderSeriesDto,
  AdminProviderSummaryDto,
  ProviderBreakdownBy,
  ProviderMetricKey,
} from "@/types/admin-providers";

const BREAKDOWNS: Record<AdminProviderSummaryDto["key"], ProviderBreakdownBy[]> = {
  openai: ["workspace", "service", "model", "operation"],
  cartesia: ["workspace", "service", "model", "operation"],
  livekit: ["workspace"],
  stripe: ["workspace"],
};

/**
 * What a provider card opens into: share of the period (pie, with the split to choose), the period
 * per bucket as columns, latency percentiles, failures by class, top workspaces, the provider's own
 * incidents and its configuration (set / not set — never a value).
 */
export function ProviderDetail({
  provider,
  series,
  range,
  currency,
  tz,
}: {
  provider: AdminProviderSummaryDto;
  series: AdminProviderSeriesDto | undefined;
  range: ProviderRangeQuery | null;
  currency: "USD" | "VND";
  tz: string;
}) {
  const t = useTranslations("adminProviders");
  const splits = BREAKDOWNS[provider.key];
  const [by, setBy] = useState<ProviderBreakdownBy>(splits[0]);
  const breakdown = useAdminProviderBreakdown(provider.key, range, by);
  const workspaces = useAdminProviderBreakdown(provider.key, range, "workspace");
  const hasCalls = provider.key === "openai" || provider.key === "cartesia";
  const errors = useAdminProviderBreakdown(provider.key, range, "errorClass", hasCalls);
  const uptime = useAdminProviderUptime(provider.key, tz);

  const costKey: ProviderMetricKey = currency === "USD" ? "costUsd" : "costVnd";
  const columnMetric = series?.metrics.find((m) => m.key === costKey && m.values.some((v) => v !== null))
    ?? series?.metrics.find((m) => m.key === "usage");
  const total = (key: string) => series?.totals.find((item) => item.key === key) ?? null;

  const breakdownData = breakdown.data;
  const slices = (breakdownData?.items ?? []).map((item, index) => ({
    key: item.key,
    label: item.label,
    value: item.value,
    color: pieColors(breakdownData?.items.length ?? 0)[index],
    detail: [
      item.costUsd !== null && currency === "USD" ? formatMetric(item.costUsd, "usd") : null,
      item.costVnd !== null && currency === "VND" ? formatMetric(item.costVnd, "vnd") : null,
      item.failures !== null && item.failures > 0 ? `${formatMetric(item.failures, "count")} ${t("uptime.failed")}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
  }));

  return (
    <div className="grid gap-4 border-t border-border bg-surface-1 px-5 py-5 lg:grid-cols-2">
      {/* Share of the period */}
      <section className="rounded-lg border border-border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-ink">{t("detail.share")}</h3>
          <Segmented
            label={t("detail.share")}
            options={splits.map((split) => ({ value: split, label: t(`detail.by.${split}`) }))}
            value={by}
            onChange={setBy}
          />
        </div>
        {breakdownData && !breakdownData.available ? (
          <p className="text-[12px] text-ink-muted">{breakdownData.note ?? t("detail.unavailable")}</p>
        ) : (
          <>
            <PieChart
              slices={slices}
              formatValue={(value) => formatMetric(value, breakdownData?.unit ?? "count")}
              ariaLabel={`${provider.name} · ${t(`detail.by.${by}`)}`}
              emptyLabel={breakdown.isLoading ? "…" : t("chart.empty")}
              centerLabel={t("detail.total")}
            />
            {breakdownData?.note ? <p className="mt-3 text-[11px] text-ink-subtle">{breakdownData.note}</p> : null}
          </>
        )}
      </section>

      {/* Per bucket */}
      <section className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-[13px] font-medium text-ink">
          {t("detail.perBucket")} · {columnMetric ? t(`metrics.${columnMetric.key}`) : ""}
        </h3>
        {series && columnMetric ? (
          <TimeSeriesChart
            variant="bar"
            height={180}
            labels={series.buckets.map((b) => (series.granularity === "hour" ? b.key.slice(11) : dayKeyLabel(b.key)))}
            titles={series.buckets.map((b) => (series.granularity === "hour" ? b.key.replace("T", " ") : dayKeyLabel(b.key)))}
            series={[
              {
                key: columnMetric.key,
                label: t(`metrics.${columnMetric.key}`),
                color: METRIC_COLORS[columnMetric.key],
                values: columnMetric.values,
              },
            ]}
            formatValue={(value) => formatMetric(value, columnMetric.unit)}
            describeGap={(index) => (series.buckets[index]?.future ? t("chart.stillToCome") : t("chart.notTracked"))}
            ariaLabel={`${provider.name} · ${t(`metrics.${columnMetric.key}`)}`}
          />
        ) : (
          <div className="h-[180px] animate-pulse rounded-md bg-surface-2" aria-hidden />
        )}
      </section>

      {/* Latency and failures */}
      {hasCalls ? (
        <section className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-[13px] font-medium text-ink">{t("detail.latency")}</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { key: "p50Ms", label: t("detail.p50"), unit: "ms" as const },
              { key: "p95Ms", label: t("detail.p95"), unit: "ms" as const },
              { key: "p99Ms", label: t("detail.p99"), unit: "ms" as const },
              { key: "successRate", label: t("detail.successRate"), unit: "percent" as const },
            ].map((item) => (
              <div key={item.key}>
                <dt className="text-[11px] text-ink-muted">{item.label}</dt>
                <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-ink">
                  {total(item.key)?.value === null || total(item.key) === null ? t("stats.notTracked") : formatMetric(total(item.key)!.value, item.unit)}
                </dd>
              </div>
            ))}
          </dl>
          {total("clientErrors")?.value ? (
            <p className="mt-3 text-[11px] text-ink-subtle">
              {t("detail.clientErrors")}: {formatMetric(total("clientErrors")!.value, "count")}
            </p>
          ) : null}

          <h3 className="mb-2 mt-5 text-[13px] font-medium text-ink">{t("detail.failures")}</h3>
          {errors.data && errors.data.available && errors.data.items.some((i) => i.value > 0) ? (
            <BarList
              rows={errors.data.items
                .filter((item) => item.value > 0)
                .map((item) => ({
                  key: item.key,
                  label: t.has(`errorClasses.${item.key}`) ? t(`errorClasses.${item.key}`) : item.key,
                  segments: [
                    {
                      key: item.key,
                      label: item.key,
                      value: item.value,
                      color: item.key === "client_error" ? "var(--hairline-strong)" : "var(--viz-3)",
                    },
                  ],
                }))}
              formatValue={(value) => formatMetric(value, "count")}
              ariaLabel={`${provider.name} · ${t("detail.failures")}`}
              showShare
            />
          ) : (
            <p className="text-[12px] text-ink-muted">{errors.data?.note ?? t("detail.noFailures")}</p>
          )}
        </section>
      ) : null}

      {/* Top workspaces */}
      <section className="rounded-lg border border-border p-4">
        <h3 className="mb-3 text-[13px] font-medium text-ink">{t("detail.topWorkspaces")}</h3>
        {workspaces.data && workspaces.data.available && workspaces.data.items.length > 0 ? (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-muted">
                <th scope="col" className="pb-2 font-normal">{t("detail.workspace")}</th>
                <th scope="col" className="pb-2 text-right font-normal">{t("detail.value")}</th>
                <th scope="col" className="pb-2 text-right font-normal">{t("detail.cost")}</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.data.items.map((item) => {
                const cost = currency === "USD" ? item.costUsd : item.costVnd;
                return (
                  <tr key={item.key} className="border-t border-hairline">
                    <td className="max-w-0 truncate py-1.5 pr-2 text-ink">{item.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatMetric(item.value, workspaces.data!.unit)}</td>
                    <td className="py-1.5 text-right tabular-nums text-ink-muted">
                      {cost === null ? "—" : formatMetric(cost, currency === "USD" ? "usd" : "vnd")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-[12px] text-ink-muted">{workspaces.data?.note ?? t("chart.empty")}</p>
        )}
      </section>

      {/* Incidents */}
      <section className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-ink">{t("detail.incidents")}</h3>
          {provider.statusPage ? (
            <a
              href={provider.statusPage.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
            >
              {t("detail.openStatusPage")} <ArrowSquareOut size={12} aria-hidden />
            </a>
          ) : null}
        </div>
        {!provider.statusPage ? (
          <p className="text-[12px] text-ink-muted">{t("detail.noStatusPage")}</p>
        ) : uptime.data && uptime.data.recentIncidents.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {uptime.data.recentIncidents.map((incident) => (
              <li key={`${incident.name}-${incident.startedAt}`} className="flex items-start gap-2 text-[12px]">
                <i
                  aria-hidden
                  className="mt-1 inline-block size-2 shrink-0 rounded-full"
                  style={{ background: incidentColor(incident.impact) }}
                />
                <div className="min-w-0">
                  {incident.url ? (
                    <a href={incident.url} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                      {incident.name}
                    </a>
                  ) : (
                    <span className="text-ink">{incident.name}</span>
                  )}
                  <div className="text-[11px] text-ink-muted">
                    {incident.impact} · {new Date(incident.startedAt).toLocaleString()} ·{" "}
                    {incident.resolvedAt
                      ? t("detail.resolved", { time: new Date(incident.resolvedAt).toLocaleString() })
                      : t("detail.ongoing")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-ink-muted">{t("detail.noIncidents")}</p>
        )}
      </section>

      {/* Configuration */}
      <section className="rounded-lg border border-border p-4">
        <h3 className="text-[13px] font-medium text-ink">{t("detail.config")}</h3>
        <p className="mb-3 text-[11px] text-ink-subtle">{t("detail.configHint")}</p>
        <dl className="flex flex-col gap-1.5 text-[12px]">
          {provider.config.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3">
              <dt className="text-ink-muted">{item.label}</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-right text-ink">
                <i
                  aria-hidden
                  className="inline-block size-1.5 shrink-0 rounded-full"
                  style={{
                    background: item.state === "yes" ? "var(--success)" : item.state === "no" ? "var(--warning)" : "var(--hairline-strong)",
                  }}
                />
                <span className="break-all">{item.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function incidentColor(impact: string): string {
  switch (impact) {
    case "critical":
      return statusColor("major_outage");
    case "major":
      return statusColor("partial_outage");
    case "minor":
      return statusColor("degraded");
    default:
      return "var(--hairline-strong)";
  }
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-hairline">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={disabled || option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors",
            "aria-pressed:bg-surface-3 aria-pressed:text-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
