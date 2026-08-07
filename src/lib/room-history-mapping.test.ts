import assert from "node:assert/strict";
import test from "node:test";

import { foldWireStatus, wireStatusIs } from "./wire-status.ts";
import {
  clampPage,
  formatMeetingDuration,
  parsePageParam,
  resolveArtifactStatus,
  resolveHistoryStatus,
  resolveMeetingDurationSeconds,
  resolveRetention,
  resolveSummaryState,
  shouldPollRoomHistory,
  totalPages,
} from "./room-history-mapping.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The case-mismatch class.
//
// warptalk-backend serialises every C# enum with JsonStringEnumConverter and no naming
// policy, so `RoomStatus.CANCELLED` reaches this client as the string "CANCELLED". A bare
// `=== "cancelled"` therefore never fires. That has now bitten three times (artifact status,
// room status, invitation status), so the wire casings are pinned here explicitly.
// ─────────────────────────────────────────────────────────────────────────────

test("resolveHistoryStatus matches the UPPERCASE wire value the backend actually sends", () => {
  // Exactly as declared in Domain/Enums/RoomStatus.cs.
  assert.equal(resolveHistoryStatus("CANCELLED"), "cancelled");
  assert.equal(resolveHistoryStatus("ENDED"), "ended");
});

test("resolveHistoryStatus is casing-agnostic, so an upstream normalizer is optional", () => {
  for (const value of ["cancelled", "Cancelled", "CANCELLED", " cancelled "]) {
    assert.equal(resolveHistoryStatus(value), "cancelled", `failed for ${JSON.stringify(value)}`);
  }
  for (const value of ["ended", "Ended", "ENDED"]) {
    assert.equal(resolveHistoryStatus(value), "ended", `failed for ${JSON.stringify(value)}`);
  }
});

test("a cancelled meeting is never labelled as completed", () => {
  assert.notEqual(resolveHistoryStatus("CANCELLED"), "ended");
});

test("unknown or missing statuses fall back to ended rather than throwing", () => {
  assert.equal(resolveHistoryStatus(undefined), "ended");
  assert.equal(resolveHistoryStatus(null), "ended");
  assert.equal(resolveHistoryStatus(""), "ended");
  assert.equal(resolveHistoryStatus("SOMETHING_NEW"), "ended");
});

test("resolveArtifactStatus keeps folding COMPLETED/ACTIVE to ready", () => {
  assert.equal(resolveArtifactStatus("COMPLETED"), "ready");
  assert.equal(resolveArtifactStatus("Active"), "ready");
  assert.equal(resolveArtifactStatus("READY"), "ready");
  assert.equal(resolveArtifactStatus("FAILED"), "failed");
  assert.equal(resolveArtifactStatus("PROCESSING"), "processing");
  assert.equal(resolveArtifactStatus("anything-else"), "processing");
});

test("foldWireStatus/wireStatusIs cover the invitation-status casing that shipped broken", () => {
  // InvitationStatus.ACCEPTED.ToString() — the old comparison was === "Accepted".
  assert.equal(foldWireStatus("ACCEPTED"), "accepted");
  assert.ok(wireStatusIs("ACCEPTED", "Accepted"));
  assert.ok(wireStatusIs("ACCEPTED", "accepted"));
  assert.ok(!wireStatusIs("PENDING", "ACCEPTED"));
  assert.ok(!wireStatusIs(undefined, "ACCEPTED"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Duration
// ─────────────────────────────────────────────────────────────────────────────

test("duration comes from startedAt→endedAt, not from when the row was created", () => {
  // The demo-prep checklist has the team pre-create meetings the night before, so createdAt
  // is many hours before anybody speaks. Using it reported ~14h for a 20-minute meeting.
  const seconds = resolveMeetingDurationSeconds({
    startedAt: "2026-08-07T09:00:00Z",
    endedAt: "2026-08-07T09:20:00Z",
  });
  assert.equal(seconds, 20 * 60);
});

test("a server-reported durationSeconds wins when present", () => {
  assert.equal(
    resolveMeetingDurationSeconds({
      durationSeconds: 930,
      startedAt: "2026-08-07T09:00:00Z",
      endedAt: "2026-08-07T09:20:00Z",
    }),
    930,
  );
});

test("a zero/negative/absent durationSeconds does not suppress the timestamp fallback", () => {
  // TranslationRoom.DurationSeconds has no writer in warptalk-backend today, so it arrives
  // null on every room — the fallback is the branch that actually runs in production.
  for (const reported of [undefined, null, 0, -5]) {
    assert.equal(
      resolveMeetingDurationSeconds({
        durationSeconds: reported,
        startedAt: "2026-08-07T09:00:00Z",
        endedAt: "2026-08-07T09:20:00Z",
      }),
      20 * 60,
      `failed for ${JSON.stringify(reported)}`,
    );
  }
});

test("a room cancelled before it ever started reports no duration", () => {
  assert.equal(
    resolveMeetingDurationSeconds({ startedAt: null, endedAt: "2026-08-07T09:20:00Z" }),
    0,
  );
  assert.equal(resolveMeetingDurationSeconds({}), 0);
});

test("duration never goes negative on clock skew", () => {
  assert.equal(
    resolveMeetingDurationSeconds({
      startedAt: "2026-08-07T09:20:00Z",
      endedAt: "2026-08-07T09:00:00Z",
    }),
    0,
  );
});

test("a short demo meeting reads as seconds, not as 0m", () => {
  assert.equal(formatMeetingDuration(45), "45s");
  assert.equal(formatMeetingDuration(59), "59s");
  assert.equal(formatMeetingDuration(60), "1m");
  assert.equal(formatMeetingDuration(20 * 60), "20m");
  assert.equal(formatMeetingDuration(3600), "1h 0m");
  assert.equal(formatMeetingDuration(3600 + 25 * 60), "1h 25m");
  assert.equal(formatMeetingDuration(0), "—");
  assert.equal(formatMeetingDuration(-1), "—");
});

// ─────────────────────────────────────────────────────────────────────────────
// Retention
// ─────────────────────────────────────────────────────────────────────────────

test("retention is not_configured when no artifact carries a date", () => {
  // This is every meeting today: ArtifactsFinalizer never passes RetentionUntil.
  assert.deepEqual(resolveRetention([{}, { expiresAt: null }, { expiresAt: undefined }]), {
    kind: "not_configured",
  });
  assert.deepEqual(resolveRetention([]), { kind: "not_configured" });
});

test("retention never invents a date from the meeting's own end time", () => {
  const state = resolveRetention([{ expiresAt: undefined }]);
  assert.equal(state.kind, "not_configured");
  assert.ok(!("expiresAt" in state));
});

test("retention reports the earliest real expiry when one exists", () => {
  const state = resolveRetention([
    { expiresAt: "2026-09-10T00:00:00Z" },
    { expiresAt: "2026-08-20T00:00:00Z" },
  ]);
  assert.deepEqual(state, { kind: "scheduled", expiresAt: "2026-08-20T00:00:00Z" });
});

test("retention ignores an unparseable expiry rather than rendering Invalid Date", () => {
  assert.deepEqual(resolveRetention([{ expiresAt: "not-a-date" }]), { kind: "not_configured" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary state — the three states that used to collapse into one message
// ─────────────────────────────────────────────────────────────────────────────

test("a processing artifact reads as generating, never as 'ended without a summary'", () => {
  assert.equal(
    resolveSummaryState({ artifactStatus: "processing", hasStructuredContent: false }),
    "generating",
  );
});

test("a failed or missing artifact is distinguishable from an empty one", () => {
  assert.equal(
    resolveSummaryState({ artifactStatus: "failed", hasStructuredContent: false }),
    "failed",
  );
  assert.equal(
    resolveSummaryState({ artifactStatus: "missing", hasStructuredContent: false }),
    "failed",
  );
  assert.equal(
    resolveSummaryState({ artifactStatus: "expired", hasStructuredContent: false }),
    "failed",
  );
});

test("a ready artifact with parsed content is ready", () => {
  assert.equal(
    resolveSummaryState({ artifactStatus: "ready", hasStructuredContent: true }),
    "ready",
  );
});

test("a ready artifact we could not parse is empty, not generating", () => {
  assert.equal(
    resolveSummaryState({ artifactStatus: "ready", hasStructuredContent: false }),
    "empty",
  );
});

test("an absent artifact is generating only while the meeting just ended", () => {
  assert.equal(
    resolveSummaryState({ hasStructuredContent: false, recentlyEnded: true }),
    "generating",
  );
  assert.equal(
    resolveSummaryState({ hasStructuredContent: false, recentlyEnded: false }),
    "empty",
  );
});

test("summary state never depends on a clock once an artifact exists", () => {
  // The regression: `isGenerating = !artifact && recentlyEnded` meant a 10-minute timer,
  // not artifact state, decided the copy — so a landed summary was eventually described as
  // never having existed.
  for (const recentlyEnded of [true, false]) {
    assert.equal(
      resolveSummaryState({ artifactStatus: "processing", hasStructuredContent: false, recentlyEnded }),
      "generating",
    );
    assert.equal(
      resolveSummaryState({ artifactStatus: "ready", hasStructuredContent: true, recentlyEnded }),
      "ready",
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Polling
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse("2026-08-07T10:00:00Z");

test("polls while a just-ended meeting is still missing its summary", () => {
  assert.ok(
    shouldPollRoomHistory(
      [
        {
          endedAt: "2026-08-07T09:59:00Z",
          artifacts: [{ type: "transcript_export", status: "ready" }],
        },
      ],
      { nowMs: NOW },
    ),
  );
});

test("polls while any artifact is still processing, however old the meeting", () => {
  assert.ok(
    shouldPollRoomHistory(
      [
        {
          endedAt: "2026-01-01T00:00:00Z",
          artifacts: [{ type: "summary_export", status: "processing" }],
        },
      ],
      { nowMs: NOW },
    ),
  );
});

test("STOPS polling once everything has resolved — no unbounded interval", () => {
  assert.equal(
    shouldPollRoomHistory(
      [
        {
          endedAt: "2026-08-07T09:59:00Z",
          artifacts: [
            { type: "transcript_export", status: "ready" },
            { type: "summary_export", status: "ready" },
          ],
        },
      ],
      { nowMs: NOW },
    ),
    false,
  );
});

test("STOPS polling for an old meeting whose artifacts never arrived", () => {
  assert.equal(
    shouldPollRoomHistory(
      [{ endedAt: "2026-08-06T10:00:00Z", artifacts: [] }],
      { nowMs: NOW },
    ),
    false,
  );
});

test("an empty or undated history does not poll", () => {
  assert.equal(shouldPollRoomHistory([], { nowMs: NOW }), false);
  assert.equal(shouldPollRoomHistory([{ artifacts: [] }], { nowMs: NOW }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination — the server's total, not rooms.length
// ─────────────────────────────────────────────────────────────────────────────

test("totalPages uses the server total, so 300 meetings are all reachable", () => {
  assert.equal(totalPages(300, 20), 15);
  assert.equal(totalPages(301, 20), 16);
  assert.equal(totalPages(20, 20), 1);
  assert.equal(totalPages(0, 20), 1);
});

test("totalPages is defensive about a nonsense page size", () => {
  assert.equal(totalPages(300, 0), 1);
  assert.equal(totalPages(300, Number.NaN), 1);
});

test("clampPage keeps a hand-edited ?page= inside the real range", () => {
  assert.equal(clampPage(99, 300, 20), 15);
  assert.equal(clampPage(0, 300, 20), 1);
  assert.equal(clampPage(-3, 300, 20), 1);
  assert.equal(clampPage(4, 300, 20), 4);
});

test("parsePageParam tolerates junk in the URL", () => {
  assert.equal(parsePageParam(null), 1);
  assert.equal(parsePageParam(""), 1);
  assert.equal(parsePageParam("abc"), 1);
  assert.equal(parsePageParam("0"), 1);
  assert.equal(parsePageParam("-2"), 1);
  assert.equal(parsePageParam("7"), 7);
});
