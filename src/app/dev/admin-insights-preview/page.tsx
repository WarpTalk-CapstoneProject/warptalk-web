"use client";

/**
 * The platform admin Insights page (`/admin`), rendered against fixtures.
 *
 * The page reads five insights endpoints that were built alongside it, plus four older admin
 * sources, none of which a laptop can reach. This renders the page's view (`InsightsDashboard`) —
 * not its queries — so the layout can be looked at in both themes and in the three states that
 * matter: every source answering, a backend that predates the insights endpoints (the state the
 * page ships into), and a first load.
 *
 * Fixtures only; /dev is 404 in production (`src/app/dev/layout.tsx` and the proxy).
 */

import { useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page-chrome";
import {
  InsightsDashboard,
  type InsightsDashboardProps,
  type PeriodChoice,
  type SourceState,
} from "@/components/admin/insights/insights-dashboard";
import {
  axisDays,
  resolveInsightsPeriod,
  type InsightsPeriodParams,
} from "@/lib/admin/insights-period";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  InsightsMetric,
  MeetingsInsightsDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "@/types/admin-insights";

const NOW = new Date(2026, 8, 17, 15, 30);

type Scenario = "full" | "partial" | "loading";

function rng(seed: number) {
  let value = seed;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

const metric = (
  id: string,
  value: number | null,
  previous: number | null,
  unit: InsightsMetric["unit"],
  higherIsBetter = true,
  note: string | null = null,
): InsightsMetric => ({ id, value, previous, unit, higherIsBetter, note });

function fixtures(params: InsightsPeriodParams) {
  const period = resolveInsightsPeriod(params, NOW);
  const days = axisDays(period, NOW).filter((day) => !day.future);
  const random = rng(days.length * 31 + 7);
  const range = { from: period.from.toISOString(), to: period.to.toISOString() };
  const previousRange = { from: period.previousFrom.toISOString(), to: period.previousTo.toISOString() };
  const scale = Math.max(1, days.length);

  const revenueByDay = days.map((day) => ({ date: day.key, revenue: Math.round(random() * 4.5) * 490_000 }));
  const revenue = revenueByDay.reduce((sum, row) => sum + row.revenue, 0);
  const aiCost = Math.round(revenue * 0.37);

  const billing: BillingInsightsDto = {
    range,
    previousRange,
    generatedAt: NOW.toISOString(),
    metrics: [
      metric("revenue", revenue, Math.round(revenue * 0.8), "money"),
      metric("payments", 2 * scale + 7, 2 * scale + 2, "count"),
      metric("failedPayments", 2, 1, "count", false),
      metric("newSubscriptions", Math.round(scale * 0.7), Math.round(scale * 0.55), "count"),
      metric("cancelledSubscriptions", 3, 5, "count", false),
      metric("creditsConsumed", 495_000 * scale, 412_000 * scale, "credits"),
      metric("overageCredits", null, null, "credits", false, "Overage is tracked per cycle, not per day"),
      metric("aiProviderCost", aiCost, Math.round(aiCost * 0.87), "money", false, "92% of usage has a rate card"),
      metric("grossMargin", revenue - aiCost, Math.round(revenue * 0.8 - aiCost * 0.87), "money"),
      metric("revenuePerPayment", Math.round(revenue / (2 * scale + 7)), null, "money"),
    ],
    revenueByDay,
    revenueByMonth: [
      { month: "2026-04", revenue: 24_000_000 },
      { month: "2026-05", revenue: 23_100_000 },
      { month: "2026-06", revenue: 20_400_000 },
      { month: "2026-07", revenue: 31_000_000 },
      { month: "2026-08", revenue: 39_150_000 },
      { month: "2026-09", revenue: 48_900_000 },
    ],
    creditsByService: [
      { usageType: "TRANSLATION", credits: 4_378_400 },
      { usageType: "AUDIO_DUBBING_STANDARD", credits: 1_936_600 },
      { usageType: "AUDIO_DUBBING_VOICE_CLONE", credits: 1_178_800 },
      { usageType: "AI_ASSISTANT", credits: 589_400 },
      { usageType: "AI_SUMMARY", credits: 336_800 },
    ],
    topWorkspaces: [
      { workspaceId: "11111111-1111-4111-8111-111111111111", workspaceName: "Hanoi Law Firm", credits: 2_410_000 },
      { workspaceId: "22222222-2222-4222-8222-222222222222", workspaceName: "WarpTalk Demo", credits: 1_980_000 },
      { workspaceId: "33333333-3333-4333-8333-333333333333", workspaceName: "Can Tho University", credits: 1_120_000 },
      { workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: "Saigon Clinic", credits: 740_000 },
      { workspaceId: "55555555-5555-4555-8555-555555555555", workspaceName: "Mekong Logistics", credits: 512_000 },
    ],
  };

  const snapshot: BillingSnapshotDto = {
    generatedAt: NOW.toISOString(),
    revenueToday: 2_390_000,
    revenueYesterday: 4_480_000,
    mrr: 21_634_333,
    mrrNote: "Includes 180 USD from USD plans at the platform rate",
    activeSubscriptions: 165,
    activeByCycle: { monthly: 95, yearly: 70, other: 0 },
    churnRateMonth: { cancelled: 3, atMonthStart: 168, rate: 1.79 },
    trials: 14,
    trialsEndingThisWeek: 6,
    pastDue: 3,
    suspended: 1,
    activeWorkspaces: 182,
    platformCreditBalance: 94_310_220,
    outstandingInvoices: { count: 5, amount: 7_880_000, pastDueCount: 3, oldestPastDueDays: 12, oldestPastDueWorkspace: "Acme Translation Co" },
    openSalesLeads: 4,
    subscriptionsByPlan: [
      { planSlug: "starter", planName: "Starter", active: 38, trial: 9, pastDue: 0 },
      { planSlug: "team", planName: "Team", active: 64, trial: 4, pastDue: 1 },
      { planSlug: "business", planName: "Business", active: 45, trial: 1, pastDue: 2 },
      { planSlug: "enterprise", planName: "Enterprise", active: 18, trial: 0, pastDue: 0 },
    ],
    recentPayments: [
      { workspaceId: "22222222-2222-4222-8222-222222222222", workspaceName: "WarpTalk Demo", amount: 1_900_000, currency: "VND", status: "paid", method: "Stripe card", at: new Date(2026, 8, 17, 9, 12).toISOString() },
      { workspaceId: "11111111-1111-4111-8111-111111111111", workspaceName: "Hanoi Law Firm", amount: 4_500_000, currency: "VND", status: "paid", method: "Bank transfer", at: new Date(2026, 8, 16, 18, 40).toISOString() },
      { workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: "Saigon Clinic", amount: 990_000, currency: "VND", status: "failed", method: "Stripe card", at: new Date(2026, 8, 16, 11, 3).toISOString() },
      { workspaceId: "66666666-6666-4666-8666-666666666666", workspaceName: "Danang Startup Hub", amount: 490_000, currency: "VND", status: "paid", method: "Stripe card", at: new Date(2026, 8, 15, 8, 27).toISOString() },
    ],
    endingSoon: [
      { workspaceId: "55555555-5555-4555-8555-555555555555", workspaceName: "Mekong Logistics", planName: "Business", endsAt: new Date(2026, 8, 21).toISOString(), cancelAtPeriodEnd: true },
      { workspaceId: "77777777-7777-4777-8777-777777777777", workspaceName: "Hue Heritage Tours", planName: "Team", endsAt: new Date(2026, 8, 24).toISOString(), cancelAtPeriodEnd: false },
    ],
    highUsageAlerts: [
      { workspaceId: "11111111-1111-4111-8111-111111111111", workspaceName: "Hanoi Law Firm", credits24h: 312_400 },
    ],
  };

  const meetingsByDay = days.map((day) => {
    const count = Math.round(random() * 22);
    return { date: day.key, meetings: count, hours: Math.round(count * (0.8 + random()) * 10) / 10 };
  });
  const held = meetingsByDay.reduce((sum, row) => sum + row.meetings, 0);
  const hours = meetingsByDay.reduce((sum, row) => sum + row.hours, 0);

  const meetings: MeetingsInsightsDto = {
    range,
    previousRange,
    metrics: [
      metric("meetingsHeld", held, Math.round(held * 0.86), "count"),
      metric("hoursTranslated", Math.round(hours * 10) / 10, Math.round(hours * 8.6) / 10, "hours"),
    ],
    meetingsByDay,
    liveNow: 7,
    startedToday: 38,
  };

  const users: UsersInsightsDto = {
    range,
    previousRange,
    metrics: [metric("newUsers", 11 * scale, 9 * scale, "count"), metric("activeUsers", 412, 390, "count")],
    newUsersByDay: days.map((day) => ({ date: day.key, count: Math.round(random() * 15) })),
  };

  const workspaces: WorkspacesInsightsDto = {
    range,
    previousRange,
    metrics: [metric("newWorkspaces", 12, 12, "count")],
    suspendedNow: 1,
  };

  return { period, billing, snapshot, meetings, users, workspaces };
}

const ready = <T,>(data: T): SourceState<T> => ({ status: "ready", data });
const LOADING = { status: "loading" } as const;
const UNAVAILABLE = { status: "unavailable" } as const;

export default function AdminInsightsPreviewPage() {
  const [dark, setDark] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("full");
  const [params, setParams] = useState<InsightsPeriodParams>({ period: "month" });

  const data = useMemo(() => fixtures(params), [params]);

  const props: InsightsDashboardProps = {
    period: data.period,
    now: NOW,
    onChoosePeriod: (choice: PeriodChoice) => setParams(choice),
    updatedAt: scenario === "loading" ? 0 : NOW.getTime(),
    billing: scenario === "full" ? ready(data.billing) : scenario === "loading" ? LOADING : UNAVAILABLE,
    snapshot: scenario === "full" ? ready(data.snapshot) : scenario === "loading" ? LOADING : UNAVAILABLE,
    users: scenario === "full" ? ready(data.users) : scenario === "loading" ? LOADING : UNAVAILABLE,
    workspaces: scenario === "full" ? ready(data.workspaces) : scenario === "loading" ? LOADING : UNAVAILABLE,
    meetings: scenario === "full" ? ready(data.meetings) : scenario === "loading" ? LOADING : UNAVAILABLE,
    // The four sources that exist on every backend today.
    meetingCounts: scenario === "loading" ? LOADING : ready({ liveNow: 7, startedToday: 38 }),
    deadLetters:
      scenario === "loading"
        ? LOADING
        : ready([
            { id: "e1", eventType: "workspace.member_joined", schemaVersion: 1, attemptCount: 5, deadLetteredAt: NOW.toISOString(), lastError: "timeout", correlationId: null, workspaceId: null },
            { id: "e2", eventType: "workspace.updated", schemaVersion: 1, attemptCount: 5, deadLetteredAt: NOW.toISOString(), lastError: "timeout", correlationId: null, workspaceId: null },
          ]),
    deadLettersLimit: 100,
    newSalesLeads: scenario === "loading" ? LOADING : ready(4),
    suspendedWorkspaces: scenario === "loading" ? LOADING : ready(1),
    usageAlerts:
      scenario === "partial"
        ? ready([{ workspaceId: "11111111-1111-4111-8111-111111111111", workspaceName: "Hanoi Law Firm", consumedCreditsIn24h: 312_400, reason: "Consumption is 3x the 7-day average" }])
        : LOADING,
    health:
      scenario === "loading"
        ? LOADING
        : ready({
            monitoringAvailable: true,
            monitoringUnavailableReason: null,
            observedAt: NOW.toISOString(),
            targets: [{ job: "billing-service", instance: "app:8080", isUp: true }],
            workers: [],
            streamGroups: [],
            deadLetters: [],
            stageLatencies: [],
            alerts: [],
            warnings: [],
          }),
  };

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-canvas text-ink">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-2 text-[12px] text-ink-muted">
          <span className="font-medium text-ink">Admin Insights preview</span>
          {(["full", "partial", "loading"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScenario(value)}
              className={`rounded-md border border-hairline px-2 py-1 ${scenario === value ? "bg-surface-3 text-ink" : "bg-surface-1"}`}
            >
              {value === "full" ? "All sources" : value === "partial" ? "Insights endpoints missing" : "First load"}
            </button>
          ))}
          <button type="button" onClick={() => setDark((value) => !value)} className="ml-auto rounded-md border border-hairline bg-surface-1 px-2 py-1">
            {dark ? "Light" : "Dark"}
          </button>
        </div>
        <AdminPage>
          <InsightsDashboard {...props} />
        </AdminPage>
      </div>
    </div>
  );
}
