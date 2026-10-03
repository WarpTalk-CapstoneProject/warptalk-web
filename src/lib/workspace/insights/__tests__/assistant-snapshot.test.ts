// What the Insights Overview tells WarpBot.
//
// The starters on that page are answered from this snapshot alone, so a figure that is wrong here
// is a wrong answer said with confidence. These pin the two rules that matter: a source that did
// not answer leaves no key (never a 0), and the text holds no comma the worker's ", " join would
// split.

import assert from "node:assert/strict";
import test from "node:test";

import type { CreditBalanceDto, SubscriptionDto } from "../../../../types/billing.ts";
import { insightsAssistantSnapshot, type InsightsSnapshotInput } from "../assistant-snapshot.ts";

const NOW = new Date(2026, 8, 15, 12, 0).getTime();

const balance: CreditBalanceDto = {
  workspaceId: "w1",
  currentCredits: 2500,
  creditsUsedThisCycle: 7500,
  totalCredits: 10000,
  status: "active",
  currentPeriodStart: new Date(2026, 8, 1).toISOString(),
  currentPeriodEnd: new Date(2026, 9, 1).toISOString(),
};

const subscription = {
  planName: "Team",
  currentPeriodEnd: new Date(2026, 9, 1).toISOString(),
  cancelAtPeriodEnd: false,
} as SubscriptionDto;

function input(extra: Partial<InsightsSnapshotInput> = {}): InsightsSnapshotInput {
  return {
    current: { from: new Date(2026, 8, 1), to: new Date(2026, 8, 15, 12, 0) },
    previous: { from: new Date(2026, 7, 1), to: new Date(2026, 7, 15, 12, 0) },
    credits: { value: 7500, previous: 5000, atLeast: false },
    meetings: { value: 12, previous: 9, atLeast: false },
    hours: { value: 8.26, previous: 6, atLeast: false },
    toolCalls: { value: 40, previous: 25, atLeast: false },
    toolSuccessRate: { value: 0.9, previous: null, atLeast: false },
    tools: { error: 3, blocked: 1, needsSetupPlugins: ["Google Drive", "Slack"] },
    activeMembers: { active: 4, total: 9 },
    balance,
    subscription,
    pendingRequests: 2,
    nowMs: NOW,
    ...extra,
  };
}

test("every card on the Overview reaches WarpBot, with its previous period", () => {
  const snapshot = insightsAssistantSnapshot(input());
  assert.equal(snapshot.period, "2026-09-01 to 2026-09-15");
  assert.equal(snapshot.previous_period, "2026-08-01 to 2026-08-15");
  assert.equal(snapshot.credits_used, "7500");
  assert.equal(snapshot.credits_used_previous_period, "5000");
  assert.equal(snapshot.meetings_held, "12");
  assert.equal(snapshot.hours_translated, "8.3");
  assert.equal(snapshot.warpbot_tool_calls, "40");
  assert.equal(snapshot.warpbot_tool_calls_previous_period, "25");
  assert.equal(snapshot.tool_success_rate, "90%");
  assert.equal(snapshot.tool_calls_failed, "3");
  assert.equal(snapshot.tool_calls_blocked_by_policy, "1");
  assert.equal(snapshot.plugins_needing_setup, "Google Drive; Slack");
  assert.equal(snapshot.active_members, "4 of 9");
  assert.equal(snapshot.credits_remaining, "2500 of 10000 (25% left)");
  assert.match(snapshot.credits_projection, /^runs out in about \d+ days at \d+ credits per day; \d+ days left in the cycle$/);
  assert.equal(snapshot.plan, "Team; renews 2026-10-01");
  assert.equal(snapshot.pending_plugin_requests, "2");
});

test("a whole-month window ends on its last day, not the first of the next", () => {
  const snapshot = insightsAssistantSnapshot(input({ current: { from: new Date(2026, 7, 1), to: new Date(2026, 8, 1) } }));
  assert.equal(snapshot.period, "2026-08-01 to 2026-08-31");
});

test("a source that did not answer leaves no key, so nothing reads as 0", () => {
  const snapshot = insightsAssistantSnapshot(
    input({
      credits: null,
      meetings: { value: null, previous: null, atLeast: false },
      toolSuccessRate: { value: null, previous: null, atLeast: false },
      tools: null,
      activeMembers: null,
      balance: undefined,
      subscription: undefined,
      pendingRequests: undefined,
    }),
  );
  for (const key of [
    "credits_used",
    "credits_used_previous_period",
    "meetings_held",
    "tool_success_rate",
    "tool_calls_failed",
    "plugins_needing_setup",
    "active_members",
    "credits_remaining",
    "credits_projection",
    "plan",
    "pending_plugin_requests",
  ]) {
    assert.equal(key in snapshot, false, key);
  }
  assert.equal(snapshot.hours_translated, "8.3");
});

test("a capped read is a floor and carries no comparison", () => {
  const snapshot = insightsAssistantSnapshot(input({ credits: { value: 10000, previous: null, atLeast: true } }));
  assert.equal(snapshot.credits_used, "at least 10000");
  assert.equal("credits_used_previous_period" in snapshot, false);
});

test("no plan is said, not left blank", () => {
  const snapshot = insightsAssistantSnapshot(input({ balance: null, subscription: null }));
  assert.equal(snapshot.credits_remaining, "no plan");
  assert.equal(snapshot.plan, "no plan");
  assert.equal("credits_projection" in snapshot, false);
});

test("a plan that is ending says so, and no setup trouble is 'none'", () => {
  const snapshot = insightsAssistantSnapshot(
    input({
      subscription: { ...subscription, cancelAtPeriodEnd: true },
      tools: { error: 0, blocked: 0, needsSetupPlugins: [] },
    }),
  );
  assert.equal(snapshot.plan, "Team; ends 2026-10-01");
  assert.equal(snapshot.plugins_needing_setup, "none");
});

test("no value holds a comma: the worker joins the pairs with ', '", () => {
  for (const snapshot of [insightsAssistantSnapshot(input()), insightsAssistantSnapshot(input({ balance: null, subscription: null }))]) {
    for (const [key, value] of Object.entries(snapshot)) assert.equal(value.includes(","), false, `${key}=${value}`);
  }
});
