"use client";

/**
 * The platform admin Insights page (`/admin`), rendered against fixtures.
 *
 * The page reads five insights endpoints that were built alongside it, plus four older admin
 * sources, none of which a laptop can reach. This renders the page's view (`InsightsDashboard`) —
 * not its queries — so the layout can be looked at in both themes and in the three states that
 * matter: every source answering, a backend that predates the insights endpoints (the state the
 * page ships into), and a first load — plus the server's honest gaps: figures that are null with a
 * note (a currency with no FX rate) and workspaces whose name could not be looked up.
 *
 * Fixtures only; /dev is 404 in production (`src/app/dev/layout.tsx` and the proxy).
 */

import { useEffect, useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/admin-page-chrome";
import {
  InsightsDashboard,
  type InsightsDashboardProps,
  type PeriodChoice,
  type SourceState,
} from "@/components/admin/insights/insights-dashboard";
import {
  dayKey,
  resolveInsightsPeriod,
  type InsightsPeriodParams,
} from "@/lib/admin/insights-period";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  InsightsMetric,
  MeetingsInsightsDto,
  PnlPeriodDto,
  ProfitAndLossDto,
  UsersInsightsDto,
  WorkspacesInsightsDto,
} from "@/types/admin-insights";

const NOW = new Date(2026, 8, 17, 15, 30);

type Scenario = "full" | "gaps" | "partial" | "loading";

/** The day keys the server would return for the period: every local day [from, to) touches. */
function serverDays(from: Date, to: Date): { key: string }[] {
  const days: { key: string }[] = [];
  for (let day = new Date(from.getFullYear(), from.getMonth(), from.getDate()); day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    days.push({ key: dayKey(day) });
  }
  return days;
}

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

function fixtures(params: InsightsPeriodParams, gaps: boolean) {
  const period = resolveInsightsPeriod(params, NOW);
  const days = serverDays(period.from, period.to);
  const random = rng(days.length * 31 + 7);
  const range = { from: period.from.toISOString(), to: period.to.toISOString() };
  const previousRange = { from: period.previousFrom.toISOString(), to: period.previousTo.toISOString() };
  const scale = Math.max(1, days.length);

  const revenueByDay: BillingInsightsDto["revenueByDay"] = days.map((day, index) => ({
    date: day.key,
    // Gaps: one day whose only payment was in a currency with no FX rate.
    revenue: gaps && index === 3 ? null : Math.round(random() * 4.5) * 490_000,
  }));
  const revenue = revenueByDay.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
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
    revenueByDayNote: gaps ? "excludes 1 EUR rows" : null,
    revenueByMonthNote: gaps ? "excludes 1 EUR rows" : null,
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
      { workspaceId: "33333333-3333-4333-8333-333333333333", workspaceName: gaps ? null : "Can Tho University", credits: 1_120_000 },
      { workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: "Saigon Clinic", credits: 740_000 },
      { workspaceId: "55555555-5555-4555-8555-555555555555", workspaceName: "Mekong Logistics", credits: 512_000 },
    ],
    // "gaps" is the sync switched off: every day estimated, and the basis line turns amber.
    aiProviderCostBasis: gaps
      ? { basis: "estimated", measuredDays: 0, estimatedDays: days.length, cartesiaCredits: 0, cartesiaUsdPerCredit: 0.0000392, syncStatus: "disabled" }
      : { basis: "mixed", measuredDays: Math.max(0, days.length - 2), estimatedDays: Math.min(2, days.length), cartesiaCredits: 1_842_300, cartesiaUsdPerCredit: 0.0000392, syncStatus: "ok" },
  };

  const snapshot: BillingSnapshotDto = {
    generatedAt: NOW.toISOString(),
    revenueToday: gaps ? null : 2_390_000,
    revenueTodayNote: gaps ? "excludes 2 EUR rows" : null,
    revenueYesterday: 4_480_000,
    revenueYesterdayNote: null,
    mrr: gaps ? null : 21_634_333,
    mrrNote: gaps
      ? "excludes 165 EUR rows"
      : "includes 180.00 USD converted at 26,300 VND/USD (billing_pricing_config.fx_rate_usd_vnd)",
    activeSubscriptions: 165,
    activeByCycle: { monthly: 95, yearly: 70, other: 0 },
    churnRateMonth: { cancelled: 3, atMonthStart: 168, rate: 1.79 },
    trials: 14,
    trialsEndingThisWeek: 6,
    pastDue: 3,
    suspended: 1,
    activeWorkspaces: 182,
    platformCreditBalance: 94_310_220,
    outstandingInvoices: gaps
      ? { count: 5, amount: null, amountNote: "excludes 5 EUR rows", pastDueCount: 3, oldestPastDueDays: 12, oldestPastDueWorkspace: null }
      : { count: 5, amount: 7_880_000, amountNote: null, pastDueCount: 3, oldestPastDueDays: 12, oldestPastDueWorkspace: "Acme Translation Co" },
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
      { workspaceId: "44444444-4444-4444-8444-444444444444", workspaceName: gaps ? null : "Saigon Clinic", amount: 990_000, currency: "VND", status: "failed", method: "Stripe card", at: new Date(2026, 8, 16, 11, 3).toISOString() },
      { workspaceId: "66666666-6666-4666-8666-666666666666", workspaceName: "Danang Startup Hub", amount: 490_000, currency: "VND", status: "paid", method: "Stripe card", at: new Date(2026, 8, 15, 8, 27).toISOString() },
    ],
    // Soonest first, as the server orders them.
    endingSoon: [
      { workspaceId: "55555555-5555-4555-8555-555555555555", workspaceName: "Mekong Logistics", planName: "Business", endsAt: new Date(2026, 8, 21).toISOString(), cancelAtPeriodEnd: true },
      { workspaceId: "77777777-7777-4777-8777-777777777777", workspaceName: gaps ? null : "Hue Heritage Tours", planName: "Team", endsAt: new Date(2026, 8, 24).toISOString(), cancelAtPeriodEnd: false },
    ],
    highUsageAlerts: [
      { workspaceId: "11111111-1111-4111-8111-111111111111", workspaceName: "Hanoi Law Firm", credits24h: 312_400 },
    ],
    cartesia: gaps
      ? {
          status: "disabled",
          statusNote: "CARTESIA_ADMIN_API_KEY is not set, so Cartesia usage is not synced; dubbing cost is estimated from rate cards",
          filteredToApiKey: false,
          creditsThisMonth: null,
          creditsToday: null,
          remainingCredits: null,
          remainingCreditsNote: "Cartesia's API reports usage only, not the credit balance; see play.cartesia.ai/subscription",
          lastSyncedAt: null,
          lastAttemptAt: null,
          usdPerCredit: 0.0000392,
        }
      : {
          status: "ok",
          statusNote: null,
          filteredToApiKey: true,
          creditsThisMonth: 1_842_300,
          creditsToday: 64_210,
          remainingCredits: null,
          remainingCreditsNote: "Cartesia's API reports usage only, not the credit balance; see play.cartesia.ai/subscription",
          lastSyncedAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
          lastAttemptAt: new Date(NOW.getTime() - 4 * 60_000).toISOString(),
          usdPerCredit: 0.0000392,
        },
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

  // Profit and loss: the same revenue days, OpenAI (STT priced, TRANSLATION not) and Cartesia costs at
  // ~25,990 VND/USD, and the gaps scenario's day without a rate.
  const pnlDay = (key: string, index: number, revenueOfDay: number | null): PnlPeriodDto => {
    const openAiUsd = Math.round(random() * 40) / 10;
    const cartesiaUsd = Math.round(random() * 60) / 10;
    const noRate = gaps && index === 5;
    const cost = noRate ? null : Math.round((openAiUsd + cartesiaUsd) * 25_990);
    const margin = revenueOfDay === null || cost === null ? null : revenueOfDay - cost;
    return {
      key, revenue: revenueOfDay, aiCost: cost, aiCostUsd: openAiUsd + cartesiaUsd, grossMargin: margin,
      marginPercent: margin === null || !revenueOfDay ? null : Math.round((margin / revenueOfDay) * 1000) / 10,
      credits: Math.round(random() * 90_000), costCoveragePercent: 58, activeWorkspaces: 4, arpa: null,
      fxRate: noRate ? null : 25_990,
      providers: [
        { provider: "openai", credits: Math.round(random() * 60_000), costUsd: openAiUsd, costVnd: noRate ? null : Math.round(openAiUsd * 25_990) },
        { provider: "cartesia", credits: Math.round(random() * 30_000), costUsd: cartesiaUsd, costVnd: noRate ? null : Math.round(cartesiaUsd * 25_990) },
      ],
    };
  };
  const pnlDays = days.map((day, index) => pnlDay(day.key, index, revenueByDay[index]?.revenue ?? null));
  const pnlCost = pnlDays.reduce((sum, row) => sum + (row.aiCost ?? 0), 0);
  const pnl: ProfitAndLossDto = {
    range,
    previousRange,
    generatedAt: NOW.toISOString(),
    metrics: [
      metric("revenue", revenue, Math.round(revenue * 0.8), "money"),
      metric("aiProviderCost", pnlCost, Math.round(pnlCost * 0.7), "money", false, "covers 58% of consumed credits; no provider cost for TRANSLATION (42%)"),
      metric("grossMargin", revenue - pnlCost, Math.round(revenue * 0.8 - pnlCost * 0.7), "money", true, "AI cost covers only 58% of consumed credits, so this margin is overstated"),
      metric("grossMarginPercent", revenue ? Math.round(((revenue - pnlCost) / revenue) * 1000) / 10 : null, 81.2, "percent"),
      metric("arpa", Math.round(revenue / 7), Math.round((revenue * 0.8) / 6), "money", true, "revenue ÷ 7 workspaces that paid or used credits"),
      metric("activeWorkspaces", 7, 6, "count"),
      metric("creditsConsumed", 1_840_000, 1_420_000, "credits"),
    ],
    aiCostUsd: pnlDays.reduce((sum, row) => sum + row.aiCostUsd, 0),
    costCoveragePercent: 58,
    costNote: "covers 58% of consumed credits",
    fxNote: "USD converted at each day's rate (25,950–26,010 VND/USD; Stripe FX quote, Stripe charge conversion)",
    days: pnlDays,
    months: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((key, index) =>
      pnlDay(key, index + 20, Math.round((4 + index) * 4_100_000))),
    providers: [
      { provider: "cartesia", credits: 620_000, coveredCredits: 620_000, coveragePercent: 100, costUsd: 96.4, costVnd: 2_505_436, measuredUsd: 80.1,
        services: [{ chargeType: "AUDIO_DUBBING_STANDARD", service: "TTS", credits: 540_000, coveredCredits: 540_000, costUsd: 84 }, { chargeType: "AUDIO_DUBBING_VOICE_CLONE", service: "TTS", credits: 80_000, coveredCredits: 80_000, costUsd: 12.4 }],
        note: "measured from the provider's usage API on synced days" },
      { provider: "openai", credits: 1_220_000, coveredCredits: 440_000, coveragePercent: 36.1, costUsd: 22, costVnd: 571_780, measuredUsd: 0,
        services: [{ chargeType: "TRANSLATION", service: "MT", credits: 780_000, coveredCredits: 0, costUsd: 0 }, { chargeType: "STT", service: "STT", credits: 440_000, coveredCredits: 440_000, costUsd: 22 }],
        note: "no provider price for TRANSLATION: its cost is not in this figure" },
    ],
    plans: [
      { planId: "p1", planSlug: "enterprise", planName: "Enterprise", revenue: Math.round(revenue * 0.7), credits: 1_100_000, aiCost: Math.round(pnlCost * 0.6), grossMargin: Math.round(revenue * 0.7 - pnlCost * 0.6), marginPercent: 88.4, activeWorkspaces: 3, arpa: Math.round((revenue * 0.7) / 3), costCoveragePercent: 55, note: null },
      { planId: "p2", planSlug: "team", planName: "Team", revenue: Math.round(revenue * 0.3), credits: 600_000, aiCost: Math.round(pnlCost * 0.35), grossMargin: Math.round(revenue * 0.3 - pnlCost * 0.35), marginPercent: 71.2, activeWorkspaces: 3, arpa: Math.round((revenue * 0.3) / 3), costCoveragePercent: 62, note: null },
      { planId: "p3", planSlug: "trial", planName: "Trial", revenue: 0, credits: 140_000, aiCost: Math.round(pnlCost * 0.05), grossMargin: -Math.round(pnlCost * 0.05), marginPercent: null, activeWorkspaces: 1, arpa: 0, costCoveragePercent: 70, note: null },
    ],
    topWorkspaces: ["Hanoi Law Firm", "Saigon Logistics", "Da Nang Clinic", null, "Hue Studio"].map((name, index) => ({
      workspaceId: `0000000${index}-1111-4111-8111-111111111111`,
      workspaceName: name,
      planName: index < 2 ? "Enterprise" : "Team",
      credits: 600_000 - index * 90_000,
      days: days.map(() => Math.round(random() * (30_000 - index * 4_000))),
    })),
    fx: {
      baseCurrency: "USD", quoteCurrency: "VND", rate: 25_989.9, source: gaps ? "stripe_charge" : "stripe_fx_quote",
      sourceLabel: gaps ? "Stripe charge conversion" : "Stripe FX quote", rateDate: gaps ? "2026-09-14" : "2026-09-17",
      asOf: NOW.toISOString(), basis: gaps ? "carriedForward" : "exact", mode: "stripe", manualRate: null, latestStripe: null,
      stale: gaps, warning: gaps ? "Stripe has not returned a rate since 2026-09-14; reports use the last known rate (25,990 VND/USD, Stripe charge conversion, 2026-09-14)." : null,
      history: [],
    },
  };

  return { period, billing, snapshot, meetings, users, workspaces, pnl };
}

const ready = <T,>(data: T): SourceState<T> => ({ status: "ready", data });
const LOADING = { status: "loading" } as const;
const UNAVAILABLE = { status: "unavailable" } as const;

export default function AdminInsightsPreviewPage() {
  const [dark, setDark] = useState(false);
  // On <html> as well as the wrapper, as next-themes does in the app: the charts' hover readouts
  // are portalled to <body>, outside the wrapper, and must still pick up the theme.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    return () => {
      root.classList.toggle("dark", before);
    };
  }, [dark]);
  const [scenario, setScenario] = useState<Scenario>("full");
  const [params, setParams] = useState<InsightsPeriodParams>({ period: "month" });

  const data = useMemo(() => fixtures(params, scenario === "gaps"), [params, scenario]);
  const answering = scenario === "full" || scenario === "gaps";

  const props: InsightsDashboardProps = {
    period: data.period,
    onChoosePeriod: (choice: PeriodChoice) => setParams(choice),
    updatedAt: scenario === "loading" ? 0 : NOW.getTime(),
    billing: answering ? ready(data.billing) : scenario === "loading" ? LOADING : UNAVAILABLE,
    snapshot: answering ? ready(data.snapshot) : scenario === "loading" ? LOADING : UNAVAILABLE,
    users: answering ? ready(data.users) : scenario === "loading" ? LOADING : UNAVAILABLE,
    workspaces: answering ? ready(data.workspaces) : scenario === "loading" ? LOADING : UNAVAILABLE,
    meetings: answering ? ready(data.meetings) : scenario === "loading" ? LOADING : UNAVAILABLE,
    pnl: answering ? ready(data.pnl) : scenario === "loading" ? LOADING : UNAVAILABLE,
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
          {(["full", "gaps", "partial", "loading"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScenario(value)}
              className={`rounded-md border border-hairline px-2 py-1 ${scenario === value ? "bg-surface-3 text-ink" : "bg-surface-1"}`}
            >
              {value === "full"
                ? "All sources"
                : value === "gaps"
                  ? "Null figures and unknown names"
                  : value === "partial"
                    ? "Insights endpoints missing"
                    : "First load"}
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
