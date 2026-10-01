"use client";

/**
 * Insights → Overview (WT-878): one workspace's credits, meetings and WarpBot tools, in the platform
 * Insights page's grammar — period cards that compare with the period before, "right now" snapshot
 * cards, charts that lead with their total, and the lists an owner acts on.
 *
 * NOTHING IS INVENTED
 *   Each source arrives as an `InsightsSourceState`. A source that cannot be read turns ITS cards
 *   into "—" and "Not available yet"; every other card renders. A read that stopped at its cap prints
 *   "at least N" and no comparison. The telemetry dashboard this replaces printed 15,000 credits,
 *   1,428 calls and a 96% success rate when a request had not answered — none of that survives here.
 *
 * A pure view: the route owns the queries (`useWorkspaceInsightsOverview`) and the URL.
 */

import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { BarList, type BarListRow } from "@/components/admin/charts/bar-list";
import { ChartFigure, TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import type { WorkspaceInsightsOverviewSources } from "@/hooks/use-workspace-insights";
import type { InsightsSourceState, InsightsTab, InsightsTabProps } from "@/components/workspace/insights/insights-types";
import type { OverviewModel } from "@/components/workspace/insights/overview-model";
import {
  CardLabel,
  CardShell,
  DELTA_TONE_CLASS,
  dataOf,
  Eyebrow,
  ListEmpty,
  ListState,
  Panel,
  PERIOD_VALUE,
  Row,
  Rows,
  RowText,
  SNAPSHOT_VALUE,
  SourceBody,
  Tag,
  VALUE_TONE_CLASS,
  type InsightsTone,
} from "@/components/workspace/insights/insights-primitives";
import { sumKnown } from "@/lib/admin/chart-scale";
import { computeDelta, deltaText, deltaTone, formatCount, formatInsightValue } from "@/lib/admin/insights-metrics";
import { monthKeyLabel, seriesAxis } from "@/lib/admin/insights-period";
import { toPluginActivityRows, type PluginActivityTone } from "@/lib/assistant/plugin-activity";
import { daysLeftInCycle, projectCycle } from "@/lib/billing/cycle-projection";
import { rankMemberUsage } from "@/lib/billing/member-usage-join";
import { cn } from "@/lib/utils";
import {
  assembleAttention,
  creditsByDay,
  creditsByService,
  creditsRemainingView,
  creditsUsedIn,
  elapsedDayKeys,
  ledgerFirstFullDay,
  meetingsByDay,
  topServices,
  upcomingRooms,
  type AttentionItem,
  type AttentionTarget,
  type CreditLevel,
  type PeriodFigure,
} from "@/lib/workspace/insights/overview-metrics";
import { toolLineStatus } from "@/lib/workspace/insights/tool-audits";

export interface OverviewTabProps extends InsightsTabProps {
  sources: WorkspaceInsightsOverviewSources;
  model: OverviewModel;
  /** The page's clock, epoch ms: projections and "last call N min ago" read it, never Date.now(). */
  nowMs: number;
  /** A link to another tab, keeping the period. */
  tabHref: (tab: InsightsTab) => string;
}

type T = ReturnType<typeof useTranslations>;

/** `projectCycle`'s English reasons, to this namespace's keys (its own test pins the English). */
const PROJECTION_REASON_KEYS: Record<string, string> = {
  "This cycle has no dates on it.": "snapshot.reasonNoDates",
  "Too early in the cycle to project a rate.": "snapshot.reasonTooEarly",
  "Nothing used yet this cycle.": "snapshot.reasonNothingUsed",
};

/** Service keys from lib/billing/usage-labels.ts (and the ledger's adjustment row) to label keys. */
const SERVICE_LABEL_KEYS: Record<string, string> = {
  translation: "usageLabels.translation",
  dubbing: "usageLabels.dubbing",
  clone_dubbing: "usageLabels.cloneDubbing",
  transcription: "usageLabels.transcription",
  assistant: "usageLabels.assistant",
  summary: "usageLabels.summary",
  voice_cloning: "usageLabels.voiceCloning",
  document_translation: "usageLabels.documentTranslation",
  adjustment: "usageLabels.adjustment",
  "raw:": "usageLabels.otherUsage",
};

const OUTCOME_TONE: Record<PluginActivityTone, InsightsTone> = {
  success: "success",
  blocked: "warning",
  attention: "warning",
  failed: "danger",
};

const LEVEL_TONE: Record<CreditLevel, InsightsTone> = { ok: "neutral", warning: "warning", critical: "danger" };
const LEVEL_METER: Record<CreditLevel, string> = { ok: "bg-success", warning: "bg-warning", critical: "bg-destructive" };

const RECENT_ACTIVITY_ROWS = 4;
const TOP_MEMBERS = 5;

function dayKeyTitle(key: string, locale: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function relativeTime(iso: string, nowMs: number, locale: string): string {
  const minutes = Math.round((new Date(iso).getTime() - nowMs) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(Math.min(0, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

// ── period cards ─────────────────────────────────────────────────────────────

interface PeriodCardSpec {
  id: string;
  label: string;
  state: InsightsSourceState<PeriodFigure>;
  format: (value: number) => string;
  /** Null: neither direction is good (credits used is spend, not a score). */
  higherIsBetter: boolean | null;
  href?: string | null;
  note?: string | null;
  /** What the card says when the source answered and the figure is null (no calls, so no rate). */
  emptyNote?: string;
}

function PeriodCard({ spec }: { spec: PeriodCardSpec }) {
  const t = useTranslations("workspaceInsights");
  const { state } = spec;
  const loading = state.status === "loading";
  const figure = state.status === "ready" ? state.data : null;
  const value = figure?.value ?? null;
  const shown = value === null ? "—" : figure?.atLeast ? t("common.atLeast", { value: spec.format(value) }) : spec.format(value);
  const delta = figure ? computeDelta(figure.value, figure.previous) : null;

  return (
    <CardShell href={state.status === "ready" ? spec.href : null} className={cn(state.status === "ready" && state.refreshing && "opacity-60")}>
      <CardLabel label={spec.label} note={loading ? null : spec.note} />
      <div className={cn(PERIOD_VALUE, loading ? "animate-pulse text-ink-muted" : "text-ink")} title={shown}>
        {shown}
      </div>
      {state.status === "unavailable" ? (
        <div className="mt-2 text-[11px] text-ink-muted">{t("common.notAvailable")}</div>
      ) : figure && value === null ? (
        <div className="mt-2 text-[11px] text-ink-muted">{spec.emptyNote ?? t("common.notAvailable")}</div>
      ) : figure && figure.atLeast ? (
        <div className="mt-2 text-[11px] text-ink-muted">{t("periodCards.floorNote")}</div>
      ) : figure && delta ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-ink-muted">
          <span className={DELTA_TONE_CLASS[spec.higherIsBetter === null ? "neutral" : deltaTone(delta, spec.higherIsBetter)]}>
            {deltaText(delta, t)}
          </span>
          <span>{t("periodCards.lastPeriod", { value: figure.previous === null ? "—" : spec.format(figure.previous) })}</span>
        </div>
      ) : null}
    </CardShell>
  );
}

// ── snapshot cards ───────────────────────────────────────────────────────────

interface SnapshotSpec {
  id: string;
  label: string;
  state: InsightsSourceState<unknown>;
  display: string;
  sub?: string | null;
  tone?: InsightsTone;
  href?: string | null;
  /** 0–100: a small meter under the figure. */
  meter?: { percent: number; className: string } | null;
}

function SnapshotCard({ spec }: { spec: SnapshotSpec }) {
  const t = useTranslations("workspaceInsights");
  const loading = spec.state.status === "loading";
  const unavailable = spec.state.status === "unavailable";
  const ready = spec.state.status === "ready";
  return (
    <CardShell href={ready ? spec.href : null}>
      <Eyebrow>{spec.label}</Eyebrow>
      <div
        className={cn(
          SNAPSHOT_VALUE,
          loading ? "animate-pulse text-ink-muted" : unavailable ? "text-ink" : VALUE_TONE_CLASS[spec.tone ?? "neutral"],
        )}
        title={ready ? spec.display : undefined}
      >
        {ready ? spec.display : "—"}
      </div>
      {unavailable ? (
        <div className="mt-1.5 text-[11px] text-ink-muted">{t("common.notAvailable")}</div>
      ) : ready && spec.sub ? (
        <div className="mt-1.5 truncate text-[11px] text-ink-muted" title={spec.sub}>
          {spec.sub}
        </div>
      ) : null}
      {ready && spec.meter ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className={cn("h-full rounded-full", spec.meter.className)} style={{ width: `${Math.min(100, Math.max(0, spec.meter.percent))}%` }} />
        </div>
      ) : null}
    </CardShell>
  );
}

function SnapshotGrid({ cards }: { cards: SnapshotSpec[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <SnapshotCard key={card.id} spec={card} />
      ))}
    </div>
  );
}

// ── WarpBot tools line ───────────────────────────────────────────────────────

function ToolsLine({ model, nowMs, locale, href }: { model: OverviewModel; nowMs: number; locale: string; href: string }) {
  const t = useTranslations("workspaceInsights");
  const state = model.tools;
  const title = <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-ink-muted">{t("toolLine.title")}</span>;
  const link = (
    <Link href={href} className="ml-auto whitespace-nowrap text-[11px] text-primary hover:underline">
      {t("links.tools")} →
    </Link>
  );
  const shell = "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-xl border px-4 py-2.5 text-[12px] tabular-nums";

  if (state.status !== "ready") {
    return (
      <div className={cn(shell, "border-hairline bg-surface-1")}>
        {title}
        <span className="font-semibold text-ink">—</span>
        {state.status === "loading" ? (
          <span className="inline-block h-3.5 w-64 max-w-full animate-pulse rounded bg-surface-2" />
        ) : (
          <span className="text-ink-muted">{t("common.notAvailable")}</span>
        )}
        {link}
      </div>
    );
  }

  const { current, lastCallAt } = state.data;
  const status = toolLineStatus(current);
  const warn = status === "needsAttention";
  const parts =
    status === "noCalls"
      ? [t("toolLine.noCallsHint")]
      : [
          current.complete
            ? t("toolLine.calls", { count: current.calls, value: formatCount(current.calls) })
            : t("toolLine.callsAtLeast", { count: current.calls, value: formatCount(current.calls) }),
          current.successRate === null ? null : t("toolLine.success", { percent: formatInsightValue(current.successRate, "percent") }),
          current.blocked > 0 ? t("toolLine.blocked", { count: current.blocked }) : null,
          current.needsSetup > 0 ? t("toolLine.needsSetup", { count: current.needsSetup }) : null,
          current.failed > 0 ? t("toolLine.failed", { count: current.failed }) : null,
        ];
  if (lastCallAt) parts.push(t("toolLine.lastCall", { time: relativeTime(lastCallAt, nowMs, locale) }));

  return (
    <div className={cn(shell, warn ? "border-warning/40 bg-warning/10" : "border-hairline bg-surface-1")}>
      {title}
      <span className={cn("font-semibold", warn ? "text-warning" : "text-ink")}>{t(`toolLine.status.${status}`)}</span>
      <span className="text-ink-muted">{parts.filter(Boolean).join(" · ")}</span>
      {link}
    </div>
  );
}

// ── needs attention ──────────────────────────────────────────────────────────

function attentionText(item: AttentionItem, t: T, dateFormat: Intl.DateTimeFormat): { title: string; detail: string; tag: string } {
  const date = (iso: unknown) => {
    const at = typeof iso === "string" && iso ? new Date(iso) : null;
    return at && Number.isFinite(at.getTime()) ? dateFormat.format(at) : "—";
  };
  const v = item.values;
  switch (item.kind) {
    case "noPlan":
      return { title: t("attention.noPlan.title"), detail: t("attention.noPlan.detail"), tag: t("attention.tags.plan") };
    case "paymentFailed":
      return {
        title: t("attention.paymentFailed.title"),
        detail: v.graceEndsAt ? t("attention.paymentFailed.detailGrace", { date: date(v.graceEndsAt) }) : t("attention.paymentFailed.detail"),
        tag: t("attention.tags.payment"),
      };
    case "lowCredits":
      return {
        title: t("attention.lowCredits.title", { percent: v.percent }),
        detail: t("attention.lowCredits.detail", { credits: formatCount(Number(v.credits)) }),
        tag: t("attention.tags.billing"),
      };
    case "planEnding":
      return {
        title: t("attention.planEnding.title"),
        detail: t("attention.planEnding.detail", { plan: String(v.plan), date: date(v.date) }),
        tag: t("attention.tags.billing"),
      };
    case "pluginsNeedSetup":
      return {
        title: t("attention.pluginsNeedSetup.title", { count: Number(v.count) }),
        detail: String(v.plugins),
        tag: t("attention.tags.needsSetup"),
      };
    case "policyBlocks":
      return {
        title:
          v.atLeast === "yes"
            ? t("attention.policyBlocks.titleAtLeast", { count: Number(v.count) })
            : t("attention.policyBlocks.title", { count: Number(v.count) }),
        detail: t("attention.policyBlocks.detail"),
        tag: t("attention.tags.policy"),
      };
    case "pendingRequests":
      return {
        title: t("attention.pendingRequests.title", { count: Number(v.count) }),
        detail: t("attention.pendingRequests.detail"),
        tag: t("attention.tags.requests"),
      };
  }
}

// ── the tab ──────────────────────────────────────────────────────────────────

export function OverviewTab(props: OverviewTabProps) {
  const t = useTranslations("workspaceInsights");
  const locale = useLocale();
  const { sources, model, period, workspaceSlug: slug, nowMs, tabHref } = props;

  const href = {
    usage: tabHref("usage"),
    tools: tabHref("tools"),
    rooms: `/${slug}/rooms`,
    billing: `/${slug}/settings/billing`,
    plans: `/${slug}/payment/plans`,
    plugins: `/${slug}/settings/plugins`,
    schedules: `/${slug}/schedules`,
  };
  const targetHref: Record<AttentionTarget, string> = {
    plans: href.plans,
    billing: href.billing,
    plugins: href.plugins,
    tools: href.tools,
  };

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }), [locale]);
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
    [locale],
  );

  const catalog = dataOf(sources.catalog);
  const workspacePlugins = dataOf(sources.workspacePlugins);
  const pluginLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const plugin of workspacePlugins?.inWorkspace ?? []) labels.set(plugin.key, plugin.label);
    for (const plugin of catalog ?? []) labels.set(plugin.key, plugin.label);
    return labels;
  }, [catalog, workspacePlugins]);
  const pluginLabel = (key: string) => pluginLabels.get(key) ?? key;
  const serviceLabel = (key: string, fallback: string) => (SERVICE_LABEL_KEYS[key] ? t(SERVICE_LABEL_KEYS[key] as never) : fallback);

  const members = dataOf(sources.members)?.items ?? [];
  const balance = dataOf(sources.balance);
  const subscription = dataOf(sources.subscription);
  const tools = dataOf(model.tools);

  // ── period cards
  const periodCards: PeriodCardSpec[] = [
    { id: "creditsUsed", label: t("periodCards.creditsUsed"), state: model.credits, format: formatCount, higherIsBetter: null, href: href.usage },
    { id: "meetingsHeld", label: t("periodCards.meetingsHeld"), state: model.meetings, format: formatCount, higherIsBetter: true, href: href.rooms },
    {
      id: "hoursTranslated",
      label: t("periodCards.hoursTranslated"),
      state: model.hours,
      format: (value) => formatInsightValue(value, "hours"),
      higherIsBetter: true,
      href: href.rooms,
      note: model.meetingsWithoutDuration > 0 ? t("periodCards.withoutDuration", { count: model.meetingsWithoutDuration }) : t("periodCards.hoursNote"),
    },
    { id: "toolCalls", label: t("periodCards.toolCalls"), state: model.toolCalls, format: formatCount, higherIsBetter: null, href: href.tools },
    {
      id: "toolSuccessRate",
      label: t("periodCards.toolSuccessRate"),
      state: model.toolSuccessRate,
      format: (value) => formatInsightValue(value, "percent"),
      higherIsBetter: true,
      href: href.tools,
      note: tools && !tools.current.complete ? t("periodCards.successNote", { count: tools.current.calls }) : null,
      emptyNote: t("periodCards.noCalls"),
    },
  ];

  // ── snapshot cards
  const remaining = balance ? creditsRemainingView(balance) : null;
  const projection = balance ? projectCycle(balance, nowMs) : null;
  const activeMembers = dataOf(model.activeMembers);

  const snapshotCards: SnapshotSpec[] = [
    {
      id: "creditsRemaining",
      label: t("snapshot.creditsRemaining"),
      state: sources.balance,
      display: remaining ? formatCount(remaining.remaining) : t("snapshot.noPlan"),
      sub: remaining
        ? remaining.percentLeft === null
          ? null
          : t("snapshot.percentLeft", { percent: remaining.percentLeft, available: formatCount(remaining.available) })
        : t("snapshot.noPlanSub"),
      tone: remaining ? LEVEL_TONE[remaining.level] : "neutral",
      href: remaining ? href.billing : href.plans,
      meter: remaining && remaining.percentLeft !== null ? { percent: remaining.percentLeft, className: LEVEL_METER[remaining.level] } : null,
    },
    {
      id: "runsOutIn",
      label: t("snapshot.runsOutIn"),
      state: sources.balance,
      display:
        projection?.kind === "runs-out"
          ? t("snapshot.days", { count: Math.max(1, Math.round(projection.daysToEmpty)) })
          : projection?.kind === "lasts"
            ? t("snapshot.lastsCycle")
            : "—",
      sub: !balance
        ? t("snapshot.noPlanSub")
        : projection?.kind === "runs-out"
          ? t("snapshot.runsOutSub", { rate: formatCount(Math.round(projection.perDay)), days: daysLeftInCycle(balance, nowMs) })
          : projection?.kind === "lasts"
            ? t("snapshot.lastsSub", { credits: formatCount(projection.creditsLeftAtRenewal) })
            : projection
              ? PROJECTION_REASON_KEYS[projection.reason]
                ? t(PROJECTION_REASON_KEYS[projection.reason] as never)
                : null
              : null,
      tone: projection?.kind === "runs-out" ? "warning" : "neutral",
      href: balance ? href.billing : href.plans,
    },
    {
      id: "plan",
      label: t("snapshot.plan"),
      state: sources.subscription,
      display: subscription ? subscription.planName : t("snapshot.noPlan"),
      sub: subscription
        ? subscription.cancelAtPeriodEnd
          ? t("snapshot.endsOn", { date: dateFormat.format(new Date(subscription.currentPeriodEnd)) })
          : t("snapshot.renewsOn", { date: dateFormat.format(new Date(subscription.currentPeriodEnd)) })
        : t("snapshot.noPlanSub"),
      tone: subscription?.cancelAtPeriodEnd ? "warning" : "neutral",
      href: subscription ? href.billing : href.plans,
    },
    {
      id: "activeMembers",
      label: t("snapshot.activeMembers"),
      state: model.activeMembers,
      display: activeMembers ? formatCount(activeMembers.active) : "—",
      sub: activeMembers
        ? activeMembers.total === null
          ? t("snapshot.activeMembersSubNoTotal")
          : t("snapshot.activeMembersSub", { total: activeMembers.total })
        : null,
      href: href.usage,
    },
  ];

  const pendingRequests = workspacePlugins?.pendingRequests.filter((request) => request.status === "pending").length;
  const avg = dataOf(model.avgCreditsPerMeeting);
  const perMember = dataOf(model.creditsPerActiveMember);
  const meetingsFigure = dataOf(model.meetings);

  const moreCards: SnapshotSpec[] = [
    {
      id: "avgCreditsPerMeeting",
      label: t("more.avgCreditsPerMeeting"),
      state: model.avgCreditsPerMeeting,
      display: avg === null || avg === undefined ? "—" : formatCount(Math.round(avg)),
      sub:
        avg === null || avg === undefined
          ? meetingsFigure?.value === 0
            ? t("more.noMeetings")
            : t("common.notAvailable")
          : t("more.avgCreditsPerMeetingSub", { count: meetingsFigure?.value ?? 0 }),
    },
    {
      id: "creditsPerActiveMember",
      label: t("more.creditsPerActiveMember"),
      state: model.creditsPerActiveMember,
      display: perMember === null || perMember === undefined ? "—" : formatCount(Math.round(perMember)),
      sub:
        perMember === null || perMember === undefined
          ? activeMembers?.active === 0
            ? t("more.noActiveMembers")
            : t("common.notAvailable")
          : t("more.creditsPerActiveMemberSub", { count: activeMembers?.active ?? 0 }),
    },
    {
      id: "connectedPlugins",
      label: t("more.connectedPlugins"),
      state: sources.workspacePlugins,
      display: workspacePlugins ? formatCount(workspacePlugins.inWorkspace.length) : "—",
      sub: t("more.connectedPluginsSub"),
      href: href.plugins,
    },
    {
      id: "pendingApprovals",
      label: t("more.pendingApprovals"),
      state: sources.workspacePlugins,
      display: pendingRequests === undefined ? "—" : formatCount(pendingRequests),
      sub: t("more.pendingApprovalsSub"),
      tone: pendingRequests ? "warning" : "neutral",
      href: href.plugins,
    },
  ];

  // ── needs attention
  const attention = useMemo(
    () =>
      assembleAttention({
        balance: sources.balance.status === "ready" ? sources.balance.data : undefined,
        subscription: sources.subscription.status === "ready" ? sources.subscription.data : undefined,
        recurring: sources.recurring.status === "ready" ? sources.recurring.data : undefined,
        tools: tools
          ? { needsSetupPlugins: tools.current.needsSetupPlugins, blocked: tools.current.blocked, complete: tools.current.complete }
          : undefined,
        pendingRequests,
        pluginLabel: (key) => pluginLabels.get(key) ?? key,
      }),
    [sources.balance, sources.subscription, sources.recurring, tools, pendingRequests, pluginLabels],
  );
  const attentionLoading =
    [sources.balance, sources.subscription, sources.recurring, model.tools, sources.workspacePlugins].some((state) => state.status === "loading") &&
    attention.items.length === 0;

  const isMonthLike = period.axisEndDay !== null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {periodCards.map((spec) => (
          <PeriodCard key={spec.id} spec={spec} />
        ))}
      </div>
      <SnapshotGrid cards={snapshotCards} />

      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 px-0.5 py-1 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <CaretRight size={14} className="transition-transform group-open:rotate-90" />
          <span className="group-open:hidden">{t("more.show", { count: moreCards.length })}</span>
          <span className="hidden group-open:inline">{t("more.hide", { count: moreCards.length })}</span>
        </summary>
        <div className="mt-2.5">
          <SnapshotGrid cards={moreCards} />
        </div>
      </details>

      <ToolsLine model={model} nowMs={nowMs} locale={locale} href={href.tools} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel chart title={t("charts.sixMonthsTitle")} subtitle={t("charts.sixMonthsSubtitle")} link={{ href: href.billing, label: t("links.billing") }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={sources.sixMonths}
              height={240}
              empty={t("charts.sixMonthsEmpty")}
              isEmpty={(months) => months.every((month) => month.credits === null)}
            >
              {(months) => (
                <>
                  <ChartFigure
                    value={t("charts.creditsValue", { value: formatInsightValue(sumKnown(months.map((m) => m.credits)), "credits") })}
                    caption={`${monthKeyLabel(months[0].key)} – ${monthKeyLabel(months[months.length - 1].key)} ${months[months.length - 1].key.slice(0, 4)}`}
                  />
                  <TimeSeriesChart
                    variant="bar"
                    ariaLabel={t("charts.sixMonthsAria")}
                    height={180}
                    labels={months.map((month) => monthKeyLabel(month.key))}
                    series={[{ key: "credits", label: t("charts.creditsSeries"), values: months.map((month) => month.credits) }]}
                    formatValue={formatCount}
                    describeGap={() => t("charts.noFigure")}
                  />
                </>
              )}
            </SourceBody>
          </div>
        </Panel>

        <Panel chart title={t("charts.perDayTitle")} subtitle={isMonthLike ? t("charts.perDaySubtitleBlank") : t("charts.perDaySubtitle")} link={{ href: href.usage, label: t("links.usage") }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={sources.ledger} height={240} empty={t("charts.noDays")} isEmpty={() => elapsedDayKeys(model.current).length === 0}>
              {(ledger) => {
                const days = seriesAxis(elapsedDayKeys(model.current).map((date) => ({ date })), period.axisEndDay);
                const credits = creditsByDay(ledger.items, model.current);
                const rooms = dataOf(sources.rooms);
                const meetings = rooms ? meetingsByDay(rooms.rooms, model.current) : null;
                const total = creditsUsedIn(ledger.items, model.current);
                // A capped read lacks its oldest rows: those days are unknown, drawn blank, never 0.
                const firstFullDay = ledgerFirstFullDay(ledger);
                const unknownDay = (key: string) => firstFullDay !== null && key < firstFullDay;
                const creditValues = days.map((day) => (day.future || unknownDay(day.key) ? null : (credits.get(day.key) ?? 0)));
                const meetingValues = days.map((day) => (day.future ? null : (meetings?.get(day.key)?.meetings ?? 0)));
                return (
                  <>
                    <ChartFigure
                      value={
                        ledger.complete
                          ? t("charts.creditsValue", { value: formatCount(total) })
                          : t("common.atLeast", { value: t("charts.creditsValue", { value: formatCount(total) }) })
                      }
                      caption={period.label}
                    />
                    <TimeSeriesChart
                      variant={meetings ? "combo" : "bar"}
                      ariaLabel={t("charts.perDayAria")}
                      height={200}
                      labels={days.map((day) => day.label)}
                      titles={days.map((day) => dayKeyTitle(day.key, locale))}
                      series={[
                        { key: "credits", label: t("charts.creditsSeries"), values: creditValues, kind: "bar", axis: "left" },
                        ...(meetings
                          ? [{ key: "meetings", label: t("charts.meetingsSeries"), values: meetingValues, kind: "line" as const, axis: "right" as const }]
                          : []),
                      ]}
                      formatValue={formatCount}
                      integerRight
                      describeGap={(index) => (days[index]?.future ? t("charts.stillToCome") : t("charts.noFigure"))}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel chart title={t("charts.byServiceTitle")} link={{ href: href.usage, label: t("links.usage") }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody
              state={sources.ledger}
              height={200}
              empty={t("charts.noCreditsUsed")}
              isEmpty={(ledger) => creditsByService(ledger.items, model.current).length === 0}
            >
              {(ledger) => {
                const services = creditsByService(ledger.items, model.current);
                const { top, rest } = topServices(services);
                const rows: BarListRow[] = top.map((service) => {
                  const label = serviceLabel(service.key, service.label);
                  return { key: service.key, label, segments: [{ key: service.key, label, value: service.credits }] };
                });
                if (rest > 0) {
                  const label = t("charts.otherService");
                  rows.push({ key: "other", label, segments: [{ key: "other", label, value: rest, color: "var(--usage-service-other)" }] });
                }
                const total = services.reduce((sum, service) => sum + service.credits, 0);
                return (
                  <>
                    <ChartFigure
                      value={ledger.complete ? formatCount(total) : t("common.atLeast", { value: formatCount(total) })}
                      caption={t("charts.byServiceCaption", { period: period.label })}
                    />
                    <BarList ariaLabel={t("charts.byServiceAria")} rows={rows} formatValue={formatCount} showShare />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>

        <Panel chart title={t("charts.meetingsTitle")} link={{ href: href.rooms, label: t("links.meetings") }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={sources.rooms} height={200} empty={t("charts.noDays")} isEmpty={() => elapsedDayKeys(model.current).length === 0}>
              {() => {
                const rooms = dataOf(sources.rooms)?.rooms ?? [];
                const byDay = meetingsByDay(rooms, model.current);
                const days = seriesAxis(elapsedDayKeys(model.current).map((date) => ({ date })), period.axisEndDay);
                const meetings = dataOf(model.meetings);
                const hours = dataOf(model.hours);
                return (
                  <>
                    <ChartFigure
                      value={
                        meetings?.value == null
                          ? "—"
                          : meetings.atLeast
                            ? t("common.atLeast", { value: t("charts.meetingsValue", { count: meetings.value }) })
                            : t("charts.meetingsValue", { count: meetings.value })
                      }
                      caption={
                        hours?.value == null
                          ? t("charts.hoursUnknown")
                          : t("charts.hoursCaption", { hours: formatInsightValue(hours.value, "hours") })
                      }
                    />
                    <TimeSeriesChart
                      variant="bar"
                      integer
                      ariaLabel={t("charts.meetingsAria")}
                      height={180}
                      labels={days.map((day) => day.label)}
                      titles={days.map((day) => dayKeyTitle(day.key, locale))}
                      series={[
                        {
                          key: "meetings",
                          label: t("charts.meetingsSeries"),
                          values: days.map((day) => (day.future ? null : (byDay.get(day.key)?.meetings ?? 0))),
                        },
                      ]}
                      formatValue={formatCount}
                      describeGap={(index) => (days[index]?.future ? t("charts.stillToCome") : t("charts.noFigure"))}
                      tooltipFooter={(index) => {
                        const day = days[index];
                        const seconds = day ? byDay.get(day.key)?.seconds : undefined;
                        return seconds ? t("charts.hoursSuffix", { hours: formatInsightValue(seconds / 3600, "hours") }) : null;
                      }}
                    />
                  </>
                );
              }}
            </SourceBody>
          </div>
        </Panel>

        <Panel chart title={t("charts.pluginsTitle")} link={{ href: href.tools, label: t("links.tools") }}>
          <div className="px-4 pb-3 pt-2">
            <SourceBody state={model.tools} height={200} empty={t("charts.noToolCalls")} isEmpty={(data) => data.current.calls === 0}>
              {(data) => (
                <>
                  <ChartFigure
                    value={
                      data.current.complete
                        ? t("charts.callsValue", { count: data.current.calls, value: formatCount(data.current.calls) })
                        : t("common.atLeast", { value: t("charts.callsValue", { count: data.current.calls, value: formatCount(data.current.calls) }) })
                    }
                    caption={t("charts.pluginsCaption", { period: period.label })}
                  />
                  <BarList
                    ariaLabel={t("charts.pluginsAria")}
                    formatValue={formatCount}
                    rows={data.current.byPlugin.slice(0, 6).map((row) => ({
                      key: row.pluginKey,
                      label: pluginLabel(row.pluginKey),
                      segments: [{ key: "calls", label: t("charts.callsSeries"), value: row.calls }],
                    }))}
                  />
                </>
              )}
            </SourceBody>
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={t("attention.title")} subtitle={t("attention.subtitle")}>
          {attentionLoading ? (
            <ListState state={{ status: "loading" }}>{() => null}</ListState>
          ) : attention.items.length === 0 ? (
            <ListEmpty>{attention.unavailable.length === 0 ? t("attention.nothingNow") : t("attention.nothingAnswered")}</ListEmpty>
          ) : (
            <Rows>
              {attention.items.map((item) => {
                const text = attentionText(item, t, dateFormat);
                return (
                  <Row key={item.kind} href={targetHref[item.target]}>
                    <RowText title={text.title} detail={text.detail} />
                    <Tag tone={item.tone}>{text.tag}</Tag>
                  </Row>
                );
              })}
            </Rows>
          )}
          {!attentionLoading && attention.unavailable.length > 0 ? (
            <footer className="border-t border-hairline px-4 py-2 text-[11px] text-ink-muted">
              {t("attention.notChecked", {
                sources: attention.unavailable.map((source) => t(`attention.sources.${source}`)).join(", "),
              })}
            </footer>
          ) : null}
        </Panel>

        <Panel title={t("members.title")} subtitle={period.label} link={{ href: href.usage, label: t("links.usage") }}>
          <ListState state={sources.memberUsage}>
            {(usage) => {
              const ranked = rankMemberUsage(usage.members, members, usage.totalCreditsConsumed).slice(0, TOP_MEMBERS);
              if (ranked.length === 0) return <ListEmpty>{t("members.empty")}</ListEmpty>;
              return (
                <div className="px-4 py-3">
                  <BarList
                    ariaLabel={t("members.title")}
                    formatValue={formatCount}
                    rows={ranked.map((row, index) => ({
                      key: row.userId,
                      label: `${index + 1}. ${row.isFormerMember ? t("members.formerMember") : row.label}`,
                      segments: [{ key: "credits", label: t("charts.creditsSeries"), value: row.creditsConsumed }],
                    }))}
                  />
                </div>
              );
            }}
          </ListState>
        </Panel>

        <Panel title={t("upNext.title")} subtitle={t("upNext.subtitle")} link={{ href: href.schedules, label: t("links.schedules") }}>
          <ListState state={sources.upcoming}>
            {(rooms) => {
              const next = upcomingRooms(rooms, nowMs);
              if (next.length === 0) return <ListEmpty>{t("upNext.empty")}</ListEmpty>;
              return (
                <Rows>
                  {next.map((room) => {
                    const live = room.status === "in_progress" || room.status === "open";
                    return (
                      <Row key={room.id} href={`/${slug}/rooms/${room.id}`}>
                        <RowText
                          title={room.title || room.translationRoomCode}
                          detail={
                            room.status === "in_progress"
                              ? t("upNext.runningNow")
                              : room.status === "open"
                                ? t("upNext.openNow")
                                : room.scheduledAt
                                  ? dateTimeFormat.format(new Date(room.scheduledAt))
                                  : t("upNext.noTimeSet")
                          }
                        />
                        <Tag tone={live ? "success" : room.status === "waiting" ? "warning" : "neutral"}>
                          {live ? t("upNext.tagLive") : room.status === "waiting" ? t("upNext.tagWaiting") : t("upNext.tagScheduled")}
                        </Tag>
                      </Row>
                    );
                  })}
                </Rows>
              );
            }}
          </ListState>
        </Panel>

        <Panel title={t("activity.title")} subtitle={t("activity.subtitle")} link={{ href: href.tools, label: t("links.tools") }}>
          <ListState state={sources.audits}>
            {(read) => {
              const rows = toPluginActivityRows(read.rows.slice(0, RECENT_ACTIVITY_ROWS), members, catalog ?? [], (key) =>
                t(`activity.${key}` as never),
              );
              if (rows.length === 0) return <ListEmpty>{t("activity.empty")}</ListEmpty>;
              return (
                <Rows>
                  {rows.map((row) => (
                    <Row key={row.id} href={href.tools}>
                      <RowText
                        title={`${row.pluginLabel} · ${row.toolLabel}`}
                        detail={`${row.memberLabel} · ${dateTimeFormat.format(new Date(row.createdAt))}`}
                      />
                      <Tag tone={OUTCOME_TONE[row.outcome.tone]}>{row.outcome.label}</Tag>
                    </Row>
                  ))}
                </Rows>
              );
            }}
          </ListState>
        </Panel>
      </div>
    </div>
  );
}
