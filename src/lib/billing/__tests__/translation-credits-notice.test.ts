import assert from "node:assert/strict";
import { test } from "node:test";

import {
  translationRestoredNotice,
  translationSuspendedNotice,
  translationSuspendedNoticeKey,
} from "../translation-credits-notice.ts";

test("running out of credits says so", () => {
  assert.match(translationSuspendedNotice("overage_cap"), /run out of credits/);
});

test("an overdue invoice is not reported as running out of credits", () => {
  const notice = translationSuspendedNotice("invoice_overdue");
  assert.match(notice, /overdue invoice/);
  assert.doesNotMatch(notice, /credits/);
});

test("an ended trial names the trial", () => {
  assert.match(translationSuspendedNotice("trial_ended"), /trial has ended/);
});

test("an unknown or missing reason makes no claim about credits", () => {
  for (const reason of ["", null, undefined, "something_new"]) {
    const notice = translationSuspendedNotice(reason);
    assert.match(notice, /suspended/);
    assert.doesNotMatch(notice, /credits/);
  }
});

test("an expired subscription says the subscription expired, not that credits ran out", () => {
  const notice = translationSuspendedNotice("subscription_expired");
  assert.match(notice, /subscription expired/i);
  assert.match(notice, /renew/);
  assert.doesNotMatch(notice, /credits/);
});

test("the notice is localized through the component's translator", () => {
  const seen: string[] = [];
  const notice = translationSuspendedNotice("subscription_expired", (key) => {
    seen.push(key);
    return `vi:${key}`;
  });
  assert.equal(notice, "vi:subscriptionExpired");
  assert.deepEqual(seen, ["subscriptionExpired"]);
});

test("every English sentence is the en catalog's own text", async () => {
  const { default: rooms } = await import("../../../../messages/en/rooms.json", {
    with: { type: "json" },
  });
  const catalog = (rooms as { translationCredits: Record<string, string> }).translationCredits;
  for (const reason of ["overage_cap", "invoice_overdue", "trial_ended", "subscription_expired", "x"]) {
    const key = translationSuspendedNoticeKey(reason);
    assert.equal(translationSuspendedNotice(reason), catalog[key]);
  }
  assert.equal(translationRestoredNotice(), catalog.restored);
});
