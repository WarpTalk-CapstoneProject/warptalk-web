import test from "node:test";
import assert from "node:assert/strict";

import { describeLanguageCeiling, describeRoomCeiling } from "../room-ceiling-notice.ts";

test("a plan ceiling is attributed to the plan", () => {
  const { message } = describeRoomCeiling({ ceiling: 5, configured: 20, source: "plan:enterprise" });

  assert.match(message!, /Your plan allows 5 concurrent rooms/);
  assert.match(message!, /can only lower the limit/);
});

test("the plan's internal slug is never shown", () => {
  // The reported sentence read "Your plan allows 5 concurrent rooms (plan:enterpise2)". That is a
  // row id from the billing catalogue, not a product name — and the one an Owner actually saw was
  // a typo for "enterprise", which is the whole argument for never printing it.
  const { message } = describeRoomCeiling({
    ceiling: 5,
    configured: 20,
    source: "plan:enterpise2",
  });

  assert.doesNotMatch(message!, /enterpise2/);
  assert.doesNotMatch(message!, /plan:/);
});

test("a platform default is not called a plan", () => {
  // "Your plan allows 5" sends an Owner to Billing to find a limit their plan never imposed.
  const { message } = describeRoomCeiling({
    ceiling: 5,
    configured: 20,
    source: "platform_default",
  });

  assert.doesNotMatch(message!, /Your plan/);
  assert.match(message!, /active plan/);
});

test("the workspace's own limit is not blamed on a plan", () => {
  const { message } = describeRoomCeiling({
    ceiling: 5,
    configured: 20,
    source: "workspace_override",
  });

  assert.doesNotMatch(message!, /Your plan/);
  assert.match(message!, /This workspace is limited to 5/);
});

test("unknown provenance still states the limit in force", () => {
  for (const source of [null, undefined, "", "something_new"]) {
    const { message } = describeRoomCeiling({ ceiling: 5, configured: 20, source });
    assert.match(message!, /limited to 5 concurrent rooms/, `source ${String(source)}`);
  }
});

test("nothing is said when the setting is the effective limit", () => {
  // Equal is not a conflict, and a ceiling above the setting means the setting is the tighter of
  // the two — which is exactly what the Owner asked for.
  assert.equal(describeRoomCeiling({ ceiling: 20, configured: 20, source: "plan:x" }).message, null);
  assert.equal(describeRoomCeiling({ ceiling: 50, configured: 20, source: "plan:x" }).message, null);
});

test("an unknown ceiling says nothing rather than guessing", () => {
  // Before the settings query resolves, and for a workspace whose snapshot has not arrived.
  assert.equal(describeRoomCeiling({ ceiling: null, configured: 20 }).message, null);
  assert.equal(describeRoomCeiling({ ceiling: 5, configured: undefined }).message, null);
});

// ── WT-500: the per-meeting language quota ───────────────────────────────────

test("a workspace permitting no more than its plan allows is told nothing", () => {
  for (const allowedCount of [1, 2, 3]) {
    assert.equal(
      describeLanguageCeiling({ ceiling: 3, allowedCount, source: "plan:enterprise" }).message,
      null,
      `${allowedCount} allowed against a ceiling of 3 needs no explanation`,
    );
  }
});

test("a wider allowlist is explained, and is NOT described as ignored", () => {
  const message = describeLanguageCeiling({
    ceiling: 3,
    allowedCount: 6,
    source: "plan:enterprise",
  }).message;

  assert.ok(message?.includes("Your plan allows 3 target languages per meeting"));
  // The distinction that matters: unlike the room ceiling, the list is still honoured.
  assert.ok(message?.includes("You may permit more here"));
  assert.ok(!message?.includes("has no effect"));
});

test("the plan slug is never shown, here either", () => {
  const message = describeLanguageCeiling({
    ceiling: 2,
    allowedCount: 5,
    source: "plan:enterpise2",
  }).message;
  assert.ok(!message?.includes("enterpise2"));
});

test("no plan in force reads as a temporary limit, not as something they bought", () => {
  const message = describeLanguageCeiling({
    ceiling: 2,
    allowedCount: 6,
    source: "platform_default",
  }).message;
  assert.ok(message?.startsWith("Until this workspace has an active plan"));
});

test("an absent quota says nothing at all — cold start is not a limit", () => {
  assert.equal(describeLanguageCeiling({ ceiling: null, allowedCount: 6 }).message, null);
  assert.equal(describeLanguageCeiling({ ceiling: undefined, allowedCount: 6 }).message, null);
  assert.equal(describeLanguageCeiling({ ceiling: 0, allowedCount: 6 }).message, null);
});
