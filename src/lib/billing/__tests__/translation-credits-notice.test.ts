import assert from "node:assert/strict";
import { test } from "node:test";

import { translationSuspendedNotice } from "../translation-credits-notice.ts";

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
