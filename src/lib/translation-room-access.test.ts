import assert from "node:assert/strict";
import test from "node:test";

import {
  canJoinTranslationRoom,
  resolveRoomEntryIntent,
  shouldEnterWaitingRoom,
} from "./translation-room-access.ts";

test("WT-273: the host is never sent to the lobby to wait for himself", () => {
  for (const status of ["scheduled", "waiting"] as const) {
    assert.equal(
      shouldEnterWaitingRoom(status, { isHost: true }),
      false,
      `host must not wait in a ${status} room`,
    );
    assert.equal(shouldEnterWaitingRoom(status, { isHost: false }), true);
    // No host information: unchanged pre-WT-273 behaviour.
    assert.equal(shouldEnterWaitingRoom(status), true);
  }
});

test("WT-273: a host looking at a room that has not started gets the host affordance", () => {
  const intent = resolveRoomEntryIntent({
    status: "scheduled",
    isHost: true,
    statusLabel: "Scheduled",
    scheduledAtLabel: "Aug 5, 2026, 9:00 AM",
  });

  assert.equal(intent.mode, "host_start");
  assert.equal(intent.label, "Start meeting");
  assert.equal(intent.isActionable, true);
  assert.ok(
    !/wait/i.test(intent.helpText ?? ""),
    "the host must never be told to wait",
  );
});

test("a non-host looking at the same room still gets the lobby, with the start time", () => {
  const intent = resolveRoomEntryIntent({
    status: "scheduled",
    isHost: false,
    statusLabel: "Scheduled",
    scheduledAtLabel: "Aug 5, 2026, 9:00 AM",
  });

  assert.equal(intent.mode, "lobby");
  assert.equal(intent.label, "Enter waiting room");
  assert.equal(
    intent.helpText,
    "This meeting starts Aug 5, 2026, 9:00 AM. You'll wait in the lobby until the host opens it.",
  );
});

test("a live room is joined directly, by host and guest alike", () => {
  for (const isHost of [true, false]) {
    const intent = resolveRoomEntryIntent({
      status: "in_progress",
      isHost,
      statusLabel: "In Progress",
    });
    assert.equal(intent.mode, "join");
    assert.equal(intent.label, "Join meeting");
    assert.equal(intent.helpText, null);
  }
});

test("a terminal room offers nothing, and says which terminal state it is in", () => {
  for (const status of [
    "ended",
    "cancelled",
    "expired",
    "failed",
    "timeout",
  ] as const) {
    assert.equal(canJoinTranslationRoom(status), false);
    const intent = resolveRoomEntryIntent({
      status,
      isHost: true,
      statusLabel: "Ended",
    });
    assert.equal(intent.mode, "unavailable");
    assert.equal(intent.isActionable, false);
    assert.equal(intent.label, "Ended");
  }
});
