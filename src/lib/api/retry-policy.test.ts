// The invariant here already caused one production incident: an expired session made every
// query on the dashboard 401, the retries multiplied that across every mounted hook, and the
// gateway's 100 req/min/IP limiter turned the storm into a 503 for everybody. A 4xx must cost
// exactly one request.

import assert from "node:assert/strict";
import test from "node:test";

import {
  getErrorStatus,
  getRetryDelayMs,
  isNonRetryableError,
  shouldRetryRequest,
} from "./retry-policy.ts";

function httpError(status: number) {
  return { response: { status } };
}

test("a 401 is never retried", () => {
  assert.equal(isNonRetryableError(httpError(401)), true);
  assert.equal(shouldRetryRequest(0, httpError(401)), false);
});

test("a 403 is never retried", () => {
  assert.equal(shouldRetryRequest(0, httpError(403)), false);
});

test("a 429 is backed off entirely rather than retried", () => {
  assert.equal(shouldRetryRequest(0, httpError(429)), false);
});

test("a 5xx is retried, because it may genuinely succeed later", () => {
  assert.equal(isNonRetryableError(httpError(503)), false);
  assert.equal(shouldRetryRequest(0, httpError(503)), true);
});

test("a network failure with no response is retried", () => {
  assert.equal(getErrorStatus(new Error("Network Error")), null);
  assert.equal(shouldRetryRequest(0, new Error("Network Error")), true);
});

test("retries are bounded, so no error loops forever", () => {
  assert.equal(shouldRetryRequest(1, httpError(503)), true);
  assert.equal(shouldRetryRequest(2, httpError(503)), false);
  assert.equal(shouldRetryRequest(99, httpError(503)), false);
});

test("backoff grows exponentially and stays capped", () => {
  assert.equal(getRetryDelayMs(0), 1_000);
  assert.equal(getRetryDelayMs(1), 2_000);
  assert.equal(getRetryDelayMs(2), 4_000);
  assert.equal(getRetryDelayMs(20), 30_000);
});
