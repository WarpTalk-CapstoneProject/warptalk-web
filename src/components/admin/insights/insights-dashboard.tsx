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
  Info,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";

import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import {
  CHART_COLORS,
  ChartEmpty,
  ChartFigure,
  TimeSeriesChart,
} from "@/components/admin/charts/time-series-chart";
import { compactMoney, sumKnown } from "@/lib/admin/chart-scale";
import { insightsHref, metricHref, workspaceHref } from "@/lib/admin/insights-links";
import {
  aiCostBasisView,
  assembleNeedsAttention,
  cartesiaLineView,
  churnSub,
  deltaText,
  formatCount,
  formatInsightValue,
  insightsCsv,
  joinNotes,
  mrrSub,
  NOT_AVAILABLE_NOTE,
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
  costPerMeetingHourByDay,
  fxLineView,
  pnlCards,
  providerColors,
  providerCostSeries,
  providerLabel,
  type CostCurrency,
} from "@/lib/admin/insights-pnl";
import {
  monthKeyLabel,
  seriesAxis,
  type InsightsPeriod,
  type ResolvedInsightsPeriod,
} from "@/lib/admin/insights-period";
import { usageServiceOf } from "@/lib/billing/usage-labels";
import { Tooltip } from "@/components/ui/tooltip";
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
  ProfitAndLossDto,
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
  /** Profit and loss (revenue, AI cost, margin, providers, plans, workspace trend). Absent = unavailable. */
  pnl?: SourceState<ProfitAndLossDto>;
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
  return (
    <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-ink-muted">
      <span
        className={cn(
          "size-[7px] rounded-full",
          updatedAt > 0 ? "bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_20%,transparent)]" : "bg-surface-4",
        )}
      />
      {updatedAt > 0
        ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
        : "Loading…"}
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
  const [customOpen, setCustomOpen] = useState(period.period === "custom");
  const [draftFrom, setDraftFrom] = useState(period.customFrom);
  const [draftTo, setDraftTo] = useState(period.customTo);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label="Period" className="inline-flex flex-wrap overflow-hidden rounded-lg border border-hairline bg-surface-1">
          <button type="button" className={SEGMENT} aria-pressed={period.period === "today"} onClick={() => onChoosePeriod({ period: "today" })}>
            Today
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "7d"} onClick={() => onChoosePeriod({ period: "7d" })}>
            7 days
          </button>
          <button type="button" className={cn(SEGMENT, "px-2.5")} aria-label="Previous month" onClick={() => onChoosePeriod({ period: "month", month: period.prevMonth })}>
            <CaretLeft size={14} />
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "month"} onClick={() => onChoosePeriod({ period: "month", month: period.month })}>
            {monthButtonLabel(period.month)}
          </button>
          <button
            type="button"
            className={cn(SEGMENT, "px-2.5")}
            aria-label="Next month"
            disabled={!period.nextMonth}
            title={period.nextMonth ? undefined : "This is the current month"}
            onClick={() => period.nextMonth && onChoosePeriod({ period: "month", month: period.nextMonth })}
          >
            <CaretRight size={14} />
          </button>
          <button type="button" className={SEGMENT} aria-pressed={period.period === "6m"} onClick={() => onChoosePeriod({ period: "6m" })}>
            6 months
          </button>
          <button
            type="button"
            className={SEGMENT}
            aria-pressed={period.period === "custom"}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
          >
            <CalendarBlank size={14} />
            Custom
          </button>
        </div>
        <span className="text-[13px] text-ink-muted">{period.caption}</span>
        <button
          type="button"
          onClick={onExport}
          className="ml-auto inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-panel transition-opacity hover:opacity-85"
        >
          <DownloadSimple size={14} />
          Export
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
            From
            <input
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="mt-1 block h-8 rounded-md border border-input bg-surface-1 px-2 text-[13px] text-ink"
            />
          </label>
          <label className="text-[11px] text-ink-muted">
            To (inclusive)
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
            Show this range
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

/**
 * A card's label, with its fine print behind an info icon. The server's notes run to a paragraph
 * (coverage, pro-rating, FX); printed in the card they pushed every card in the row to their
 * height. The icon sits inside a card that is itself a link, so a click on it must not navigate.
 */
function CardLabel({ label, note }: { label: ReactNode; note?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Eyebrow>{label}</Eyebrow>
      {note ? (
        <Tooltip content={note} side="bottom" className="max-w-[320px]">
          <span
            role="img"
            aria-label={note}
            className="-m-1 inline-flex shrink-0 cursor-help rounded p-1 text-ink-subtle outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Info size={13} weight="bold" aria-hidden />
          </span>
        </Tooltip>
      ) : null}
    </div>
  );
}

function PeriodCards({ props }: { props: InsightsDashboardProps }) {
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
        const view = periodCardView(spec, sources);
        const loading = state.status === "loading";
        return (
          <CardShell
            key={spec.id}
            href={metricHref(spec.id)}
            className={cn(state.status === "ready" && state.refreshing && "opacity-60")}
          >
            <CardLabel label={spec.label} note={loading ? null : view.note} />
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
                <span className={DELTA_TONE_CLASS[view.deltaTone]}>{deltaText(view.delta)}</span>
                <span>last period {view.previous}</span>
              </div>
            ) : null}
            {!loading && spec.id === "aiProviderCost" ? (
              <AiCostBasisLine basis={sources.billing?.aiProviderCostBasis} />
            ) : null}
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
        <div className="mt-1.5 text-[11px] text-ink-muted">{NOT_AVAILABLE_NOTE}</div>
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
  chart = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  link?: { href: string; label: string };
  /** A chart card: no rule under the title, so the headline figure reads as part of it. */
  chart?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    // overflow-hidden keeps row hovers inside the rounded corners. It cannot clip a chart's hover
    // readout any more: that is portalled to <body> (components/admin/charts/chart-tooltip).
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-hairline bg-surface-1", className)}>
      <header className={cn("flex items-start justify-between gap-2.5 px-4", chart ? "pt-3.5" : "border-b border-hairline py-2.5")}>
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
  if (state.status === "loading") {
    return <div className="animate-pulse rounded-md bg-surface-2" style={{ height }} />;
  }
  if (state.status === "unavailable") {
    return <ChartEmpty height={height}>{NOT_AVAILABLE_NOTE}</ChartEmpty>;
  }
  if (isEmpty(state.data)) return <ChartEmpty height={height}>{empty}</ChartEmpty>;
  return <div className={cn(state.refreshing && "opacity-60")}>{children(state.data)}</div>;
}

const dayShort = (date: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** The five largest services, then "Other" — ranked bars, one hue: the rank is the length. */
function creditsByServiceRows(rows: BillingInsightsDto["creditsByService"]): BarListRow[] {
  const grouped = new Map<string, { label: string; value: number }>();
  for (const row of rows) {
    const service = usageServiceOf(row.usageType);
    const entry = grouped.get(service.key) ?? { label: service.label, value: 0 };
    entry.value += row.credits;
    grouped.set(service.key, entry);
  }
  const sorted = [...grouped.entries()].filter(([, entry]) => entry.value > 0).sort((a, b) => b[1].value - a[1].value);
  const result: BarListRow[] = sorted.slice(0, 5).map(([key, entry]) => ({
    key,
    label: entry.label,
    segments: [{ key, label: entry.label, value: entry.value }],
  }));
  const rest = sorted.slice(5).reduce((sum, [, entry]) => sum + entry.value, 0);
  if (rest > 0) {
    result.push({ key: "other", label: "Other", segments: [{ key: "other", label: "Other", value: rest, color: "var(--usage-service-other)" }] });
  }
  return result;
}

/** "Tue, Sep 16" from a server day key, for tooltip titles. */
function dayKeyTitle(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

const moneyVnd = (value: number) => formatMoney(value, "VND");
const moneyAxis = (value: number) => compactMoney(value, "VND");

const SUBSCRIPTION_SEGMENTS = [
  { key: "active", label: "Active", color: CHART_COLORS.primary },
  // A lighter step of the same hue: a trial is an account that has not paid yet, not another kind.
  { key: "trial", label: "Trial", color: "color-mix(in srgb, var(--viz-1) 40%, var(--surface-1))" },
  // Status, not identity: past due is the one state that needs acting on.
  { key: "pastDue", label: "Past due", color: "var(--warning)" },
] as const;

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
  if (state.status === "loading") {
    return (
      <div className="space-y-2 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    );
  }
  if (state.status === "unavailable") return <ListEmpty>{NOT_AVAILABLE_NOTE}</ListEmpty>;
  return <>{children(state.data)}</>;
}


// ── profit and loss ──────────────────────────────────────────────────────────

const moneyUsd = (value: number) => formatMoney(Math.round(value * 100) / 100, "USD");
const usdAxis = (value: number) => compactMoney(value, "USD");
const percentText = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
const instantText = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Where the USD→VND rate every figure below converts with came from, and when. Amber, with the
 * server's own warning, whenever Stripe has not answered for a day — the rate is then the last known
 * one, and the admin is told, not left to assume.
 */
function FxLine({ pnl }: { pnl: ProfitAndLossDto }) {
  const view = fxLineView(pnl.fx, instantText);
  if (!view) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl border px-4 py-2.5 text-[12px] tabular-nums",
        view.tone === "warning" ? "border-warning/40 bg-warning/10" : "border-hairline bg-surface-1",
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">USD → VND</span>
      <span className={cn("font-semibold", view.tone === "warning" ? "text-warning" : "text-ink")}>{view.rate}</span>
      <span className="text-ink-muted">
        {[view.source, view.asOf ? `as of ${view.asOf}` : null, pnl.fxNote].filter(Boolean).join(" · ")}
      </span>
      {view.warning ? <span className="min-w-0 text-warning">{view.warning}</span> : null}
      <Link href="/admin/settings" className="ml-auto whitespace-nowrap text-[11px] text-primary hover:underline">
        Rate settings →
      </Link>
    </div>
  );
}

function ProfitAndLossSection({ props }: { props: InsightsDashboardProps }) {
  const state: SourceState<ProfitAndLossDto> = props.pnl ?? { status: "unavailable" };
  const pnl = dataOf(state);
  const meetings = dataOf(props.meetings);
  const { period } = props;
  const [currency, setCurrency] = useState<CostCurrency>("VND");
  const cards = pnlCards(pnl, meetings);
  const loading = state.status === "loading";

  return (
    <section aria-labelledby="pnl-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pnl-heading" className="text-[15px] font-semibold text-ink">Profit and loss</h2>
        {pnl ? (
          <span className="text-[11px] text-ink-muted">
            AI cost covers {percentText(pnl.costCoveragePercent)} of consumed credits
            {pnl.costCoveragePercent < 100 ? " — margins are overstated by the rest" : ""}
          </span>
        ) : null}
      </div>
      {pnl ? <FxLine pnl={pnl} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.id} className={cn(CARD, state.status === "ready" && state.refreshing && "opacity-60")}>
            <CardLabel label={card.label} note={loading ? null : card.note} />
            <div
              className={cn(
                "mt-2 truncate text-[21px] font-semibold leading-[1.1] tracking-[-0.4px] tabular-nums",
                loading ? "animate-pulse text-ink-muted" : VALUE_TONE_CLASS[card.tone],
              )}
              title={card.value}
            >
              {card.value}
            </div>
            {card.available ? (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-ink-muted">
                <span className={DELTA_TONE_CLASS[card.deltaTone]}>{deltaText(card.delta)}</span>
                <span>last period {card.previous}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel chart title="Revenue and AI cost per day" link={{ href: insightsHref("billingLedger"), label: "Ledger" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={state} height={240} empty="No days in this period." isEmpty={(data) => data.days.length === 0}>
              {(data) => {
                const days = seriesAxis(data.days.map((row) => ({ ...row, date: row.key })), period.axisEndDay);
                const perHour = costPerMeetingHourByDay(data.days, meetings?.meetingsByDay);
                const perHourByKey = new Map(data.days.map((row, index) => [row.key, perHour[index]]));
                const margin = findPnlMetric(data, "grossMargin");
                return (
                  <>
                    <ChartFigure
                      value={formatInsightValue(margin?.value, "money")}
                      caption={joinNotes("Gross margin · revenue minus AI provider cost", margin?.note)}
                    />
                    <TimeSeriesChart
                      variant="line"
                      ariaLabel="Revenue and AI provider cost per day"
                      height={200}
                      labels={days.map((d) => d.label)}
                      titles={days.map((d) => dayKeyTitle(d.key))}
                      series={[
                        { key: "revenue", label: "Revenue", values: days.map((d) => d.row?.revenue ?? null) },
                        { key: "aiCost", label: "AI provider cost", values: days.map((d) => d.row?.aiCost ?? null) },
                      ]}
                      formatValue={moneyVnd}
                      formatAxis={moneyAxis}
                      describeGap={(index) => (days[index]?.future ? "Still to come" : "No figure")}
                      tooltipFooter={(index) => {
                        const row = days[index]?.row;
                        if (!row) return null;
                        const hourCost = perHourByKey.get(row.key);
                        return [
                          `Margin ${percentText(row.marginPercent)}`,
                          hourCost != null ? `${moneyVnd(hourCost)} per meeting-hour` : null,
                          row.fxRate ? `${new Intl.NumberFormat("en-US").format(row.fxRate)} VND/USD` : null,
                        ].filter(Boolean).join(" · ");
                      }}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
        <Panel chart title="Profit and loss, 6 months">
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={state} height={240} empty="No months." isEmpty={(data) => data.months.length === 0}>
              {(data) => {
                const months = data.months;
                const margins = months.map((m) => m.grossMargin);
                return (
                  <>
                    <ChartFigure
                      value={formatInsightValue(sumKnown(margins), "money")}
                      caption="Gross margin over six months · revenue vs AI cost"
                    />
                    <TimeSeriesChart
                      variant="bar"
                      ariaLabel="Revenue and AI provider cost per month"
                      height={180}
                      labels={months.map((m) => monthKeyLabel(m.key))}
                      series={[
                        { key: "revenue", label: "Revenue", values: months.map((m) => m.revenue) },
                        { key: "aiCost", label: "AI provider cost", values: months.map((m) => m.aiCost) },
                      ]}
                      formatValue={moneyVnd}
                      formatAxis={moneyAxis}
                      tooltipFooter={(index) => {
                        const row = months[index];
                        return row
                          ? `Margin ${formatInsightValue(row.grossMargin, "money")} (${percentText(row.marginPercent)}) · ARPA ${formatInsightValue(row.arpa, "money")}`
                          : null;
                      }}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel chart title="AI provider cost over time">
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={state} height={240} empty="No provider cost in this period." isEmpty={(data) => data.providers.length === 0}>
              {(data) => {
                const days = seriesAxis(data.days.map((row) => ({ ...row, date: row.key })), period.axisEndDay);
                const rows = days.map((d) => d.row).filter((row): row is NonNullable<typeof row> => row !== null);
                const series = providerCostSeries(rows, currency);
                const colors = providerColors(series.map((s) => s.key));
                const pad = days.length - rows.length;
                const format = currency === "USD" ? moneyUsd : moneyVnd;
                return (
                  <>
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <ChartFigure
                        value={currency === "USD" ? moneyUsd(data.aiCostUsd) : formatInsightValue(findPnlMetric(data, "aiProviderCost")?.value, "money")}
                        caption="AI provider cost, by provider"
                      />
                      <div role="group" aria-label="Currency" className="inline-flex overflow-hidden rounded-md border border-hairline">
                        {(["VND", "USD"] as const).map((code) => (
                          <button
                            key={code}
                            type="button"
                            aria-pressed={currency === code}
                            onClick={() => setCurrency(code)}
                            className="px-2.5 py-1 text-[11px] font-medium text-ink-muted aria-pressed:bg-surface-3 aria-pressed:text-ink"
                          >
                            {code}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TimeSeriesChart
                      variant="line"
                      ariaLabel={`AI provider cost per day in ${currency}, by provider`}
                      height={200}
                      labels={days.map((d) => d.label)}
                      titles={days.map((d) => dayKeyTitle(d.key))}
                      series={series.map((s) => ({
                        key: s.key,
                        label: s.label,
                        color: colors[s.key],
                        values: [...s.values, ...Array<number | null>(pad).fill(null)],
                      }))}
                      formatValue={format}
                      formatAxis={currency === "USD" ? usdAxis : moneyAxis}
                      describeGap={(index) => (days[index]?.future ? "Still to come" : "No USD→VND rate")}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
        <Panel chart title="Credits by AI provider">
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={state} height={200} empty="No credits consumed in this period." isEmpty={(data) => data.providers.length === 0}>
              {(data) => {
                const colors = providerColors(data.providers.map((p) => p.provider));
                const services = [...new Set(data.providers.flatMap((p) => p.services.map((s) => s.service)))];
                const serviceColor = (index: number) => `color-mix(in srgb, var(--viz-1) ${100 - index * 22}%, var(--surface-1))`;
                return (
                  <>
                    <ChartFigure
                      value={formatCount(data.providers.reduce((sum, p) => sum + p.credits, 0))}
                      caption="Credits consumed · STT / MT / TTS / LLM split"
                    />
                    <BarList
                      ariaLabel="Credits consumed by AI provider"
                      formatValue={formatCount}
                      legend={services.map((service, index) => ({ key: service, label: service, color: serviceColor(index) }))}
                      rows={data.providers.map((provider) => ({
                        key: provider.provider,
                        label: providerLabel(provider.provider),
                        valueText: `${formatCount(provider.credits)} · ${moneyUsd(provider.costUsd)}${provider.costVnd === null ? "" : ` · ${moneyVnd(provider.costVnd)}`}`,
                        segments: provider.services.map((service) => ({
                          key: `${provider.provider}-${service.chargeType}`,
                          label: `${service.service} (${service.chargeType})`,
                          value: service.credits,
                          color: services.length > 1 ? serviceColor(services.indexOf(service.service)) : colors[provider.provider],
                        })),
                      }))}
                    />
                    {data.providers.some((p) => p.note) ? (
                      <ul className="mt-2 space-y-1 text-[11px] text-ink-muted">
                        {data.providers.filter((p) => p.note).map((p) => (
                          <li key={p.provider}>
                            <b className="font-medium text-ink">{providerLabel(p.provider)}</b>: {p.note}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Gross margin by plan" subtitle={`${period.label} · AI cost allocated by each plan's usage`} link={{ href: insightsHref("plans"), label: "Plans" }}>
          <ListState state={state}>
            {(data) =>
              data.plans.length === 0 ? (
                <ListEmpty>No revenue or usage in this period.</ListEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] tabular-nums">
                    <thead className="text-left text-[11px] text-ink-muted">
                      <tr className="border-b border-hairline">
                        <th scope="col" className="px-4 py-2 font-medium">Plan</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Revenue</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">AI cost</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Margin</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">%</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">ARPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.plans.map((plan) => (
                        <tr key={plan.planId ?? plan.planSlug} className="border-b border-hairline last:border-b-0" title={plan.note ?? undefined}>
                          <th scope="row" className="max-w-[180px] truncate px-4 py-2 text-left font-medium text-ink">
                            {plan.planName}
                            <small className="block text-[11px] font-normal text-ink-muted">
                              {formatCount(plan.activeWorkspaces)} active · {formatCount(plan.credits)} credits
                            </small>
                          </th>
                          <td className="px-2 py-2 text-right">{formatInsightValue(plan.revenue, "money")}</td>
                          <td className="px-2 py-2 text-right">{formatInsightValue(plan.aiCost, "money")}</td>
                          <td className={cn("px-2 py-2 text-right", plan.grossMargin !== null && plan.grossMargin < 0 ? "text-destructive" : "text-ink")}>
                            {formatInsightValue(plan.grossMargin, "money")}
                          </td>
                          <td className="px-2 py-2 text-right">{percentText(plan.marginPercent)}</td>
                          <td className="px-4 py-2 text-right">{formatInsightValue(plan.arpa, "money")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </ListState>
        </Panel>

        <Panel chart title="Credits per workspace" link={{ href: insightsHref("workspaces"), label: "Workspaces" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={state} height={220} empty="No credits consumed in this period." isEmpty={(data) => data.topWorkspaces.length === 0}>
              {(data) => {
                const days = seriesAxis(data.days.map((row) => ({ ...row, date: row.key })), period.axisEndDay);
                // Colour follows the workspace: slots in name order, so a re-ranking does not repaint.
                const ordered = [...data.topWorkspaces].sort((a, b) =>
                  workspaceLabel(a.workspaceName).localeCompare(workspaceLabel(b.workspaceName)) || a.workspaceId.localeCompare(b.workspaceId));
                const color = new Map(ordered.map((w, index) => [w.workspaceId, `var(--viz-${index + 1})`]));
                return (
                  <>
                    <ChartFigure
                      value={formatCount(data.topWorkspaces.reduce((sum, w) => sum + w.credits, 0))}
                      caption={`Top ${data.topWorkspaces.length} workspaces by credits · ${period.label}`}
                    />
                    <TimeSeriesChart
                      variant="line"
                      integer
                      ariaLabel="Credits per day for the top workspaces"
                      height={170}
                      labels={days.map((d) => d.label)}
                      titles={days.map((d) => dayKeyTitle(d.key))}
                      series={data.topWorkspaces.map((w) => ({
                        key: w.workspaceId,
                        label: workspaceLabel(w.workspaceName),
                        color: color.get(w.workspaceId),
                        values: days.map((d, index) => (d.future ? null : (w.days[index] ?? null))),
                      }))}
                      formatValue={formatCount}
                      describeGap={(index) => (days[index]?.future ? "Still to come" : "No figure")}
                    />
                    <div className="mt-3">
                      <BarList
                        ariaLabel="Top workspaces by credits"
                        formatValue={formatCount}
                        rows={data.topWorkspaces.map((w, index) => ({
                          key: w.workspaceId,
                          label: `${index + 1}. ${workspaceLabel(w.workspaceName)}${w.planName ? ` · ${w.planName}` : ""}`,
                          href: workspaceHref(w.workspaceId),
                          segments: [{ key: "credits", label: "Credits", value: w.credits, color: color.get(w.workspaceId) }],
                        }))}
                      />
                    </div>
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function findPnlMetric(data: ProfitAndLossDto, id: string) {
  return data.metrics.find((metric) => metric.id === id) ?? null;
}

// ── the page ─────────────────────────────────────────────────────────────────

export function InsightsDashboard(props: InsightsDashboardProps) {
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
      assembleNeedsAttention({
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
          // No drill-down: the Event outbox page was retired (2026-09-24). The count stays here.
          deadLetters: null,
          newSalesLeads: insightsHref("newSalesLeads"),
          subscriptions: insightsHref("subscriptions"),
          workspace: workspaceHref,
        },
      }),
    [snapshot, props.suspendedWorkspaces, deadLetters, deadLettersCapped, props.usageAlerts, props.newSalesLeads, health],
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
      label: "Revenue today",
      state: props.snapshot,
      value: snapshot?.revenueToday,
      display: formatInsightValue(snapshot?.revenueToday, "money"),
      sub: snapshot ? revenueTodaySub(snapshot) : null,
    },
    {
      id: "mrr",
      label: "MRR",
      state: props.snapshot,
      value: snapshot?.mrr,
      display: formatInsightValue(snapshot?.mrr, "money"),
      sub: snapshot ? mrrSub(snapshot) : null,
    },
    {
      id: "activeSubscriptions",
      label: "Active subscriptions",
      state: props.snapshot,
      value: snapshot?.activeSubscriptions,
      display: formatInsightValue(snapshot?.activeSubscriptions, "count"),
      sub: snapshot
        ? [
            `${formatCount(snapshot.activeByCycle.monthly)} monthly`,
            `${formatCount(snapshot.activeByCycle.yearly)} yearly`,
            snapshot.activeByCycle.other > 0 ? `${formatCount(snapshot.activeByCycle.other)} other` : null,
          ].filter(Boolean).join(" · ")
        : null,
    },
    {
      id: "churnRate",
      label: "Churn rate (month)",
      state: props.snapshot,
      value: snapshot?.churnRateMonth.rate,
      display: formatInsightValue(snapshot?.churnRateMonth.rate, "percent"),
      sub: snapshot ? churnSub(snapshot.churnRateMonth) : null,
    },
  ];

  const opsCards: SnapshotCardSpec[] = [
    {
      id: "liveMeetings",
      label: "Live meetings",
      state: liveState,
      value: live?.liveNow,
      display: formatInsightValue(live?.liveNow, "count"),
      sub: live ? `${formatCount(live.startedToday)} started today` : null,
      tone: "neutral",
    },
    {
      id: "outstandingInvoices",
      label: "Outstanding invoices",
      state: props.snapshot,
      value: snapshot?.outstandingInvoices.count,
      display: formatInsightValue(snapshot?.outstandingInvoices.amount, "money"),
      sub: snapshot ? outstandingSub(snapshot.outstandingInvoices) : null,
    },
    {
      id: "openSalesLeads",
      label: "Open sales leads",
      state: props.newSalesLeads,
      value: dataOf(props.newSalesLeads),
      display: formatInsightValue(dataOf(props.newSalesLeads), "count"),
      sub: "New, waiting for a reply",
    },
    {
      id: "deadLetters",
      label: "Dead-letter events",
      state: props.deadLetters,
      value: deadLetters?.length,
      display: deadLetters ? `${formatCount(deadLetters.length)}${deadLettersCapped ? "+" : ""}` : "—",
      sub: "Workspace event outbox",
    },
  ];

  const moreCards: SnapshotCardSpec[] = [
    {
      id: "trials",
      label: "Trials",
      state: props.snapshot,
      display: formatInsightValue(snapshot?.trials, "count"),
      sub: snapshot ? `${formatCount(snapshot.trialsEndingThisWeek)} end this week` : null,
    },
    {
      id: "pastDue",
      label: "Past due subscriptions",
      state: props.snapshot,
      value: snapshot?.pastDue,
      display: formatInsightValue(snapshot?.pastDue, "count"),
      sub: snapshot ? `${formatCount(snapshot.suspended)} suspended` : null,
    },
    {
      id: "activeWorkspaces",
      label: "Active workspaces",
      state: props.snapshot,
      display: formatInsightValue(snapshot?.activeWorkspaces, "count"),
      sub: "With an active subscription",
    },
    {
      id: "platformCreditBalance",
      label: "Platform credit balance",
      state: props.snapshot,
      display: formatInsightValue(snapshot?.platformCreditBalance, "credits"),
      sub: "Credits across all workspaces",
    },
  ];

  const isMonth = period.period === "month";

  return (
    <div className="flex flex-col gap-3.5 text-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.4px]">Insights</h1>
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
          <span className="group-open:hidden">Show 4 more metrics</span>
          <span className="hidden group-open:inline">Hide 4 more metrics</span>
        </summary>
        <div className="mt-2.5">
          <SnapshotGrid cards={moreCards} />
        </div>
      </details>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel chart title="Revenue, 6 months" link={{ href: insightsHref("subscriptions"), label: "Subscriptions" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={props.billing}
              height={240}
              empty="No revenue in these six months."
              isEmpty={(data) => (data.revenueByMonth ?? []).length === 0}
            >
              {(data) => {
                const months = data.revenueByMonth;
                return (
                  <>
                    <ChartFigure
                      value={formatInsightValue(sumKnown(months.map((row) => row.revenue)), "money")}
                      caption={joinNotes("Successful payments, by month", data.revenueByMonthNote)}
                    />
                    <TimeSeriesChart
                      variant="bar"
                      ariaLabel="Revenue per month"
                      height={180}
                      labels={months.map((row) => monthKeyLabel(row.month))}
                      series={[{ key: "revenue", label: "Revenue", values: months.map((row) => row.revenue) }]}
                      formatValue={moneyVnd}
                      formatAxis={moneyAxis}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
        <Panel chart title="Revenue per day" link={{ href: insightsHref("billingLedger"), label: "Ledger" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={props.billing}
              height={240}
              empty="No days in this period."
              isEmpty={(data) => (data.revenueByDay ?? []).length === 0}
            >
              {(data) => {
                // The server's own local days (of the tz the page sent), labelled from their keys.
                const days = seriesAxis(data.revenueByDay, period.axisEndDay);
                return (
                  <>
                    <ChartFigure
                      value={formatInsightValue(sumKnown(days.map((day) => day.row?.revenue ?? null)), "money")}
                      caption={joinNotes(
                        isMonth ? `${period.label} — days still to come are left blank, not drawn as 0` : period.label,
                        data.revenueByDayNote,
                      )}
                    />
                    <TimeSeriesChart
                      variant="area"
                      ariaLabel="Revenue per day"
                      height={180}
                      labels={days.map((day) => day.label)}
                      titles={days.map((day) => dayKeyTitle(day.key))}
                      series={[{ key: "revenue", label: "Revenue", values: days.map((day) => day.row?.revenue ?? null) }]}
                      formatValue={moneyVnd}
                      formatAxis={moneyAxis}
                      describeGap={(index) => (days[index]?.future ? "Still to come" : "No figure")}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <ProfitAndLossSection props={props} />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel chart title="Credits by AI service" link={{ href: insightsHref("workspaces"), label: "Workspaces" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={props.billing}
              height={200}
              empty="No credits consumed in this period."
              isEmpty={(data) => creditsByServiceRows(data.creditsByService ?? []).length === 0}
            >
              {(data) => {
                const rows = creditsByServiceRows(data.creditsByService);
                const total = rows.reduce((sum, row) => sum + row.segments[0].value, 0);
                return (
                  <>
                    <ChartFigure value={formatCount(total)} caption={`Credits consumed · ${period.label}`} />
                    <BarList ariaLabel="Credits by AI service" rows={rows} formatValue={formatCount} showShare />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
        <Panel chart title="Subscriptions by plan" link={{ href: insightsHref("plans"), label: "Plans" }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={props.snapshot}
              height={200}
              empty="No subscriptions yet."
              isEmpty={(data) => (data.subscriptionsByPlan ?? []).length === 0}
            >
              {(data) => {
                const total = data.subscriptionsByPlan.reduce((sum, plan) => sum + plan.active + plan.trial + plan.pastDue, 0);
                return (
                  <>
                    <ChartFigure value={formatCount(total)} caption="Active · trial · past due, right now" />
                    <BarList
                      ariaLabel="Subscriptions by plan and status"
                      legend={SUBSCRIPTION_SEGMENTS.map((segment) => ({ ...segment }))}
                      formatValue={formatCount}
                      rows={data.subscriptionsByPlan.map((plan) => ({
                        key: plan.planSlug,
                        label: plan.planName,
                        segments: SUBSCRIPTION_SEGMENTS.map((segment) => ({
                          key: segment.key,
                          label: segment.label,
                          color: segment.color,
                          value: plan[segment.key],
                        })),
                      }))}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
        {/* No link: the platform meeting directory was retired (2026-09-24). */}
        <Panel chart title="Meetings per day">
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={props.meetings}
              height={200}
              empty="No days in this period."
              isEmpty={(data) => (data.meetingsByDay ?? []).length === 0}
            >
              {(data) => {
                const days = seriesAxis(data.meetingsByDay, period.axisEndDay);
                const hours = sumKnown(days.map((day) => day.row?.hours ?? null));
                return (
                  <>
                    <ChartFigure
                      value={formatInsightValue(sumKnown(days.map((day) => day.row?.meetings ?? null)), "count")}
                      caption={`Meetings held · ${formatInsightValue(hours, "hours")} translated`}
                    />
                    <TimeSeriesChart
                      variant="bar"
                      integer
                      ariaLabel="Meetings per day"
                      height={220}
                      labels={days.map((day) => day.label)}
                      titles={days.map((day) => dayKeyTitle(day.key))}
                      series={[{ key: "meetings", label: "meetings", values: days.map((day) => day.row?.meetings ?? null) }]}
                      formatValue={formatCount}
                      describeGap={(index) => (days[index]?.future ? "Still to come" : "No figure")}
                      tooltipFooter={(index) => {
                        const row = days[index]?.row;
                        return row ? `${formatInsightValue(row.hours, "hours")} translated` : null;
                      }}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Needs attention" subtitle="Things an operator should act on today">
          {attentionLoading ? (
            <ListState state={{ status: "loading" }}>{() => null}</ListState>
          ) : attention.items.length === 0 ? (
            <ListEmpty>
              {attention.unavailable.length === 0
                ? "Nothing needs attention right now."
                : "Nothing needs attention in the sources that answered."}
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
              Not checked, not available yet: {attention.unavailable.join(", ")}
            </footer>
          ) : null}
        </Panel>

        <Panel title="Top workspaces by credits" subtitle={period.label} link={{ href: insightsHref("workspaces"), label: "Workspaces" }}>
          <ListState state={props.billing}>
            {(data) => {
              const top = data.topWorkspaces ?? [];
              if (top.length === 0) return <ListEmpty>No credits consumed in this period.</ListEmpty>;
              return (
                <div className="px-4 py-3">
                  <BarList
                    ariaLabel="Top workspaces by credits"
                    formatValue={formatCount}
                    rows={top.map((row, index) => ({
                      key: row.workspaceId,
                      label: `${index + 1}. ${workspaceLabel(row.workspaceName)}`,
                      href: workspaceHref(row.workspaceId),
                      segments: [{ key: "credits", label: "Credits", value: row.credits }],
                    }))}
                  />
                </div>
              );
            }}
          </ListState>
        </Panel>

        <Panel title="Recent payments" subtitle="Across all workspaces" link={{ href: insightsHref("billingLedger"), label: "Ledger" }}>
          <ListState state={props.snapshot}>
            {(data) =>
              (data.recentPayments ?? []).length === 0 ? (
                <ListEmpty>No payments yet.</ListEmpty>
              ) : (
                <Rows>
                  {data.recentPayments.map((payment, index) => {
                    const status = payment.status.toLowerCase();
                    const tone = status === "paid" || status === "succeeded" ? "success" : status === "failed" ? "danger" : "neutral";
                    return (
                      <Row key={`${payment.workspaceId}-${payment.at}-${index}`} href={workspaceHref(payment.workspaceId)}>
                        <RowText
                          title={payment.workspaceId ? workspaceLabel(payment.workspaceName) : "No workspace"}
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
          title="Subscriptions ending soon"
          subtitle="Soonest first · up to 8 paid subscriptions whose period ends within 14 days · trials not included"
          link={{ href: insightsHref("subscriptionsEndingSoon"), label: "Subscriptions" }}
        >
          <ListState state={props.snapshot}>
            {(data) =>
              (data.endingSoon ?? []).length === 0 ? (
                <ListEmpty>No paid subscription reaches the end of its period in the next 14 days.</ListEmpty>
              ) : (
                <Rows>
                  {data.endingSoon.map((row) => (
                    <Row key={`${row.workspaceId}-${row.endsAt}`} href={workspaceHref(row.workspaceId)}>
                      <RowText
                        title={workspaceLabel(row.workspaceName)}
                        detail={`${row.planName} · ${row.cancelAtPeriodEnd ? "will not renew" : "renews"}`}
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
