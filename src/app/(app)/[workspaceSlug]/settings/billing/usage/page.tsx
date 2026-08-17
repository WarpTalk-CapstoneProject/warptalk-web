"use client";

/**
 * Usage — what this workspace actually spent, in credits.
 *
 * IT COUNTS CREDITS, NOT CHARGES. The old surface listed one row per settlement, so a meeting
 * that settled thirty times appeared thirty times and the column a reader cared about — how many
 * credits went out — had to be reconstructed by eye. "sao k hiển thị đơn vị credit mà để charge
 * (số lần trừ credit) hơi khó theo dõi." Every number here is credits; the settlement count is
 * kept only as a secondary figure, because it explains a row rather than being the point of it.
 *
 * IT AGGREGATES. Per-day for the chart, per-service for the table. A stream of individual −2
 * credit lines is a log, not a report, and it was the specific complaint: "chứ mỗi lần -2 credit
 * cx show lên."
 *
 * Layout follows the OpenAI usage screen: one headline number with its series, a right rail of
 * supporting totals, then the breakdown underneath. Rules, not floating tiles — and no shadows.
 */

import { Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";

import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import {
  summariseCycleActivity,
  summariseServiceUsage,
} from "@/lib/billing/cycle-activity";
import { formatAmount } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { CycleSpendChart } from "../components/cycle-spend-chart";
import {
  Row,
  RowGroup,
  Section,
  SectionHeader,
} from "../components/billing-primitives";
import { ServiceUsageTable } from "../components/service-usage-table";

export default function WorkspaceUsagePage() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceId = activeWorkspaceId || "";
  const role = useWorkspaceRole();

  // Read once, at mount. Reading the clock during render is impure — the chart and the window
  // length would each see a slightly different "now" and could disagree across midnight.
  const [now] = useState(() => Date.now());

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

  // `days` since the cycle began, so the per-service table covers the same window as the chart
  // above it. Asking for a fixed 30 would label a 30-day window as "this cycle" on every plan
  // whose cycle is not 30 days.
  const cycleDaysElapsed = cycleStart
    ? Math.max(1, Math.ceil((now - new Date(cycleStart).getTime()) / 86_400_000))
    : 30;

  const { data: serviceUsage, isLoading: isServiceUsageLoading } = useQuery({
    queryKey: ["billing", "service-usage", workspaceId, cycleDaysElapsed],
    queryFn: () => billingService.getWorkspaceUsageBreakdown(workspaceId, cycleDaysElapsed),
    enabled: !!workspaceId,
    retry: 1,
  });

  const cycleActivity = useMemo(() => {
    if (!balance || !cycleLedger?.items) return null;
    return summariseCycleActivity(
      {
        transactions: cycleLedger.items,
        currentPeriodStart: balance.currentPeriodStart,
        currentPeriodEnd: balance.currentPeriodEnd,
        totalCredits: balance.totalCredits,
      },
      now,
    );
  }, [balance, cycleLedger, now]);

  const serviceRows = useMemo(
    () => summariseServiceUsage(serviceUsage ?? []),
    [serviceUsage],
  );

  /**
   * Settlements, counted once. This is the number the old page showed INSTEAD of credits; it
   * survives as context — "3,412 settlements" tells you a figure is an aggregate — but it is
   * never the headline.
   */
  const settlementCount = cycleLedger?.items?.filter((tx) => tx.type === "consume").length ?? 0;

  const toppedUp = cycleActivity ? Math.round(cycleActivity.totalToppedUp) : 0;
  const consumed = cycleActivity ? Math.round(cycleActivity.totalConsumed) : 0;

  if (role && role !== "owner" && role !== "admin") {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        Only workspace Owners and Administrators can view usage.
      </div>
    );
  }

  const isLoading = isBalanceLoading || isLedgerLoading;

  return (
    <div className="flex flex-col gap-4 bg-surface-1 px-4 py-4 text-ink">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Section>
          <div className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] text-ink-muted">Credits spent</p>
              <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums text-ink">
                {formatAmount(consumed)}
              </p>
              <p className="mt-2 text-[12px] text-ink-muted">
                {cycleActivity
                  ? `Per ${cycleActivity.bucketSize} since ${format(cycleActivity.buckets[0].start, "MMM d")}`
                  : "This billing cycle"}
              </p>
            </div>
            <span className="shrink-0 rounded-[6px] border border-border px-2 py-1 text-[11px] text-ink-muted">
              {cycleDaysElapsed}d
            </span>
          </div>
          <div className="border-t border-hairline px-4 py-3.5">
            {isLoading ? (
              <div className="flex h-[220px] items-center justify-center">
                <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
              </div>
            ) : cycleActivity ? (
              <CycleSpendChart activity={cycleActivity} />
            ) : (
              <p className="flex h-[220px] items-center justify-center text-[12px] text-ink-muted">
                This cycle has no dates to chart against.
              </p>
            )}
          </div>
        </Section>

        <Section className="h-fit">
          <SectionHeader title="This cycle" />
          <RowGroup>
            <Row label="Credits granted" value={formatAmount(balance?.totalCredits ?? 0)} />
            <Row label="Credits spent" value={formatAmount(consumed)} />
            <Row label="Topped up" value={formatAmount(toppedUp)} />
            <Row label="Remaining" value={formatAmount(balance?.currentCredits ?? 0)} />
            <Row
              label="Settlements"
              value={formatAmount(settlementCount)}
              hint="How many times credits were deducted"
            />
            <Row
              label="Busiest day"
              value={
                cycleActivity?.busiest
                  ? format(cycleActivity.busiest.start, "MMM d")
                  : "—"
              }
              hint={
                cycleActivity?.busiest
                  ? `${formatAmount(Math.round(cycleActivity.busiest.consumed))} credits`
                  : undefined
              }
            />
          </RowGroup>
        </Section>
      </div>

      <Section>
        <SectionHeader
          title="Credits by AI service"
          description={`What each service cost, and what it cost per use · last ${cycleDaysElapsed} day${cycleDaysElapsed === 1 ? "" : "s"}`}
        />
        {isServiceUsageLoading ? (
          <div className="flex h-[120px] items-center justify-center">
            <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : (
          <ServiceUsageTable rows={serviceRows} />
        )}
      </Section>
    </div>
  );
}
