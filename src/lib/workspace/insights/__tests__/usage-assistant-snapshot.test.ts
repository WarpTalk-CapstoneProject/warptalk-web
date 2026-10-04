// What the Insights Usage tab tells WarpBot.
//
// The figures are the tab's own (same helpers), so these pin what is specific to the snapshot:
// a capped ledger is a floor, rooms that have not loaded leave no meeting count, no member is
// named, and no value holds a comma.

import assert from "node:assert/strict";
import test from "node:test";

import type { CreditBalanceDto, CreditTransactionDto } from "../../../../types/billing.ts";
import { usageAssistantSnapshot, type UsageSnapshotInput } from "../usage-assistant-snapshot.ts";

const NOW = new Date(2026, 8, 10, 12, 0).getTime();
const HOUR = 60 * 60 * 1000;
const ALICE = "u-alice";
const BOB = "u-bob";

const balance: CreditBalanceDto = {
  workspaceId: "w1",
  currentCredits: 800,
  creditsUsedThisCycle: 200,
  totalCredits: 1000,
  status: "active",
  currentPeriodStart: new Date(2026, 8, 1).toISOString(),
  currentPeriodEnd: new Date(2026, 9, 1).toISOString(),
};

let seq = 0;
function tx(over: Partial<CreditTransactionDto> & { at: number }): CreditTransactionDto {
  const { at, ...rest } = over;
  seq += 1;
  return {
    id: `tx-${seq}`,
    workspaceId: "w1",
    userId: ALICE,
    amount: -10,
    type: "consume",
    description: "Aggregated TRANSLATION",
    referenceType: "translation_content",
    referenceId: `seg-${seq}`,
    balanceAfter: 800,
    createdAt: new Date(at).toISOString(),
    ...rest,
  };
}

const day = (d: number, hour = 10) => new Date(2026, 8, d, hour).getTime();

function input(extra: Partial<UsageSnapshotInput> = {}): UsageSnapshotInput {
  return {
    balance,
    ledger: [
      tx({ at: day(2), amount: 1000, type: "top_up", description: "Plan grant", userId: null }),
      tx({ at: day(3), amount: -100, userId: ALICE }),
      tx({ at: day(3, 11), amount: -60, userId: ALICE, description: "Aggregated AUDIO_DUBBING", referenceType: "audio_dubbing" }),
      tx({ at: day(5), amount: -40, userId: BOB }),
    ],
    ledgerComplete: true,
    serviceUsage: undefined,
    members: [
      { userId: ALICE, fullName: "Alice Nguyen, PhD", email: "alice@example.com" },
      { userId: BOB, fullName: "Bob Tran", email: "bob@example.com" },
    ],
    rooms: [{ id: "r1", title: "Weekly sync", startedAt: new Date(day(3, 9)).toISOString(), endedAt: new Date(day(3, 9) + 3 * HOUR).toISOString() }],
    nowMs: NOW,
    ...extra,
  };
}

test("the tab headline figures reach WarpBot", () => {
  const snapshot = usageAssistantSnapshot(input());
  assert.equal(snapshot.billing_cycle, "2026-09-01 to 2026-10-01");
  assert.equal(snapshot.usage_scope, "whole workspace");
  assert.equal(snapshot.credits_remaining, "800 of 1000 (80% left)");
  assert.equal(snapshot.credits_spent_this_cycle, "200");
  assert.equal(snapshot.credits_topped_up_this_cycle, "1000");
  assert.equal(snapshot.busiest_day, "2026-09-03 with 160 credits");
  assert.match(snapshot.credits_projection, /^(runs out|lasts)/);
});

test("credits by AI service are ranked, with their share", () => {
  const snapshot = usageAssistantSnapshot(input());
  const [first, second] = snapshot.credits_by_ai_service.split("; ");
  assert.match(first, /credits \(70%\)/);
  assert.match(second, /credits \(30%\)/);
});

test("a member is counted and measured, never named", () => {
  const snapshot = usageAssistantSnapshot(input());
  assert.equal(snapshot.members_who_spent_credits, "2");
  assert.equal(snapshot.top_spender_share_of_credits, "80%");
  const text = JSON.stringify(snapshot);
  for (const secret of ["Alice", "Bob", "alice@example.com", "bob@example.com", "Weekly sync"]) {
    assert.equal(text.includes(secret), false, secret);
  }
});

test("a ledger that stopped at the paging cap is a floor", () => {
  const snapshot = usageAssistantSnapshot(input({ ledgerComplete: false }));
  assert.equal(snapshot.credits_spent_this_cycle, "at least 200");
  assert.equal(snapshot.credits_topped_up_this_cycle, "at least 1000");
});

test("meetings billed need the rooms: no rooms read, no count", () => {
  assert.equal(usageAssistantSnapshot(input()).meetings_billed_this_cycle, "1");
  assert.equal("meetings_billed_this_cycle" in usageAssistantSnapshot(input({ rooms: [] })), false);
});

test("an empty cycle says what it knows and invents no spend", () => {
  const snapshot = usageAssistantSnapshot(input({ ledger: [], rooms: [] }));
  assert.equal(snapshot.credits_spent_this_cycle, "0");
  for (const key of ["credits_by_ai_service", "members_who_spent_credits", "top_spender_share_of_credits", "busiest_day"]) {
    assert.equal(key in snapshot, false, key);
  }
});

test("no value holds a comma, and no key is one the widget pill reads", () => {
  for (const snapshot of [usageAssistantSnapshot(input()), usageAssistantSnapshot(input({ ledger: [] }))]) {
    for (const [key, value] of Object.entries(snapshot)) {
      assert.equal(value.includes(","), false, `${key}=${value}`);
      assert.equal(["title", "name", "query", "status"].includes(key), false, key);
    }
  }
});
