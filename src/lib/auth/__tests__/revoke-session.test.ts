import assert from "node:assert/strict";
import test from "node:test";

import {
  REVOKE_DEDUPE_WINDOW_MS,
  describeRevokeFailure,
  isRetryableRevokeFailure,
  resetRevokeDedupe,
  revokeWithRetry,
  shouldSendRevoke,
} from "../revoke-session.ts";

/**
 * WT-405 — a sign-out the gateway refuses must not evaporate.
 *
 * Production, 15 Aug 04:08:04: `POST /api/v1/auth/logout` was answered 429 by the gateway's
 * shared per-address budget. The old code dispatched the request and swallowed every failure
 * with an empty catch, so the request was simply lost: the server never revoked the family or
 * cleared its HttpOnly cookies, and this side had already reported a successful sign-out.
 *
 * ROUND 2, 15 Aug. The first fix retried 429. Three hours of production: 289 refused logouts,
 * ZERO accepted — so the "retry 38 seconds later did go through" that justified the schedule
 * was never a thing that happened. The gateway's window is 60s and both retries land inside it,
 * so each sign-out became three guaranteed failures. Separately, the POSTs arrived 200–340ms
 * apart, 117 in one minute: a caller re-entering logout() in a loop, which the retry then
 * tripled. The tests below pin both halves of the correction.
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

test("a sign-out refused with 429 is not re-sent", async () => {
  // The correction. Retry-After is 60s; the schedule is 1.5s and 5s. Both land inside a window
  // the server has told us is shut, so the only thing a retry buys is two more refusals — and
  // 289 of production's refusals were partly this. retry-policy.ts already said so: "429, where
  // retrying is precisely the behaviour the server is asking us to stop."
  let attempts = 0;
  const { waited, wait } = recordingWait();

  const outcome = await revokeWithRetry(
    async () => {
      attempts += 1;
      throw refusal(429);
    },
    { wait },
  );

  assert.equal(attempts, 1, "A rate-limited sign-out was re-sent into a window it was told was shut.");
  assert.deepEqual(waited, [], "Nothing should have been waited for.");
  assert.equal(outcome.revoked, false);
});

test("a 429 is reported, not silently discarded", async () => {
  // Unchanged from round 1 and still the point: the caller can tell that the server still holds
  // this session. Giving up early must not mean giving up quietly.
  const outcome = await revokeWithRetry(async () => {
    throw refusal(429);
  }, { wait: async () => {} });

  assert.equal(outcome.revoked, false);
  assert.equal(outcome.lastFailure, "429");
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
  assert.equal(isRetryableRevokeFailure(refusal(429)), false);
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

/**
 * WT-405 round 2 — the same session asking to be revoked twice is not two sign-outs.
 *
 * endDeadSession() is latched, but the latch only guards its own door: logout() has six other
 * callers. Production showed logout POSTs 200–340ms apart, 117 in a single minute — too fast
 * for the retry schedule and far too fast for a person. This keys on the credential, so a real
 * second sign-out passes and a looping caller costs one request.
 */

test("the same session is revoked once, however many times the caller asks", () => {
  resetRevokeDedupe();
  const t = 1_000_000;

  assert.equal(shouldSendRevoke("token-a", t), true);
  assert.equal(shouldSendRevoke("token-a", t + 210), false, "the 200ms re-entry got through");
  assert.equal(shouldSendRevoke("token-a", t + 340), false);
  assert.equal(shouldSendRevoke("token-a", t + 59_000), false);
});

test("a genuinely different session still signs out", () => {
  // The negative control. A guard that suppressed this would recreate the original bug — a
  // sign-out that never reaches the server — which is the whole ticket.
  resetRevokeDedupe();
  const t = 1_000_000;

  assert.equal(shouldSendRevoke("token-a", t), true);
  assert.equal(
    shouldSendRevoke("token-b", t + 100),
    true,
    "Signing in as somebody else and out again was swallowed.",
  );
});

test("the same session may be revoked again once the window has passed", () => {
  resetRevokeDedupe();
  const t = 1_000_000;

  assert.equal(shouldSendRevoke("token-a", t), true);
  assert.equal(shouldSendRevoke("token-a", t + REVOKE_DEDUPE_WINDOW_MS + 1), true);
});

test("signing in clears the dedupe, so the new session can sign out immediately", () => {
  // A cookie-only sign-out has no token to key on, so consecutive ones share a key. Without
  // this reset, signing in and straight back out inside a minute would be swallowed — the
  // ticket's own failure mode, reintroduced by its fix. auth-store.login() calls it.
  resetRevokeDedupe();
  const t = 1_000_000;

  assert.equal(shouldSendRevoke(null, t), true);
  assert.equal(shouldSendRevoke(null, t + 500), false);

  resetRevokeDedupe();
  assert.equal(shouldSendRevoke(null, t + 600), true);
});
