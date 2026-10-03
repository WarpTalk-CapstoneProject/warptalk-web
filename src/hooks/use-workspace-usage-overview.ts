"use client";

/**
 * Everything `UsageOverview` needs, for the Usage tab of workspace Insights (WT-878).
 *
 * THE ONLY COPY
 *   This was lifted out of the stand-alone `/settings/billing/usage` page so Insights could show
 *   the same surface. That page was retired on 2026-10-03 (its address forwards to
 *   `/insights?tab=usage` in proxy.ts), so this hook is now the one place these queries live. Why
 *   the surface is shaped as it is lives at the top of `UsageOverview`; the behaviours, in short:
 *
 *   - WT-430: the cycle's ledger is paged in full (`getAllCreditHistory`), never one page.
 *   - One clock: `now` moves only when the data is refetched, so every figure agrees on "today".
 *   - Freshness: the billing hub (`useBillingRealtime`) plus a 30s poll while the tab is visible,
 *     because the hub never publishes credit consumption.
 *   - Members come from the member directory (the ledger's `userName` is null); meetings are the
 *     cycle's room history, matched to charges by settlement time inside `UsageOverview`.
 *
 * WHAT THIS HOOK ADDS
 *   The page never had to tell "this workspace has no plan" apart from "the billing service did
 *   not answer" — both left it on an empty surface. A tab inside Insights has to, so the hook
 *   reports a `status`: the balance endpoint answers a workspace without a subscription with
 *   BILLING_SUBSCRIPTION_NOT_FOUND, which is an account state (`noSubscription`) and is not
 *   retried; any other failure of the balance or the ledger is `unavailable`. The query
 *   functions themselves are untouched, so the cache the page shares holds the same shapes.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { useBillingRealtime } from "@/hooks/use-billing-realtime";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import { apiErrorCode } from "@/lib/api/errors";
import { NO_SUBSCRIPTION_CODE } from "@/lib/billing/workspace-paywall";
import type { BreakdownRowLike, MeetingWindowLike, UsageMemberLike } from "@/lib/billing/usage-overview";
import { billingService } from "@/services/billing.service";
import { translationRoomService } from "@/services/translation-room.service";
import type { CreditBalanceDto, CreditTransactionDto } from "@/types/billing";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The page's poll: credits move in settlements seconds apart during a meeting. */
const POLL_INTERVAL_MS = 30_000;

/** Room history changes when a meeting starts or ends; it refreshes on its own slower clock. */
const MEETINGS_REFRESH_MS = 2 * 60_000;
const MEETINGS_PAGE_SIZE = 100;
const MEETINGS_MAX_PAGES = 10;

/** How many times a failed balance read is retried — React Query's default, minus "no plan". */
const BALANCE_RETRIES = 3;

/** Stable empties, so the layout's memoised joins do not recompute on every render while loading. */
const NO_MEMBERS: UsageMemberLike[] = [];
const NO_ROOMS: MeetingWindowLike[] = [];

export type WorkspaceUsageStatus =
  /** The balance (and with it the cycle) is still being read for the first time. */
  | "loading"
  /** The workspace has no subscription: there is no cycle to show. */
  | "noSubscription"
  /** The balance or the ledger could not be read. */
  | "unavailable"
  | "ready";

export interface WorkspaceUsageOverview {
  status: WorkspaceUsageStatus;
  /** Whether the viewer may see usage (workspace owner or admin), and whether that is known yet. */
  canView: boolean;
  roleLoaded: boolean;
  /** The props `UsageOverview` takes, minus `workspaceSlug`. */
  balance: CreditBalanceDto | undefined;
  ledger: CreditTransactionDto[] | undefined;
  /** False when paging stopped before the server's own total, so the ledger is a floor. Undefined until read. */
  ledgerComplete: boolean | undefined;
  serviceUsage: readonly BreakdownRowLike[] | undefined;
  members: readonly UsageMemberLike[];
  rooms: readonly MeetingWindowLike[];
  now: number;
  isLoading: boolean;
  /** Re-read everything, meetings included, and advance the clock. Also the retry of a failure. */
  onRefresh: () => void;
}

function isNoSubscription(error: unknown): boolean {
  return apiErrorCode(error) === NO_SUBSCRIPTION_CODE;
}

export function useWorkspaceUsageOverview(workspaceId: string): WorkspaceUsageOverview {
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const canView = role === "owner" || role === "admin";

  const queryClient = useQueryClient();

  /** One clock, advanced only when the data behind it is refetched. */
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setNow(Date.now());
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  }, [queryClient]);

  useBillingRealtime(refresh);

  useEffect(() => {
    // Only while the tab is on screen: a background tab polling billing is load nobody reads.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const balanceQuery = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId,
    // "No plan" is an answer, not a fault: asking three more times cannot change it.
    retry: (failureCount, error) => !isNoSubscription(error) && failureCount < BALANCE_RETRIES,
  });
  const balance = balanceQuery.data;

  const cycleStart = balance?.currentPeriodStart;

  const ledgerQuery = useQuery({
    queryKey: ["billing", "cycle-ledger", workspaceId, cycleStart],
    queryFn: () =>
      // WT-430: every page, not one — the server clamps pageSize to 200.
      billingService.getAllCreditHistory(workspaceId, {
        fromDate: cycleStart ? new Date(cycleStart).toISOString() : undefined,
      }),
    enabled: !!workspaceId && !!cycleStart,
    retry: 1,
  });

  // Days since the cycle began, so the breakdown covers the same window as the ledger.
  const cycleDaysElapsed = cycleStart
    ? Math.max(1, Math.ceil((now - new Date(cycleStart).getTime()) / MS_PER_DAY))
    : 30;

  const { data: serviceUsage } = useQuery({
    queryKey: ["billing", "service-usage", workspaceId, cycleDaysElapsed],
    queryFn: () => billingService.getWorkspaceUsageBreakdown(workspaceId, cycleDaysElapsed),
    enabled: !!workspaceId,
    retry: 1,
  });

  // Names for the ledger's user ids, at the page size the Usage page uses.
  const { data: members } = useWorkspaceMembers(canView ? workspaceId : "", 1, 100);

  const { data: rooms } = useQuery({
    queryKey: ["usage-meetings", workspaceId, cycleStart],
    queryFn: () => loadCycleMeetings(workspaceId, cycleStart!),
    enabled: canView && !!workspaceId && !!cycleStart,
    staleTime: MEETINGS_REFRESH_MS,
    refetchInterval: MEETINGS_REFRESH_MS,
    retry: 1,
  });

  const onRefresh = useCallback(() => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["usage-meetings", workspaceId] });
  }, [refresh, queryClient, workspaceId]);

  // A failure behind data already on screen (a poll that missed) keeps the data; only a read that
  // never produced anything is a state of its own.
  let status: WorkspaceUsageStatus;
  if (!balance) {
    if (balanceQuery.isError) {
      status = isNoSubscription(balanceQuery.error) ? "noSubscription" : "unavailable";
    } else {
      status = "loading";
    }
  } else if (ledgerQuery.isError && !ledgerQuery.data) {
    status = "unavailable";
  } else {
    status = "ready";
  }

  return {
    status,
    canView,
    roleLoaded,
    balance,
    ledger: ledgerQuery.data?.items,
    ledgerComplete: ledgerQuery.data
      ? ledgerQuery.data.items.length >= (ledgerQuery.data.totalCount ?? ledgerQuery.data.items.length)
      : undefined,
    serviceUsage,
    members: members?.items ?? NO_MEMBERS,
    rooms: rooms ?? NO_ROOMS,
    now,
    isLoading: balanceQuery.isLoading || ledgerQuery.isLoading,
    onRefresh,
  };
}

async function loadCycleMeetings(
  workspaceId: string,
  cycleStart: string,
): Promise<MeetingWindowLike[]> {
  // A week of slack: the history filters on the BOOKED time, and a meeting booked before the
  // cycle can still run in it.
  const from = new Date(new Date(cycleStart).getTime() - 7 * MS_PER_DAY).toISOString();
  const rooms: MeetingWindowLike[] = [];
  for (let page = 1; page <= MEETINGS_MAX_PAGES; page += 1) {
    const { data } = await translationRoomService.history({
      workspaceId,
      status: "IN_PROGRESS,PAUSED,ENDED",
      from,
      page,
      pageSize: MEETINGS_PAGE_SIZE,
    });
    for (const item of data.rooms) {
      rooms.push({
        id: item.room.id,
        title: item.room.title,
        startedAt: item.room.startedAt ?? null,
        endedAt: item.room.endedAt ?? null,
      });
    }
    if (data.rooms.length < MEETINGS_PAGE_SIZE || rooms.length >= (data.total ?? 0)) break;
  }
  return rooms;
}
