/**
 * WT-701 — when the summary picker keeps waiting, and when a reply is really someone else's.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRetryableRenderingError,
  normalizeRenderingLanguage,
  normalizeRenderingTemplate,
  renderingAnswerMatches,
} from "../summary-rendering-poll.ts";

const axiosError = (status?: number) => ({
  isAxiosError: true,
  ...(status === undefined ? {} : { response: { status } }),
});

test("no response at all is transient — network, CORS, timeout", () => {
  assert.equal(isRetryableRenderingError(axiosError()), true);
});

test("5xx from the gateway or the service is transient", () => {
  assert.equal(isRetryableRenderingError(axiosError(500)), true);
  assert.equal(isRetryableRenderingError(axiosError(502)), true);
  assert.equal(isRetryableRenderingError(axiosError(503)), true);
});

test("429 keeps the slow poll going instead of ending the attempt", () => {
  assert.equal(isRetryableRenderingError(axiosError(429)), true);
});

test("any other 4xx is the server refusing, and ends the attempt now", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isRetryableRenderingError(axiosError(status)), false, String(status));
  }
});

test("an exception from our own code is not retried — it would throw on every tick", () => {
  assert.equal(isRetryableRenderingError(new TypeError("boom")), false);
  assert.equal(isRetryableRenderingError(undefined), false);
  assert.equal(isRetryableRenderingError("nope"), false);
});

test("pairs are compared in the server's normalised spelling", () => {
  assert.equal(normalizeRenderingTemplate(" Traceable "), "traceable");
  assert.equal(normalizeRenderingLanguage("vi-VN"), "vi");
  assert.equal(normalizeRenderingLanguage("EN_us"), "en");
  assert.equal(normalizeRenderingLanguage(null), "");
});

test("an echo that differs only in case or region is the answer that was asked for", () => {
  assert.equal(
    renderingAnswerMatches(
      { templateKey: "Standup", language: "vi-VN" },
      { templateKey: "standup", language: "vi" },
    ),
    true,
  );
});

test("asking for 'as spoken' accepts whatever language the server resolved", () => {
  assert.equal(
    renderingAnswerMatches({ templateKey: "general", language: "" }, { templateKey: "general", language: "en" }),
    true,
  );
});

test("a reply for a different shape or language is genuinely stale", () => {
  assert.equal(
    renderingAnswerMatches({ templateKey: "general", language: "vi" }, { templateKey: "demo", language: "vi" }),
    false,
  );
  assert.equal(
    renderingAnswerMatches({ templateKey: "general", language: "vi" }, { templateKey: "general", language: "ja" }),
    false,
  );
});
