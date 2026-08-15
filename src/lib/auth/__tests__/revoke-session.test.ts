import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRevokeFailure,
  isRetryableRevokeFailure,
  revokeWithRetry,
} from "../revoke-session.ts";

/**
 * WT-405 — a sign-out the gateway refuses must not evaporate.
 *
 * Production, 15 Aug 04:08:04: `POST /api/v1/auth/logout` was answered 429 by the gateway's
 * shared per-address budget. The old code dispatched the request and swallowed every failure
 * with an empty catch, so the request was simply lost: the server never revoked the family or
 * cleared its HttpOnly cookies, and this side had already reported a successful sign-out.
 *
 * `wait` is stubbed throughout. The delays are real (1.5s, 5s) and asserting them by actually
 * sleeping would make this suite take seven seconds to prove something about control flow.
 */

function refusal(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

/** Records what was waited for without waiting. */
function recordingWait() {
  const waited: number[] = [];
  return {
    waited,
    wait: async (ms: number) => {
      waited.push(ms);
    },
  };
}

test("a sign-out refused with 429 is re-sent and can still succeed", async () => {
  let attempts = 0;
  const { waited, wait } = recordingWait();

  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
      // Refused once by the shared budget, accepted when the window drains — exactly the
      // production shape, where a retry 38 seconds later did go through.
      if (attempts === 1) throw refusal(429);
      return undefined;
    },
    { wait },
  );

  assert.equal(
    outcome.revoked,
    true,
    "A sign-out that was only rate-limited must end with the session actually revoked.",
  );
  assert.equal(attempts, 2);
  assert.deepEqual(waited, [1_500]);
});

test("a 429 that never clears is reported, not silently discarded", async () => {
  const { waited, wait } = recordingWait();
  let attempts = 0;

  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
      throw refusal(429);
    },
    { wait },
  );

  // The point of the whole change: the caller can now tell that the server still holds this
  // session. Before, this case was indistinguishable from a clean sign-out.
  assert.equal(outcome.revoked, false);
  assert.equal(outcome.lastFailure, "429");
  assert.equal(attempts, 3, "One attempt plus both retries.");
  assert.deepEqual(waited, [1_500, 5_000]);
});

test("a server error is retried too — it is not a verdict on the session", async () => {
  let attempts = 0;
  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw refusal(503);
      return undefined;
    },
    { wait: async () => {} },
  );

  assert.equal(outcome.revoked, true);
  assert.equal(attempts, 3);
});

test("a request that never got a response is retried", async () => {
  let attempts = 0;
  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Network Error");
      return undefined;
    },
    { wait: async () => {} },
  );

  assert.equal(outcome.revoked, true);
  assert.equal(attempts, 2);
});

test("a refusal the server meant is not re-sent", async () => {
  // 401 is the server having looked at this and declined: the access token being handed over
  // has expired. Re-sending spends permits from the very budget whose exhaustion is the
  // problem, and cannot succeed.
  for (const status of [400, 401, 403, 404]) {
    let attempts = 0;
    const { waited, wait } = recordingWait();

    const outcome = await revokeWithRetry(
      async () => {
        attempts += 1;
        throw refusal(status);
      },
      { wait },
    );

    assert.equal(attempts, 1, `HTTP ${status} must not be retried.`);
    assert.equal(outcome.revoked, false);
    assert.equal(outcome.lastFailure, String(status));
    assert.deepEqual(waited, []);
  }
});

test("a sign-out that works first time costs nothing extra", async () => {
  let attempts = 0;
  const { waited, wait } = recordingWait();

  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
    },
    { wait },
  );

  assert.deepEqual(outcome, { revoked: true, attempts: 1 });
  assert.equal(attempts, 1);
  assert.deepEqual(waited, [], "The happy path must not sleep.");
});

test("retryability is decided by status, not by the shape of the error", () => {
  assert.equal(isRetryableRevokeFailure(refusal(429)), true);
  assert.equal(isRetryableRevokeFailure(refusal(500)), true);
  assert.equal(isRetryableRevokeFailure(refusal(502)), true);
  assert.equal(isRetryableRevokeFailure(refusal(401)), false);
  assert.equal(isRetryableRevokeFailure(refusal(400)), false);
  assert.equal(isRetryableRevokeFailure(new Error("Network Error")), true);
  assert.equal(isRetryableRevokeFailure(null), true);
  assert.equal(isRetryableRevokeFailure(undefined), true);
});

test("the breadcrumb names the status, so a stranded session is diagnosable", () => {
  assert.equal(describeRevokeFailure(refusal(429)), "429");
  assert.equal(describeRevokeFailure(new Error("Network Error")), "no-response");
});
