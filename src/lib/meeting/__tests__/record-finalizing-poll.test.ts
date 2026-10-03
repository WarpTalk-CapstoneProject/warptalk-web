import assert from "node:assert/strict";
import test from "node:test";

import {
  endedRecordRefetchInterval,
  finalizingDeadlineDelayMs,
  RECORD_FINALIZING_POLL_MS,
  ROOM_HISTORY_POLL_MS,
} from "../record-finalizing-poll.ts";
import { isRecordFinalizing, RECORD_FINALIZING_WINDOW_MS } from "../room-history-mapping.ts";

// B4 — bridge session 2026-10-03: after End, "Finishing up this meeting" never cleared.

const ROOM_ID = "01a10069-b8e0-7c9a-9dd0-88a71c0dcdb4";
const ENDED_AT = "2026-10-03T10:00:00.000Z";
const ENDED_MS = Date.parse(ENDED_AT);

const done = {
  id: ROOM_ID,
  endedAt: ENDED_AT,
  artifacts: [
    { type: "transcript_export", status: "ready" as const },
    { type: "summary_export", status: "ready" as const },
  ],
  summary: { summary: "Agreed the plan.", templateKey: "general" },
};

const otherIdleRoom = {
  id: "another-room",
  endedAt: "2026-09-01T10:00:00.000Z",
  artifacts: [{ type: "transcript_export", status: "ready" as const }],
};

test("finalizing and the room is NOT in the list yet: still polls fast (the hang)", () => {
  // The cached list predates the meeting's end: only an idle old room in it. The shared list
  // rule alone said "nothing generating" and never asked again.
  const interval = endedRecordRefetchInterval(
    { rooms: [otherIdleRoom], roomId: ROOM_ID, status: "ended", endedAt: ENDED_AT },
    ENDED_MS + 10_000,
  );
  assert.equal(interval, RECORD_FINALIZING_POLL_MS);
  assert.ok(interval >= 3_000 && interval <= 5_000);
});

test("finalizing and the list has not loaded at all: still polls fast", () => {
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: undefined, roomId: ROOM_ID, status: "ENDED", endedAt: ENDED_AT },
      ENDED_MS + 1_000,
    ),
    RECORD_FINALIZING_POLL_MS,
  );
});

test("finalizing with the room listed but no transcript yet: polls fast", () => {
  const listed = { ...done, artifacts: [], summary: null };
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: [listed], roomId: ROOM_ID, status: "ended", endedAt: ENDED_AT },
      ENDED_MS + 30_000,
    ),
    RECORD_FINALIZING_POLL_MS,
  );
});

test("transcript is listed: the fast poll stops (resolve)", () => {
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: [done], roomId: ROOM_ID, status: "ended", endedAt: ENDED_AT },
      ENDED_MS + 60_000,
    ),
    false,
  );
});

test("transcript listed but summary still processing: falls back to the ordinary list cadence", () => {
  const summaryPending = {
    ...done,
    artifacts: [
      { type: "transcript_export", status: "ready" as const },
      { type: "summary_export", status: "processing" as const },
    ],
  };
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: [summaryPending], roomId: ROOM_ID, status: "ended", endedAt: ENDED_AT },
      ENDED_MS + 60_000,
    ),
    ROOM_HISTORY_POLL_MS,
  );
});

test("past the finalizing window with the room still absent: stops asking", () => {
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: [otherIdleRoom], roomId: ROOM_ID, status: "ended", endedAt: ENDED_AT },
      ENDED_MS + RECORD_FINALIZING_WINDOW_MS + 1,
    ),
    false,
  );
});

test("a room that has not ended does not trigger the finalizing poll", () => {
  assert.equal(
    endedRecordRefetchInterval(
      { rooms: [otherIdleRoom], roomId: ROOM_ID, status: "in_progress", endedAt: null },
      ENDED_MS,
    ),
    false,
  );
});

test("deadline: the delay lands just past the window, where the screen resolves", () => {
  const now = ENDED_MS + 60_000;
  const delay = finalizingDeadlineDelayMs({ status: "ended", endedAt: ENDED_AT }, now);
  assert.equal(delay, RECORD_FINALIZING_WINDOW_MS - 60_000 + 1);
  // At the moment the timer fires, a still-absent record no longer holds the screen.
  assert.equal(
    isRecordFinalizing({ status: "ended", endedAt: ENDED_AT, record: null }, now + delay!),
    false,
  );
  // And just before it, it still does — so the timer is not early.
  assert.equal(
    isRecordFinalizing({ status: "ended", endedAt: ENDED_AT, record: null }, now + delay! - 2),
    true,
  );
});

test("deadline: none when there is no window to wait out", () => {
  assert.equal(finalizingDeadlineDelayMs({ status: "in_progress", endedAt: ENDED_AT }, ENDED_MS), null);
  assert.equal(finalizingDeadlineDelayMs({ status: "ended", endedAt: null }, ENDED_MS), null);
  assert.equal(finalizingDeadlineDelayMs({ status: "ended", endedAt: "garbage" }, ENDED_MS), null);
  assert.equal(
    finalizingDeadlineDelayMs({ status: "ended", endedAt: ENDED_AT }, ENDED_MS + RECORD_FINALIZING_WINDOW_MS),
    null,
  );
});

test("deadline: a client clock behind the server's is capped to one window per leg", () => {
  // The end reads as 10 minutes in the future. The timer must not park the screen for 15 minutes
  // in one go; the hook re-arms after each leg.
  const delay = finalizingDeadlineDelayMs({ status: "ended", endedAt: ENDED_AT }, ENDED_MS - 10 * 60_000);
  assert.equal(delay, RECORD_FINALIZING_WINDOW_MS + 1);
});
