"use client";

/**
 * Usage — what this workspace spent, in credits, on what, by whom, in which meeting.
 *
 * WHY IT WAS REBUILT (2026-09-17)
 *   The owner, on the previous version: "usage đang hiển thị ít thông tin quá, với lại Credits by AI
 *   service hiển thị không tốt" — too little on the page, and the per-service table read badly (its
 *   labels were "Real-time Translation (Speech-to-Text / STT)" and truncated in every row). The
 *   instruction was to follow platform.openai.com/usage, and the approved mock does.
 *
 * THE SHAPE, TOP TO BOTTOM
 *   1. Header row — title, a member filter, the cycle, refresh, CSV export.
 *   2. Main row — "Credits spent" with its average and the overage projection, over a bar chart of
 *      spend per day (or week) STACKED BY SERVICE; beside it a rail of three cells: cycle credits
 *      (allowance, progress with a pace tick, the figures that add up), settlements, meetings billed.
 *   3. Bottom row — AI service cards | top-ups & adjustments, and members | meetings ranked lists.
 *   The mock's "Languages" tab is not built: a credit transaction carries no language.
 *
 * ONE RULED SURFACE, NO GROUND
 *   Laid out in ../components/usage-overview (fixtures: /dev/usage-preview). Cells are split by 1px
 *   hairlines edge to edge, the Billing page's framing
 *   (../components/billing-primitives GridRow). The page paints no background — it sits on the
 *   shell's panel (scripts/check-page-ground.mjs). The service cards are the one bordered element,
 *   as in the mock.
 *
 * THE BURN-UP IS GONE FROM THIS PAGE, ITS MATHS IS NOT
 *   The cumulative chart answered "when does this start costing extra"; the stacked bars answer
 *   "on what". The projection survives as text under the number and as the pace note in the rail,
 *   both from `summariseCycleBurnUp`. The bars' old failure — one day holding nearly the whole
 *   cycle — is handled on the axis (`stackedChartScale`), not by abandoning bars.
 *
 * BEHAVIOURS KEPT FROM THE PREVIOUS PAGE, EACH A FIXED BUG
 *   - WT-430: the ledger is paged in full (`getAllCreditHistory`); the server clamps a page to 200.
 *   - One clock: `now` moves only when data is refetched, so every figure agrees about "today".
 *   - Freshness: the billing hub (`useBillingRealtime`) plus a 30s poll while the tab is visible —
 *     the hub never publishes credit consumption.
 *   - Granted + carried over (or adjustments) + topped up = available, and Remaining is the
 *     server's balance. Numbers are formatted through lib/format/currency (fixed locale).
 *
 * WHERE THE NUMBERS COME FROM — lib/billing/usage-overview.ts, all tested
 *   - Per-service spend reads the settlement's "Aggregated <charge_type>" description; charge types
 *     and breakdown usage types fold onto one service in lib/billing/usage-labels.ts.
 *   - The member filter is applied to the ledger before anything is computed. The breakdown
 *     endpoint cannot be filtered, so with a member picked the cards count uses from the ledger.
 *   - Members are named from the member directory: the history endpoint sends `userName: null`.
 *   - Meetings are matched by settlement TIME against room history, because the ledger's reference
 *     is a transcript segment, not a room. Charges during overlapping meetings, and ones that fall
 *     outside every meeting, are listed as themselves rather than guessed.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useBillingRealtime } from "@/hooks/use-billing-realtime";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import type { MeetingWindowLike } from "@/lib/billing/usage-overview";
import { billingService } from "@/services/billing.service";
import { translationRoomService } from "@/services/translation-room.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { UsageOverview } from "../components/usage-overview";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How often the page re-reads its own numbers while it is on screen.
 *
 * Thirty seconds is chosen against what it is watching: credits move in settlements a few seconds
 * apart during a live meeting, and not at all between them. Faster buys nothing a reader would
 * notice; slower makes a meeting look like it is not being billed.
 */
const POLL_INTERVAL_MS = 30_000;

/**
 * Room history changes when a meeting starts or ends, not every settlement, and the history
 * endpoint loads every room's roster and artifacts. It refreshes on its own slower clock rather
 * than riding the 30s billing poll.
 */
const MEETINGS_REFRESH_MS = 2 * 60_000;
const MEETINGS_PAGE_SIZE = 100;
const MEETINGS_MAX_PAGES = 10;

/** Stable empties, so the layout's memoised joins do not recompute on every render while loading. */
const NO_MEMBERS: never[] = [];
const NO_ROOMS: MeetingWindowLike[] = [];

export default function WorkspaceUsagePage() {
  const t = useTranslations("settingsBillingUsage");
  const params = useParams();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const storeSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const workspaceId = activeWorkspaceId || "";
  const workspaceSlug = storeSlug || (params?.workspaceSlug as string) || "";
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const canView = role === "owner" || role === "admin";

  const queryClient = useQueryClient();

  /**
   * One clock for the whole page, advanced only when the data behind it is refetched.
   *
   * Reading `Date.now()` during render is impure — the chart and the window length would each see
   * a slightly different "now" and could disagree across midnight. But holding the mount value
   * forever is its own bug: a tab left open overnight keeps drawing yesterday as today and files
   * fresh transactions into the wrong day. It moves with the refresh, and only there.
   */
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    setNow(Date.now());
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  }, [queryClient]);

  /**
   * Two sources of freshness, because neither one covers this page alone.
   *
   * The hub carries subscription, plan, payment and overage events the moment they happen. It
   * does NOT carry credit consumption — nothing in the billing service publishes that — so the
   * number this page is actually about would sit still without a timer.
   */
  useBillingRealtime(refresh);

  useEffect(() => {
    // Only while the tab is on screen. A background tab polling billing endpoints every half
    // minute is load nobody is reading, on a gateway that rate-limits.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId,
  });

  const cycleStart = balance?.currentPeriodStart;

  const { data: cycleLedger, isLoading: isLedgerLoading } = useQuery({
    queryKey: ["billing", "cycle-ledger", workspaceId, cycleStart],
    queryFn: () =>
      // WT-430: getAllCreditHistory, not one page — the server clamps pageSize to 200, so a busy
      // cycle's chart was quietly built from its newest fifth.
      billingService.getAllCreditHistory(workspaceId, {
        fromDate: cycleStart ? new Date(cycleStart).toISOString() : undefined,
      }),
    enabled: !!workspaceId && !!cycleStart,
    retry: 1,
  });

  // `days` since the cycle began, so the breakdown covers the same window as the ledger. Asking for
  // a fixed 30 would label a 30-day window as "this cycle" on every plan whose cycle is not 30 days.
  const cycleDaysElapsed = cycleStart
    ? Math.max(1, Math.ceil((now - new Date(cycleStart).getTime()) / MS_PER_DAY))
    : 30;

  const { data: serviceUsage } = useQuery({
    queryKey: ["billing", "service-usage", workspaceId, cycleDaysElapsed],
    queryFn: () => billingService.getWorkspaceUsageBreakdown(workspaceId, cycleDaysElapsed),
    enabled: !!workspaceId,
    retry: 1,
  });

  // Names for the ledger's user ids. The same page size the dashboard's member usage panel uses.
  const { data: members } = useWorkspaceMembers(canView ? workspaceId : "", 1, 100);

  const { data: rooms } = useQuery({
    queryKey: ["usage-meetings", workspaceId, cycleStart],
    queryFn: () => loadCycleMeetings(workspaceId, cycleStart!),
    enabled: canView && !!workspaceId && !!cycleStart,
    staleTime: MEETINGS_REFRESH_MS,
    refetchInterval: MEETINGS_REFRESH_MS,
    retry: 1,
  });

  const manualRefresh = useCallback(() => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ["usage-meetings", workspaceId] });
  }, [refresh, queryClient, workspaceId]);

  if (roleLoaded && !canView) {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        {t("accessDenied")}
      </div>
    );
  }

  return (
    <UsageOverview
      balance={balance}
      ledger={cycleLedger?.items}
      serviceUsage={serviceUsage}
      members={members?.items ?? NO_MEMBERS}
      rooms={rooms ?? NO_ROOMS}
      now={now}
      isLoading={isBalanceLoading || isLedgerLoading}
      workspaceSlug={workspaceSlug}
      onRefresh={manualRefresh}
    />
  );
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
