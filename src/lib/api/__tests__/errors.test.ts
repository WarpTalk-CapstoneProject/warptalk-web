import assert from "node:assert/strict";
import test from "node:test";

import { AxiosError, AxiosHeaders } from "axios";

import { getErrorMessage } from "../errors.ts";

function axiosError(status: number | undefined, body?: unknown, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    status === undefined
      ? "Network Error"
      : `Request failed with status code ${status}`,
    code,
    config,
    {},
    status === undefined
      ? undefined
      : { status, data: body, headers: new AxiosHeaders(), config, statusText: "" },
  );
}

test("a server explanation always wins", () => {
  const message = getErrorMessage(
    axiosError(403, { error: "User does not have permission to create meetings." }),
    "Could not create the room.",
  );
  assert.equal(message, "User does not have permission to create meetings.");
});

/**
 * The defect this file exists for. The gateway's rate limiter rejects with a bodyless 503, so
 * there is no server message to prefer — and the axios string was the next candidate, which is
 * how "Request failed with status code 503" reached real users as the whole explanation.
 */
test("a bodyless 503 never surfaces the raw axios string", () => {
  const message = getErrorMessage(axiosError(503), "Could not create the room.");
  assert.doesNotMatch(message, /status code/);
  assert.match(message, /too many requests/i);
});

test("429 reads the same as the 503 the limiter actually sends", () => {
  assert.equal(
    getErrorMessage(axiosError(429), "fallback"),
    getErrorMessage(axiosError(503), "fallback"),
  );
});

test("an unreachable server says so instead of naming a status code", () => {
  const message = getErrorMessage(axiosError(undefined), "Could not create the room.");
  assert.doesNotMatch(message, /status code/);
  assert.match(message, /cannot reach/i);
});

test("a timeout is distinguished from an unreachable server", () => {
  const message = getErrorMessage(axiosError(undefined, undefined, "ECONNABORTED"), "fallback");
  assert.match(message, /too long/i);
});

/**
 * A status the transport mapper has no opinion about must fall through to the caller's fallback,
 * which is specific to the action. A generic "something went wrong" here would be worse than the
 * sentence the caller already wrote.
 */
test("a bodyless 403 falls through to the caller's fallback", () => {
  assert.equal(
    getErrorMessage(axiosError(403), "Could not remove the member."),
    "Could not remove the member.",
  );
});

test("an empty server message does not win over the fallback", () => {
  assert.equal(getErrorMessage(axiosError(400, { error: "   " }), "Check the form."), "Check the form.");
});

test("a plain Error still shows its own message", () => {
  assert.equal(
    getErrorMessage(new Error("Pick at least one language."), "fallback"),
    "Pick at least one language.",
  );
});

test("something that is not an error at all uses the fallback", () => {
  assert.equal(getErrorMessage("boom", "Could not save."), "Could not save.");
});
