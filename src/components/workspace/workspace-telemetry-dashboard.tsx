"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  CHART_COLORS,
  ChartEmpty,
  ChartFigure,
  TimeSeriesChart,
} from "@/components/admin/charts/time-series-chart";
import {
  ADMIN_MASTER_DEFAULT_RATES,
  DEFAULT_CURRENCY_CONFIG,
  aggregateTelemetryBuckets,
  calculateMeetingEconomics,
  formatCreditWithFiat,
  type CurrencyRateConfig,
  type TelemetryBucket,
  type TelemetryTimeframe,
} from "@/lib/billing/workspace-telemetry";
import { formatMoney } from "@/lib/format/currency";
import { adminPricingService } from "@/services/admin-pricing.service";
import { cn } from "@/lib/utils";
import { WorkspaceCurrencyConfigModal } from "./workspace-currency-config-modal";

// ── Shared UI Shells (Aligned with Linear / Resend Metrics) ─────
const CARD = "relative block min-w-0 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="truncate text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">
      {children}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  link,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-1", className)}>
      <header className="flex items-start justify-between gap-2.5 px-4 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-ink-muted">{subtitle}</p> : null}
        </div>
        {link ? (
          <Link href={link.href} className="shrink-0 whitespace-nowrap text-[11px] text-primary hover:underline">
            {link.label} →
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export interface WorkspaceTelemetryProps {
  workspaceSlug?: string;
  currentCredits: number;
  totalCredits: number;
  renewsDate: string;
  totalCreditsConsumed: number;
  completedMeetingsCount: number;
  activeMembersCount: number;
  pluginInvocationsCount: number;
  pluginSuccessRate: number;
  pluginBlockedCount: number;
  rawDailyHistory: { date: string; credits: number; meetings: number }[];
  className?: string;
}

export function WorkspaceTelemetryDashboard({
  workspaceSlug,
  currentCredits,
  totalCredits,
  renewsDate,
  totalCreditsConsumed,
  completedMeetingsCount,
  activeMembersCount,
  pluginInvocationsCount,
  pluginSuccessRate,
  pluginBlockedCount,
  rawDailyHistory,
  className,
}: WorkspaceTelemetryProps) {
  const [timeframe, setTimeframe] = useState<TelemetryTimeframe>("day");

  // Query platform Admin Master pricing config if accessible
  const { data: adminPricing } = useQuery({
    queryKey: ["admin-pricing", "config-public"],
    queryFn: async () => {
      try {
        return await adminPricingService.getPricingConfig();
      } catch {
        return null;
      }
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  // Calculate dynamic Admin Master rates based on platform config
  const adminMasterRates = useMemo<Record<string, number>>(() => {
    const rates = { ...ADMIN_MASTER_DEFAULT_RATES };
    if (adminPricing) {
      if (adminPricing.creditValueVnd && adminPricing.creditValueVnd > 0) {
        rates.VND = adminPricing.creditValueVnd;
      }
      if (
        adminPricing.creditValueVnd &&
        adminPricing.fxRateUsdVnd &&
        adminPricing.fxRateUsdVnd > 0
      ) {
        rates.USD = Number((adminPricing.creditValueVnd / adminPricing.fxRateUsdVnd).toFixed(6));
      }
    }
    return rates;
  }, [adminPricing]);

  // Currency & Rate Configuration (workspace-scoped persistence)
  const storageKey = `warptalk:ws:${workspaceSlug || "default"}:telemetry-currency`;

  const [currencyConfig, setCurrencyConfig] = useState<CurrencyRateConfig>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.currency && typeof parsed.ratePerCredit === "number") {
            return parsed;
          }
        }
      } catch {
        // Fallback to default
      }
    }
    return DEFAULT_CURRENCY_CONFIG;
  });

  const fxRateUsdVnd = adminPricing?.fxRateUsdVnd && adminPricing.fxRateUsdVnd > 0
    ? adminPricing.fxRateUsdVnd
    : 25641;

  // Helper for secondary currency conversion
  const formatFiatWithConversion = (amount: number, currency: string) => {
    const formattedPrimary = formatMoney(amount, currency);
    if (currency === "USD") {
      const vnd = Math.round(amount * fxRateUsdVnd);
      return `≈ ${formattedPrimary} (≈ ${formatMoney(vnd, "VND")})`;
    }
    if (currency === "VND") {
      const usd = amount / fxRateUsdVnd;
      return `≈ ${formattedPrimary} (≈ ${formatMoney(usd, "USD")})`;
    }
    return `≈ ${formattedPrimary}`;
  };

  // Update localStorage when currencyConfig changes
  const handleSaveCurrencyConfig = (newConfig: CurrencyRateConfig) => {
    setCurrencyConfig(newConfig);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newConfig));
      } catch {
        // Ignore storage errors
      }
    }
  };

  // Quick switch currency
  const handleQuickCurrencySwitch = (newCurrency: string) => {
    const isCustom = Boolean(currencyConfig.isCustom);
    const rate = isCustom
      ? currencyConfig.ratePerCredit
      : adminMasterRates[newCurrency] ?? ADMIN_MASTER_DEFAULT_RATES[newCurrency] ?? 0.0039;

    handleSaveCurrencyConfig({
      currency: newCurrency,
      ratePerCredit: rate,
      isCustom,
    });
  };

  const economics = useMemo(
    () =>
      calculateMeetingEconomics(
        totalCreditsConsumed,
        completedMeetingsCount,
        activeMembersCount,
        currencyConfig,
      ),
    [totalCreditsConsumed, completedMeetingsCount, activeMembersCount, currencyConfig],
  );

  const remainingPercent = totalCredits > 0 ? (currentCredits / totalCredits) * 100 : 0;
  const isCreditLow = remainingPercent <= 15 && totalCredits > 0;

  // Aggregate buckets for the Bar chart
  const buckets = useMemo(
    () => aggregateTelemetryBuckets(timeframe, rawDailyHistory, currencyConfig),
    [timeframe, rawDailyHistory, currencyConfig],
  );

  const barLabels = useMemo(() => buckets.map((b) => b.label), [buckets]);
  const barTitles = useMemo(() => buckets.map((b) => b.title ?? b.label), [buckets]);

  // Daily timeline for the Area chart
  const dailyLabels = useMemo(() => rawDailyHistory.map((d) => d.date.substring(5)), [rawDailyHistory]);
  const dailyTitles = useMemo(() => rawDailyHistory.map((d) => d.date), [rawDailyHistory]);

  const totalPeriodSpend = useMemo(
    () => buckets.reduce((sum, b) => sum + b.credits, 0),
    [buckets],
  );

  const avgDailyBurn = useMemo(() => {
    if (rawDailyHistory.length === 0) return 0;
    const total = rawDailyHistory.reduce((sum, d) => sum + d.credits, 0);
    return Math.round(total / rawDailyHistory.length);
  }, [rawDailyHistory]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* 0. Telemetry Header Controls (Currency Selector & Valuation Config) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-hairline bg-surface-1 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">
            Valuation Currency:
          </span>
          {/* Quick Currency Pills */}
          <div className="inline-flex overflow-hidden rounded-md border border-hairline bg-surface-2/60">
            {(["USD", "VND", "EUR"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => handleQuickCurrencySwitch(code)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium transition-colors uppercase tracking-[0.3px]",
                  currencyConfig.currency === code
                    ? "bg-surface-3 text-ink font-semibold"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {code}
              </button>
            ))}
          </div>
          {currencyConfig.isCustom ? (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              Custom Rate
            </span>
          ) : (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Admin Master
            </span>
          )}
        </div>

        {/* Currency & Valuation Modal Trigger */}
        <WorkspaceCurrencyConfigModal
          currentConfig={currencyConfig}
          adminMasterRates={adminMasterRates}
          onSave={handleSaveCurrencyConfig}
        />
      </div>

      {/* 1. Executive Financial & Scale Stat Grid (5 Tiles) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Tile 1: Credits Remaining */}
        <div className={CARD}>
          <Eyebrow>Credits Remaining</Eyebrow>
          <div
            className={cn(
              "mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
              isCreditLow ? "text-warning" : "text-ink",
            )}
            title={`${currentCredits.toLocaleString()} credits`}
          >
            {currentCredits.toLocaleString()} cr
          </div>
          <p className="mt-1.5 truncate text-[11px] text-ink-subtle">
            {formatFiatWithConversion(currentCredits * currencyConfig.ratePerCredit, currencyConfig.currency)} · {remainingPercent.toFixed(1)}% left
          </p>
        </div>

        {/* Tile 2: Avg Cost / Meeting */}
        <div className={CARD}>
          <Eyebrow>Avg Cost / Meeting</Eyebrow>
          <div
            className="mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums text-primary"
            title={`${economics.avgCreditsPerMeeting} credits per meeting`}
          >
            {economics.avgCreditsPerMeeting.toLocaleString()} cr
          </div>
          <p className="mt-1.5 truncate text-[11px] text-ink-subtle">
            {formatFiatWithConversion(economics.avgCostPerMeeting, currencyConfig.currency)} · {economics.completedMeetingsCount} mtgs
          </p>
        </div>

        {/* Tile 3: Cycle Total Spend */}
        <div className={CARD}>
          <Eyebrow>Cycle Total Spend</Eyebrow>
          <div
            className="mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums text-ink"
            title={`${totalCreditsConsumed.toLocaleString()} credits`}
          >
            {totalCreditsConsumed.toLocaleString()} cr
          </div>
          <p className="mt-1.5 truncate text-[11px] text-ink-subtle">
            {formatFiatWithConversion(economics.totalCost, currencyConfig.currency)} · Renews {renewsDate}
          </p>
        </div>

        {/* Tile 4: Active Scale */}
        <div className={CARD}>
          <Eyebrow>Active Scale</Eyebrow>
          <div
            className="mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums text-ink"
            title={`${completedMeetingsCount} meetings, ${activeMembersCount} members`}
          >
            {completedMeetingsCount} mtgs · {activeMembersCount} mbrs
          </div>
          <p className="mt-1.5 truncate text-[11px] text-ink-subtle">
            Team meeting participation
          </p>
        </div>

        {/* Tile 5: Plugin Tool Health */}
        <div className={CARD}>
          <Eyebrow>Plugin Tool Health</Eyebrow>
          <div
            className={cn(
              "mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
              pluginSuccessRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500",
            )}
            title={`${pluginSuccessRate}% execution success rate`}
          >
            {pluginSuccessRate}%
          </div>
          <p className="mt-1.5 truncate text-[11px] text-ink-subtle">
            {pluginInvocationsCount} calls · {pluginBlockedCount} blocked
          </p>
        </div>
      </div>

      {/* 2. Dual Synchronized Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Left Chart: Periodic Spend & Cost Equivalent (Bar) */}
        <Panel
          title="Periodic Spend & Cost Equivalent"
          subtitle="Aggregated credit burn and fiat currency equivalent"
        >
          <div className="px-4 pb-3 pt-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <ChartFigure
                value={formatCreditWithFiat(totalPeriodSpend, currencyConfig, fxRateUsdVnd)}
                caption={`Total expenditure across ${buckets.length} ${timeframe}s`}
              />
              {/* Timeframe Switcher */}
              <div
                role="group"
                aria-label="Timeframe"
                className="inline-flex overflow-hidden rounded-md border border-hairline bg-surface-1"
              >
                {(["day", "month", "quarter"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={timeframe === t}
                    onClick={() => setTimeframe(t)}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium transition-colors uppercase tracking-[0.3px]",
                      timeframe === t
                        ? "bg-surface-3 text-ink font-semibold"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {buckets.length === 0 ? (
              <ChartEmpty height={180}>No recorded transactions</ChartEmpty>
            ) : (
              <TimeSeriesChart
                variant="bar"
                integer={true}
                ariaLabel="Periodic credit consumption"
                height={180}
                labels={barLabels}
                titles={barTitles}
                series={[
                  {
                    key: "spend",
                    label: "Credits Burned",
                    color: CHART_COLORS.primary,
                    values: buckets.map((b) => b.credits),
                  },
                ]}
                formatValue={(val) => formatCreditWithFiat(val, currencyConfig, fxRateUsdVnd)}
                formatAxis={(val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`)}
                tooltipFooter={(index) => {
                  const b = buckets[index];
                  return b ? `Fiat: ${formatFiatWithConversion(b.cost, currencyConfig.currency)} · ${b.meetings} meetings` : null;
                }}
              />
            )}
          </div>
        </Panel>

        {/* Right Chart: Daily Burn & Activity Correlation (Area / Line) */}
        <Panel
          title="Daily Burn & Meeting Activity"
          subtitle="Daily credit burn correlated with completed meeting sessions"
        >
          <div className="px-4 pb-3 pt-2">
            <ChartFigure
              value={`${avgDailyBurn.toLocaleString()} cr / day`}
              caption="Average daily burn rate across the active cycle"
            />
            {rawDailyHistory.length === 0 ? (
              <ChartEmpty height={180}>No activity recorded in this cycle</ChartEmpty>
            ) : (
              <TimeSeriesChart
                variant="area"
                integer={true}
                ariaLabel="Daily burn rate and meetings activity"
                height={180}
                labels={dailyLabels}
                titles={dailyTitles}
                series={[
                  {
                    key: "dailyCredits",
                    label: "Credits Burned",
                    color: "var(--viz-1)",
                    values: rawDailyHistory.map((d) => d.credits),
                  },
                  {
                    key: "meetings",
                    label: "Meetings Held",
                    color: "var(--viz-2)",
                    values: rawDailyHistory.map((d) => d.meetings),
                  },
                ]}
                formatValue={(val) => `${val.toLocaleString()} cr`}
                tooltipFooter={(index) => {
                  const d = rawDailyHistory[index];
                  return d
                    ? `Cost: ${formatFiatWithConversion(d.credits * currencyConfig.ratePerCredit, currencyConfig.currency)}`
                    : null;
                }}
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
