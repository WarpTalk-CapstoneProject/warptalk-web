/**
 * The Overview tab's figures, built once from its sources (WT-878).
 *
 * Kept apart from the view so the Export button (which the page's period bar owns) writes exactly
 * the figures the cards print. The arithmetic itself is in `lib/workspace/insights`, where it is
 * tested; this file only threads the sources' loading/unavailable states through it.
 */

import type { WorkspaceInsightsOverviewSources } from "@/hooks/use-workspace-insights";
import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import {
  creditsFigure,
  meetingFigures,
  periodFigure,
  ratio,
  type CsvFigure,
  type PeriodFigure,
  type TimeRange,
} from "@/lib/workspace/insights/overview-metrics";
import {
  lastToolCallAt,
  summariseToolCalls,
  type ToolCallSummary,
} from "@/lib/workspace/insights/tool-audits";

type State<T> = InsightsSourceState<T>;

export function mapState<T, R>(state: State<T>, select: (data: T) => R): State<R> {
  if (state.status !== "ready") return state;
  return { status: "ready", data: select(state.data), refreshing: state.refreshing };
}

/** Loading while either is loading; unavailable when either cannot be read. */
export function combineStates<A, B, R>(a: State<A>, b: State<B>, select: (a: A, b: B) => R): State<R> {
  if (a.status === "loading" || b.status === "loading") return { status: "loading" };
  if (a.status === "unavailable" || b.status === "unavailable") return { status: "unavailable" };
  return { status: "ready", data: select(a.data, b.data), refreshing: a.refreshing || b.refreshing };
}

/** A ready figure whose value is null is "unavailable" to the card: the source answered, the metric did not. */
function nullIsUnavailable(state: State<PeriodFigure>): State<PeriodFigure> {
  return state.status === "ready" && state.data.value === null ? { status: "unavailable" } : state;
}

export interface ToolsModel {
  current: ToolCallSummary;
  previous: ToolCallSummary;
  lastCallAt: string | null;
}

export interface OverviewModel {
  current: TimeRange;
  previous: TimeRange;
  credits: State<PeriodFigure>;
  meetings: State<PeriodFigure>;
  hours: State<PeriodFigure>;
  /** Meetings held that did not say how long they ran (left out of hours). */
  meetingsWithoutDuration: number;
  toolCalls: State<PeriodFigure>;
  /** Null value with a ready state: no calls, so no rate. */
  toolSuccessRate: State<PeriodFigure>;
  tools: State<ToolsModel>;
  activeMembers: State<{ active: number; total: number | null }>;
  avgCreditsPerMeeting: State<number | null>;
  creditsPerActiveMember: State<number | null>;
}

export function buildOverviewModel(sources: WorkspaceInsightsOverviewSources, period: ResolvedInsightsPeriod): OverviewModel {
  const current = { from: period.from, to: period.to };
  const previous = { from: period.previousFrom, to: period.previousTo };

  const credits = mapState(sources.ledger, (read) => creditsFigure(read, current, previous));
  const rooms = mapState(sources.rooms, (read) => meetingFigures(read, current, previous));
  const meetings = mapState(rooms, (figures) => figures.meetings);
  const hours = nullIsUnavailable(mapState(rooms, (figures) => figures.hours));

  const tools = mapState(sources.audits, (read) => ({
    current: summariseToolCalls(read, current),
    previous: summariseToolCalls(read, previous),
    lastCallAt: lastToolCallAt(read),
  }));
  const toolCalls = mapState(tools, ({ current: now, previous: before }) =>
    periodFigure(now.calls, before.complete ? before.calls : null, !now.complete),
  );
  // The rate of the calls that were read. When the read stopped at its cap those are the newest
  // calls of the window, which the card says; it is not scaled or guessed past them.
  const toolSuccessRate = mapState(tools, ({ current: now, previous: before }) =>
    periodFigure(now.successRate, before.complete ? before.successRate : null),
  );

  // "Active" = spent credits in the period: the one per-member activity a workspace source reports.
  // The directory only adds the "of N members" beside it, so its failure does not hide the count.
  const memberTotal = sources.members.status === "ready" ? sources.members.data.total : null;
  const activeMembers = mapState(sources.memberUsage, (usage) => ({
    active: usage.members.filter((row) => row.creditsConsumed > 0 || row.recordCount > 0).length,
    total: memberTotal,
  }));

  const avgCreditsPerMeeting = combineStates(credits, meetings, (c, m) =>
    c.atLeast || m.atLeast ? null : ratio(c.value, m.value),
  );
  const creditsPerActiveMember = combineStates(credits, activeMembers, (c, a) =>
    c.atLeast ? null : ratio(c.value, a.active),
  );

  return {
    current,
    previous,
    credits,
    meetings,
    hours,
    meetingsWithoutDuration: rooms.status === "ready" ? rooms.data.withoutDuration : 0,
    toolCalls,
    toolSuccessRate,
    tools,
    activeMembers,
    avgCreditsPerMeeting,
    creditsPerActiveMember,
  };
}

const UNAVAILABLE: PeriodFigure = { value: null, previous: null, atLeast: false };
const figureOf = (state: State<PeriodFigure>): PeriodFigure => (state.status === "ready" ? state.data : UNAVAILABLE);
const singleOf = (state: State<number | null>): PeriodFigure =>
  state.status === "ready" ? { value: state.data, previous: null, atLeast: false } : UNAVAILABLE;

/** The rows of the Overview export, labelled by the caller (translated). */
export function overviewCsvFigures(model: OverviewModel, label: (id: string) => string): CsvFigure[] {
  return [
    { label: label("creditsUsed"), figure: figureOf(model.credits), unit: "credits" },
    { label: label("meetingsHeld"), figure: figureOf(model.meetings), unit: "count" },
    { label: label("hoursTranslated"), figure: figureOf(model.hours), unit: "hours" },
    { label: label("toolCalls"), figure: figureOf(model.toolCalls), unit: "count" },
    { label: label("toolSuccessRate"), figure: figureOf(model.toolSuccessRate), unit: "percent" },
    {
      label: label("activeMembers"),
      figure: model.activeMembers.status === "ready" ? { value: model.activeMembers.data.active, previous: null, atLeast: false } : UNAVAILABLE,
      unit: "count",
    },
    { label: label("avgCreditsPerMeeting"), figure: singleOf(model.avgCreditsPerMeeting), unit: "credits" },
    { label: label("creditsPerActiveMember"), figure: singleOf(model.creditsPerActiveMember), unit: "credits" },
  ];
}
