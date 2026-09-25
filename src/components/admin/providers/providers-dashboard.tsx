"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowsClockwise, MagnifyingGlass, Plugs } from "@phosphor-icons/react/dist/ssr";

import { AdminPage, AdminPageHeader } from "@/components/admin/admin-page-chrome";
import { ProviderCard } from "@/components/admin/providers/provider-card";
import { Segmented } from "@/components/admin/providers/provider-detail";
import { Button } from "@/components/ui/button";
import { useAdminProviders } from "@/hooks/use-admin-providers";
import { browserTimeZone } from "@/lib/admin/insights-period";
import {
  PROVIDER_PERIODS,
  PROVIDER_SORTS,
  filterAndSortProviders,
  hourlyAllowed,
  providerRangeQuery,
  resolveProviderPeriod,
  type ProviderPeriod,
  type ProviderSort,
} from "@/lib/admin/providers";
import type { ProviderKey } from "@/types/admin-providers";

/**
 * /admin/providers — one long card per external provider (OpenAI, Cartesia, LiveKit, Stripe). The
 * period, granularity and currency apply to every card at once; search and sort are local (four
 * rows need no server round trip).
 */
export function ProvidersDashboard() {
  const t = useTranslations("adminProviders");
  const [tz] = useState(() => browserTimeZone());
  const [period, setPeriod] = useState<ProviderPeriod>("30d");
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [granularity, setGranularity] = useState<"day" | "hour">("day");
  const [currency, setCurrency] = useState<"USD" | "VND">("USD");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProviderSort>("status");
  const [expanded, setExpanded] = useState<ProviderKey | null>(null);

  const resolved = useMemo(
    () => resolveProviderPeriod({ period, from: applied.from, to: applied.to }, new Date()),
    [period, applied],
  );
  const range = useMemo(() => providerRangeQuery(resolved, tz), [resolved, tz]);
  const canHourly = hourlyAllowed(resolved);
  const effectiveGranularity = canHourly ? granularity : "day";

  const overview = useAdminProviders(tz);
  const providers = filterAndSortProviders(overview.data?.providers ?? [], search, sort);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("page.eyebrow")}
        eyebrowIcon={<Plugs size={13} aria-hidden />}
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            {overview.data ? (
              <span className="text-[11px] text-ink-subtle">
                {t("page.asOf", { time: new Date(overview.data.generatedAt).toLocaleTimeString() })}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              <ArrowsClockwise size={14} aria-hidden className={overview.isFetching ? "animate-spin" : undefined} />
              {t("page.refresh")}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 border-b border-border py-4 lg:flex-row lg:flex-wrap lg:items-center">
        <Segmented
          label={t("controls.period")}
          options={PROVIDER_PERIODS.map((value) => ({ value, label: t(`controls.periods.${value}`) }))}
          value={period}
          onChange={setPeriod}
        />
        {period === "custom" ? (
          <form
            className="flex flex-wrap items-center gap-2 text-[12px]"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(custom);
            }}
          >
            <label className="flex items-center gap-1.5 text-ink-muted">
              {t("controls.from")}
              <input
                type="date"
                value={custom.from}
                onChange={(event) => setCustom((c) => ({ ...c, from: event.target.value }))}
                className="rounded-md border border-border bg-surface-1 px-2 py-1 text-ink"
              />
            </label>
            <label className="flex items-center gap-1.5 text-ink-muted">
              {t("controls.to")}
              <input
                type="date"
                value={custom.to}
                onChange={(event) => setCustom((c) => ({ ...c, to: event.target.value }))}
                className="rounded-md border border-border bg-surface-1 px-2 py-1 text-ink"
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              {t("controls.apply")}
            </Button>
          </form>
        ) : null}
        <Segmented
          label={t("controls.granularity")}
          options={[
            { value: "day" as const, label: t("controls.day") },
            { value: "hour" as const, label: t("controls.hour"), disabled: !canHourly, title: canHourly ? undefined : t("controls.hourlyLimit") },
          ]}
          value={effectiveGranularity}
          onChange={setGranularity}
        />
        <Segmented
          label={t("controls.currency")}
          options={[
            { value: "USD" as const, label: "USD" },
            { value: "VND" as const, label: "VND" },
          ]}
          value={currency}
          onChange={setCurrency}
        />
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <label className="relative">
            <span className="sr-only">{t("controls.search")}</span>
            <MagnifyingGlass size={13} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("controls.search")}
              className="w-48 rounded-md border border-border bg-surface-1 py-1 pl-7 pr-2 text-[12px] text-ink placeholder:text-ink-subtle"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
            {t("controls.sort")}
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ProviderSort)}
              className="rounded-md border border-border bg-surface-1 px-2 py-1 text-ink"
            >
              {PROVIDER_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`controls.sorts.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {resolved.notice ? <p className="pt-2 text-[12px] text-warning">{resolved.notice}</p> : null}

      <div className="flex flex-col gap-4 pt-5">
        {overview.isError && !overview.data ? (
          <div className="rounded-lg border border-border bg-surface-1 p-6 text-center">
            <p className="text-[14px] font-medium text-ink">{t("errors.loadTitle")}</p>
            <p className="mt-1 text-[12px] text-ink-muted">{t("errors.loadDescription")}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => overview.refetch()}>
              {t("errors.retry")}
            </Button>
          </div>
        ) : !overview.data ? (
          [0, 1, 2, 3].map((index) => <div key={index} className="h-[420px] animate-pulse rounded-lg bg-surface-1" aria-hidden />)
        ) : providers.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-muted">{t("errors.noMatch")}</p>
        ) : (
          providers.map((provider) => (
            <ProviderCard
              key={provider.key}
              provider={provider}
              range={range}
              granularity={effectiveGranularity}
              currency={currency}
              tz={tz}
              expanded={expanded === provider.key}
              onToggle={() => setExpanded((current) => (current === provider.key ? null : provider.key))}
            />
          ))
        )}
      </div>
    </AdminPage>
  );
}
