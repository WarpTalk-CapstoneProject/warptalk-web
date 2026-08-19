"use client";

/**
 * The billing surface, rendered against fixtures.
 *
 * WHY IT EXISTS
 *   Every panel on `/[workspaceSlug]/settings/billing` needs a live billing service: a subscription, a
 *   credit balance, a transaction ledger and a plan catalogue. None of that is reachable from a
 *   laptop, so the only way to LOOK at this page has been to deploy it — which is how it accrued
 *   three different card languages, a chart with hardcoded slate colours that inverts in dark
 *   mode, and grey tiles nobody had seen next to the white page they sit on.
 *
 *   The fixtures below are shaped to make the states that are hard to reach on purpose: a cycle
 *   with a spike well over the pace line, a plan that withholds two entitlements, an unpaid
 *   invoice, and a workspace heading for empty before renewal.
 *
 * IT IS NOT THE PAGE
 *   It renders the page's COMPONENTS, not its data layer. It cannot catch a wrong query key or a
 *   mis-mapped DTO — only what those components look like once the data arrives.
 */

import { useState } from "react";

import { summariseCycleActivity, summariseServiceUsage } from "@/lib/billing/cycle-activity";
import { summariseCycleBurnUp } from "@/lib/billing/cycle-burnup";
import { projectCycle } from "@/lib/billing/cycle-projection";
import type { CreditTransactionDto, PlanDto, SubscriptionDto } from "@/types/billing";
import { CreditBurnUpChart } from "@/app/(app)/[workspaceSlug]/settings/billing/components/credit-burnup-chart";
import { CycleSpendChart } from "@/app/(app)/[workspaceSlug]/settings/billing/components/cycle-spend-chart";
import { Metric, MetricGrid, Panel } from "@/app/(app)/[workspaceSlug]/settings/billing/components/metric-grid";
import { PlanPanel } from "@/app/(app)/[workspaceSlug]/settings/billing/components/plan-panel";
import { ServiceUsageTable } from "@/app/(app)/[workspaceSlug]/settings/billing/components/service-usage-table";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 7, 14, 11, 0, 0).getTime();
const PERIOD_START = new Date(2026, 6, 29, 0, 0, 0).toISOString();
const PERIOD_END = new Date(2026, 7, 29, 0, 0, 0).toISOString();

const TOTAL_CREDITS = 1_400_000;

/** A cycle with one spike, so the pace line has something to be crossed by. */
const LEDGER: CreditTransactionDto[] = [
  { at: 0, amount: TOTAL_CREDITS },
  { at: 1, amount: -22_000 },
  { at: 2, amount: -31_500 },
  { at: 3, amount: -18_200 },
  { at: 4, amount: -9_800 },
  { at: 5, amount: -47_000 },
  { at: 6, amount: -134_000 },
  { at: 7, amount: -52_300 },
  { at: 8, amount: -28_900 },
  { at: 9, amount: -61_400 },
  { at: 10, amount: -44_100 },
  { at: 11, amount: -19_600 },
  { at: 12, amount: -73_800 },
  { at: 13, amount: -38_200 },
  { at: 14, amount: -55_900 },
  { at: 15, amount: -12_400 },
].map(({ at, amount }, index, all) => ({
  id: `tx-${index}`,
  workspaceId: "w",
  userId: "u",
  amount,
  type: amount > 0 ? "top_up" : "consume",
  // A running balance, not a hardcoded zero. The burn-up derives its ceiling from `balanceAfter`
  // — available = spent so far + balance — so a fixture where every row says the workspace has
  // nothing draws a ceiling on the axis and puts the preview permanently in overage.
  balanceAfter: all.slice(0, index + 1).reduce((sum, tx) => sum + tx.amount, 0),
  createdAt: new Date(new Date(PERIOD_START).getTime() + at * DAY + 9 * 60 * 60 * 1000).toISOString(),
}));

const CONSUMED = LEDGER.filter((tx) => tx.amount < 0).reduce((s, tx) => s + -tx.amount, 0);

const SUBSCRIPTION: SubscriptionDto = {
  id: "sub",
  userId: null,
  workspaceId: "w",
  planId: "plan-enterprise",
  planName: "Enterprise",
  price: 1_900_000,
  status: "active",
  creditsRemaining: TOTAL_CREDITS - CONSUMED,
  creditsUsedThisCycle: CONSUMED,
  currentPeriodStart: PERIOD_START,
  currentPeriodEnd: PERIOD_END,
  autoRenew: true,
  cancelAtPeriodEnd: false,
  createdAt: PERIOD_START,
  cancelledAt: null,
};

const PLAN: PlanDto = {
  id: "plan-enterprise",
  name: "Enterprise",
  slug: "enterprise",
  tier: "enterprise",
  price: 1_900_000,
  currency: "VND",
  billingCycle: "monthly",
  creditsPerCycle: TOTAL_CREDITS,
  overageCapCredits: 100_000,
  overagePricePerCredit: 4,
  lowBalanceThresholdCredits: 150_000,
  rolloverCapCredits: 0,
  invoiceTermsDays: 15,
  invoiceGraceHours: 360,
  features: "[]",
  sortOrder: 1,
  isActive: true,
  maxParticipants: 50,
  maxLanguages: 7,
  voiceCloneEnabled: true,
  aiAssistantEnabled: true,
  glossaryEnabled: false,
  dedicatedGpu: false,
};

const SERVICE_ROWS = summariseServiceUsage([
  { usageType: "voice_translation", totalCreditsConsumed: 402_300, usageCount: 1_284 },
  { usageType: "text_to_speech", totalCreditsConsumed: 168_900, usageCount: 1_190 },
  { usageType: "voice_cloning", totalCreditsConsumed: 41_200, usageCount: 0 },
  { usageType: "meeting_summary", totalCreditsConsumed: 26_400, usageCount: 88 },
  { usageType: "chat", totalCreditsConsumed: 9_300, usageCount: 620 },
]);

export default function BillingPreviewPage() {
  const [dark, setDark] = useState(false);

  const activity = summariseCycleActivity(
    {
      transactions: LEDGER,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      totalCredits: TOTAL_CREDITS,
    },
    NOW,
  );

  const burnUp = summariseCycleBurnUp(
    {
      transactions: LEDGER,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      totalCredits: TOTAL_CREDITS,
      currentCredits: TOTAL_CREDITS - CONSUMED,
    },
    NOW,
  );

  const projection = projectCycle(
    {
      currentCredits: TOTAL_CREDITS - CONSUMED,
      creditsUsedThisCycle: CONSUMED,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
    },
    NOW,
  );

  const usagePercent = Math.round((CONSUMED / TOTAL_CREDITS) * 100);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-surface-1 px-4 py-4 text-ink">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDark((value) => !value)}
            className="rounded-full border border-border px-3 py-1 text-[12px] text-ink"
          >
            {dark ? "Light" : "Dark"}
          </button>
          <span className="text-[12px] text-ink-muted">
            Fixtures only — /dev is 404 in production.
          </span>
        </div>

        <MetricGrid>
          <Metric
            label="Credits remaining"
            value={(TOTAL_CREDITS - CONSUMED).toLocaleString()}
            detail={`${100 - usagePercent}% of ${TOTAL_CREDITS.toLocaleString()} available`}
          />
          <Metric
            label="Spent this cycle"
            value={CONSUMED.toLocaleString()}
            detail={`${usagePercent}% of this cycle's credits`}
          />
          <Metric
            label="Burn rate"
            value={
              projection.kind === "unknown"
                ? "—"
                : `${Math.round(projection.perDay).toLocaleString()}/day`
            }
            detail="Average since the cycle began"
          />
          <Metric
            label="Renews"
            value="Aug 29, 2026"
            detail={
              projection.kind === "runs-out"
                ? "Credits run out Aug 24 — before renewal"
                : projection.kind === "lasts"
                  ? `${projection.creditsLeftAtRenewal.toLocaleString()} left at this rate`
                  : "Nothing spent yet this cycle"
            }
            tone={projection.kind === "runs-out" ? "warn" : "default"}
          />
          <Metric
            label="Busiest day"
            value="Aug 04"
            detail={`${activity?.busiest?.consumed.toLocaleString()} credits in one day`}
          />
          <Metric
            label="Invoiced to date"
            value="5,700,000 VND"
            detail="1,900,000 VND outstanding across 1 invoice"
            tone="warn"
          />
        </MetricGrid>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title="Credits spent"
              description={`Cumulative since Jul 29 · ${burnUp?.spent.toLocaleString()} of ${burnUp?.available.toLocaleString()} available`}
            >
              {burnUp ? <CreditBurnUpChart burnUp={burnUp} /> : null}
            </Panel>

            <Panel
              title="Credit spend"
              description={`Per day since Jul 29 · ${activity?.totalConsumed.toLocaleString()} credits spent`}
            >
              {activity ? <CycleSpendChart activity={activity} /> : null}
            </Panel>

            <Panel
              title="Cost by AI service"
              description="What each service cost, and what it cost per use · last 16 days"
              bodyClassName="p-0"
            >
              <ServiceUsageTable rows={SERVICE_ROWS} />
            </Panel>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <PlanPanel subscription={SUBSCRIPTION} plan={PLAN} plansHref="#" />
            <PlanPanel
              subscription={{ ...SUBSCRIPTION, cancelAtPeriodEnd: true }}
              plan={PLAN}
              plansHref="#"
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
