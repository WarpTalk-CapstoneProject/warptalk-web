"use client";

import { useTranslations } from "next-intl";

import type { TooltipRow } from "@/components/admin/charts/chart-tooltip";
import { UptimeBars, type UptimeBar } from "@/components/admin/charts/uptime-bars";
import { useAdminProviderUptime } from "@/hooks/use-admin-providers";
import { dayKeyLabel } from "@/lib/admin/insights-period";
import { formatMetric, formatUptime, statusColor } from "@/lib/admin/providers";
import type { AdminProviderSummaryDto, AdminProviderUptimeDto } from "@/types/admin-providers";

/**
 * The status.claude.com row of one provider card: 90 daily bars, the uptime in the middle. The
 * percentage says what it is measured from; with no signal it says "not tracked" instead of 100%.
 */
export function ProviderUptimeRow({ provider, tz }: { provider: AdminProviderSummaryDto; tz: string }) {
  const t = useTranslations("adminProviders");
  const query = useAdminProviderUptime(provider.key, tz);
  const data = query.data;

  if (query.isError) {
    return <p className="text-[12px] text-ink-muted">{t("uptime.loadFailed")}</p>;
  }

  if (!data) {
    return <div className="h-[52px] animate-pulse rounded-md bg-surface-2" aria-hidden />;
  }

  const bars = toBars(data, t);
  const percent = formatUptime(data.uptimePercent);

  return (
    <div>
      <UptimeBars
        bars={bars}
        ariaLabel={t("uptime.aria", { provider: provider.name, days: data.days.length })}
        startLabel={t("uptime.start", { days: data.days.length })}
        endLabel={t("uptime.end")}
        centerLabel={
          percent ? (
            <span title={t(`uptime.basis.${data.basis}`)}>{t("uptime.percent", { percent })}</span>
          ) : (
            <span className="text-ink-muted">{t("uptime.notTracked")}</span>
          )
        }
      />
      {data.note ? <p className="mt-1.5 text-[11px] text-ink-subtle">{data.note}</p> : null}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations>;

function toBars(data: AdminProviderUptimeDto, t: Translate): UptimeBar[] {
  return data.days.map((day) => {
    const rows: TooltipRow[] = [];
    if (day.tracked) {
      if (day.calls > 0) {
        rows.push({ key: "calls", label: t("uptime.calls"), value: formatMetric(day.calls, "count") });
        rows.push({ key: "failed", label: t("uptime.failed"), value: formatMetric(day.failures, "count") });
        if (day.successRate !== null) {
          rows.push({ key: "rate", label: t("uptime.succeeded"), value: formatMetric(day.successRate, "percent") });
        }
        if (day.p95Ms !== null) rows.push({ key: "p95", label: t("uptime.p95"), value: formatMetric(day.p95Ms, "ms") });
        for (const [failureClass, count] of Object.entries(day.failuresByClass)) {
          if (count > 0) {
            rows.push({
              key: `class-${failureClass}`,
              label: t.has(`errorClasses.${failureClass}`) ? t(`errorClasses.${failureClass}`) : failureClass,
              value: formatMetric(count, "count"),
              muted: true,
            });
          }
        }
      } else {
        rows.push({ key: "none", label: "", value: t("uptime.noCalls"), muted: true });
      }
    }

    const footer = day.incidents.length
      ? day.incidents
          .slice(0, 3)
          .map((incident) => t("uptime.incident", { impact: incident.impact, name: incident.name }))
          .join(" · ")
      : null;

    return {
      key: day.date,
      title: dayKeyLabel(day.date),
      statusLabel: t(`status.${day.status}`),
      color: statusColor(day.status),
      muted: day.status === "no_data",
      rows,
      footer,
    };
  });
}
