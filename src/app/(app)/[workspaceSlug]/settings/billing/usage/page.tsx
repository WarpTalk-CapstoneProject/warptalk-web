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
 * IT AGGREGATES. Cumulative for the chart, per-service for the table. A stream of individual −2
 * credit lines is a log, not a report, and it was the specific complaint: "chứ mỗi lần -2 credit
 * cx show lên."
 *
 * ONE BLOCK, RULED — NOT A GRID OF CARDS. The page used to stack three bordered sections inside
 * a bordered surface, which is a card inside a card and reads as patches rather than as a page.
 * Everything now lives in a single frame: one vertical rule between the chart and its totals,
 * horizontal rules between the parts. Same language as the OpenAI usage screen this follows.
 *
 * THE THREE TOP-LINE NUMBERS ADD UP. "Credits granted 385,000" beside "Credits spent 2,106,183"
 * read as broken data on the demo workspace; it was not, the workspace had topped up and carried
 * a balance in. Granted + carried over + topped up now sum to Credits available, which is the
 * number the chart's ceiling draws and the number Remaining subtracts from.
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
import { summariseCycleBurnUp } from "@/lib/billing/cycle-burnup";
import { formatAmount } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";

import { CreditBurnUpChart } from "../components/credit-burnup-chart";
import { ServiceUsageTable } from "../components/service-usage-table";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    ? Math.max(1, Math.ceil((now - new Date(cycleStart).getTime()) / MS_PER_DAY))
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

  const burnUp = useMemo(() => {
    if (!balance || !cycleLedger?.items) return null;
    return summariseCycleBurnUp(
      {
        transactions: cycleLedger.items,
        currentPeriodStart: balance.currentPeriodStart,
        currentPeriodEnd: balance.currentPeriodEnd,
        totalCredits: balance.totalCredits,
        currentCredits: balance.currentCredits,
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
  const granted = Math.round(balance?.totalCredits ?? 0);
  const available = burnUp ? Math.round(burnUp.available) : granted + toppedUp;

  // Whatever the cycle started with that the plan did not grant: a balance rolled over from last
  // cycle, or an admin adjustment. It is not a mystery to be hidden — it is the difference
  // between two numbers the page already shows, and leaving it out is what made them disagree.
  const carried = available - granted - toppedUp;

  const share = available > 0 ? Math.round((consumed / available) * 100) : 0;

  const overageDate = useMemo(() => {
    if (!burnUp || burnUp.overageAt === null) return null;
    const bucketDays = burnUp.bucketSize === "week" ? 7 : 1;
    const at = new Date(burnUp.points[0].start.getTime());
    at.setDate(at.getDate() + Math.round(burnUp.overageAt * bucketDays));
    return at;
  }, [burnUp]);

  if (role && role !== "owner" && role !== "admin") {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        Only workspace Owners and Administrators can view usage.
      </div>
    );
  }

  const isLoading = isBalanceLoading || isLedgerLoading;

  return (
    <div className="bg-surface-1 px-4 py-4 text-ink">
      <div className="overflow-hidden rounded-[12px] border border-border bg-surface-1 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h1 className="text-[14px] font-semibold text-ink">Usage</h1>
          <span className="rounded-[6px] border border-border px-2 py-1 text-[11px] text-ink-muted">
            {balance
              ? `${format(new Date(balance.currentPeriodStart), "d MMM")} – ${format(
                  new Date(balance.currentPeriodEnd),
                  "d MMM",
                )} · ${cycleDaysElapsed}d elapsed`
              : "This billing cycle"}
          </span>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_296px]">
          <div className="min-w-0 px-4 py-4">
            <p className="text-[13px] text-ink-muted">Credits spent</p>
            <p className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-ink">
              {formatAmount(consumed)}
            </p>
            <p className="mt-2 text-[12px] text-ink-muted">
              {available > 0 ? (
                <>
                  <b className="font-semibold text-ink">{share}%</b> of {formatAmount(available)}{" "}
                  available
                </>
              ) : (
                "This billing cycle"
              )}
              {overageDate && burnUp ? (
                <>
                  {" · "}
                  <span className="font-semibold text-destructive">
                    {burnUp.overageIsMeasured ? "in overage since" : "projected overage on"}{" "}
                    {format(overageDate, "d MMM")}
                  </span>
                </>
              ) : null}
            </p>

            <div className="mt-4">
              {isLoading ? (
                <div className="flex h-[220px] items-center justify-center">
                  <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
                </div>
              ) : burnUp ? (
                <CreditBurnUpChart burnUp={burnUp} />
              ) : (
                <p className="flex h-[220px] items-center justify-center text-[12px] text-ink-muted">
                  This cycle has no dates to chart against.
                </p>
              )}
            </div>
          </div>

          {/* The rail is separated by ONE rule, not by a card of its own. At narrow widths the
              grid drops to a single column and the rule has to move with it, or the totals hang
              under the chart with nothing between them. */}
          <aside className="border-t border-hairline xl:border-l xl:border-t-0">
            <p className="px-4 pb-2 pt-3.5 text-[13px] font-semibold text-ink">This cycle</p>

            <RailGroup>
              <RailRow label="Credits available" value={formatAmount(available)} strong />
              <RailRow label="Granted" value={formatAmount(granted)} />
              <RailRow
                label={carried < 0 ? "Adjustments" : "Carried over"}
                value={formatAmount(carried)}
              />
              <RailRow label="Topped up" value={formatAmount(toppedUp)} />
            </RailGroup>

            <RailGroup>
              <RailRow label="Spent" value={formatAmount(consumed)} strong />
              <RailRow
                label="Remaining"
                value={formatAmount(balance?.currentCredits ?? 0)}
                tone={(balance?.currentCredits ?? 0) <= 0 ? "warn" : "default"}
              />
            </RailGroup>

            <RailGroup>
              <RailRow
                label="Settlements"
                hint="How many times credits were deducted"
                value={formatAmount(settlementCount)}
              />
              <RailRow
                label="Busiest day"
                hint={
                  cycleActivity?.busiest
                    ? `${formatAmount(Math.round(cycleActivity.busiest.consumed))} credits`
                    : undefined
                }
                value={
                  cycleActivity?.busiest ? format(cycleActivity.busiest.start, "d MMM") : "—"
                }
              />
            </RailGroup>
          </aside>
        </div>

        <div className="border-t border-hairline px-4 pb-3 pt-4">
          <h2 className="text-[14px] font-semibold leading-tight text-ink">
            Credits by AI service
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            What each service cost, and what it cost per use · last {cycleDaysElapsed} day
            {cycleDaysElapsed === 1 ? "" : "s"}
          </p>
        </div>

        <div className="border-t border-hairline">
          {isServiceUsageLoading ? (
            <div className="flex h-[120px] items-center justify-center">
              <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
            </div>
          ) : (
            <ServiceUsageTable rows={serviceRows} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Rows that belong to one statement, ruled together and separated from the next group. */
function RailGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-hairline border-t border-hairline">{children}</div>;
}

function RailRow({
  label,
  value,
  hint,
  strong,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  strong?: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <span className="text-[13px] text-ink-muted">{label}</span>
        {hint ? <p className="mt-0.5 text-[11px] text-ink-subtle">{hint}</p> : null}
      </div>
      <span
        className={`shrink-0 font-semibold tabular-nums ${strong ? "text-[14px]" : "text-[13px]"} ${
          tone === "warn" ? "text-destructive" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
