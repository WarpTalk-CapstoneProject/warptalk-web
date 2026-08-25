/**
 * When a summary should admit it no longer matches the transcript.
 *
 * Both directions are wrong in their own way and the tests are split along that line. A warning
 * that will not turn off becomes furniture people dismiss; one that never turns on leaves a
 * document that has quietly stopped being true. So: it fires on a real correction, and it stays
 * silent on anything short of one.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isSummaryStale, lastCorrectionAt, summaryWrittenAt } from "../summary-staleness.ts";

const SUMMARY = { createdAt: "2026-08-20T10:00:00Z", updatedAt: "2026-08-20T10:00:00Z" };

test("a correction after the summary was written makes it stale", () => {
  const segments = [{ isCorrected: true, updatedAt: "2026-08-20T11:00:00Z" }];

  assert.equal(isSummaryStale(segments, SUMMARY), true);
});

test("regenerating the summary clears the warning", () => {
  // The whole reason translation_room_artifacts gained updated_at: without it the comparison
  // could only ever answer yes, and a warning that cannot turn itself off means nothing.
  const segments = [{ isCorrected: true, updatedAt: "2026-08-20T11:00:00Z" }];
  const regenerated = { createdAt: "2026-08-20T10:00:00Z", updatedAt: "2026-08-20T12:00:00Z" };

  assert.equal(isSummaryStale(segments, regenerated), false);
});

test("a correction made BEFORE the summary was written is already reflected in it", () => {
  const segments = [{ isCorrected: true, updatedAt: "2026-08-20T09:00:00Z" }];

  assert.equal(isSummaryStale(segments, SUMMARY), false);
});

test("an uncorrected segment touched for other reasons is not a correction", () => {
  // Every segment's updatedAt moves for reasons unrelated to its text. Counting those would be
  // the flag-that-lies problem in a different costume.
  const segments = [{ isCorrected: false, updatedAt: "2026-08-20T23:00:00Z" }];

  assert.equal(isSummaryStale(segments, SUMMARY), false);
});

test("the newest correction is the one that counts", () => {
  const segments = [
    { isCorrected: true, updatedAt: "2026-08-20T09:00:00Z" },
    { isCorrected: true, updatedAt: "2026-08-20T11:00:00Z" },
    { isCorrected: false, updatedAt: "2026-08-20T23:00:00Z" },
  ];

  assert.equal(lastCorrectionAt(segments), new Date("2026-08-20T11:00:00Z").getTime());
  assert.equal(isSummaryStale(segments, SUMMARY), true);
});

test("an artifact predating the updated_at column falls back to when it was written", () => {
  const legacy = { createdAt: "2026-08-20T10:00:00Z", updatedAt: null };

  assert.equal(summaryWrittenAt(legacy), new Date("2026-08-20T10:00:00Z").getTime());
  assert.equal(isSummaryStale([{ isCorrected: true, updatedAt: "2026-08-20T11:00:00Z" }], legacy), true);
});

test("nothing corrected means nothing to warn about", () => {
  assert.equal(isSummaryStale([], SUMMARY), false);
  assert.equal(isSummaryStale(null, SUMMARY), false);
  assert.equal(isSummaryStale(undefined, SUMMARY), false);
});

test("no summary at all is not a stale summary", () => {
  const segments = [{ isCorrected: true, updatedAt: "2026-08-20T11:00:00Z" }];

  assert.equal(isSummaryStale(segments, null), false);
  assert.equal(isSummaryStale(segments, { createdAt: null, updatedAt: null }), false);
});

test("an unreadable timestamp is unknown, and unknown never accuses", () => {
  // A staleness banner says the document on screen is wrong. Raising one on missing evidence
  // trains people to dismiss it.
  const segments = [{ isCorrected: true, updatedAt: "not a date" }];

  assert.equal(lastCorrectionAt(segments), null);
  assert.equal(isSummaryStale(segments, SUMMARY), false);
});

test("a correction with no timestamp cannot be compared", () => {
  assert.equal(isSummaryStale([{ isCorrected: true, updatedAt: null }], SUMMARY), false);
});
