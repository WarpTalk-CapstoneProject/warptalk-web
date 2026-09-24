"use client";

/**
 * The platform admin Insights page, as a pure view over its sources.
 *
 * The route (`/admin`) owns the queries and the URL; the dev preview
 * (`/dev/admin-insights-preview`) feeds this the same props from fixtures. Nothing in here fetches.
 *
 * Every source arrives as a `SourceState`: loading, ready, or unavailable. Unavailable is what a
 * 404 from a backend that predates an endpoint looks like, and also a 5xx — the page cannot tell a
 * missing endpoint from a broken one and does not pretend to. Either way that source's cards say
 * "—" and "Not available yet", and every other source renders normally.
 */

import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  DownloadSimple,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import {
  ChartEmpty,
  DailyLine,
  Donut,
  StackedBars,
  ValueBars,
  type DonutPart,
} from "@/components/admin/insights/insights-charts";
import { insightsHref, metricHref, workspaceHref } from "@/lib/admin/insights-links";
import {
  aiCostBasisView,
  assembleNeedsAttention,
  cartesiaLineView,
  churnSub,
  compactNumber,
  deltaText,
  formatCount,
  formatInsightValue,
  insightsCsv,
  joinNotes,
  mrrSub,
  outstandingSub,
  PERIOD_CARDS,
  periodCardView,
  revenueTodaySub,
  valueTone,
  workspaceLabel,
  type AttentionItem,
  type DeltaTone,
  type ValueTone,
} from "@/lib/admin/insights-metrics";
import {
  monthKeyLabel,
  seriesAxis,
  type InsightsPeriod,
  type ResolvedInsightsPeriod,
} from "@/lib/admin/insights-period";
import { usageServiceOf } from "@/lib/billing/usage-labels";
import { formatMoney } from "@/lib/format/currency";
import { downloadBlob } from "@/lib/ui/download-blob";
import { cn } from "@/lib/utils";
import type { AdminMeetingCountsDto } from "@/types/admin-meeting";
import type { WorkspaceOutboxDeadLetterDto } from "@/types/admin-outbox";
import type { AdminPlatformHealthDto } from "@/types/admin-platform-health";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  MeetingsInsightsDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "@/types/admin-insights";
import type { UsageAlertDto } from "@/types/billing";

export type SourceState<T> =
  | { status: "loading" }
  | { status: "unavailable" }
  /** `refreshing`: the data shown belongs to the previous period while the new one loads. */
  | { status: "ready"; data: T; refreshing?: boolean };

export interface PeriodChoice {
  period: InsightsPeriod;
  month?: string;
  from?: string;
  to?: string;
}

export interface InsightsDashboardProps {
  period: ResolvedInsightsPeriod;
  onChoosePeriod: (choice: PeriodChoice) => void;
  /** Epoch ms of the newest successful read across every source; 0 before the first. */
  updatedAt: number;
  billing: SourceState<BillingInsightsDto>;
  snapshot: SourceState<BillingSnapshotDto>;
  users: SourceState<UsersInsightsDto>;
  workspaces: SourceState<WorkspacesInsightsDto>;
  meetings: SourceState<MeetingsInsightsDto>;
  meetingCounts: SourceState<AdminMeetingCountsDto>;
  deadLetters: SourceState<WorkspaceOutboxDeadLetterDto[]>;
  deadLettersLimit: number;
  newSalesLeads: SourceState<number>;
  suspendedWorkspaces: SourceState<number>;
  /** The pre-insights 24h usage alerts, read only while the snapshot is unavailable. */
  usageAlerts: SourceState<UsageAlertDto[]>;
  health: SourceState<AdminPlatformHealthDto>;
}

const dataOf = <T,>(state: SourceState<T>): T | undefined =>
  state.status === "ready" ? state.data : undefined;

const VALUE_TONE_CLASS: Record<ValueTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-ink",
};

const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  success: "font-semibold text-success",
  danger: "font-semibold text-destructive",
  neutral: "text-ink-muted",
};

const TAG_CLASS: Record<AttentionItem["tone"], string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
};

const CARD = "relative block min-w-0 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5";
const CARD_LINK =
  "transition-colors hover:border-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// ── header + period bar ──────────────────────────────────────────────────────

function UpdatedPulse({ updatedAt }: { updatedAt: number }) {
  const t = useTranslations("adminOps.insights");
  return (
    <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-muted">
      <span
        className={cn(
          "size-[7px] rounded-full",
          updatedAt > 0 ? "bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_20%,transparent)]" : "bg-surface-4",
        )}
      />
      {updatedAt > 0
        ? t("common.updated", {
            time: new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          })
        : t("common.loading")}
    </span>
  );
}

const SEGMENT =
  "inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap border-r border-hairline px-3 text-[13px] font-medium text-ink-muted transition-colors last:border-r-0 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-muted aria-pressed:bg-surface-3 aria-pressed:text-ink";

function monthButtonLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(year, index - 1, 1));
}

function PeriodBar({
  period,
  onChoosePeriod,
  onExport,
}: {
  period: ResolvedInsightsPeriod;
  onChoosePeriod: (choice: PeriodChoice) => void;
  onExport: () => void;
}) {
  const t = useTranslations("adminOps.insights");
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
            {monthButtonLabel(period.month)}
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
        <button
          type="button"
          onClick={onExport}
          className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-panel transition-opacity hover:opacity-85"
        >
          <DownloadSimple size={14} />
          {t("periodBar.export")}
        </button>
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

// ── cards ────────────────────────────────────────────────────────────────────

function CardShell({ href, className, children }: { href?: string | null; className?: string; children: ReactNode }) {
  if (href) {
    return (
      <Link href={href} className={cn(CARD, CARD_LINK, className)}>
        {children}
      </Link>
    );
  }
  return <div className={cn(CARD, className)}>{children}</div>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="truncate text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{children}</div>
  );
}

function PeriodCards({ props }: { props: InsightsDashboardProps }) {
  const t = useTranslations("adminOps.insights");
  const sources = {
    billing: dataOf(props.billing),
    users: dataOf(props.users),
    workspaces: dataOf(props.workspaces),
    meetings: dataOf(props.meetings),
  };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {PERIOD_CARDS.map((spec) => {
        const state = props[spec.source];
        const view = periodCardView(spec, sources, t);
        const loading = state.status === "loading";
        return (
          <CardShell
            key={spec.id}
            href={metricHref(spec.id)}
            className={cn(state.status === "ready" && state.refreshing && "opacity-60")}
          >
            <Eyebrow>{t(`periodCards.${spec.id}`)}</Eyebrow>
            <div
              className={cn(
                "mt-2 truncate text-[21px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
                loading ? "animate-pulse text-ink-muted" : VALUE_TONE_CLASS[view.valueTone],
              )}
              title={view.value}
            >
              {view.value}
            </div>
            {view.available ? (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-ink-muted">
                <span className={DELTA_TONE_CLASS[view.deltaTone]}>{deltaText(view.delta, t)}</span>
                <span>{t("periodCards.lastPeriod", { value: view.previous })}</span>
              </div>
            ) : null}
            {!loading && spec.id === "aiProviderCost" ? (
              <AiCostBasisLine basis={sources.billing?.aiProviderCostBasis} />
            ) : null}
            {!loading && view.note ? <div className="mt-1.5 text-[11px] text-ink-muted">{view.note}</div> : null}
          </CardShell>
        );
      })}
    </div>
  );
}

/**
 * Whether the AI provider cost priced dubbing from measured Cartesia credits or estimated it. The
 * server's note beside it has the arithmetic; this is the one word an admin reads first.
 */
function AiCostBasisLine({ basis }: { basis: BillingInsightsDto["aiProviderCostBasis"] }) {
  const t = useTranslations("adminOps.insights.aiCostBasis");
  const view = aiCostBasisView(basis);
  if (!view) return null;
  return (
    <div className={cn("mt-1.5 text-[11px] font-medium", view.tone === "warning" ? "text-warning" : "text-ink-muted")}>
      {view.basis === "measured"
        ? t("measured")
        : view.basis === "mixed"
          ? t("mixed", { measured: view.measuredDays, total: view.totalDays })
          : t("estimated")}
    </div>
  );
}

/**
 * Cartesia, measured: what billing's usage sync has read. One line, not a card — it is context for
 * the AI cost figure, not a metric of its own — and amber whenever the sync is not healthy, because
 * then the AI cost above it is an estimate.
 */
function CartesiaLine({ state, nowMs }: { state: SourceState<BillingSnapshotDto>; nowMs: number }) {
  const t = useTranslations("adminOps.insights.cartesia");
  const cartesia = state.status === "ready" ? state.data.cartesia : null;
  if (!cartesia) return null;

  const view = cartesiaLineView(cartesia, nowMs);
  const price = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 }).format(cartesia.usdPerCredit);
  const parts = [
    view.creditsThisMonth === null
      ? t("monthUnknown")
      : t("thisMonth", { credits: formatCount(view.creditsThisMonth) }),
    view.creditsToday === null ? null : t("today", { credits: formatCount(view.creditsToday) }),
    view.remainingCredits === null
      ? t("remainingUnknown")
      : t("remaining", { credits: formatCount(view.remainingCredits) }),
    view.syncedMinutesAgo === null ? t("neverSynced") : t("syncedAgo", { minutes: view.syncedMinutesAgo }),
    cartesia.filteredToApiKey ? null : t("allKeys"),
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl border px-4 py-2.5 text-[12px] tabular-nums",
        view.tone === "warning" ? "border-warning/40 bg-warning/10" : "border-hairline bg-surface-1",
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("title")}</span>
      <span className={cn("font-semibold", view.tone === "warning" ? "text-warning" : "text-ink")}>
        {t(`status.${view.state}`)}
      </span>
      <span className="text-ink-muted" title={cartesia.remainingCreditsNote ?? undefined}>
        {parts.join(" · ")}
      </span>
      {view.note ? <span className="min-w-0 text-warning">{view.note}</span> : null}
      <Link href="/admin/settings" className="ml-auto whitespace-nowrap text-[11px] text-primary hover:underline">
        {t("price", { price })} →
      </Link>
    </div>
  );
}

interface SnapshotCardSpec {
  id: string;
  label: string;
  state: SourceState<unknown>;
  value?: number | null;
  display?: string;
  sub?: string | null;
  tone?: ValueTone;
}

function SnapshotCard({ spec }: { spec: SnapshotCardSpec }) {
  const t = useTranslations("adminOps.insights");
  const loading = spec.state.status === "loading";
  const unavailable = spec.state.status === "unavailable";
  const href = spec.state.status === "ready" ? metricHref(spec.id) : null;
  const tone = spec.tone ?? valueTone(spec.id, spec.value);
  return (
    <CardShell href={href}>
      <Eyebrow>{spec.label}</Eyebrow>
      <div
        className={cn(
          "mt-2 truncate text-[24px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
          loading ? "animate-pulse text-ink-muted" : unavailable ? "text-ink" : VALUE_TONE_CLASS[tone],
        )}
      >
        {spec.state.status === "ready" ? (spec.display ?? "—") : "—"}
      </div>
      {unavailable ? (
        <div className="mt-1.5 text-[11px] text-ink-muted">{t("common.notAvailable")}</div>
      ) : spec.state.status === "ready" && spec.sub ? (
        <div className="mt-1.5 truncate text-[11px] text-ink-muted" title={spec.sub}>
          {spec.sub}
        </div>
      ) : null}
    </CardShell>
  );
}

function SnapshotGrid({ cards }: { cards: SnapshotCardSpec[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <SnapshotCard key={card.id} spec={card} />
      ))}
    </div>
  );
}

// ── panels ───────────────────────────────────────────────────────────────────

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
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-1", className)}>
      <header className="flex items-start justify-between gap-2.5 border-b border-hairline px-4 py-2.5">
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

function SourceBody<T>({
  state,
  height,
  empty,
  isEmpty,
  children,
}: {
  state: SourceState<T>;
  height: number;
  empty: string;
  isEmpty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  const t = useTranslations("adminOps.insights");
  if (state.status === "loading") {
    return <div className="animate-pulse rounded-md bg-surface-2" style={{ height }} />;
  }
  if (state.status === "unavailable") {
    return <ChartEmpty height={height}>{t("common.notAvailable")}</ChartEmpty>;
  }
  if (isEmpty(state.data)) return <ChartEmpty height={height}>{empty}</ChartEmpty>;
  return <div className={cn(state.refreshing && "opacity-60")}>{children(state.data)}</div>;
}

const dayShort = (date: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

const SERVICE_COLORS = [
  "var(--usage-service-1)",
  "var(--usage-service-2)",
  "var(--usage-service-3)",
  "var(--usage-service-4)",
  "var(--usage-service-5)",
];

function creditsByServiceParts(rows: BillingInsightsDto["creditsByService"], otherLabel: string): DonutPart[] {
  const grouped = new Map<string, { label: string; value: number }>();
  for (const row of rows) {
    const service = usageServiceOf(row.usageType);
    const entry = grouped.get(service.key) ?? { label: service.label, value: 0 };
    entry.value += row.credits;
    grouped.set(service.key, entry);
  }
  const sorted = [...grouped.entries()].filter(([, entry]) => entry.value > 0).sort((a, b) => b[1].value - a[1].value);
  const parts: DonutPart[] = sorted.slice(0, 5).map(([key, entry], index) => ({ key, label: entry.label, value: entry.value, color: SERVICE_COLORS[index] }));
  const rest = sorted.slice(5).reduce((sum, [, entry]) => sum + entry.value, 0);
  if (rest > 0) parts.push({ key: "other", label: otherLabel, value: rest, color: "var(--usage-service-other)" });
  return parts;
}

function Rows({ children }: { children: ReactNode }) {
  return <ul className="max-h-[252px] overflow-auto">{children}</ul>;
}

function Row({ href, children }: { href?: string | null; children: ReactNode }) {
  const className = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2.5";
  return (
    <li className="border-b border-hairline last:border-b-0">
      {href ? (
        <Link href={href} className={cn(className, "transition-colors hover:bg-surface-2")}>
          {children}
        </Link>
      ) : (
        <div className={className}>{children}</div>
      )}
    </li>
  );
}

function RowText({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="min-w-0">
      <b className="block truncate text-[13px] font-medium text-ink">{title}</b>
      {detail ? <small className="block truncate text-[11px] text-ink-muted">{detail}</small> : null}
    </div>
  );
}

function Tag({ tone, children }: { tone: AttentionItem["tone"] | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-[7px] py-px text-[10.5px] font-semibold",
        tone === "neutral" ? "bg-surface-2 text-ink-muted" : TAG_CLASS[tone],
      )}
    >
      {children}
    </span>
  );
}

function ListEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[12px] text-ink-muted">{children}</p>;
}

function ListState<T>({ state, children }: { state: SourceState<T>; children: (data: T) => ReactNode }) {
  const t = useTranslations("adminOps.insights");
  if (state.status === "loading") {
    return (
      <div className="space-y-2 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    );
  }
  if (state.status === "unavailable") return <ListEmpty>{t("common.notAvailable")}</ListEmpty>;
  return <>{children(state.data)}</>;
}

// ── the page ─────────────────────────────────────────────────────────────────

export function InsightsDashboard(props: InsightsDashboardProps) {
  const t = useTranslations("adminOps.insights");
  const { period } = props;
  const billing = dataOf(props.billing);
  const snapshot = dataOf(props.snapshot);
  const meetingCounts = dataOf(props.meetingCounts);
  const meetingsInsights = dataOf(props.meetings);
  const deadLetters = dataOf(props.deadLetters);
  const deadLettersCapped = deadLetters !== undefined && deadLetters.length >= props.deadLettersLimit;
  const health = dataOf(props.health);

  const attention = useMemo(
    () =>
      assembleNeedsAttention(
        {
          snapshot,
          suspendedWorkspaces: dataOf(props.suspendedWorkspaces),
          deadLetters,
          deadLettersCapped,
          usageAlerts: dataOf(props.usageAlerts),
          newSalesLeads: dataOf(props.newSalesLeads),
          health,
          links: {
            health: insightsHref("health"),
            suspendedWorkspaces: insightsHref("suspendedWorkspaces"),
            deadLetters: insightsHref("deadLetters"),
            newSalesLeads: insightsHref("newSalesLeads"),
            subscriptions: insightsHref("subscriptions"),
            workspace: workspaceHref,
          },
        },
        t,
      ),
    [snapshot, props.suspendedWorkspaces, deadLetters, deadLettersCapped, props.usageAlerts, props.newSalesLeads, health, t],
  );
  const attentionLoading =
    [props.snapshot, props.suspendedWorkspaces, props.deadLetters, props.newSalesLeads, props.health].some(
      (state) => state.status === "loading",
    ) && attention.items.length === 0;

  const handleExport = () => {
    const csv = insightsCsv({
      billing,
      users: dataOf(props.users),
      workspaces: dataOf(props.workspaces),
      meetings: meetingsInsights,
    });
    // A byte-order mark so a spreadsheet opens the file as UTF-8.
    void downloadBlob(
      () => new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
      `warptalk-insights-${period.customFrom}-to-${period.customTo}.csv`,
    ).catch(() => undefined);
  };

  const liveState: SourceState<AdminMeetingCountsDto> =
    props.meetingCounts.status === "ready"
      ? props.meetingCounts
      : meetingsInsights
        ? { status: "ready", data: { liveNow: meetingsInsights.liveNow, startedToday: meetingsInsights.startedToday } }
        : props.meetingCounts;
  const live = dataOf(liveState) ?? meetingCounts;

  const snapshotCards: SnapshotCardSpec[] = [
    {
      id: "revenueToday",
      label: t("cards.revenueToday"),
      state: props.snapshot,
      value: snapshot?.revenueToday,
      display: formatInsightValue(snapshot?.revenueToday, "money"),
      sub: snapshot ? revenueTodaySub(snapshot, t) : null,
    },
    {
      id: "mrr",
      label: t("cards.mrr"),
      state: props.snapshot,
      value: snapshot?.mrr,
      display: formatInsightValue(snapshot?.mrr, "money"),
      sub: snapshot ? mrrSub(snapshot, t) : null,
    },
    {
      id: "activeSubscriptions",
      label: t("cards.activeSubscriptions"),
      state: props.snapshot,
      value: snapshot?.activeSubscriptions,
      display: formatInsightValue(snapshot?.activeSubscriptions, "count"),
      sub: snapshot
        ? [
            t("cards.monthlyCount", { count: formatCount(snapshot.activeByCycle.monthly) }),
            t("cards.yearlyCount", { count: formatCount(snapshot.activeByCycle.yearly) }),
            snapshot.activeByCycle.other > 0 ? t("cards.otherCount", { count: formatCount(snapshot.activeByCycle.other) }) : null,
          ].filter(Boolean).join(" · ")
        : null,
    },
    {
      id: "churnRate",
      label: t("cards.churnRate"),
      state: props.snapshot,
      value: snapshot?.churnRateMonth.rate,
      display: formatInsightValue(snapshot?.churnRateMonth.rate, "percent"),
      sub: snapshot ? churnSub(snapshot.churnRateMonth, t) : null,
    },
  ];

  const opsCards: SnapshotCardSpec[] = [
    {
      id: "liveMeetings",
      label: t("cards.liveMeetings"),
      state: liveState,
      value: live?.liveNow,
      display: formatInsightValue(live?.liveNow, "count"),
      sub: live ? t("cards.startedToday", { count: live.startedToday }) : null,
      tone: "neutral",
    },
    {
      id: "outstandingInvoices",
      label: t("cards.outstandingInvoices"),
      state: props.snapshot,
      value: snapshot?.outstandingInvoices.count,
      display: formatInsightValue(snapshot?.outstandingInvoices.amount, "money"),
      sub: snapshot ? outstandingSub(snapshot.outstandingInvoices, t) : null,
    },
    {
      id: "openSalesLeads",
      label: t("cards.openSalesLeads"),
      state: props.newSalesLeads,
      value: dataOf(props.newSalesLeads),
      display: formatInsightValue(dataOf(props.newSalesLeads), "count"),
      sub: t("cards.newWaitingReply"),
    },
    {
      id: "deadLetters",
      label: t("cards.deadLetters"),
      state: props.deadLetters,
      value: deadLetters?.length,
      display: deadLetters ? `${formatCount(deadLetters.length)}${deadLettersCapped ? "+" : ""}` : "—",
      sub: t("cards.workspaceEventOutbox"),
    },
  ];

  const moreCards: SnapshotCardSpec[] = [
    {
      id: "trials",
      label: t("cards.trials"),
      state: props.snapshot,
      display: formatInsightValue(snapshot?.trials, "count"),
      sub: snapshot ? t("cards.endThisWeek", { count: snapshot.trialsEndingThisWeek }) : null,
    },
    {
      id: "pastDue",
      label: t("cards.pastDue"),
      state: props.snapshot,
      value: snapshot?.pastDue,
      display: formatInsightValue(snapshot?.pastDue, "count"),
      sub: snapshot ? t("cards.suspendedCount", { count: snapshot.suspended }) : null,
    },
    {
      id: "activeWorkspaces",
      label: t("cards.activeWorkspaces"),
      state: props.snapshot,
      display: formatInsightValue(snapshot?.activeWorkspaces, "count"),
      sub: t("cards.withActiveSubscription"),
    },
    {
      id: "platformCreditBalance",
      label: t("cards.platformCreditBalance"),
      state: props.snapshot,
      display: formatInsightValue(snapshot?.platformCreditBalance, "credits"),
      sub: t("cards.creditsAcrossWorkspaces"),
    },
  ];

  const isMonth = period.period === "month";

  return (
    <div className="flex flex-col gap-3.5 text-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.4px]">{t("title")}</h1>
        <UpdatedPulse updatedAt={props.updatedAt} />
      </div>

      {/* Keyed so the custom date drafts follow the URL after back/forward. */}
      <PeriodBar
        key={`${period.period}:${period.customFrom}:${period.customTo}`}
        period={period}
        onChoosePeriod={props.onChoosePeriod}
        onExport={handleExport}
      />

      {/* Period cards follow the period bar; the rows under them are "right now". */}
      <PeriodCards props={props} />
      <SnapshotGrid cards={snapshotCards} />
      <SnapshotGrid cards={opsCards} />
      <CartesiaLine state={props.snapshot} nowMs={props.updatedAt} />

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 px-0.5 py-1 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <CaretRight size={14} className="transition-transform group-open:rotate-90" />
          <span className="group-open:hidden">{t("periodCards.showMore", { count: moreCards.length })}</span>
          <span className="hidden group-open:inline">{t("periodCards.hideMore", { count: moreCards.length })}</span>
        </summary>
        <div className="mt-2.5">
          <SnapshotGrid cards={moreCards} />
        </div>
      </details>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel
          title={t("charts.revenue6mTitle")}
          subtitle={joinNotes(t("charts.revenueByMonthSubtitle"), billing?.revenueByMonthNote) ?? undefined}
          link={{ href: insightsHref("subscriptions"), label: t("links.subscriptions") }}
        >
          <div className="px-4 py-3.5">
            <SourceBody
              state={props.billing}
              height={220}
              empty={t("charts.noRevenue6m")}
              isEmpty={(data) => (data.revenueByMonth ?? []).length === 0}
            >
              {(data) => (
                <ValueBars
                  ariaLabel={t("charts.ariaRevenueByMonth")}
                  color="var(--success)"
                  data={data.revenueByMonth.map((row) => ({
                    key: row.month,
                    label: monthKeyLabel(row.month),
                    value: row.revenue,
                    title: `${monthKeyLabel(row.month)}: ${row.revenue === null ? t("charts.noFigure") : formatMoney(row.revenue, "VND")}`,
                  }))}
                />
              )}
            </SourceBody>
          </div>
        </Panel>
        <Panel
          title={t("charts.revenuePerDayTitle")}
          subtitle={joinNotes(
            isMonth ? t("charts.revenuePerDayNote", { label: period.label }) : period.label,
            billing?.revenueByDayNote,
          ) ?? undefined}
          link={{ href: insightsHref("billingLedger"), label: t("links.ledger") }}
        >
          <div className="px-4 py-3.5">
            <SourceBody
              state={props.billing}
              height={220}
              empty={t("charts.noDaysInPeriod")}
              isEmpty={(data) => (data.revenueByDay ?? []).length === 0}
            >
              {(data) => (
                // The server's own local days (of the tz the page sent), labelled from their keys.
                <DailyLine
                  ariaLabel={t("charts.ariaRevenuePerDay")}
                  formatValue={(value) => formatMoney(value, "VND")}
                  points={seriesAxis(data.revenueByDay, period.axisEndDay).map((day) => ({
                    key: day.key,
                    label: day.label,
                    value: day.row?.revenue ?? null,
                  }))}
                />
              )}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title={t("charts.creditsByServiceTitle")} subtitle={t("charts.creditsByServiceSubtitle", { period: period.label })} link={{ href: insightsHref("workspaces"), label: t("links.workspaces") }}>
          <div className="px-4 py-3.5">
            <SourceBody
              state={props.billing}
              height={170}
              empty={t("charts.noCreditsConsumed")}
              isEmpty={(data) => creditsByServiceParts(data.creditsByService ?? [], t("charts.otherService")).length === 0}
            >
              {(data) => {
                const parts = creditsByServiceParts(data.creditsByService, t("charts.otherService"));
                const total = parts.reduce((sum, part) => sum + part.value, 0);
                return <Donut ariaLabel={t("charts.ariaCreditsByService")} parts={parts} centerLabel={compactNumber(total)} />;
              }}
            </SourceBody>
          </div>
        </Panel>
        <Panel title={t("charts.subscriptionsByPlanTitle")} subtitle={t("charts.subscriptionsByPlanSubtitle")} link={{ href: insightsHref("plans"), label: t("links.plans") }}>
          <div className="px-4 py-3.5">
            <SourceBody
              state={props.snapshot}
              height={170}
              empty={t("charts.noSubscriptionsYet")}
              isEmpty={(data) => (data.subscriptionsByPlan ?? []).length === 0}
            >
              {(data) => (
                <>
                  <StackedBars
                    ariaLabel={t("charts.ariaSubscriptionsByPlan")}
                    rows={data.subscriptionsByPlan.map((plan) => ({
                      key: plan.planSlug,
                      label: plan.planName,
                      segments: [
                        { key: "active", label: t("charts.legendActive"), value: plan.active, color: "var(--primary)" },
                        { key: "trial", label: t("charts.legendTrial"), value: plan.trial, color: "var(--info)", opacity: 0.45 },
                        { key: "pastDue", label: t("charts.legendPastDue"), value: plan.pastDue, color: "var(--warning)" },
                      ],
                    }))}
                  />
                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block size-[9px] rounded-[2px] bg-primary" />{t("charts.legendActive")}</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block size-[9px] rounded-[2px] bg-info opacity-45" />{t("charts.legendTrial")}</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block size-[9px] rounded-[2px] bg-warning" />{t("charts.legendPastDue")}</span>
                  </div>
                </>
              )}
            </SourceBody>
          </div>
        </Panel>
        <Panel title={t("charts.meetingsPerDayTitle")} subtitle={t("charts.meetingsPerDaySubtitle")} link={{ href: insightsHref("meetings"), label: t("links.meetings") }}>
          <div className="px-4 py-3.5">
            <SourceBody
              state={props.meetings}
              height={170}
              empty={t("charts.noDaysInPeriod")}
              isEmpty={(data) => (data.meetingsByDay ?? []).length === 0}
            >
              {(data) => {
                const days = seriesAxis(data.meetingsByDay, period.axisEndDay);
                return (
                  <ValueBars
                    ariaLabel={t("charts.ariaMeetingsPerDay")}
                    color="var(--primary)"
                    height={170}
                    showValues={days.length <= 16}
                    data={days.map((day) => ({
                      key: day.key,
                      label: day.label,
                      value: day.row?.meetings ?? null,
                      title: day.row
                        ? t("charts.meetingsTooltip", {
                            label: day.label,
                            count: day.row.meetings,
                            hours: formatInsightValue(day.row.hours, "hours"),
                          })
                        : t("charts.stillToCome", { label: day.label }),
                    }))}
                  />
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t("needsAttention.title")} subtitle={t("needsAttention.subtitle")}>
          {attentionLoading ? (
            <ListState state={{ status: "loading" }}>{() => null}</ListState>
          ) : attention.items.length === 0 ? (
            <ListEmpty>
              {attention.unavailable.length === 0
                ? t("needsAttention.nothingNow")
                : t("needsAttention.nothingAnswered")}
            </ListEmpty>
          ) : (
            <Rows>
              {attention.items.map((item) => (
                <Row key={item.key} href={item.href}>
                  <RowText title={item.title} detail={item.detail} />
                  <Tag tone={item.tone}>{item.tag}</Tag>
                </Row>
              ))}
            </Rows>
          )}
          {!attentionLoading && attention.unavailable.length > 0 ? (
            <footer className="border-t border-hairline px-4 py-2 text-[11px] text-ink-muted">
              {t("needsAttention.notChecked", { sources: attention.unavailable.join(", ") })}
            </footer>
          ) : null}
        </Panel>

        <Panel title={t("panels.topWorkspacesTitle")} subtitle={period.label} link={{ href: insightsHref("workspaces"), label: t("links.workspaces") }}>
          <ListState state={props.billing}>
            {(data) => {
              const top = data.topWorkspaces ?? [];
              if (top.length === 0) return <ListEmpty>{t("charts.noCreditsConsumed")}</ListEmpty>;
              const max = Math.max(1, ...top.map((row) => row.credits));
              return (
                <Rows>
                  {top.map((row, index) => (
                    <Row key={row.workspaceId} href={workspaceHref(row.workspaceId)}>
                      <div className="min-w-0">
                        <b className="block truncate text-[13px] font-medium text-ink">
                          {index + 1}. {workspaceLabel(row.workspaceName, t)}
                        </b>
                        <span className="mt-1.5 block h-[3px] rounded-full bg-surface-3">
                          <span className="block h-[3px] rounded-full bg-primary" style={{ width: `${Math.max(2, (row.credits / max) * 100)}%` }} />
                        </span>
                      </div>
                      <div className="text-right text-[13px] tabular-nums text-ink">{formatCount(row.credits)}</div>
                    </Row>
                  ))}
                </Rows>
              );
            }}
          </ListState>
        </Panel>

        <Panel title={t("panels.recentPaymentsTitle")} subtitle={t("panels.recentPaymentsSubtitle")} link={{ href: insightsHref("billingLedger"), label: t("links.ledger") }}>
          <ListState state={props.snapshot}>
            {(data) =>
              (data.recentPayments ?? []).length === 0 ? (
                <ListEmpty>{t("panels.noPaymentsYet")}</ListEmpty>
              ) : (
                <Rows>
                  {data.recentPayments.map((payment, index) => {
                    const status = payment.status.toLowerCase();
                    const tone = status === "paid" || status === "succeeded" ? "success" : status === "failed" ? "danger" : "neutral";
                    return (
                      <Row key={`${payment.workspaceId}-${payment.at}-${index}`} href={workspaceHref(payment.workspaceId)}>
                        <RowText
                          title={payment.workspaceId ? workspaceLabel(payment.workspaceName, t) : t("panels.noWorkspace")}
                          detail={[dateTime(payment.at), payment.method].filter(Boolean).join(" · ")}
                        />
                        <div className="text-right text-[13px] tabular-nums text-ink">
                          {formatMoney(payment.amount, payment.currency)}
                          <div className="mt-0.5">
                            <Tag tone={tone}>{payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}</Tag>
                          </div>
                        </div>
                      </Row>
                    );
                  })}
                </Rows>
              )
            }
          </ListState>
        </Panel>

        <Panel
          title={t("panels.endingSoonTitle")}
          subtitle={t("panels.endingSoonSubtitle")}
          link={{ href: insightsHref("subscriptionsEndingSoon"), label: t("links.subscriptions") }}
        >
          <ListState state={props.snapshot}>
            {(data) =>
              (data.endingSoon ?? []).length === 0 ? (
                <ListEmpty>{t("panels.noEndingSoon")}</ListEmpty>
              ) : (
                <Rows>
                  {data.endingSoon.map((row) => (
                    <Row key={`${row.workspaceId}-${row.endsAt}`} href={workspaceHref(row.workspaceId)}>
                      <RowText
                        title={workspaceLabel(row.workspaceName, t)}
                        detail={t("panels.planRenewal", {
                          plan: row.planName,
                          renewal: row.cancelAtPeriodEnd ? t("panels.willNotRenew") : t("panels.renews"),
                        })}
                      />
                      <div className={cn("text-right text-[13px] tabular-nums", row.cancelAtPeriodEnd ? "text-warning" : "text-ink")}>
                        {dayShort(new Date(row.endsAt))}
                      </div>
                    </Row>
                  ))}
                </Rows>
              )
            }
          </ListState>
        </Panel>
      </div>
    </div>
  );
}
