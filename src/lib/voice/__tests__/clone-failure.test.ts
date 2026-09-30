import assert from "node:assert/strict";
import test from "node:test";

import { describeCloneFailure } from "../clone-failure.ts";

/**
 * "Couldn't clone", 2026-09-18: every upload failed because the voice provider account had
 * dropped to a plan without cloning. The row offered only Re-record — which could not have
 * helped, because the recordings were fine. These pin that the page now names the cause and
 * offers the action that can actually work.
 */

test("a plan refusal says the recording is fine and offers a retry, not a new take", () => {
  assert.deepEqual(describeCloneFailure("PROVIDER_PLAN_REQUIRED"), {
    reason: "planRequired",
    canRetry: true,
    suggestReRecord: false,
  });
});

test("credits, credentials and outages are the account's problem, never the recording's", () => {
  for (const code of [
    "PROVIDER_QUOTA_EXCEEDED",
    "PROVIDER_REJECTED",
    "PROVIDER_BUSY",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_UNREACHABLE",
  ]) {
    const failure = describeCloneFailure(code);
    assert.equal(failure.canRetry, true, code);
    assert.equal(failure.suggestReRecord, false, code);
  }
});

test("only a recording the provider refused asks for a new take, and does not offer a retry", () => {
  assert.deepEqual(describeCloneFailure("SAMPLE_REJECTED"), {
    reason: "sampleRejected",
    canRetry: false,
    suggestReRecord: true,
  });
});

test("an expired sample can be re-sent from storage", () => {
  assert.equal(describeCloneFailure("SAMPLE_EXPIRED").canRetry, true);
});

test("a row that failed before reasons were stored offers both ways out", () => {
  for (const code of [null, undefined, "", "  "]) {
    assert.deepEqual(describeCloneFailure(code), {
      reason: "notRecorded",
      canRetry: true,
      suggestReRecord: true,
    });
  }
});

test("a code this page does not know is unknown, not a guessed cause", () => {
  assert.equal(describeCloneFailure("SOMETHING_NEW").reason, "unknown");
  assert.equal(describeCloneFailure("UNKNOWN").reason, "unknown");
});
