"use client";

/**
 * The workspace Insights Overview's sources (WT-878), each as an `InsightsSourceState`.
 *
 * ONE SOURCE FAILING NEVER TAKES THE PAGE DOWN
 *   Every read stands alone. One that errors becomes `unavailable` — "Not available yet" on the
 *   cards that need it — and every other card renders. A 404 from the billing reads is not an
 *   error: it is the account state "this workspace has no plan", returned as `null` data.
 *
 * READS THAT PAGE
 *   The credit ledger and room history have no per-period aggregate for a workspace, so they are
 *   read in pages over the period AND the one before it (for the deltas), each with a cap. A read
 *   that stops at its cap says so (`complete: false`) and the page prints a floor ("at least N"),
 *   never a total it did not see.
 *
 * TOOL CALLS ARE COUNTED BY THE SERVER
 *   Since wave 4 the tool figures come from `useWorkspaceToolInsights` (every WarpBot call, counted
 *   by the assistant service), not from paging the plugin audit log. The log is still read here,
 *   one short page, only to list the most recent plugin calls.
 *
 * FRESHNESS
 *   Every key sits under `INSIGHTS_QUERY_ROOT`, so `useInsightsUpdatedAt` can say when the newest
 *   of them last arrived. The route moves "now" once a minute; for a to-now period that moves the
 *   window and with it the keys, so the period sources refresh on the same beat.
 */

import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import type { InsightsSourceState } from "@/components/workspace/insights/insights-types";
import type { ResolvedInsightsPeriod } from "@/lib/admin/insights-period";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { UNFINISHED_ROOM_STATUSES_FILTER } from "@/lib/meeting/meeting-day";
import {
  lastMonthKeys,
  monthlyCredits,
  yearsOfMonthKeys,
  type HeldRoomLike,
  type LedgerRead,
  type MonthCredits,
  type RoomsRead,
} from "@/lib/workspace/insights/overview-metrics";
import { assistantService } from "@/services/assistant.service";
import { billingService } from "@/services/billing.service";
import { translationRoomService } from "@/services/translation-room.service";
import { WorkspaceService } from "@/services/workspace.service";
import type {
  AssistantPluginCatalogItemDto,
  WorkspacePluginToolAuditDto,
  WorkspacePluginsOverviewDto,
} from "@/types/assistant";
import type {
  CreditBalanceDto,
  MonthlyUsagePoint,
  RecurringBillingStatusDto,
  SubscriptionDto,
  WorkspaceUsageByMemberDto,
} from "@/types/billing";
import type { TranslationRoomDto } from "@/types/translationRoom";
import type { WorkspaceMemberDto } from "@/types/workspace";

/** Every Insights query key starts with this — the Usage and Tools tabs should use it too. */
export const INSIGHTS_QUERY_ROOT = "workspace-insights";

/** How often the "right now" reads refresh while the tab is visible (TanStack pauses it when hidden). */
export const INSIGHTS_REFRESH_MS = 60_000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Room history: a week of slack each side, because the history filters on the BOOKED time. */
const ROOM_SLACK_MS = 7 * MS_PER_DAY;
const ROOMS_PAGE_SIZE = 100;
const ROOMS_MAX_PAGES = 10;

/** How many rows of up-next and of the member directory are read. */
const UPCOMING_PAGE_SIZE = 100;
/** The "Recent tool activity" list: one page of the plugin audit log, never paged further. */
export const RECENT_TOOL_ACTIVITY_ROWS = 4;
const MEMBERS_PAGE_SIZE = 100;

export function insightsStateOf<T, R = T>(query: UseQueryResult<T>, select?: (data: T) => R): InsightsSourceState<R> {
  if (query.data !== undefined) {
    return {
      status: "ready",
      data: select ? select(query.data) : (query.data as unknown as R),
      refreshing: query.isPlaceholderData,
    };
  }
  return query.isError ? { status: "unavailable" } : { status: "loading" };
}

/** A 404 is "nothing here" (no plan, nothing to renew), not a failure. */
async function nullOn404<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (getErrorStatus(error) === 404) return null;
    throw error;
  }
}

/**
 * The newest successful read across every Insights query of this workspace, or 0 before the
 * first. Read from the query cache, so the tabs do not have to report it upward.
 */
export function useInsightsUpdatedAt(workspaceId: string | null | undefined): number {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const compute = useCallback(() => {
    let newest = 0;
    for (const query of cache.findAll({ queryKey: [INSIGHTS_QUERY_ROOT, workspaceId ?? null] })) {
      if (query.state.data !== undefined && query.state.dataUpdatedAt > newest) newest = query.state.dataUpdatedAt;
    }
    return newest;
  }, [cache, workspaceId]);
  return useSyncExternalStore(
    useCallback((onChange) => cache.subscribe(onChange), [cache]),
    compute,
    () => 0,
  );
}

// ── paged reads ──────────────────────────────────────────────────────────────

/**
 * From `from` to now, filtered to the windows client-side. No `toDate`: the Usage page never sends
 * one either, and a server that read it as a calendar date would silently drop the window's last day.
 */
async function readLedger(workspaceId: string, from: Date): Promise<LedgerRead> {
  const page = await billingService.getAllCreditHistory(workspaceId, {
    fromDate: from.toISOString(),
  });
  return { items: page.items, complete: page.items.length >= (page.totalCount ?? page.items.length) };
}

async function readHeldRooms(workspaceId: string, from: Date, to: Date): Promise<RoomsRead> {
  const rooms: HeldRoomLike[] = [];
  let complete = false;
  for (let page = 1; page <= ROOMS_MAX_PAGES; page += 1) {
    const { data } = await translationRoomService.history({
      workspaceId,
      status: "ENDED",
      from: new Date(from.getTime() - ROOM_SLACK_MS).toISOString(),
      to: new Date(to.getTime() + ROOM_SLACK_MS).toISOString(),
      page,
      pageSize: ROOMS_PAGE_SIZE,
    });
    for (const item of data.rooms) {
      rooms.push({
        id: item.room.id,
        status: item.room.status,
        startedAt: item.room.startedAt ?? null,
        endedAt: item.room.endedAt ?? null,
        durationSeconds: item.room.durationSeconds ?? null,
      });
    }
    if (data.rooms.length < ROOMS_PAGE_SIZE || rooms.length >= (data.total ?? 0)) {
      complete = true;
      break;
    }
  }
  return { rooms, complete };
}

async function readMonthlyCredits(workspaceId: string, keys: string[]): Promise<MonthCredits[]> {
  const years = yearsOfMonthKeys(keys);
  const charts = await Promise.all(
    years.map(async (year) => {
      const chart = await nullOn404(() => billingService.getWorkspaceUsageChart(workspaceId, year));
      return [year, chart?.monthlyData ?? null] as [number, MonthlyUsagePoint[] | null];
    }),
  );
  return monthlyCredits(keys, new Map(charts));
}

// ── the hook ─────────────────────────────────────────────────────────────────

export interface WorkspaceInsightsOverviewSources {
  /** `null` data: the workspace has no plan. */
  balance: InsightsSourceState<CreditBalanceDto | null>;
  subscription: InsightsSourceState<SubscriptionDto | null>;
  /** `null` data: nothing renews (no plan). */
  recurring: InsightsSourceState<RecurringBillingStatusDto | null>;
  /** The period and the previous one. */
  ledger: InsightsSourceState<LedgerRead>;
  sixMonths: InsightsSourceState<MonthCredits[]>;
  /** Ended rooms around the period and the previous one. */
  rooms: InsightsSourceState<RoomsRead>;
  upcoming: InsightsSourceState<TranslationRoomDto[]>;
  memberUsage: InsightsSourceState<WorkspaceUsageByMemberDto>;
  members: InsightsSourceState<{ items: WorkspaceMemberDto[]; total: number }>;
  /** The newest plugin calls, for the "Recent tool activity" list only — never counted. */
  recentAudits: InsightsSourceState<WorkspacePluginToolAuditDto[]>;
  catalog: InsightsSourceState<AssistantPluginCatalogItemDto[]>;
  workspacePlugins: InsightsSourceState<WorkspacePluginsOverviewDto>;
}

export function useWorkspaceInsightsOverview({
  workspaceId,
  period,
  nowMs,
  enabled,
}: {
  workspaceId: string;
  period: ResolvedInsightsPeriod;
  nowMs: number;
  enabled: boolean;
}): WorkspaceInsightsOverviewSources {
  const on = enabled && !!workspaceId;
  const root = [INSIGHTS_QUERY_ROOT, workspaceId] as const;
  const from = period.from.toISOString();
  const to = period.to.toISOString();
  const previousFrom = period.previousFrom.toISOString();
  const snapshot = { enabled: on, refetchInterval: INSIGHTS_REFRESH_MS } as const;
  const windowed = { enabled: on, placeholderData: keepPreviousData, staleTime: 30_000 } as const;

  const balance = useQuery({
    queryKey: [...root, "balance"],
    queryFn: () => nullOn404(() => billingService.getWorkspaceCredits(workspaceId)),
    ...snapshot,
  });
  const subscription = useQuery({
    queryKey: [...root, "subscription"],
    queryFn: () => nullOn404(() => billingService.getActiveSubscription(workspaceId)),
    ...snapshot,
  });
  const recurring = useQuery({
    queryKey: [...root, "recurring"],
    queryFn: () => nullOn404(() => billingService.getRecurringBilling(workspaceId)),
    ...snapshot,
  });

  // One ledger read covers both windows: the previous period ends where this one starts.
  const ledger = useQuery({
    queryKey: [...root, "ledger", previousFrom, to],
    queryFn: () => readLedger(workspaceId, period.previousFrom),
    ...windowed,
  });

  const monthKeys = lastMonthKeys(new Date(nowMs));
  const sixMonths = useQuery({
    queryKey: [...root, "six-months", monthKeys[0], monthKeys[monthKeys.length - 1]],
    queryFn: () => readMonthlyCredits(workspaceId, monthKeys),
    ...windowed,
  });

  const rooms = useQuery({
    queryKey: [...root, "held-rooms", previousFrom, to],
    queryFn: () => readHeldRooms(workspaceId, period.previousFrom, period.to),
    ...windowed,
  });

  // `status` is sent, not left to the server's default: OPEN (WT-612 / WT-621) is not among the
  // four statuses that default was written with — see the dashboard's "coming up".
  const upcoming = useQuery({
    queryKey: [...root, "upcoming"],
    queryFn: async () => {
      const { data } = await translationRoomService.list({
        pageSize: UPCOMING_PAGE_SIZE,
        status: UNFINISHED_ROOM_STATUSES_FILTER,
        workspaceId,
      });
      return data.rooms;
    },
    ...snapshot,
  });

  const memberUsage = useQuery({
    queryKey: [...root, "member-usage", from, to],
    queryFn: () => billingService.getUsageByMember(workspaceId, { from, to }),
    ...windowed,
  });
  const members = useQuery({
    queryKey: [...root, "members"],
    queryFn: async () => {
      const page = await WorkspaceService.listMembers(workspaceId, 1, MEMBERS_PAGE_SIZE);
      return { items: page.items, total: page.total ?? page.items.length };
    },
    enabled: on,
    staleTime: 5 * 60_000,
  });

  const recentAudits = useQuery({
    queryKey: [...root, "recent-tool-audits"],
    queryFn: async () =>
      (await assistantService.listWorkspacePluginToolAudits({ workspaceId, skip: 0, take: RECENT_TOOL_ACTIVITY_ROWS })).data ?? [],
    ...snapshot,
  });
  const catalog = useQuery({
    queryKey: [...root, "plugin-catalog"],
    queryFn: async () => (await assistantService.listPlugins(workspaceId)).data,
    enabled: on,
    staleTime: 5 * 60_000,
  });
  const workspacePlugins = useQuery({
    queryKey: [...root, "workspace-plugins"],
    queryFn: async () => (await assistantService.getWorkspacePlugins(workspaceId)).data,
    ...snapshot,
  });

  return {
    balance: insightsStateOf(balance),
    subscription: insightsStateOf(subscription),
    recurring: insightsStateOf(recurring),
    ledger: insightsStateOf(ledger),
    sixMonths: insightsStateOf(sixMonths),
    rooms: insightsStateOf(rooms),
    upcoming: insightsStateOf(upcoming),
    memberUsage: insightsStateOf(memberUsage),
    members: insightsStateOf(members),
    recentAudits: insightsStateOf(recentAudits),
    catalog: insightsStateOf(catalog),
    workspacePlugins: insightsStateOf(workspacePlugins),
  };
}
