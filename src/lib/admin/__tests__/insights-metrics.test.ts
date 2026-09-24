import test from "node:test";
import assert from "node:assert/strict";

import {
  aiCostBasisView,
  assembleNeedsAttention,
  CARTESIA_STALE_MINUTES,
  cartesiaLineView,
  churnSub,
  computeDelta,
  deltaText,
  deltaTone,
  formatInsightValue,
  insightsCsv,
  insightsCsvRows,
  joinNotes,
  mrrSub,
  NOT_AVAILABLE_NOTE,
  outstandingSub,
  PERIOD_CARDS,
  periodCardView,
  revenueTodaySub,
  UNKNOWN_WORKSPACE,
  valueTone,
  workspaceLabel,
  type AttentionInputs,
} from "../insights-metrics.ts";
import type {
  BillingInsightsDto,
  BillingSnapshotDto,
  CartesiaUsageDto,
  InsightsMetric,
} from "../../../types/admin-insights.ts";

const metric = (id: string, value: number | null, previous: number | null, extra: Partial<InsightsMetric> = {}): InsightsMetric => ({
  id,
  value,
  previous,
  unit: "count",
  higherIsBetter: true,
  note: null,
  ...extra,
});

const range = { from: "2026-09-01T00:00:00Z", to: "2026-09-17T08:30:00Z" };

function billing(metrics: InsightsMetric[]): BillingInsightsDto {
  return {
    range,
    previousRange: range,
    generatedAt: range.to,
    metrics,
    revenueByDay: [],
    revenueByDayNote: null,
    revenueByMonth: [],
    revenueByMonthNote: null,
    creditsByService: [],
    topWorkspaces: [],
  };
}

// ── delta ────────────────────────────────────────────────────────────────────

test("an unknown previous figure says so rather than inventing a percentage", () => {
  assert.equal(deltaText(computeDelta(10, null)), "no figure last period");
  assert.equal(deltaText(computeDelta(null, 10)), "no figure last period");
});

test("a move under 0.05% is no change", () => {
  assert.equal(deltaText(computeDelta(100_040, 100_000)), "no change");
  assert.equal(deltaText(computeDelta(0, 0)), "no change");
});

test("a real move is an arrow and one decimal", () => {
  assert.equal(deltaText(computeDelta(48_900_000, 39_150_000)), "▲ 24.9%");
  assert.equal(deltaText(computeDelta(3, 5)), "▼ 40.0%");
});

test("growth from zero is stated, not divided by zero", () => {
  assert.equal(deltaText(computeDelta(4, 0)), "▲ from 0");
});

test("the chip's colour follows higherIsBetter, not the sign", () => {
  assert.equal(deltaTone(computeDelta(3, 5), false), "success", "fewer cancellations is good");
  assert.equal(deltaTone(computeDelta(5, 3), false), "danger");
  assert.equal(deltaTone(computeDelta(5, 3), true), "success");
  assert.equal(deltaTone(computeDelta(3, 5), true), "danger");
  assert.equal(deltaTone(computeDelta(3, null), true), "neutral");
  assert.equal(deltaTone(computeDelta(100, 100), false), "neutral");
});

// ── values ───────────────────────────────────────────────────────────────────

test("values render in English with a spelled-out currency, and null is a dash", () => {
  assert.equal(formatInsightValue(48_900_000, "money"), "48,900,000 VND");
  assert.equal(formatInsightValue(412.25, "hours"), "412.3 h");
  assert.equal(formatInsightValue(8_420_000, "credits"), "8,420,000");
  assert.equal(formatInsightValue(1.79, "percent"), "1.8%");
  assert.equal(formatInsightValue(null, "money"), "—");
});

test("value tones: money in green, cost amber, losses red, queues amber when not empty", () => {
  assert.equal(valueTone("revenue", 1), "success");
  assert.equal(valueTone("grossMargin", 10), "success");
  assert.equal(valueTone("grossMargin", -10), "danger");
  assert.equal(valueTone("aiProviderCost", 10), "warning");
  assert.equal(valueTone("cancelledSubscriptions", 3), "danger");
  assert.equal(valueTone("churnRate", 5), "neutral");
  assert.equal(valueTone("churnRate", 5.01), "danger");
  assert.equal(valueTone("deadLetters", 0), "neutral");
  assert.equal(valueTone("deadLetters", 2), "warning");
  assert.equal(valueTone("revenue", null), "neutral");
});

// ── cards ────────────────────────────────────────────────────────────────────

test("there are ten period cards in the mock's order", () => {
  assert.deepEqual(
    PERIOD_CARDS.map((card) => card.label),
    [
      "Revenue", "Payments", "New subscriptions", "Cancelled", "New users",
      "Meetings held", "Hours translated", "Credits consumed", "AI provider cost",
      "Revenue minus AI cost",
    ],
  );
});

test("a card whose source did not answer is a dash with a note, never a zero", () => {
  const view = periodCardView(PERIOD_CARDS[4], { billing: billing([]) });
  assert.equal(view.available, false);
  assert.equal(view.value, "—");
  assert.equal(view.note, NOT_AVAILABLE_NOTE);
  assert.equal(view.delta.kind, "none");
});

test("a metric id the source did not return is unavailable too", () => {
  const view = periodCardView(PERIOD_CARDS[0], { billing: billing([metric("payments", 1, 1)]) });
  assert.equal(view.available, false);
});

test("the server's note is kept, and Payments adds its failed count", () => {
  const view = periodCardView(PERIOD_CARDS[1], {
    billing: billing([metric("payments", 41, 36), metric("failedPayments", 2, 1, { higherIsBetter: false })]),
  });
  assert.equal(view.value, "41");
  assert.equal(view.previous, "36");
  assert.equal(view.note, "2 failed");

  const cost = periodCardView(PERIOD_CARDS[8], {
    billing: billing([metric("aiProviderCost", 18_300_000, null, { unit: "money", higherIsBetter: false, note: "92% of usage has a rate card" })]),
  });
  assert.equal(cost.note, "92% of usage has a rate card");
  assert.equal(cost.valueTone, "warning");
  assert.equal(cost.delta.kind, "none");
});

// ── export ───────────────────────────────────────────────────────────────────

test("the export has every card, then the extra metrics, with empty cells where unknown", () => {
  const rows = insightsCsvRows({
    billing: billing([
      metric("revenue", 48_900_000, 39_150_000, { unit: "money" }),
      metric("cancelledSubscriptions", 3, 5, { higherIsBetter: false }),
      metric("overageCredits", null, null, { unit: "credits", note: "not tracked" }),
    ]),
  });
  assert.deepEqual(rows[0], ["Metric", "This period", "Previous period", "Change", "Unit"]);
  assert.deepEqual(rows[1], ["Revenue", 48_900_000, 39_150_000, "24.9%", "VND"]);
  assert.deepEqual(rows[4], ["Cancelled", 3, 5, "-40.0%", "count"]);
  assert.deepEqual(rows[5], ["New users", "", "", "", "count"], "an unanswered source is still a row");
  assert.equal(rows.length, 1 + PERIOD_CARDS.length + 1);
  assert.deepEqual(rows.at(-1), ["Overage credits", "", "", "", "credits"]);
});

test("the CSV text is RFC 4180 with CRLF", () => {
  const text = insightsCsv({});
  assert.ok(text.startsWith("Metric,This period,Previous period,Change,Unit\r\n"));
  assert.ok(text.includes("Revenue minus AI cost,,,,VND\r\n"));
});

// ── needs attention ──────────────────────────────────────────────────────────

const links: AttentionInputs["links"] = {
  health: "/admin/health",
  suspendedWorkspaces: "/admin/workspaces?status=suspended",
  deadLetters: "/admin/outbox",
  newSalesLeads: "/admin/sales-leads?status=new",
  subscriptions: "/admin/subscriptions",
  workspace: (id) => `/admin/workspaces/${id}`,
};

function snapshot(overrides: Partial<BillingSnapshotDto> = {}): BillingSnapshotDto {
  return {
    generatedAt: range.to,
    revenueToday: 0,
    revenueTodayNote: null,
    revenueYesterday: 0,
    revenueYesterdayNote: null,
    mrr: 0,
    mrrNote: null,
    activeSubscriptions: 0,
    activeByCycle: { monthly: 0, yearly: 0, other: 0 },
    churnRateMonth: { cancelled: 0, atMonthStart: 0, rate: 0 },
    trials: 0,
    trialsEndingThisWeek: 0,
    pastDue: 0,
    suspended: 0,
    activeWorkspaces: 0,
    platformCreditBalance: 0,
    outstandingInvoices: { count: 0, amount: 0, amountNote: null, pastDueCount: 0, oldestPastDueDays: null, oldestPastDueWorkspace: null },
    openSalesLeads: 0,
    subscriptionsByPlan: [],
    recentPayments: [],
    endingSoon: [],
    highUsageAlerts: [],
    ...overrides,
  };
}

test("needs attention is assembled from every live source, most severe first", () => {
  const result = assembleNeedsAttention({
    snapshot: snapshot({
      pastDue: 3,
      outstandingInvoices: { count: 5, amount: 7_880_000, amountNote: null, pastDueCount: 3, oldestPastDueDays: 12, oldestPastDueWorkspace: "Acme Translation Co" },
      highUsageAlerts: [{ workspaceId: "w1", workspaceName: "Hanoi Law Firm", credits24h: 312_400 }],
    }),
    suspendedWorkspaces: 1,
    deadLetters: [{ eventType: "workspace.member_joined", attemptCount: 5 }, { eventType: "x", attemptCount: 5 }],
    newSalesLeads: 4,
    health: {
      monitoringAvailable: true,
      targets: [{ job: "billing", instance: "a", isUp: true }],
      alerts: [{ name: "RedisMemoryHigh", severity: "warning", state: "pending", summary: null }],
    },
    links,
  });
  assert.deepEqual(result.unavailable, []);
  assert.deepEqual(
    result.items.map((item) => item.title),
    [
      "3 invoices past due",
      "3 subscriptions past due",
      "1 workspace suspended",
      "2 dead-letter events",
      "High usage: Hanoi Law Firm",
      "4 new sales leads",
    ],
  );
  assert.equal(result.items[0].detail, "Oldest: Acme Translation Co · 12 days");
  assert.equal(result.items[2].href, "/admin/workspaces?status=suspended");
  assert.equal(result.items[3].detail, "workspace.member_joined · 5 attempts");
  assert.equal(result.items[4].detail, "312,400 credits in 24h");
  assert.equal(result.items[4].href, "/admin/workspaces/w1");
});

test("without the snapshot, the existing usage alerts still reach the list", () => {
  const result = assembleNeedsAttention({
    snapshot: undefined,
    suspendedWorkspaces: 0,
    deadLetters: [],
    newSalesLeads: 0,
    usageAlerts: [{ workspaceId: "w2", workspaceName: "Saigon Clinic", consumedCreditsIn24h: 90_000, reason: "3x the 7-day average" }],
    links,
  });
  assert.deepEqual(result.unavailable, ["system health", "invoices and subscriptions"]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].detail, "90,000 credits in 24h · 3x the 7-day average");
});

test("an unanswered source is named, not counted as zero", () => {
  const result = assembleNeedsAttention({ links });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.unavailable, [
    "system health",
    "invoices and subscriptions",
    "suspended workspaces",
    "event outbox",
    "usage alerts",
    "sales leads",
  ]);
});

test("a capped dead-letter list says the count is a floor", () => {
  const result = assembleNeedsAttention({
    deadLetters: Array.from({ length: 100 }, () => ({ eventType: "e", attemptCount: 1 })),
    deadLettersCapped: true,
    links,
  });
  assert.equal(result.items[0].title, "100+ dead-letter events");
});

test("health: services down and firing alerts are listed; pending alerts and a blind monitor are not", () => {
  const result = assembleNeedsAttention({
    health: {
      monitoringAvailable: true,
      targets: [
        { job: "billing", instance: "a", isUp: false },
        { job: "auth", instance: "b", isUp: true },
      ],
      alerts: [
        { name: "StreamLagHigh", severity: "critical", state: "firing", summary: "translate lag 4,000" },
        { name: "RedisMemoryHigh", severity: "warning", state: "pending", summary: null },
      ],
    },
    links,
  });
  assert.deepEqual(result.items.map((item) => [item.title, item.tone, item.href]), [
    ["1 service not answering", "danger", "/admin/health"],
    ["Alert firing: StreamLagHigh", "danger", "/admin/health"],
  ]);
  assert.ok(!result.unavailable.includes("system health"));

  const blind = assembleNeedsAttention({ health: { monitoringAvailable: false, targets: [], alerts: [] }, links });
  assert.ok(blind.unavailable.includes("system health"));
  assert.equal(blind.items.length, 0, "monitoring being unreadable is not an outage");
});

// ── nulls the server really sends (backend #421) ─────────────────────────────

test("a workspace the server could not name is 'Unknown workspace', never a raw id or blank", () => {
  assert.equal(workspaceLabel(null), UNKNOWN_WORKSPACE);
  assert.equal(workspaceLabel("   "), UNKNOWN_WORKSPACE);
  assert.equal(workspaceLabel("Hanoi Law Firm"), "Hanoi Law Firm");
});

test("an unnamed workspace still links by its id", () => {
  const result = assembleNeedsAttention({
    snapshot: snapshot({ highUsageAlerts: [{ workspaceId: "w9", workspaceName: null, credits24h: 60_000 }] }),
    links,
  });
  const usage = result.items.find((item) => item.key === "usage-w9");
  assert.equal(usage?.title, "High usage: Unknown workspace");
  assert.equal(usage?.href, "/admin/workspaces/w9");
});

test("a null revenue today renders a dash with the server's note, not 0", () => {
  const today = snapshot({ revenueToday: null, revenueTodayNote: "excludes 2 EUR rows", revenueYesterday: 4_480_000 });
  assert.equal(formatInsightValue(today.revenueToday, "money"), "—");
  const sub = revenueTodaySub(today);
  assert.match(sub, /^excludes 2 EUR rows · yesterday /);
  assert.doesNotMatch(sub, /yesterday 0/);

  const yesterdayUnknown = revenueTodaySub(snapshot({ revenueYesterday: null, revenueYesterdayNote: "excludes 1 EUR rows" }));
  assert.equal(yesterdayUnknown, "yesterday — · yesterday excludes 1 EUR rows");
});

test("a null MRR says why; with no note it still does not read as a number", () => {
  assert.equal(formatInsightValue(null, "money"), "—");
  assert.equal(mrrSub({ mrr: null, mrrNote: "excludes 3 EUR rows" }), "excludes 3 EUR rows");
  assert.equal(mrrSub({ mrr: null, mrrNote: null }), "Cannot be totalled in VND");
  assert.equal(mrrSub({ mrr: 1, mrrNote: null }), "Monthly recurring revenue");
});

test("a null churn rate explains itself", () => {
  assert.equal(
    churnSub({ cancelled: 0, atMonthStart: 0, rate: null }),
    "0 cancelled / 0 at month start · no rate without paying subscriptions at month start",
  );
  assert.equal(churnSub({ cancelled: 3, atMonthStart: 168, rate: 1.79 }), "3 cancelled / 168 at month start");
});

test("a null outstanding amount is a dash plus its note, in the card and in Needs attention", () => {
  const invoices = { count: 2, amount: null, amountNote: "excludes 2 EUR rows", pastDueCount: 0, oldestPastDueDays: null, oldestPastDueWorkspace: null };
  assert.equal(outstandingSub(invoices), "2 invoices · 0 past due · excludes 2 EUR rows");

  const open = assembleNeedsAttention({ snapshot: snapshot({ outstandingInvoices: invoices }), links });
  assert.equal(open.items[0].detail, "Amount not totalled (excludes 2 EUR rows), none past due");
  assert.doesNotMatch(open.items[0].detail, /0 ₫|₫0|\b0 VND/);

  const pastDue = assembleNeedsAttention({
    snapshot: snapshot({ outstandingInvoices: { ...invoices, pastDueCount: 1, oldestPastDueDays: 4, oldestPastDueWorkspace: null } }),
    links,
  });
  assert.equal(pastDue.items[0].detail, "Oldest: Unknown workspace · 4 days");
});

test("notes join only what says something", () => {
  assert.equal(joinNotes("a", null, "  ", undefined, "b"), "a · b");
  assert.equal(joinNotes(null, ""), null);
});

// ── Cartesia ────────────────────────────────────────────────────────────────

const NOW_MS = Date.parse("2026-09-18T09:30:00Z");

function cartesia(overrides: Partial<CartesiaUsageDto> = {}): CartesiaUsageDto {
  return {
    status: "ok",
    statusNote: null,
    filteredToApiKey: true,
    creditsThisMonth: 812_340,
    creditsToday: 12_003,
    remainingCredits: null,
    remainingCreditsNote: "Cartesia's API reports usage only, not the credit balance",
    lastSyncedAt: "2026-09-18T09:27:00Z",
    lastAttemptAt: "2026-09-18T09:27:00Z",
    usdPerCredit: 0.0000392,
    ...overrides,
  };
}

test("a fresh Cartesia sync is neutral, and says how long ago it ran", () => {
  const view = cartesiaLineView(cartesia(), NOW_MS);
  assert.equal(view.state, "ok");
  assert.equal(view.tone, "neutral");
  assert.equal(view.syncedMinutesAgo, 3);
  assert.equal(view.creditsThisMonth, 812_340);
  assert.equal(view.remainingCredits, null, "the API has no balance; the page must not invent one");
  assert.equal(view.note, null);
});

test("a disabled, failing or stale Cartesia sync is a warning with its reason", () => {
  const disabled = cartesiaLineView(
    cartesia({ status: "disabled", statusNote: "CARTESIA_ADMIN_API_KEY is not set", lastSyncedAt: null, creditsThisMonth: null }),
    NOW_MS,
  );
  assert.deepEqual([disabled.state, disabled.tone, disabled.note, disabled.syncedMinutesAgo], [
    "disabled", "warning", "CARTESIA_ADMIN_API_KEY is not set", null,
  ]);

  const failing = cartesiaLineView(cartesia({ status: "error", statusNote: "Cartesia rate-limited the usage sync (HTTP 429)" }), NOW_MS);
  assert.equal(failing.tone, "warning");
  assert.match(failing.note ?? "", /429/);

  const old = new Date(NOW_MS - (CARTESIA_STALE_MINUTES + 1) * 60_000).toISOString();
  const stale = cartesiaLineView(cartesia({ lastSyncedAt: old }), NOW_MS);
  assert.deepEqual([stale.state, stale.tone], ["stale", "warning"]);

  assert.equal(cartesiaLineView(cartesia({ status: "pending", lastSyncedAt: null }), NOW_MS).tone, "neutral");
});

test("the AI cost basis says measured, mixed or estimated, and warns only when the sync is down", () => {
  assert.equal(aiCostBasisView(null), null, "an older backend claims no basis");
  assert.equal(aiCostBasisView(undefined), null);

  const measured = aiCostBasisView({
    basis: "measured", measuredDays: 30, estimatedDays: 0, cartesiaCredits: 2500, cartesiaUsdPerCredit: 0.0000392, syncStatus: "ok",
  });
  assert.deepEqual(measured, { basis: "measured", measuredDays: 30, totalDays: 30, cartesiaCredits: 2500, tone: "neutral" });

  const mixed = aiCostBasisView({
    basis: "mixed", measuredDays: 28, estimatedDays: 2, cartesiaCredits: 900, cartesiaUsdPerCredit: 0.0000392, syncStatus: "ok",
  });
  assert.equal(mixed?.totalDays, 30);
  assert.equal(mixed?.tone, "neutral", "history from before the sync existed is expected to be estimated");

  const broken = aiCostBasisView({
    basis: "estimated", measuredDays: 0, estimatedDays: 30, cartesiaCredits: 0, cartesiaUsdPerCredit: 0.0000392, syncStatus: "disabled",
  });
  assert.equal(broken?.tone, "warning");
});
