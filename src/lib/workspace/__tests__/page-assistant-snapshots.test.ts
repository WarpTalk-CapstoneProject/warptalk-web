// What the workspace Billing and Plugins pages tell WarpBot.
//
// Rules pinned here: a source that was not read has no key (never "off" or "none"), a no-plan
// workspace says so, nothing about a card or a requester leaks, and no value holds a comma.

import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspacePluginsOverviewDto } from "../../../types/assistant.ts";
import type { CreditBalanceDto, RecurringBillingStatusDto, SubscriptionDto } from "../../../types/billing.ts";
import { billingAssistantSnapshot, type BillingSnapshotInput } from "../billing-assistant-snapshot.ts";
import { pluginsAssistantSnapshot } from "../plugins-assistant-snapshot.ts";

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
  planName: "Team, Annual",
  price: 49.5,
  planCurrency: "USD",
  status: "active",
  autoRenew: true,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date(2026, 9, 1).toISOString(),
} as SubscriptionDto;

const recurring = {
  renewalMode: "stripe",
  autoRenew: true,
  card: { brand: "visa", last4: "4242" },
  nextChargeAt: new Date(2026, 9, 1).toISOString(),
  nextChargeAmount: 49.5,
  nextChargeCurrency: "USD",
  paymentFailed: false,
  paymentFailedAt: null,
  paymentGraceEndsAt: null,
  paymentFailureReason: "card_declined: insufficient funds",
} as unknown as RecurringBillingStatusDto;

function billing(extra: Partial<BillingSnapshotInput> = {}): BillingSnapshotInput {
  return {
    balance,
    subscription,
    plan: { currency: "USD", maxParticipants: 50, maxLanguages: 10 },
    interval: "monthly",
    overage: { enabled: true, effectiveCapCredits: 2000, planCapCredits: 5000, overageCreditsThisCycle: 120 },
    frozen: undefined,
    recurring,
    canBuyExtraCredits: true,
    nowMs: NOW,
    ...extra,
  };
}

test("the Billing page figures reach WarpBot", () => {
  const snapshot = billingAssistantSnapshot(billing());
  assert.equal(snapshot.plan, "Team Annual; renews 2026-10-01");
  assert.equal(snapshot.plan_price, "49.5 USD per month");
  assert.equal(snapshot.plan_limits, "up to 50 participants and 10 languages per meeting");
  assert.equal(snapshot.credits_remaining, "2500 of 10000 (25% left)");
  assert.equal(snapshot.credits_used_this_cycle, "7500");
  assert.equal(snapshot.billing_cycle, "2026-09-01 to 2026-10-01");
  assert.equal(snapshot.overages, "on; cap 2000 credits; 120 used this cycle");
  assert.equal(snapshot.auto_renew, "on");
  assert.equal(snapshot.renewal_mode, "card charged automatically");
  assert.equal(snapshot.card_on_file, "yes");
  assert.equal(snapshot.next_charge, "49.5 USD on 2026-10-01");
  assert.equal(snapshot.payment_failed, "no");
  assert.equal(snapshot.can_buy_extra_credits, "yes");
});

test("a failed renewal charge says when and until when the plan runs", () => {
  const snapshot = billingAssistantSnapshot(
    billing({
      recurring: {
        ...recurring,
        paymentFailed: true,
        paymentFailedAt: new Date(2026, 8, 14).toISOString(),
        paymentGraceEndsAt: new Date(2026, 8, 21).toISOString(),
      },
    }),
  );
  assert.equal(snapshot.payment_failed, "yes on 2026-09-14; the plan keeps running until 2026-09-21");
});

test("a card is a yes or a no, and the provider words never leave the page", () => {
  const text = JSON.stringify(billingAssistantSnapshot(billing()));
  for (const secret of ["visa", "4242", "card_declined", "insufficient"]) assert.equal(text.includes(secret), false, secret);
});

test("a source that was not read leaves no key, so nothing reads as off or none", () => {
  const snapshot = billingAssistantSnapshot(billing({ overage: undefined, recurring: undefined, balance: undefined, plan: undefined }));
  for (const key of ["overages", "renewal_mode", "card_on_file", "payment_failed", "credits_remaining", "plan_limits"]) {
    assert.equal(key in snapshot, false, key);
  }
  assert.equal(snapshot.plan, "Team Annual; renews 2026-10-01");
});

test("an ending plan and overages that are off say so", () => {
  const snapshot = billingAssistantSnapshot(
    billing({
      subscription: { ...subscription, cancelAtPeriodEnd: true },
      overage: { enabled: false, effectiveCapCredits: 0, planCapCredits: 5000, overageCreditsThisCycle: 0 },
      recurring: { ...recurring, autoRenew: false },
    }),
  );
  assert.equal(snapshot.plan, "Team Annual; ends 2026-10-01");
  assert.equal(snapshot.overages, "off; the plan allows up to 5000 credits if turned on");
  assert.equal(snapshot.auto_renew, "off");
});

test("no plan is said, with what was kept and what ended", () => {
  const snapshot = billingAssistantSnapshot(
    billing({
      balance: null,
      subscription: null,
      plan: null,
      overage: undefined,
      recurring: undefined,
      canBuyExtraCredits: false,
      frozen: {
        workspaceId: "w1",
        frozenCredits: 900,
        frozenAt: null,
        endedAt: null,
        dormantSince: null,
        graceEndsAt: null,
        hasActiveSubscription: false,
        lastPlanName: "Team",
        lastEndedAt: new Date(2026, 7, 31).toISOString(),
      },
    }),
  );
  assert.equal(snapshot.plan, "no plan");
  assert.equal(snapshot.credits_kept_from_previous_plan, "900");
  assert.equal(snapshot.last_plan, "Team; ended 2026-08-31");
  assert.equal("credits_remaining" in snapshot, false);
});

test("no Billing value holds a comma, and no key is one the widget pill reads", () => {
  for (const snapshot of [billingAssistantSnapshot(billing()), billingAssistantSnapshot(billing({ balance: null, subscription: null }))]) {
    for (const [key, value] of Object.entries(snapshot)) {
      assert.equal(value.includes(","), false, `${key}=${value}`);
      assert.equal(["title", "name", "query", "status"].includes(key), false, key);
    }
  }
});

// -- Plugins ------------------------------------------------------------------

const plugin = (over: Record<string, unknown>) =>
  ({ key: "k", provider: "p", label: "L", description: "", kind: "mcp", availability: "added", membersUsedCount: 0, ...over }) as WorkspacePluginsOverviewDto["inWorkspace"][number];

function overview(over: Partial<WorkspacePluginsOverviewDto> = {}): WorkspacePluginsOverviewDto {
  return {
    workspaceId: "w1",
    isCurated: true,
    canManage: true,
    inWorkspace: [
      plugin({ key: "drive", label: "Google Drive", membersUsedCount: 3 }),
      plugin({ key: "crm", label: "Acme, CRM", availability: "private", mcpServerUrl: "https://secret.example.com/mcp", membersUsedCount: 1 }),
    ],
    marketplace: [plugin({ key: "slack", label: "Slack", availability: "not_added" })],
    pendingRequests: [
      { id: "r1", workspaceId: "w1", pluginKey: "slack", pluginLabel: "Slack", requestedBy: "user-123", reason: "need it", status: "pending", createdAt: "2026-09-01T00:00:00Z" },
      { id: "r2", workspaceId: "w1", pluginKey: "notion", pluginLabel: "Notion", requestedBy: "user-456", status: "declined", createdAt: "2026-09-01T00:00:00Z" },
    ],
    ...over,
  };
}

test("the Plugins list reaches WarpBot with counts and labels", () => {
  const snapshot = pluginsAssistantSnapshot(overview(), true);
  assert.equal(snapshot.plugins_in_workspace_count, "2");
  assert.equal(snapshot.plugins_in_workspace, "Google Drive (used by 3 members); Acme CRM (private MCP server; used by 1 member)");
  assert.equal(snapshot.private_mcp_plugins, "1");
  assert.equal(snapshot.marketplace_plugins_not_added, "Slack");
  assert.equal(snapshot.plugin_requests_waiting_for_owner, "1");
  assert.equal(snapshot.plugins_requested, "Slack");
  assert.equal(snapshot.list_chosen_by_owner, "yes");
  assert.equal(snapshot.can_change_the_list, "yes");
});

test("nobody who asked is named and no server address leaves the page", () => {
  const text = JSON.stringify(pluginsAssistantSnapshot(overview(), true));
  for (const secret of ["user-123", "user-456", "need it", "secret.example.com"]) assert.equal(text.includes(secret), false, secret);
});

test("an empty list is none, an Admin is read-only, a carried-over default is not chosen", () => {
  const snapshot = pluginsAssistantSnapshot(overview({ inWorkspace: [], marketplace: [], pendingRequests: [], isCurated: false }), false);
  assert.equal(snapshot.plugins_in_workspace, "none");
  assert.equal(snapshot.marketplace_plugins_not_added, "none");
  assert.equal(snapshot.plugin_requests_waiting_for_owner, "0");
  assert.equal("plugins_requested" in snapshot, false);
  assert.match(snapshot.list_chosen_by_owner, /^no: /);
  assert.match(snapshot.can_change_the_list, /^no: /);
});

test("plugins the platform turned off are listed, and a long list is cut with a count", () => {
  const many = Array.from({ length: 15 }, (_, i) => plugin({ key: `p${i}`, label: `Plugin ${i}` }));
  const snapshot = pluginsAssistantSnapshot(
    overview({ inWorkspace: many, disabledByPlatform: [plugin({ key: "old", label: "Old tool", availability: "platform_disabled" })] }),
    true,
  );
  assert.equal(snapshot.turned_off_by_platform, "Old tool");
  assert.match(snapshot.plugins_in_workspace, /; and 3 more$/);
});

test("no Plugins value holds a comma, and no key is one the widget pill reads", () => {
  for (const snapshot of [pluginsAssistantSnapshot(overview(), true), pluginsAssistantSnapshot(overview({ inWorkspace: [] }), false)]) {
    for (const [key, value] of Object.entries(snapshot)) {
      assert.equal(value.includes(","), false, `${key}=${value}`);
      assert.equal(["title", "name", "query", "status"].includes(key), false, key);
    }
  }
});
