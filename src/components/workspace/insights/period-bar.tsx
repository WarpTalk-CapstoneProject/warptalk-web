"use client";

/**
 * The workspace Insights period bar (WT-878): Today, 7 days, a month with its arrows, 6 months and
 * a custom range, the caption that says what the comparison is, and Export.
 *
 * The platform Insights page's bar, class for class; its resolver (`lib/admin/insights-period.ts`)
 * is reused as is, so the two pages cut the same windows and say the same captions. The URL is the
 * source of truth: this only reports a choice, the route writes it.
 */

import { CalendarBlank, CaretLeft, CaretRight, DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { InsightsPeriod, ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import { cn } from "@/lib/utils";

export interface PeriodChoice {
  period: InsightsPeriod;
  month?: string;
  from?: string;
  to?: string;
}

const SEGMENT =
  "inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap border-r border-hairline px-3 text-[13px] font-medium text-ink-muted transition-colors last:border-r-0 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted aria-pressed:bg-surface-3 aria-pressed:text-ink";

function monthButtonLabel(month: string, locale: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(year, index - 1, 1));
}

export function PeriodBar({
  period,
  onChoosePeriod,
  onExport,
  locale = "en-US",
}: {
  period: ResolvedInsightsPeriod;
  onChoosePeriod: (choice: PeriodChoice) => void;
  /** Absent: no Export button (a tab with nothing of its own to export). */
  onExport?: () => void;
  locale?: string;
}) {
  const t = useTranslations("workspaceInsights");
  const [customOpen, setCustomOpen] = useState(period.period === "custom");
  const [draftFrom, setDraftFrom] = useState(period.customFrom);
  const [draftTo, setDraftTo] = useState(period.customTo);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label={t("periodBar.groupLabel")} className="inline-flex flex-wrap overflow-hidden rounded-lg border border-hairline bg-surface-1">
          <button type="button" className={SEGMENT} aria-pressed={period.period === "today"} onClick={() => onChoosePeriod({ period: "today" })}>
            {t("periodBar.today")}
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "7d"} onClick={() => onChoosePeriod({ period: "7d" })}>
            {t("periodBar.days7")}
          </button>
          <button type="button" className={cn(SEGMENT, "px-2.5")} aria-label={t("periodBar.previousMonth")} onClick={() => onChoosePeriod({ period: "month", month: period.prevMonth })}>
            <CaretLeft size={14} />
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "month"} onClick={() => onChoosePeriod({ period: "month", month: period.month })}>
            {monthButtonLabel(period.month, locale)}
          </button>
          <button
            type="button"
            className={cn(SEGMENT, "px-2.5")}
            aria-label={t("periodBar.nextMonth")}
            disabled={!period.nextMonth}
            title={period.nextMonth ? undefined : t("periodBar.currentMonthTitle")}
            onClick={() => period.nextMonth && onChoosePeriod({ period: "month", month: period.nextMonth })}
          >
            <CaretRight size={14} />
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "6m"} onClick={() => onChoosePeriod({ period: "6m" })}>
            {t("periodBar.months6")}
          </button>
          <button
            type="button"
            className={SEGMENT}
            aria-pressed={period.period === "custom"}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
          >
            <CalendarBlank size={14} />
            {t("periodBar.custom")}
          </button>
        </div>
        <span className="text-[13px] text-ink-muted">{period.caption}</span>
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-panel transition-opacity hover:opacity-85"
          >
            <DownloadSimple size={14} />
            {t("periodBar.export")}
          </button>
        ) : null}
      </div>

      {customOpen ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline bg-surface-1 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftFrom && draftTo) onChoosePeriod({ period: "custom", from: draftFrom, to: draftTo });
          }}
        >
          <label className="text-[11px] text-ink-muted">
            {t("periodBar.from")}
            <input
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="mt-1 block h-8 rounded-md border border-input bg-surface-1 px-2 text-[13px] text-ink"
            />
          </label>
          <label className="text-[11px] text-ink-muted">
            {t("periodBar.to")}
            <input
              type="date"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
              className="mt-1 block h-8 rounded-md border border-input bg-surface-1 px-2 text-[13px] text-ink"
            />
          </label>
          <button
            type="submit"
            disabled={!draftFrom || !draftTo}
            className="h-8 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("periodBar.showRange")}
          </button>
        </form>
      ) : null}

      {period.notice ? <p className="text-[12px] text-warning">{period.notice}</p> : null}
    </div>
  );
}
